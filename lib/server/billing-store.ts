import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import {
  PAYMENT_GRACE_DAYS,
  planCatalog,
  planRank,
  selfServePlanKeySchema,
  topUpCatalog,
  topUpPackageKeySchema,
  type BillingInterval,
  type SelfServePlanKey,
  type TopUpPackageKey,
} from "../domain/billing";
import type { ApiActor } from "./api-actor";
import { AuthRequestError } from "./auth-errors";
import { getBillingOverview, grantTopUpCredits } from "./billing-entitlements";
import { sendBillingNotice } from "./billing-email";
import {
  metadataPlan,
  subscriptionPriceDetails,
  subscriptionPriceId,
  topUpPackageForPrice,
  topUpPriceId,
} from "./billing-prices";
import { getStripeClient } from "./stripe-client";
import { getDatabase } from "./database";
import {
  organizationBilling,
  organizations,
  prospectCreditGrants,
  providerEvents,
  usageLedger,
} from "./database/schema";

// Stripe statuses that mean a subscription still exists and must be changed
// through the portal or plan-change flow rather than a second checkout.
const LIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due", "unpaid", "incomplete"]);

function requireBillingAccess(actor: ApiActor) {
  if (!["admin", "billing"].includes(actor.organizationRole)) {
    throw new AuthRequestError(
      "Admin or billing permission is required to manage billing.",
      403,
    );
  }
}

export function canManageBilling(role: ApiActor["organizationRole"]) {
  return role === "admin" || role === "billing";
}

function baseUrl() {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  throw new AuthRequestError(
    "APP_BASE_URL must be configured to start a checkout session.",
    503,
  );
}

function automaticTaxEnabled() {
  // Stripe rejects automatic_tax until Stripe Tax is activated for the account,
  // so it is opt-in rather than assumed.
  return process.env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase() === "true";
}

function customerIdOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

export async function getBillingSummary(actor: ApiActor) {
  const database = getDatabase();
  const [billing] = await database
    .select()
    .from(organizationBilling)
    .where(eq(organizationBilling.organizationId, actor.organizationId))
    .limit(1);
  return (
    billing ?? {
      organizationId: actor.organizationId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      planId: null,
      planKey: null,
      billingInterval: null,
      status: "none" as const,
      subscriptionStartedAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      pastDueSince: null,
      lastPaymentError: null,
    }
  );
}

// One Stripe Customer per workspace, created before the first checkout so every
// later session, invoice and portal visit lands on the same customer record.
async function ensureStripeCustomer(actor: ApiActor) {
  const database = getDatabase();
  const billing = await getBillingSummary(actor);
  if (billing.stripeCustomerId) return billing.stripeCustomerId;
  const [organization] = await database
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId))
    .limit(1);
  if (!organization) throw new AuthRequestError("Workspace was not found.", 400);
  const customer = await getStripeClient().customers.create(
    {
      name: organization.name,
      email: actor.email,
      metadata: { organizationId: actor.organizationId },
    },
    { idempotencyKey: `vranceflex-customer-${actor.organizationId}` },
  );
  await database
    .insert(organizationBilling)
    .values({ organizationId: actor.organizationId, stripeCustomerId: customer.id, status: "none" })
    .onConflictDoUpdate({
      target: organizationBilling.organizationId,
      set: { stripeCustomerId: sql`coalesce(${organizationBilling.stripeCustomerId}, ${customer.id})`, updatedAt: new Date() },
    });
  const refreshed = await getBillingSummary(actor);
  return refreshed.stripeCustomerId ?? customer.id;
}

async function findLiveSubscription(customerId: string) {
  const subscriptions = await getStripeClient().subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  return subscriptions.data.find((subscription) => LIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) ?? null;
}

// Short buckets let a double-click reuse one Checkout Session without pinning
// a user to a stale session for the whole 24h idempotency window.
function checkoutIdempotencyKey(parts: string[]) {
  const bucket = Math.floor(Date.now() / (5 * 60_000));
  return `vranceflex-checkout-${parts.join("-")}-${bucket}`;
}

