import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getDatabase } from "./database";
import { voiceAddons, voiceMinuteGrants, voiceMinuteUsage, type VoiceMinuteSource } from "./database/schema";
import { resolveBillingAccount } from "./billing-entitlements";

/**
 * Voice minutes, kept in seconds. The paid add-on includes a number of minutes
 * each billing period; when those run out, purchased packs are used. Both are
 * grants that expire (included minutes with the period, packs after a year),
 * and calls spend whichever expires first.
 *
 * Minutes belong to the billing account (a workspace family shares one pool);
 * usage rows keep the workspace that placed the call.
 */

/** Not worth dialing with fewer seconds than this left. */
export const MIN_SECONDS_TO_DIAL = 120;
/** No single call runs longer than this. */
export const MAX_CALL_SECONDS = 900;

const YEAR_MS = 365 * 86_400_000;

async function billingOrganizationId(organizationId: string) {
  return (await resolveBillingAccount(organizationId)).billingOrganizationId;
}

export async function grantVoiceSeconds(input: {
  organizationId: string;
  source: VoiceMinuteSource;
  sourceKey: string;
  seconds: number;
  validFrom: Date;
  expiresAt: Date;
}) {
  if (!Number.isInteger(input.seconds) || input.seconds <= 0) throw new Error("A voice minute grant needs a positive number of seconds.");
  const accountId = await billingOrganizationId(input.organizationId);
  const [grant] = await getDatabase()
    .insert(voiceMinuteGrants)
    .values({
      id: crypto.randomUUID(),
      organizationId: accountId,
      source: input.source,
      sourceKey: input.sourceKey,
      secondsTotal: input.seconds,
      secondsRemaining: input.seconds,
      validFrom: input.validFrom,
      expiresAt: input.expiresAt,
    })
    .onConflictDoNothing({ target: [voiceMinuteGrants.organizationId, voiceMinuteGrants.sourceKey] })
    .returning({ id: voiceMinuteGrants.id });
  return { granted: Boolean(grant) };
}

/** A purchased pack of minutes, valid for a year. Safe to call twice for the same purchase. */
export function grantVoiceTopUp(input: { organizationId: string; purchaseKey: string; minutes: number; purchasedAt?: Date }) {
  const purchasedAt = input.purchasedAt ?? new Date();
  return grantVoiceSeconds({
    organizationId: input.organizationId,
    source: "topup",
    sourceKey: `topup:${input.purchaseKey}`,
    seconds: input.minutes * 60,
    validFrom: purchasedAt,
    expiresAt: new Date(purchasedAt.getTime() + YEAR_MS),
  });
}

export async function getVoiceAddon(organizationId: string) {
  const accountId = await billingOrganizationId(organizationId);
  const [row] = await getDatabase().select().from(voiceAddons).where(eq(voiceAddons.organizationId, accountId)).limit(1);
  return row ?? null;
}

/** Turns the add-on on or off for a billing account. Called when the Stripe subscription changes. */
export async function setVoiceAddon(input: {
  organizationId: string;
  active: boolean;
  monthlySeconds: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  stripeSubscriptionItemId?: string | null;
}) {
  const accountId = await billingOrganizationId(input.organizationId);
  const values = {
    active: input.active,
    monthlySeconds: input.monthlySeconds,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    stripeSubscriptionItemId: input.stripeSubscriptionItemId ?? null,
    updatedAt: new Date(),
  };
  await getDatabase()
    .insert(voiceAddons)
    .values({ organizationId: accountId, ...values })
    .onConflictDoUpdate({ target: voiceAddons.organizationId, set: values });
  if (input.active) await syncVoiceAllowance(input.organizationId);
}

/**
 * Grants this period's included minutes once. They expire at the end of the
 * period, so unused included minutes don't pile up. Returns whether a new
 * grant was made.
 */
export async function syncVoiceAllowance(organizationId: string, now = new Date()) {
  const addon = await getVoiceAddon(organizationId);
  if (!addon?.active || !addon.periodStart || !addon.periodEnd || addon.monthlySeconds <= 0) return { granted: false };
  if (now.getTime() >= addon.periodEnd.getTime()) return { granted: false };
  return grantVoiceSeconds({
    organizationId,
    source: "plan_monthly",
    sourceKey: `plan:${addon.periodStart.toISOString()}`,
    seconds: addon.monthlySeconds,
    validFrom: addon.periodStart,
    expiresAt: addon.periodEnd,
  });
}

