import { beforeEach, describe, expect, it } from "vitest";
import type { ApiActor } from "./api-actor";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedOrganization } from "./test-support/seed";

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";

describe.skipIf(!hasTestDatabase)("campaign offer storage", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  const input = {
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

  async function create(extra: { offer?: string }) {
    const { organizationId, userId } = await seedOrganization();
    const actor: ApiActor = { userId, organizationId, organizationRole: "admin" };
    const { campaignCreateSchema } = await import("../domain/campaign");
    const { createCampaign } = await import("./campaign-store");
    const result = await createCampaign(campaignCreateSchema.parse({ ...input, ...extra }), actor, crypto.randomUUID());
    return result!.campaign;
  }

  it("saves and returns the offer", async () => {
    const campaign = await create({ offer: "A written plan for getting you onto page one" });
    expect(campaign.offer).toBe("A written plan for getting you onto page one");
  });

  it("returns no offer when there is none", async () => {
    expect((await create({})).offer).toBeUndefined();
  });
});