export async function createSubscriptionCheckout(
  actor: ApiActor,
  input: { plan: SelfServePlanKey; interval: BillingInterval },
) {
  requireBillingAccess(actor);
  const plan = selfServePlanKeySchema.parse(input.plan);
  const priceId = subscriptionPriceId(plan, input.interval);
  if (!priceId) throw new AuthRequestError("This plan is not configured in Stripe yet.", 503);

  const customerId = await ensureStripeCustomer(actor);
  const live = await findLiveSubscription(customerId);
  if (live) {
    await upsertBillingFromSubscription(actor.organizationId, live);
    throw new AuthRequestError(
      "This workspace already has a subscription. Change its plan from the billing page instead.",
      409,
    );
  }

  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: actor.organizationId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      ...(automaticTaxEnabled() ? { automatic_tax: { enabled: true } } : {}),
      success_url: `${baseUrl()}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl()}/settings/billing?checkout=cancelled`,
      metadata: {
        organizationId: actor.organizationId,
        checkoutKind: "subscription",
        planKey: plan,
        billingInterval: input.interval,
      },
      subscription_data: {
        metadata: {
          organizationId: actor.organizationId,
          planKey: plan,
          billingInterval: input.interval,
        },
      },
    },
    { idempotencyKey: checkoutIdempotencyKey([actor.organizationId, plan, input.interval]) },
  );

  if (!session.url) {
    throw new AuthRequestError("Stripe did not return a checkout URL.", 502);
  }
  return { url: session.url };
}

export async function changeSubscriptionPlan(
  actor: ApiActor,
  input: { plan: SelfServePlanKey; interval: BillingInterval },
) {
  requireBillingAccess(actor);
  const plan = selfServePlanKeySchema.parse(input.plan);
  const priceId = subscriptionPriceId(plan, input.interval);
  if (!priceId) throw new AuthRequestError("This plan is not configured in Stripe yet.", 503);
  const billing = await getBillingSummary(actor);
  if (!billing.stripeSubscriptionId) {
    throw new AuthRequestError("There is no subscription to change yet. Choose a plan to start one.", 400);
  }
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(billing.stripeSubscriptionId);
  const item = subscription.items.data[0];
  if (!item) throw new AuthRequestError("The subscription has no plan item to change.", 409);
  if (item.price.id === priceId) {
    return { changed: false };
  }

  const current = subscriptionPriceDetails(item.price.id);
  const currentMonthly = current ? planCatalog[current.plan].monthlyPriceUsd * (current.interval === "year" ? 10 / 12 : 1) : 0;
  const nextMonthly = planCatalog[plan].monthlyPriceUsd * (input.interval === "year" ? 10 / 12 : 1);
  const upgrade = !current || planRank(plan) > planRank(current.plan) || nextMonthly > currentMonthly || input.interval === "year" && current.interval === "month";

  // Upgrades are charged now so the new credits are paid for when granted;
  // downgrades are credited against the next invoice.
  const updated = await stripe.subscriptions.update(
    subscription.id,
    {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: upgrade ? "always_invoice" : "create_prorations",
      payment_behavior: upgrade ? "pending_if_incomplete" : "allow_incomplete",
      cancel_at_period_end: false,
      metadata: { ...subscription.metadata, organizationId: actor.organizationId, planKey: plan, billingInterval: input.interval },
    },
    { idempotencyKey: `vranceflex-plan-change-${subscription.id}-${priceId}-${Math.floor(Date.now() / 60_000)}` },
  );
  const pending = Boolean(updated.pending_update);
  if (!pending) await upsertBillingFromSubscription(actor.organizationId, updated);
  return { changed: !pending, pending };
}

export async function createTopUpCheckout(
  actor: ApiActor,
  input: { packageKey: TopUpPackageKey },
) {
  requireBillingAccess(actor);
  const packageKey = topUpPackageKeySchema.parse(input.packageKey);
  const overview = await getBillingOverview(actor.organizationId);
  if (!overview.active) {
    throw new AuthRequestError("An active subscription is required before purchasing credit top-ups.", 402);
  }
  const priceId = topUpPriceId(packageKey);
  if (!priceId) throw new AuthRequestError("This credit top-up is not configured in Stripe yet.", 503);
  const customerId = await ensureStripeCustomer(actor);
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: "payment",
      customer: customerId,
      client_reference_id: actor.organizationId,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      invoice_creation: { enabled: true, invoice_data: { description: `${topUpCatalog[packageKey].credits} VranceFlex prospect credits`, metadata: { organizationId: actor.organizationId, packageKey } } },
      ...(automaticTaxEnabled() ? { automatic_tax: { enabled: true } } : {}),
      success_url: `${baseUrl()}/settings/billing?topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl()}/settings/billing?topup=cancelled`,
      metadata: {
        organizationId: actor.organizationId,
        checkoutKind: "prospect_credit_topup",
        packageKey,
        credits: String(topUpCatalog[packageKey].credits),
      },
      payment_intent_data: { metadata: { organizationId: actor.organizationId, packageKey } },
    },
    { idempotencyKey: checkoutIdempotencyKey([actor.organizationId, packageKey]) },
  );
  if (!session.url) throw new AuthRequestError("Stripe did not return a checkout URL.", 502);
  return { url: session.url };
}

