import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDatabase } from "./database";
import { voiceMinuteGrants } from "./database/schema";
import { resolveBillingAccount } from "./billing-entitlements";
import { subscriptionPriceDetails } from "./billing-prices";
import { getVoiceAddon, grantVoiceTopUp, setVoiceAddon } from "./voice-credits";

/**
 * Voice calling's side of billing.
 *
 *  - The ADD-ON is a second item on the workspace's existing Stripe
 *    subscription. While it is active the workspace gets some minutes each
 *    billing period; they expire with the period.
 *  - MINUTE PACKS are one-time purchases that cover extra minutes for a year.
 *
 * Prices live in Stripe; the environment says which Stripe price is which
 * (STRIPE_PRICE_ID_VOICE_ADDON_MONTHLY, STRIPE_PRICE_ID_VOICE_PACK_*) and how
 * many minutes the add-on includes (VOICE_ADDON_INCLUDED_MINUTES).
 */

export const voicePackKeys = ["minutes_60", "minutes_300", "minutes_1000"] as const;
export type VoicePackKey = (typeof voicePackKeys)[number];

export const voicePackCatalog: Record<VoicePackKey, { minutes: number; label: string }> = {
  minutes_60: { minutes: 60, label: "60 minutes" },
  minutes_300: { minutes: 300, label: "300 minutes" },
  minutes_1000: { minutes: 1_000, label: "1,000 minutes" },
};

const PACK_PRICE_VARIABLES: Record<VoicePackKey, string> = {
  minutes_60: "STRIPE_PRICE_ID_VOICE_PACK_60",
  minutes_300: "STRIPE_PRICE_ID_VOICE_PACK_300",
  minutes_1000: "STRIPE_PRICE_ID_VOICE_PACK_1000",
};

/** Marks a Checkout Session as a voice-minute pack, so the webhook never mistakes it for a prospect-credit top-up. */
export const VOICE_CHECKOUT_KIND = "voice_minute_pack";

const configured = (name: string) => process.env[name]?.trim() || null;

export const voiceAddonPriceId = () => configured("STRIPE_PRICE_ID_VOICE_ADDON_MONTHLY");
export const voicePackPriceId = (key: VoicePackKey) => configured(PACK_PRICE_VARIABLES[key]);

export function voicePackForPrice(priceId: string): VoicePackKey | null {
  return voicePackKeys.find((key) => voicePackPriceId(key) === priceId) ?? null;
}

/** Minutes the add-on includes each billing period. */
export function voiceIncludedMinutes() {
  const value = Number(process.env.VOICE_ADDON_INCLUDED_MINUTES);
  return Number.isInteger(value) && value > 0 ? value : 120;
}

export function voiceOffer() {
  return {
    addonConfigured: Boolean(voiceAddonPriceId()),
    includedMinutes: voiceIncludedMinutes(),
    packs: voicePackKeys.map((key) => ({ key, ...voicePackCatalog[key], configured: Boolean(voicePackPriceId(key)) })),
  };
}

export function isVoicePackSession(session: { metadata?: Record<string, string> | null }) {
  return session.metadata?.checkoutKind === VOICE_CHECKOUT_KIND;
}

// ---- The subscription -----------------------------------------------------------------

/**
 * The item that carries the workspace's plan. With the add-on on the same
 * subscription the plan is not necessarily the first item, so it's found by its
 * price. Falls back to the first item for anything unrecognised.
 */
export function planItemOf(subscription: Stripe.Subscription) {
  const items = subscription.items.data;
  return items.find((item) => subscriptionPriceDetails(item.price.id) !== null) ?? items[0];
}

export function addonItemOf(subscription: Stripe.Subscription) {
  const priceId = voiceAddonPriceId();
  return priceId ? subscription.items.data.find((item) => item.price.id === priceId) : undefined;
}

/** Statuses where the add-on counts: Stripe is still collecting or the customer is paying. */
const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

/**
 * Turns the add-on on or off to match the subscription, and grants this
 * period's included minutes. Safe to call on every subscription event.
 */
export async function syncVoiceAddonFromSubscription(organizationId: string, subscription: Stripe.Subscription) {
  const item = addonItemOf(subscription);
  // Most workspaces never have the add-on: don't create a row for them.
  if (!item && !(await getVoiceAddon(organizationId))) return { active: false };
  const active = Boolean(item) && ACTIVE_STATUSES.has(subscription.status);
  await setVoiceAddon({
    organizationId,
    active,
    monthlySeconds: voiceIncludedMinutes() * 60,
    periodStart: item?.current_period_start ? new Date(item.current_period_start * 1_000) : null,
    periodEnd: item?.current_period_end ? new Date(item.current_period_end * 1_000) : null,
    stripeSubscriptionItemId: item?.id ?? null,
  });
  return { active };
}

// ---- Minute packs ------------------------------------------------------------------------

/** Grants the minutes for a paid pack session. Safe to run twice for the same session. */
export async function fulfillVoicePackSession(session: Stripe.Checkout.Session, lookupPriceId?: () => Promise<string | null>) {
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return { granted: false, pending: true };
  const organizationId = session.client_reference_id ?? session.metadata?.organizationId;
  let key = voicePackKeys.find((candidate) => candidate === session.metadata?.packKey) ?? null;
  if (!key && lookupPriceId) {
    const priceId = await lookupPriceId();
    if (priceId) key = voicePackForPrice(priceId);
  }
  if (!organizationId || !key) throw new Error("The paid voice minute pack is missing its workspace or pack mapping.");
  return {
    ...(await grantVoiceTopUp({
      organizationId,
      purchaseKey: session.id,
      minutes: voicePackCatalog[key].minutes,
      purchasedAt: new Date(session.created * 1_000),
    })),
    pending: false,
    minutes: voicePackCatalog[key].minutes,
  };
}

/** A refund or dispute takes back the unspent part of the pack it paid for. */
export async function revokeVoicePackMinutes(input: { organizationId: string; sessionId: string; fraction: number }) {
  const database = getDatabase();
  const { billingOrganizationId } = await resolveBillingAccount(input.organizationId);
  return database.transaction(async (transaction) => {
    const [grant] = await transaction
      .select()
      .from(voiceMinuteGrants)
      .where(eq(voiceMinuteGrants.sourceKey, `topup:${input.sessionId}`))
      .for("update")
      .limit(1);
    if (!grant || grant.organizationId !== billingOrganizationId) return { revokedSeconds: 0 };
    // Refund events carry the cumulative fraction, so aim for it rather than subtracting it again.
    const target = Math.round(grant.secondsTotal * Math.min(1, Math.max(0, input.fraction)));
    const alreadyGone = grant.secondsTotal - grant.secondsRemaining;
    const revoke = Math.min(grant.secondsRemaining, Math.max(0, target - alreadyGone));
    if (revoke === 0) return { revokedSeconds: 0 };
    await transaction.update(voiceMinuteGrants).set({ secondsRemaining: grant.secondsRemaining - revoke }).where(eq(voiceMinuteGrants.id, grant.id));
    return { revokedSeconds: revoke };
  });
}
