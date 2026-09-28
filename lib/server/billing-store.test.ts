import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedOrganization } from "./test-support/seed";

const stripe = {
  subscriptions: { retrieve: vi.fn() },
  checkout: { sessions: { list: vi.fn(), listLineItems: vi.fn() } },
  charges: { retrieve: vi.fn() },
};

vi.mock("./stripe-client", () => ({
  getStripeClient: () => stripe,
  isStripeConfigured: () => true,
}));
vi.mock("./billing-email", () => ({ sendBillingNotice: vi.fn(async () => ({ sent: 1 })) }));

function subscription(overrides: Partial<Record<string, unknown>> = {}) {
  const now = Math.floor(Date.now() / 1_000);
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    start_date: now - 86_400,
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { organizationId: "", planKey: "growth", billingInterval: "month" },
    items: { data: [{ price: { id: "price_growth_month", recurring: { interval: "month" } }, current_period_end: now + 29 * 86_400 }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

let counter = 0;
function event<T>(type: string, object: T) {
  counter += 1;
  return { id: `evt_${counter}_${Date.now()}`, type, created: Math.floor(Date.now() / 1_000), livemode: false, data: { object } } as unknown as Stripe.Event;
}

describe.skipIf(!hasTestDatabase)("Stripe webhook handling", () => {
  beforeEach(async () => {
    await truncateAllTables();
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_PRICE_ID_GROWTH_MONTHLY", "price_growth_month");
    vi.stubEnv("STRIPE_PRICE_ID_TOPUP_500", "price_topup_500");
  });

  it("activates a plan from checkout by re-reading the subscription, and ignores replays", async () => {
    const { applyStripeWebhookEvent } = await import("./billing-store");
    const { getBillingOverview } = await import("./billing-entitlements");
    const { organizationId } = await seedOrganization();
    stripe.subscriptions.retrieve.mockResolvedValue(subscription({ metadata: { organizationId, planKey: "growth" } }));

    const completed = event("checkout.session.completed", { id: "cs_1", mode: "subscription", subscription: "sub_1", client_reference_id: organizationId, metadata: { organizationId } });
    expect(await applyStripeWebhookEvent(completed)).toEqual({ duplicate: false });
    expect(await applyStripeWebhookEvent(completed)).toEqual({ duplicate: true });

    const overview = await getBillingOverview(organizationId);
    expect(overview).toMatchObject({ active: true, planKey: "growth", status: "active" });
    expect(overview.credits.included).toBe(600);
  });

  it("keeps a failed renewal working inside the grace period and records the error", async () => {
    const { applyStripeWebhookEvent } = await import("./billing-store");
    const { getBillingOverview } = await import("./billing-entitlements");
    const { sendBillingNotice } = await import("./billing-email");
    const { organizationId } = await seedOrganization();
    stripe.subscriptions.retrieve.mockResolvedValue(subscription({ metadata: { organizationId } }));
    await applyStripeWebhookEvent(event("customer.subscription.created", { id: "sub_1" }));

    stripe.subscriptions.retrieve.mockResolvedValue(subscription({ status: "past_due", metadata: { organizationId } }));
    await applyStripeWebhookEvent(event("invoice.payment_failed", {
      id: "in_1", customer: "cus_1", attempt_count: 1, amount_due: 24_900, currency: "usd", hosted_invoice_url: "https://invoice.stripe.com/i/1",
      parent: { subscription_details: { subscription: "sub_1" } }, last_finalization_error: null,
    }));

    const overview = await getBillingOverview(organizationId);
    expect(overview.status).toBe("past_due");
    expect(overview.active).toBe(true);
    expect(overview.graceEndsAt).not.toBeNull();
    expect(overview.lastPaymentError).toBe("The renewal payment failed.");
    expect(sendBillingNotice).toHaveBeenCalledWith(expect.objectContaining({ organizationId, kind: "payment_failed" }));

    stripe.subscriptions.retrieve.mockResolvedValue(subscription({ metadata: { organizationId } }));
    await applyStripeWebhookEvent(event("invoice.paid", { id: "in_1", customer: "cus_1", parent: { subscription_details: { subscription: "sub_1" } } }));
    const recovered = await getBillingOverview(organizationId);
    expect(recovered).toMatchObject({ status: "active", pastDueSince: null, lastPaymentError: null });
  });

  it("revokes the unused part of a refunded credit pack only once", async () => {
    const { applyStripeWebhookEvent } = await import("./billing-store");
    const { getDatabase } = await import("./database");
    const { prospectCreditGrants } = await import("./database/schema");
    const { organizationId } = await seedOrganization();
    const session = { id: "cs_topup", mode: "payment", payment_status: "paid", client_reference_id: organizationId, created: Math.floor(Date.now() / 1_000), metadata: { organizationId, packageKey: "credits_500" } };
    await applyStripeWebhookEvent(event("checkout.session.completed", session));
    stripe.checkout.sessions.list.mockResolvedValue({ data: [session] });

    const halfRefund = { id: "ch_1", payment_intent: "pi_1", amount: 19_900, amount_refunded: 9_950 };
    await applyStripeWebhookEvent(event("charge.refunded", halfRefund));
    await applyStripeWebhookEvent(event("charge.refunded", halfRefund));
    let [grant] = await getDatabase().select().from(prospectCreditGrants).where(eq(prospectCreditGrants.organizationId, organizationId));
    expect(grant?.remaining).toBe(250);

    await applyStripeWebhookEvent(event("charge.refunded", { ...halfRefund, amount_refunded: 19_900 }));
    [grant] = await getDatabase().select().from(prospectCreditGrants).where(eq(prospectCreditGrants.organizationId, organizationId));
    expect(grant?.remaining).toBe(0);
  });

  it("stores the processing error and rethrows so Stripe retries", async () => {
    const { applyStripeWebhookEvent } = await import("./billing-store");
    const { getDatabase } = await import("./database");
    const { providerEvents } = await import("./database/schema");
    stripe.subscriptions.retrieve.mockRejectedValue(new Error("Stripe unavailable"));
    const failing = event("customer.subscription.updated", { id: "sub_missing" });
    await expect(applyStripeWebhookEvent(failing)).rejects.toThrow("Stripe unavailable");
    const [row] = await getDatabase().select().from(providerEvents).where(eq(providerEvents.providerEventId, (failing as { id: string }).id));
    expect(row).toMatchObject({ processedAt: null, processingError: "Stripe unavailable" });
  });
});