export async function createPortalSession(actor: ApiActor, flow?: "payment_method_update" | "subscription_cancel") {
  requireBillingAccess(actor);
  const stripe = getStripeClient();
  const billing = await getBillingSummary(actor);
  if (!billing.stripeCustomerId) {
    throw new AuthRequestError("No billing customer exists for this workspace yet.", 400);
  }
  const configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  const returnUrl = `${baseUrl()}/settings/billing`;
  const flowData: Stripe.BillingPortal.SessionCreateParams.FlowData | undefined =
    flow === "payment_method_update"
      ? { type: "payment_method_update" }
      : flow === "subscription_cancel" && billing.stripeSubscriptionId
        ? { type: "subscription_cancel", subscription_cancel: { subscription: billing.stripeSubscriptionId }, after_completion: { type: "redirect", redirect: { return_url: returnUrl } } }
        : undefined;

  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: returnUrl,
    ...(configuration ? { configuration } : {}),
    ...(flowData ? { flow_data: flowData } : {}),
  });

  return { url: session.url };
}

export async function resumeSubscription(actor: ApiActor) {
  requireBillingAccess(actor);
  const billing = await getBillingSummary(actor);
  if (!billing.stripeSubscriptionId) throw new AuthRequestError("There is no subscription to resume.", 400);
  const updated = await getStripeClient().subscriptions.update(billing.stripeSubscriptionId, { cancel_at_period_end: false });
  await upsertBillingFromSubscription(actor.organizationId, updated);
  return { resumed: true };
}

export type InvoiceSummary = {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
  created: string;
  description: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

export async function listInvoices(actor: ApiActor): Promise<InvoiceSummary[]> {
  requireBillingAccess(actor);
  const billing = await getBillingSummary(actor);
  if (!billing.stripeCustomerId) return [];
  const invoices = await getStripeClient().invoices.list({ customer: billing.stripeCustomerId, limit: 12 });
  return invoices.data
    .filter((invoice) => invoice.status !== "draft")
    .map((invoice) => ({
      id: invoice.id ?? "",
      number: invoice.number ?? null,
      status: invoice.status ?? null,
      amountPaid: invoice.amount_paid,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      created: new Date(invoice.created * 1_000).toISOString(),
      description: invoice.lines.data[0]?.description ?? invoice.description ?? null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
    }));
}

function subscriptionStatusFor(status: Stripe.Subscription.Status) {
  switch (status) {
    case "trialing":
      return "trialing" as const;
    case "active":
      return "active" as const;
    case "past_due":
    case "unpaid":
      return "past_due" as const;
    case "canceled":
    case "incomplete_expired":
      return "canceled" as const;
    default:
      return "incomplete" as const;
  }
}

export async function upsertBillingFromSubscription(
  organizationId: string,
  subscription: Stripe.Subscription,
) {
  const item = subscription.items.data[0];
  const priceDetails = item ? subscriptionPriceDetails(item.price.id) : null;
  const planKey = priceDetails?.plan ?? metadataPlan(subscription.metadata.planKey);
  const interval =
    priceDetails?.interval ??
    (item?.price.recurring?.interval === "year" ? "year" : "month");
  const status = subscriptionStatusFor(subscription.status);
  const now = new Date();
  const values = {
    stripeCustomerId: customerIdOf(subscription.customer),
    stripeSubscriptionId: subscription.id,
    planId: item?.price.id ?? null,
    planKey,
    billingInterval: planKey ? interval : null,
    status,
    subscriptionStartedAt: new Date(subscription.start_date * 1_000),
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1_000)
      : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
    updatedAt: now,
  };
  const database = getDatabase();
  await database
    .insert(organizationBilling)
    .values({ organizationId, ...values, pastDueSince: status === "past_due" ? now : null })
    .onConflictDoUpdate({
      target: organizationBilling.organizationId,
      set: {
        ...values,
        // Keep the first failure time so the grace window cannot be extended by later events.
        pastDueSince: status === "past_due" ? sql`coalesce(${organizationBilling.pastDueSince}, now())` : null,
        lastPaymentError: status === "past_due" ? sql`${organizationBilling.lastPaymentError}` : null,
      },
    });
}

