import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { ApiActor } from "./api-actor";
import { AuthRequestError } from "./auth-errors";
import { getStripeClient } from "./stripe-client";
import { getDatabase } from "./database";
import {
  organizationBilling,
  organizations,
  providerEvents,
} from "./database/schema";

function requireBillingAccess(actor: ApiActor) {
  if (!["admin", "billing"].includes(actor.organizationRole)) {
    throw new AuthRequestError(
      "Admin or billing permission is required to manage billing.",
      403,
    );
  }
}

function baseUrl() {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    throw new AuthRequestError(
      "APP_BASE_URL must be configured to start a checkout session.",
      503,
    );
  }
  return base;
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
      status: "none" as const,
      currentPeriodEnd: null,
    }
  );
}

const allowedPriceIds = () =>
  [process.env.STRIPE_PRICE_ID_PRO?.trim()].filter(
    (value): value is string => Boolean(value),
  );

export async function createCheckoutSession(
  actor: ApiActor,
  input: { priceId: string },
) {
  requireBillingAccess(actor);
  if (!allowedPriceIds().includes(input.priceId)) {
    throw new AuthRequestError("This plan is not available.", 400);
  }

  const stripe = getStripeClient();
  const database = getDatabase();
  const [organization] = await database
    .select()
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId))
    .limit(1);
  if (!organization) throw new AuthRequestError("Workspace was not found.", 400);

  const [billing] = await database
    .select()
    .from(organizationBilling)
    .where(eq(organizationBilling.organizationId, actor.organizationId))
    .limit(1);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: actor.organizationId,
    customer: billing?.stripeCustomerId ?? undefined,
    customer_email: billing?.stripeCustomerId ? undefined : actor.email,
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: `${baseUrl()}/settings/billing?checkout=success`,
    cancel_url: `${baseUrl()}/settings/billing?checkout=cancelled`,
    metadata: { organizationId: actor.organizationId },
  });

  if (!session.url) {
    throw new AuthRequestError("Stripe did not return a checkout URL.", 502);
  }

  await database
    .insert(organizationBilling)
    .values({
      organizationId: actor.organizationId,
      status: "none",
    })
    .onConflictDoNothing();

  return { url: session.url };
}

export async function createPortalSession(actor: ApiActor) {
  requireBillingAccess(actor);
  const stripe = getStripeClient();
  const billing = await getBillingSummary(actor);
  if (!billing.stripeCustomerId) {
    throw new AuthRequestError("No billing customer exists for this workspace yet.", 400);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: `${baseUrl()}/settings/billing`,
  });

  return { url: session.url };
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
      return "canceled" as const;
    default:
      return "incomplete" as const;
  }
}

async function upsertBillingFromSubscription(
  organizationId: string,
  subscription: Stripe.Subscription,
) {
  const item = subscription.items.data[0];
  const database = getDatabase();
  await database
    .insert(organizationBilling)
    .values({
      organizationId,
      stripeCustomerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      planId: item?.price.id ?? null,
      status: subscriptionStatusFor(subscription.status),
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1_000)
        : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: organizationBilling.organizationId,
      set: {
        stripeCustomerId:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id,
        stripeSubscriptionId: subscription.id,
        planId: item?.price.id ?? null,
        status: subscriptionStatusFor(subscription.status),
        currentPeriodEnd: item?.current_period_end
          ? new Date(item.current_period_end * 1_000)
          : null,
        updatedAt: new Date(),
      },
    });
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
      payload: {},
      occurredAt: new Date(event.created * 1_000),
    })
    .onConflictDoNothing()
    .returning({ id: providerEvents.id, processedAt: providerEvents.processedAt });

  let eventRecord = inserted;
  if (!eventRecord) {
    const [existing] = await database
      .select({ id: providerEvents.id, processedAt: providerEvents.processedAt })
      .from(providerEvents)
      .where(eq(providerEvents.providerEventId, event.id))
      .limit(1);
    if (existing?.processedAt) return { duplicate: true };
    eventRecord = existing;
  }
  if (!eventRecord) throw new Error("The Stripe event could not be reserved.");

  const stripe = getStripeClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const organizationId =
      session.client_reference_id ?? session.metadata?.organizationId;
    if (organizationId && session.subscription) {
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await upsertBillingFromSubscription(organizationId, subscription);
    }
  } else if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const [billing] = await database
      .select()
      .from(organizationBilling)
      .where(
        eq(
          organizationBilling.stripeSubscriptionId,
          subscription.id,
        ),
      )
      .limit(1);
    if (billing) {
      await upsertBillingFromSubscription(billing.organizationId, subscription);
    }
  }

  await database
    .update(providerEvents)
    .set({ processedAt: new Date() })
    .where(eq(providerEvents.id, eventRecord.id));

  return { duplicate: false };
}
