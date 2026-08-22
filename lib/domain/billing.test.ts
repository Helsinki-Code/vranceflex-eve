import { describe, expect, it } from "vitest";
import { planCatalog, topUpCatalog } from "./billing";

describe("premium billing catalog", () => {
  it("prices annual self-serve plans at ten monthly payments", () => {
    expect(planCatalog.launch.annualPriceUsd).toBe(
      planCatalog.launch.monthlyPriceUsd * 10,
    );
    expect(planCatalog.growth.annualPriceUsd).toBe(
      planCatalog.growth.monthlyPriceUsd * 10,
    );
  });

  it("uses verified prospects as the primary value metric", () => {
    expect(planCatalog.launch.verifiedProspects).toBe(150);
    expect(planCatalog.growth.verifiedProspects).toBe(600);
    expect(planCatalog.agency.verifiedProspects).toBe(2_000);
    expect(planCatalog.enterprise.verifiedProspects).toBe(5_000);
  });

  it("keeps the published top-up packaging stable", () => {
    expect(topUpCatalog.credits_100).toMatchObject({ credits: 100, priceUsd: 49 });
    expect(topUpCatalog.credits_500).toMatchObject({ credits: 500, priceUsd: 199 });
    expect(topUpCatalog.credits_2000).toMatchObject({ credits: 2_000, priceUsd: 699 });
  });
});
