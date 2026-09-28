import Stripe from "stripe";

export const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

export class StripeConfigurationError extends Error {}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function assertStripeConfigured() {
  if (!isStripeConfigured()) {
    throw new StripeConfigurationError(
      "Stripe is not configured. Add STRIPE_SECRET_KEY.",
    );
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __vranceflexStripe: Stripe | undefined;
}

export function getStripeClient() {
  assertStripeConfigured();
  if (!globalThis.__vranceflexStripe) {
    globalThis.__vranceflexStripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim(), {
      // Pinned so webhook payloads and API responses share one shape. The
      // webhook endpoint in Stripe must use the same version (see
      // scripts/stripe-setup.ts); billing reads current_period_end from the
      // subscription item, which only exists on 2025-03-31 and later.
      apiVersion: STRIPE_API_VERSION,
      appInfo: { name: "VranceFlex" },
      maxNetworkRetries: 2,
    });
  }
  return globalThis.__vranceflexStripe;
}
