import { z } from "zod";

export const paidPlanKeys = ["launch", "growth", "agency", "enterprise"] as const;
export const paidPlanKeySchema = z.enum(paidPlanKeys);
export type PaidPlanKey = z.infer<typeof paidPlanKeySchema>;

export const billingIntervals = ["month", "year"] as const;
export const billingIntervalSchema = z.enum(billingIntervals);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export type PlanEntitlements = {
  key: PaidPlanKey;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number | null;
  verifiedProspects: number;
  seats: number;
  workspaces: number;
  activeCampaigns: number;
  discoveryRuns: number;
  support: "standard" | "priority" | "dedicated";
  selfServe: boolean;
};

export const planCatalog: Record<PaidPlanKey, PlanEntitlements> = {
  launch: {
    key: "launch",
    name: "Launch",
    description: "For founders and small businesses validating outbound.",
    monthlyPriceUsd: 99,
    annualPriceUsd: 990,
    verifiedProspects: 150,
    seats: 2,
    workspaces: 1,
    activeCampaigns: 3,
    discoveryRuns: 6,
    support: "standard",
    selfServe: true,
  },
  growth: {
    key: "growth",
    name: "Growth",
    description: "For teams running a consistent, measurable prospecting motion.",
    monthlyPriceUsd: 249,
    annualPriceUsd: 2_490,
    verifiedProspects: 600,
    seats: 5,
    workspaces: 1,
    activeCampaigns: 10,
    discoveryRuns: 30,
    support: "priority",
    selfServe: true,
  },
  agency: {
    key: "agency",
    name: "Agency",
    description: "For agencies and fractional GTM teams managing client work.",
    monthlyPriceUsd: 699,
    annualPriceUsd: 6_990,
    verifiedProspects: 2_000,
    seats: 15,
    workspaces: 5,
    activeCampaigns: 30,
    discoveryRuns: 100,
    support: "dedicated",
    selfServe: false,
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    description: "For governed sales organizations with custom scale and controls.",
    monthlyPriceUsd: 1_500,
    annualPriceUsd: null,
    verifiedProspects: 5_000,
    seats: 50,
    workspaces: 20,
    activeCampaigns: 100,
    discoveryRuns: 300,
    support: "dedicated",
    selfServe: false,
  },
};

export const selfServePlanKeySchema = z.enum(["launch", "growth"]);
export type SelfServePlanKey = z.infer<typeof selfServePlanKeySchema>;

export const topUpPackageKeys = ["credits_100", "credits_500", "credits_2000"] as const;
export const topUpPackageKeySchema = z.enum(topUpPackageKeys);
export type TopUpPackageKey = z.infer<typeof topUpPackageKeySchema>;

export const topUpCatalog: Record<
  TopUpPackageKey,
  { key: TopUpPackageKey; credits: number; priceUsd: number }
> = {
  credits_100: { key: "credits_100", credits: 100, priceUsd: 49 },
  credits_500: { key: "credits_500", credits: 500, priceUsd: 199 },
  credits_2000: { key: "credits_2000", credits: 2_000, priceUsd: 699 },
};

export function isPaidPlanKey(value: string | null | undefined): value is PaidPlanKey {
  return Boolean(value && paidPlanKeys.includes(value as PaidPlanKey));
}

export function planEntitlements(value: string | null | undefined) {
  return isPaidPlanKey(value) ? planCatalog[value] : null;
}