async function fulfillTopUpSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    return { granted: false, pending: true };
  }
  const organizationId = session.client_reference_id ?? session.metadata?.organizationId;
  const metadataPackage = topUpPackageKeySchema.safeParse(session.metadata?.packageKey);
  let packageKey = metadataPackage.success ? metadataPackage.data : null;
  if (!packageKey) {
    const lineItems = await getStripeClient().checkout.sessions.listLineItems(session.id, {
      limit: 1,
      expand: ["data.price"],
    });
    const price = lineItems.data[0]?.price;
    if (price) packageKey = topUpPackageForPrice(price.id);
  }
  if (!organizationId || !packageKey) {
    throw new Error("The paid credit top-up is missing its workspace or package mapping.");
  }
  return grantTopUpCredits({
    organizationId,
    packageKey,
    checkoutSessionId: session.id,
    purchasedAt: new Date(session.created * 1_000),
  });
}

// Refunds and disputes take back the unspent part of the top-up they paid for.
// Credits already consumed on verified prospects are not clawed back below zero.
async function revokeTopUpForCharge(charge: Stripe.Charge, fraction: number, reason: "refund" | "dispute") {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return { revoked: 0 };
  const sessions = await getStripeClient().checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const session = sessions.data[0];
  if (!session || session.mode !== "payment") return { revoked: 0 };
  const organizationId = session.client_reference_id ?? session.metadata?.organizationId;
  if (!organizationId) return { revoked: 0 };
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    const [grant] = await transaction
      .select()
      .from(prospectCreditGrants)
      .where(and(eq(prospectCreditGrants.organizationId, organizationId), eq(prospectCreditGrants.sourceKey, `topup:${session.id}`)))
      .for("update")
      .limit(1);
    if (!grant) return { revoked: 0 };
    // amount_refunded is cumulative, so compare the target against what earlier
    // refund events already revoked instead of revoking the full fraction again.
    const [previous] = await transaction
      .select({ total: sql<number>`coalesce(-sum(${usageLedger.quantity}), 0)::int` })
      .from(usageLedger)
      .where(and(eq(usageLedger.organizationId, organizationId), sql`${usageLedger.idempotencyKey} like ${`topup-revoke/${session.id}/%`}`));
    const target = Math.round(grant.quantity * Math.min(1, Math.max(0, fraction)));
    const revoke = Math.min(grant.remaining, Math.max(0, target - (previous?.total ?? 0)));
    if (revoke === 0) return { revoked: 0 };
    const [ledger] = await transaction
      .insert(usageLedger)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        campaignId: null,
        kind: "topup_credits",
        quantity: -revoke,
        idempotencyKey: `topup-revoke/${session.id}/${reason}/${target}`,
        metadata: { grantId: grant.id, reason, chargeId: charge.id },
        occurredAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: usageLedger.id });
    if (!ledger) return { revoked: 0 };
    await transaction
      .update(prospectCreditGrants)
      .set({ remaining: grant.remaining - revoke, updatedAt: new Date() })
      .where(eq(prospectCreditGrants.id, grant.id));
    return { revoked: revoke };
  });
}

async function organizationForStripeObject(input: { subscriptionId?: string | null; customerId?: string | null; metadataOrganizationId?: string | null }) {
  const database = getDatabase();
  if (input.subscriptionId) {
    const [row] = await database.select({ organizationId: organizationBilling.organizationId }).from(organizationBilling).where(eq(organizationBilling.stripeSubscriptionId, input.subscriptionId)).limit(1);
    if (row) return row.organizationId;
  }
  if (input.customerId) {
    const [row] = await database.select({ organizationId: organizationBilling.organizationId }).from(organizationBilling).where(eq(organizationBilling.stripeCustomerId, input.customerId)).limit(1);
    if (row) return row.organizationId;
  }
  return input.metadataOrganizationId ?? null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const fromParent = invoice.parent?.subscription_details?.subscription;
  if (fromParent) return typeof fromParent === "string" ? fromParent : fromParent.id;
  return null;
}

