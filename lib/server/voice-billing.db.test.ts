import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedOrganization } from "./test-support/seed";

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64url");

const DAY = 86_400_000;
const sec = (date: Date) => Math.floor(date.getTime() / 1_000);
async function schema() { return import("./database/schema"); }
async function db() { return (await import("./database")).getDatabase(); }

function item(id: string, priceId: string, start: Date, end: Date) {
  return { id, price: { id: priceId, recurring: { interval: "month" } }, current_period_start: sec(start), current_period_end: sec(end) };
}
function subscription(organizationId: string, items: ReturnType<typeof item>[], overrides: Partial<{ status: string; cancel_at_period_end: boolean }> = {}) {
  return {
    id: "sub_1", customer: "cus_1", status: "active", start_date: sec(new Date(Date.now() - 40 * DAY)), cancel_at_period_end: false, cancel_at: null,
    metadata: { organizationId }, items: { data: items }, ...overrides,
  } as unknown as Stripe.Subscription;
}

describe.skipIf(!hasTestDatabase)("voice billing", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("STRIPE_PRICE_ID_GROWTH_MONTHLY", "price_growth");
    vi.stubEnv("STRIPE_PRICE_ID_VOICE_ADDON_MONTHLY", "price_voice");
    vi.stubEnv("STRIPE_PRICE_ID_VOICE_PACK_60", "price_pack_60");
    vi.stubEnv("STRIPE_PRICE_ID_VOICE_PACK_300", "price_pack_300");
    vi.stubEnv("VOICE_ADDON_INCLUDED_MINUTES", "100");
    await truncateAllTables();
  });

  const periodNow = () => ({ start: new Date(Date.now() - 5 * DAY), end: new Date(Date.now() + 25 * DAY) });

  it("finds the plan by its price even when the add-on is listed first", async () => {
    const { planItemOf } = await import("./voice-billing");
    const { start, end } = periodNow();
    const sub = subscription("x", [item("si_voice", "price_voice", start, end), item("si_plan", "price_growth", start, end)]);
    expect(planItemOf(sub)?.id).toBe("si_plan");
    // Nothing recognised: fall back to the first item, as before.
    expect(planItemOf(subscription("x", [item("si_a", "price_unknown", start, end)]))?.id).toBe("si_a");
  });

  it("keeps the plan and turns the add-on on, with the period's included minutes", async () => {
    const { organizationId } = await seedOrganization();
    const { start, end } = periodNow();
    const { upsertBillingFromSubscription } = await import("./billing-store");
    await upsertBillingFromSubscription(organizationId, subscription(organizationId, [item("si_voice", "price_voice", start, end), item("si_plan", "price_growth", start, end)]));

    const { organizationBilling } = await schema();
    const [billing] = await (await db()).select().from(organizationBilling).where(eq(organizationBilling.organizationId, organizationId));
    expect(billing).toMatchObject({ planKey: "growth", status: "active", planId: "price_growth" });

    const { getVoiceBalance, getVoiceAddon } = await import("./voice-credits");
    expect(await getVoiceAddon(organizationId)).toMatchObject({ active: true, monthlySeconds: 6_000, stripeSubscriptionItemId: "si_voice" });
    expect(await getVoiceBalance(organizationId)).toMatchObject({ availableSeconds: 6_000, includedSeconds: 6_000, addonActive: true });
  });

  it("grants a second period's minutes after renewal, and the old ones expire with their period", async () => {
    const { organizationId } = await seedOrganization();
    const { start, end } = periodNow();
    const { upsertBillingFromSubscription } = await import("./billing-store");
    const { getVoiceBalance } = await import("./voice-credits");
    await upsertBillingFromSubscription(organizationId, subscription(organizationId, [item("si_voice", "price_voice", start, end), item("si_plan", "price_growth", start, end)]));
    await upsertBillingFromSubscription(organizationId, subscription(organizationId, [item("si_voice", "price_voice", start, end), item("si_plan", "price_growth", start, end)]));
    expect((await getVoiceBalance(organizationId)).includedSeconds).toBe(6_000); // synced twice, granted once

    const nextStart = end;
    const nextEnd = new Date(end.getTime() + 30 * DAY);
    await upsertBillingFromSubscription(organizationId, subscription(organizationId, [item("si_voice", "price_voice", nextStart, nextEnd), item("si_plan", "price_growth", nextStart, nextEnd)]));
    // The new period's grant is valid from its start; check just after it begins.
    const justAfter = new Date(nextStart.getTime() + 60_000);
    expect((await getVoiceBalance(organizationId, justAfter)).includedSeconds).toBe(6_000);
  });

  it("turns the add-on off when it is removed or the subscription ends, and its minutes stop counting", async () => {
    const { organizationId } = await seedOrganization();
    const { start, end } = periodNow();
    const { upsertBillingFromSubscription } = await import("./billing-store");
    const { getVoiceBalance, grantVoiceTopUp } = await import("./voice-credits");
    await upsertBillingFromSubscription(organizationId, subscription(organizationId, [item("si_voice", "price_voice", start, end), item("si_plan", "price_growth", start, end)]));
    await grantVoiceTopUp({ organizationId, purchaseKey: "cs_keep", minutes: 10 });

    // The add-on item is removed from the subscription.
    await upsertBillingFromSubscription(organizationId, subscription(organizationId, [item("si_plan", "price_growth", start, end)]));
    expect(await getVoiceBalance(organizationId)).toMatchObject({ addonActive: false, includedSeconds: 0, packSeconds: 600 });

    // Re-added, then the whole subscription is cancelled.
    await upsertBillingFromSubscription(organizationId, subscription(organizationId, [item("si_voice", "price_voice", start, end), item("si_plan", "price_growth", start, end)]));
    expect((await getVoiceBalance(organizationId)).addonActive).toBe(true);
    await upsertBillingFromSubscription(organizationId, subscription(organizationId, [item("si_voice", "price_voice", start, end), item("si_plan", "price_growth", start, end)], { status: "canceled" }));
    expect(await getVoiceBalance(organizationId)).toMatchObject({ addonActive: false, includedSeconds: 0 });
  });

  it("leaves workspaces without the add-on alone, creating no row for them", async () => {
    const { organizationId } = await seedOrganization();
    const { start, end } = periodNow();
    const { upsertBillingFromSubscription } = await import("./billing-store");
    await upsertBillingFromSubscription(organizationId, subscription(organizationId, [item("si_plan", "price_growth", start, end)]));
    const { voiceAddons } = await schema();
    expect(await (await db()).select().from(voiceAddons)).toHaveLength(0);
  });

  it("keeps the add-on on while Stripe is still retrying a late payment", async () => {
    const { organizationId } = await seedOrganization();
    const { start, end } = periodNow();
    const { upsertBillingFromSubscription } = await import("./billing-store");
    const { getVoiceAddon } = await import("./voice-credits");
    await upsertBillingFromSubscription(organizationId, subscription(organizationId, [item("si_voice", "price_voice", start, end), item("si_plan", "price_growth", start, end)], { status: "past_due" }));
    expect((await getVoiceAddon(organizationId))?.active).toBe(true);
  });

  describe("minute packs", () => {
    const pack = (organizationId: string, overrides: Record<string, unknown> = {}) =>
      ({ id: "cs_pack_1", mode: "payment", payment_status: "paid", created: sec(new Date()), client_reference_id: organizationId, metadata: { organizationId, checkoutKind: "voice_minute_pack", packKey: "minutes_300" }, ...overrides }) as unknown as Stripe.Checkout.Session;

    it("grants the pack's minutes once, however many times the event is replayed", async () => {
      const { organizationId } = await seedOrganization();
      const { fulfillVoicePackSession } = await import("./voice-billing");
      const { getVoiceBalance } = await import("./voice-credits");
      expect(await fulfillVoicePackSession(pack(organizationId))).toMatchObject({ granted: true, minutes: 300 });
      expect(await fulfillVoicePackSession(pack(organizationId))).toMatchObject({ granted: false });
      expect((await getVoiceBalance(organizationId)).packSeconds).toBe(18_000);
    });

    it("waits for payment to clear before granting", async () => {
      const { organizationId } = await seedOrganization();
      const { fulfillVoicePackSession } = await import("./voice-billing");
      const { getVoiceBalance } = await import("./voice-credits");
      expect(await fulfillVoicePackSession(pack(organizationId, { payment_status: "unpaid" }))).toEqual({ granted: false, pending: true });
      expect((await getVoiceBalance(organizationId)).packSeconds).toBe(0);
    });

    it("works out the pack from the line item's price when the metadata lacks it", async () => {
      const { organizationId } = await seedOrganization();
      const { fulfillVoicePackSession } = await import("./voice-billing");
      const session = pack(organizationId, { metadata: { organizationId, checkoutKind: "voice_minute_pack" } });
      expect(await fulfillVoicePackSession(session, async () => "price_pack_60")).toMatchObject({ granted: true, minutes: 60 });
      await expect(fulfillVoicePackSession(pack(organizationId, { id: "cs_x", metadata: { organizationId } }))).rejects.toThrow(/missing its workspace or pack mapping/);
    });

    it("routes a voice pack through the webhook without touching prospect credits", async () => {
      const { organizationId } = await seedOrganization();
      const { applyStripeWebhookEvent } = await import("./billing-store");
      const { getVoiceBalance } = await import("./voice-credits");
      const event = { id: "evt_pack_1", type: "checkout.session.completed", created: sec(new Date()), livemode: false, data: { object: pack(organizationId) } } as unknown as Stripe.Event;
      expect(await applyStripeWebhookEvent(event)).toEqual({ duplicate: false });
      expect((await getVoiceBalance(organizationId)).packSeconds).toBe(18_000);
      const { prospectCreditGrants, providerEvents } = await schema();
      expect(await (await db()).select().from(prospectCreditGrants)).toHaveLength(0);
      const [recorded] = await (await db()).select().from(providerEvents).where(eq(providerEvents.providerEventId, "evt_pack_1"));
      expect(recorded).toMatchObject({ processingError: null });
      expect(recorded!.processedAt).not.toBeNull();
      // Delivered again: recognised as a duplicate, nothing granted twice.
      expect(await applyStripeWebhookEvent(event)).toEqual({ duplicate: true });
      expect((await getVoiceBalance(organizationId)).packSeconds).toBe(18_000);
    });

    it("takes back the unspent part of a pack when it is refunded, never below what was used", async () => {
      const { organizationId } = await seedOrganization();
      const { fulfillVoicePackSession, revokeVoicePackMinutes } = await import("./voice-billing");
      const { getVoiceBalance, settleCallSeconds } = await import("./voice-credits");
      await fulfillVoicePackSession(pack(organizationId, { metadata: { organizationId, checkoutKind: "voice_minute_pack", packKey: "minutes_60" } }));
      await settleCallSeconds({ organizationId, callId: crypto.randomUUID(), seconds: 600 }); // 10 of 60 minutes used

      expect(await revokeVoicePackMinutes({ organizationId, sessionId: "cs_pack_1", fraction: 0.5 })).toEqual({ revokedSeconds: 1_200 }); // 50% of 3600 = 1800, 600 already gone
      expect((await getVoiceBalance(organizationId)).packSeconds).toBe(1_800);
      // The same cumulative fraction again changes nothing.
      expect(await revokeVoicePackMinutes({ organizationId, sessionId: "cs_pack_1", fraction: 0.5 })).toEqual({ revokedSeconds: 0 });
      // A full refund takes only what is left.
      expect(await revokeVoicePackMinutes({ organizationId, sessionId: "cs_pack_1", fraction: 1 })).toEqual({ revokedSeconds: 1_800 });
      expect((await getVoiceBalance(organizationId)).packSeconds).toBe(0);
      expect(await revokeVoicePackMinutes({ organizationId, sessionId: "cs_unknown", fraction: 1 })).toEqual({ revokedSeconds: 0 });
    });
  });

  it("reports what can be bought, from the environment", async () => {
    const { voiceOffer, voicePackForPrice, isVoicePackSession } = await import("./voice-billing");
    expect(voiceOffer()).toMatchObject({ addonConfigured: true, includedMinutes: 100 });
    expect(voiceOffer().packs.map((pack) => [pack.key, pack.configured])).toEqual([["minutes_60", true], ["minutes_300", true], ["minutes_1000", false]]);
    expect(voicePackForPrice("price_pack_300")).toBe("minutes_300");
    expect(voicePackForPrice("price_nope")).toBeNull();
    expect(isVoicePackSession({ metadata: { checkoutKind: "voice_minute_pack" } })).toBe(true);
    expect(isVoicePackSession({ metadata: { checkoutKind: "prospect_credit_topup" } })).toBe(false);
    vi.stubEnv("VOICE_ADDON_INCLUDED_MINUTES", "");
    expect((await import("./voice-billing")).voiceIncludedMinutes()).toBe(120);
  });
});