export type VoiceBalance = {
  availableSeconds: number;
  includedSeconds: number;
  packSeconds: number;
  addonActive: boolean;
  /** The soonest expiry among minutes that can still be spent, for a "use them or lose them" hint. */
  nextExpiry: Date | null;
};

export async function getVoiceBalance(organizationId: string, now = new Date()): Promise<VoiceBalance> {
  await syncVoiceAllowance(organizationId, now);
  const accountId = await billingOrganizationId(organizationId);
  const grants = await getDatabase()
    .select()
    .from(voiceMinuteGrants)
    .where(and(eq(voiceMinuteGrants.organizationId, accountId), gt(voiceMinuteGrants.secondsRemaining, 0), gt(voiceMinuteGrants.expiresAt, now)))
    .orderBy(asc(voiceMinuteGrants.expiresAt));
  const usable = grants.filter((grant) => grant.validFrom.getTime() <= now.getTime());
  const sum = (source: "plan_monthly" | "other") =>
    usable.filter((grant) => (source === "plan_monthly" ? grant.source === "plan_monthly" : grant.source !== "plan_monthly")).reduce((total, grant) => total + grant.secondsRemaining, 0);
  const addon = await getVoiceAddon(organizationId);
  return {
    availableSeconds: sum("plan_monthly") + sum("other"),
    includedSeconds: sum("plan_monthly"),
    packSeconds: sum("other"),
    addonActive: Boolean(addon?.active),
    nextExpiry: usable[0]?.expiresAt ?? null,
  };
}

/** How long the next call may run, or 0 when there aren't enough minutes to start one. */
export async function maxSecondsForNextCall(organizationId: string, now = new Date()) {
  const { availableSeconds } = await getVoiceBalance(organizationId, now);
  return availableSeconds < MIN_SECONDS_TO_DIAL ? 0 : Math.min(MAX_CALL_SECONDS, availableSeconds);
}

/**
 * Charges a finished call against the workspace's minutes, oldest-expiring
 * first. Safe to call twice for the same call. Returns what was charged and any
 * shortfall (a call can't normally exceed the cap it was given).
 */
export async function settleCallSeconds(input: { organizationId: string; callId: string; seconds: number; now?: Date }) {
  const now = input.now ?? new Date();
  const wanted = Math.max(0, Math.ceil(input.seconds));
  const accountId = await billingOrganizationId(input.organizationId);
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`voice-minutes/${accountId}`}))`);
    const existing = await transaction.select({ seconds: voiceMinuteUsage.seconds }).from(voiceMinuteUsage).where(eq(voiceMinuteUsage.callId, input.callId));
    if (existing.length) {
      return { billedSeconds: existing.reduce((total, row) => total + row.seconds, 0), shortfallSeconds: 0, alreadySettled: true };
    }
    if (wanted === 0) return { billedSeconds: 0, shortfallSeconds: 0, alreadySettled: false };

    const grants = await transaction
      .select()
      .from(voiceMinuteGrants)
      .where(and(eq(voiceMinuteGrants.organizationId, accountId), gt(voiceMinuteGrants.secondsRemaining, 0), gt(voiceMinuteGrants.expiresAt, now)))
      .orderBy(asc(voiceMinuteGrants.expiresAt));
    let left = wanted;
    for (const grant of grants) {
      if (left <= 0) break;
      const take = Math.min(left, grant.secondsRemaining);
      await transaction
        .update(voiceMinuteGrants)
        .set({ secondsRemaining: grant.secondsRemaining - take })
        .where(eq(voiceMinuteGrants.id, grant.id));
      await transaction.insert(voiceMinuteUsage).values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        callId: input.callId,
        grantId: grant.id,
        seconds: take,
      });
      left -= take;
    }
    return { billedSeconds: wanted - left, shortfallSeconds: left, alreadySettled: false };
  });
}
