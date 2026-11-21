import { describe, expect, it } from "vitest";
import { campaignCreateSchema } from "./campaign";

const base = {
  businessName: "Acme",
  productName: "Acme Widget",
  productSummary: "A widget that saves operations teams real time every week.",
  source: { kind: "website" as const, url: "https://example.com" },
  audience: "Operations leaders at mid-market companies",
  geography: "United States",
  goal: "book_meetings" as const,
  leadCount: 25 as const,
  monthlyBudgetUsd: 500,
  channels: ["email" as const],
};

describe("campaign offer", () => {
  it("is optional", () => {
    expect(campaignCreateSchema.parse(base).offer).toBeUndefined();
  });

  it("turns an empty or blank offer into no offer", () => {
    expect(campaignCreateSchema.parse({ ...base, offer: "" }).offer).toBeUndefined();
    expect(campaignCreateSchema.parse({ ...base, offer: "   " }).offer).toBeUndefined();
  });

  it("keeps a good offer, trimmed", () => {
    expect(campaignCreateSchema.parse({ ...base, offer: "  A written plan for getting you onto page one  " }).offer).toBe(
      "A written plan for getting you onto page one",
    );
  });

  it.each(["20% off your first month", "A personalised demo", "A quick call to discuss", "A plan"])(
    "rejects the weak offer %j with a reason",
    (offer) => {
      const result = campaignCreateSchema.safeParse({ ...base, offer });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["offer"]);
      expect(result.error?.issues[0]?.message.length).toBeGreaterThan(20);
    },
  );
});
