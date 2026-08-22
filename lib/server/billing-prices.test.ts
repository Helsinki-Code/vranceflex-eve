import { afterEach, describe, expect, it, vi } from "vitest";
import {
  subscriptionPriceDetails,
  subscriptionPriceId,
  topUpPackageForPrice,
  topUpPriceId,
} from "./billing-prices";

describe("Stripe price mappings", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("maps subscription prices in both directions", () => {
    vi.stubEnv("STRIPE_PRICE_ID_LAUNCH_MONTHLY", "price_launch_month");
    vi.stubEnv("STRIPE_PRICE_ID_GROWTH_YEARLY", "price_growth_year");
    expect(subscriptionPriceId("launch", "month")).toBe("price_launch_month");
    expect(subscriptionPriceDetails("price_launch_month")).toEqual({
      plan: "launch",
      interval: "month",
    });
    expect(subscriptionPriceDetails("price_growth_year")).toEqual({
      plan: "growth",
      interval: "year",
    });
  });

  it("keeps the legacy Pro price mapped to Growth monthly during migration", () => {
    vi.stubEnv("STRIPE_PRICE_ID_GROWTH_MONTHLY", "");
    vi.stubEnv("STRIPE_PRICE_ID_PRO", "price_legacy_pro");
    expect(subscriptionPriceId("growth", "month")).toBe("price_legacy_pro");
    expect(subscriptionPriceDetails("price_legacy_pro")).toEqual({
      plan: "growth",
      interval: "month",
    });
  });

  it("maps one-time credit packages", () => {
    vi.stubEnv("STRIPE_PRICE_ID_TOPUP_500", "price_topup_500");
    expect(topUpPriceId("credits_500")).toBe("price_topup_500");
    expect(topUpPackageForPrice("price_topup_500")).toBe("credits_500");
  });
});