async function syncSubscription(subscriptionId: string, fallbackOrganizationId?: string | null) {
  // Always read the live object: webhook delivery order is not guaranteed, so a
  // stale payload must never overwrite newer state.
  const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
  const organizationId = await organizationForStripeObject({
    subscriptionId: subscription.id,
    customerId: customerIdOf(subscription.customer),
    metadataOrganizationId: subscription.metadata.organizationId ?? fallbackOrganizationId ?? null,
  });
  if (organizationId) await upsertBillingFromSubscription(organizationId, subscription);
  return organizationId;
}

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const organizationId = session.client_reference_id ?? session.metadata?.organizationId ?? null;
      if (session.mode === "subscription" && session.subscription) {
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(subscriptionId, organizationId);
      } else if (session.mode === "payment") {
        await fulfillTopUpSession(session);
      }
      return organizationId;
    }
    case "checkout.session.async_payment_succeeded": {
      await fulfillTopUpSession(event.data.object);
      return event.data.object.client_reference_id ?? null;
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      // Nothing was granted for these sessions; recording the event is enough.
      return event.data.object.client_reference_id ?? null;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return syncSubscription(event.data.object.id);
    case "invoice.paid": {
      const subscriptionId = invoiceSubscriptionId(event.data.object);
      return subscriptionId ? syncSubscription(subscriptionId) : null;
    }
    case "invoice.payment_failed":
    case "invoice.payment_action_required": {
      const invoice = event.data.object;
      const subscriptionId = invoiceSubscriptionId(invoice);
      const organizationId = subscriptionId
        ? await syncSubscription(subscriptionId)
        : await organizationForStripeObject({ customerId: customerIdOf(invoice.customer) });
      if (!organizationId) return null;
      const message = invoice.last_finalization_error?.message ?? (event.type === "invoice.payment_action_required" ? "Payment needs customer authentication." : "The renewal payment failed.");
      await getDatabase()
        .update(organizationBilling)
        .set({ lastPaymentError: message, updatedAt: new Date() })
        .where(eq(organizationBilling.organizationId, organizationId));
      // Only the first attempt emails; Stripe's own dunning emails cover retries.
      if (event.type === "invoice.payment_action_required" || (invoice.attempt_count ?? 1) <= 1) {
        await sendBillingNotice({
          organizationId,
          kind: event.type === "invoice.payment_failed" ? "payment_failed" : "payment_action_required",
          hostedInvoiceUrl: invoice.hosted_invoice_url,
          amountDue: invoice.amount_due,
          currency: invoice.currency,
        });
      }
      return organizationId;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const fraction = charge.amount ? charge.amount_refunded / charge.amount : 0;
      await revokeTopUpForCharge(charge, fraction, "refund");
      return null;
    }
    case "charge.dispute.created": {
      const dispute = event.data.object;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
      const charge = await getStripeClient().charges.retrieve(chargeId);
      await revokeTopUpForCharge(charge, 1, "dispute");
      return null;
    }
    default:
      return null;
  }
}

export async function applyStripeWebhookEvent(event: Stripe.Event) {
  const database = getDatabase();
  const [inserted] = await database
    .insert(providerEvents)
    .values({
      id: crypto.randomUUID(),
      provider: "stripe",
      providerEventId: event.id,
      eventType: event.type,
      payload: { livemode: event.livemode, objectId: (event.data.object as { id?: string }).id ?? null },
      occurredAt: new Date(event.created * 1_000),
    })
    .onConflictDoNothing()
    .returning({ id: providerEvents.id, processedAt: providerEvents.processedAt });

  let eventRecord = inserted;
  if (!eventRecord) {
    const [existing] = await database
      .select({ id: providerEvents.id, processedAt: providerEvents.processedAt })
      .from(providerEvents)
      .where(
        and(
          eq(providerEvents.provider, "stripe"),
          eq(providerEvents.providerEventId, event.id),
        ),
      )
      .limit(1);
    if (existing?.processedAt) return { duplicate: true };
    eventRecord = existing;
  }
  if (!eventRecord) throw new Error("The Stripe event could not be reserved.");

  try {
    const organizationId = await handleStripeEvent(event);
    await database
      .update(providerEvents)
      .set({ processedAt: new Date(), processingError: null, ...(organizationId ? { organizationId } : {}) })
      .where(eq(providerEvents.id, eventRecord.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await database
      .update(providerEvents)
      .set({ processingError: message.slice(0, 2_000) })
      .where(eq(providerEvents.id, eventRecord.id))
      .catch(() => undefined);
    throw error;
  }

  return { duplicate: false };
}

// Pulls every known subscription from Stripe. Run by the daily cron so a missed
// or failed webhook can never leave a workspace locked out or over-entitled.
export async function reconcileSubscriptions() {
  const database = getDatabase();
  const rows = await database
    .select({ organizationId: organizationBilling.organizationId, subscriptionId: organizationBilling.stripeSubscriptionId })
    .from(organizationBilling);
  let synced = 0;
  const failures: string[] = [];
  for (const row of rows) {
    if (!row.subscriptionId) continue;
    try {
      const subscription = await getStripeClient().subscriptions.retrieve(row.subscriptionId);
      await upsertBillingFromSubscription(row.organizationId, subscription);
      synced += 1;
    } catch (error) {
      failures.push(`${row.organizationId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { synced, failures, graceDays: PAYMENT_GRACE_DAYS };
}
