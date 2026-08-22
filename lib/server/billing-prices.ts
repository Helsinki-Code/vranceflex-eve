import {
  billingIntervalSchema,
  isPaidPlanKey,
  paidPlanKeys,
  planCatalog,
  selfServePlanKeySchema,
  topUpCatalog,
  topUpPackageKeySchema,
  type BillingInterval,
  type PaidPlanKey,
  type SelfServePlanKey,
  type TopUpPackageKey,
} from "../domain/billing";

const subscriptionPriceVariables: Record<
  PaidPlanKey,
  Partial<Record<BillingInterval, string>>
> = {
  launch: {
    month: "STRIPE_PRICE_ID_LAUNCH_MONTHLY",
    year: "STRIPE_PRICE_ID_LAUNCH_YEARLY",
  },
  growth: {
    month: "STRIPE_PRICE_ID_GROWTH_MONTHLY",
    year: "STRIPE_PRICE_ID_GROWTH_YEARLY",
  },
  agency: {
    month: "STRIPE_PRICE_ID_AGENCY_MONTHLY",
    year: "STRIPE_PRICE_ID_AGENCY_YEARLY",
  },
  enterprise: {
    month: "STRIPE_PRICE_ID_ENTERPRISE",
  },
};

const topUpPriceVariables: Record<TopUpPackageKey, string> = {
  credits_100: "STRIPE_PRICE_ID_TOPUP_100",
  credits_500: "STRIPE_PRICE_ID_TOPUP_500",
  credits_2000: "STRIPE_PRICE_ID_TOPUP_2000",
};

function configuredValue(name: string | undefined) {
  return name ? process.env[name]?.trim() || null : null;
}

export function subscriptionPriceId(
  plan: SelfServePlanKey,
  interval: BillingInterval,
) {
  const configured = configuredValue(subscriptionPriceVariables[plan][interval]);
  if (configured) return configured;
  // Keep existing deployments functional while they migrate the old Pro price.
  if (plan === "growth" && interval === "month") {
    return process.env.STRIPE_PRICE_ID_PRO?.trim() || null;
  }
  return null;
}

export function topUpPriceId(packageKey: TopUpPackageKey) {
  return configuredValue(topUpPriceVariables[packageKey]);
}

export function subscriptionPriceDetails(priceId: string) {
  for (const plan of paidPlanKeys) {
    for (const interval of ["month", "year"] as const) {
      const configured = configuredValue(subscriptionPriceVariables[plan][interval]);
      if (configured === priceId) return { plan, interval };
    }
  }
  if (process.env.STRIPE_PRICE_ID_PRO?.trim() === priceId) {
    return { plan: "growth" as const, interval: "month" as const };
  }
  return null;
}

export function topUpPackageForPrice(priceId: string) {
  for (const packageKey of topUpPackageKeySchema.options) {
    if (topUpPriceId(packageKey) === priceId) return packageKey;
  }
  return null;
}

export function checkoutConfiguration() {
  return {
    plans: selfServePlanKeySchema.options.map((key) => ({
      ...planCatalog[key],
      monthlyConfigured: Boolean(subscriptionPriceId(key, "month")),
      annualConfigured: Boolean(subscriptionPriceId(key, "year")),
    })),
    topUps: topUpPackageKeySchema.options.map((key) => ({
      ...topUpCatalog[key],
      configured: Boolean(topUpPriceId(key)),
    })),
  };
}

export function parseCheckoutPlan(value: unknown) {
  return selfServePlanKeySchema.parse(value);
}

export function parseBillingInterval(value: unknown) {
  return billingIntervalSchema.parse(value);
}

export function parseTopUpPackage(value: unknown) {
  return topUpPackageKeySchema.parse(value);
}

export function metadataPlan(value: string | null | undefined) {
  return isPaidPlanKey(value) ? value : null;
}
