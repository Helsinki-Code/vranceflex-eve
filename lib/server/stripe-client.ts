import Stripe from "stripe";

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
    globalThis.__vranceflexStripe = new Stripe(
      process.env.STRIPE_SECRET_KEY!.trim(),
    );
  }
  return globalThis.__vranceflexStripe;
}
