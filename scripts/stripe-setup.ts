// Creates (or reuses) every Stripe object VranceFlex billing needs and prints the
// environment variables to copy into the hosting platform.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.ts \
//     --webhook-url https://app.example.com/api/webhooks/stripe
//
// Safe to re-run: products and prices are matched by lookup_key / metadata,
// the webhook endpoint by URL, and the portal configuration by metadata.
// Prices are immutable in Stripe, so a changed amount creates a new Price and
// moves the lookup_key to it; existing subscribers stay on their old Price.
import Stripe from "stripe";
import { planCatalog, topUpCatalog } from "../lib/domain/billing.ts";

const API_VERSION = "2026-06-24.dahlia";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "charge.refunded",
  "charge.dispute.created",
] as Stripe.WebhookEndpointCreateParams.EnabledEvent[];

const secret = process.env.STRIPE_SECRET_KEY?.trim();
if (!secret) {
  console.error("Set STRIPE_SECRET_KEY (use a test-mode key first).");
  process.exit(1);
}
const args = process.argv.slice(2);
function flag(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}
const webhookUrl = flag("--webhook-url");
const currency = (flag("--currency") ?? "usd").toLowerCase();

const stripe = new Stripe(secret, { apiVersion: API_VERSION as Stripe.LatestApiVersion });
const env: Record<string, string> = {};

async function ensureProduct(key: string, name: string, description: string) {
  const existing = await stripe.products.search({ query: `metadata['vranceflex_key']:'${key}'` }).catch(() => null);
  const found = existing?.data.find((product) => product.active) ?? null;
  if (found) {
    if (found.name !== name || found.description !== description) await stripe.products.update(found.id, { name, description });
    return found.id;
  }
  const product = await stripe.products.create({ name, description, metadata: { vranceflex_key: key } }, { idempotencyKey: `vranceflex-product-${key}` });
  return product.id;
}

async function ensurePrice(input: { lookupKey: string; product: string; unitAmount: number; recurring?: "month" | "year"; nickname: string }) {
  const existing = await stripe.prices.list({ lookup_keys: [input.lookupKey], active: true, limit: 1 });
  const current = existing.data[0];
  const matches = current && current.unit_amount === input.unitAmount && current.currency === currency && (current.recurring?.interval ?? null) === (input.recurring ?? null) && (typeof current.product === "string" ? current.product : current.product.id) === input.product;
  if (matches) return current.id;
  const price = await stripe.prices.create({
    product: input.product,
    currency,
    unit_amount: input.unitAmount,
    nickname: input.nickname,
    lookup_key: input.lookupKey,
    transfer_lookup_key: true,
    tax_behavior: "exclusive",
    ...(input.recurring ? { recurring: { interval: input.recurring } } : {}),
    metadata: { vranceflex_lookup_key: input.lookupKey },
  });
  return price.id;
}

const subscriptionPriceIds: string[] = [];
const portalProducts: Array<{ product: string; prices: string[] }> = [];

for (const plan of Object.values(planCatalog)) {
  if (plan.key === "enterprise") continue; // Sales-led; contracts are created by hand.
  const product = await ensureProduct(`plan_${plan.key}`, `VranceFlex ${plan.name}`, plan.description);
  const monthly = await ensurePrice({ lookupKey: `vranceflex_${plan.key}_monthly`, product, unitAmount: plan.monthlyPriceUsd * 100, recurring: "month", nickname: `${plan.name} monthly` });
  env[`STRIPE_PRICE_ID_${plan.key.toUpperCase()}_MONTHLY`] = monthly;
  const prices = [monthly];
  if (plan.annualPriceUsd) {
    const yearly = await ensurePrice({ lookupKey: `vranceflex_${plan.key}_yearly`, product, unitAmount: plan.annualPriceUsd * 100, recurring: "year", nickname: `${plan.name} annual` });
    env[`STRIPE_PRICE_ID_${plan.key.toUpperCase()}_YEARLY`] = yearly;
    prices.push(yearly);
  }
  subscriptionPriceIds.push(...prices);
  portalProducts.push({ product, prices });
}

const topUpProduct = await ensureProduct("prospect_credits", "VranceFlex prospect credits", "One-time verified-prospect credit packs. Valid for 12 months.");
for (const item of Object.values(topUpCatalog)) {
  env[`STRIPE_PRICE_ID_TOPUP_${item.credits}`] = await ensurePrice({ lookupKey: `vranceflex_topup_${item.credits}`, product: topUpProduct, unitAmount: item.priceUsd * 100, nickname: `${item.credits} credits` });
}

// Customer portal: plan switching between self-serve plans, cancel at period end,
// card updates and invoice history.
const portalFeatures: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
  customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id", "name"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "switched_service", "unused", "other"] } },
  subscription_update: { enabled: true, default_allowed_updates: ["price", "promotion_code"], proration_behavior: "create_prorations", products: portalProducts },
};
const portals = await stripe.billingPortal.configurations.list({ limit: 100 });
const existingPortal = portals.data.find((configuration) => configuration.metadata?.vranceflex === "portal" && configuration.active);
const portal = existingPortal
  ? await stripe.billingPortal.configurations.update(existingPortal.id, { features: portalFeatures })
  : await stripe.billingPortal.configurations.create({ features: portalFeatures, business_profile: { headline: "Manage your VranceFlex plan" }, metadata: { vranceflex: "portal" } });
env.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;

if (webhookUrl) {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = endpoints.data.find((endpoint) => endpoint.url === webhookUrl);
  if (existing && existing.api_version === API_VERSION) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: WEBHOOK_EVENTS, disabled: false });
    console.log(`Webhook ${existing.id} updated. Its signing secret is unchanged (Dashboard → Webhooks → reveal).`);
  } else {
    if (existing) {
      // The API version of an endpoint cannot be changed; replace it.
      await stripe.webhookEndpoints.del(existing.id);
      console.log(`Replaced webhook ${existing.id} because it used API version ${existing.api_version}.`);
    }
    const endpoint = await stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: WEBHOOK_EVENTS, api_version: API_VERSION, description: "VranceFlex billing" });
    env.STRIPE_WEBHOOK_SECRET = endpoint.secret ?? "";
  }
} else {
  console.log("No --webhook-url given. For local testing run:\n  stripe listen --forward-to localhost:3000/api/webhooks/stripe\nand copy the whsec_ it prints into STRIPE_WEBHOOK_SECRET.\n");
}

console.log(`# Stripe ${secret.startsWith("sk_live") ? "LIVE" : "test"} mode configuration`);
for (const [key, value] of Object.entries(env)) console.log(`${key}=${value}`);
