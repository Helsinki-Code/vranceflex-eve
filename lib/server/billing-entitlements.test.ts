import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeProspectCredit,
  getBillingOverview,
  grantTopUpCredits,
  monthlyCreditWindow,
  requireActivePlan,
  releaseProspectCredits,
  reserveProspectCredits,
} from "./billing-entitlements";
import { getDatabase } from "./database";
import {
  campaignCandidates,
  organizationBilling,
  prospectCreditGrants,
  usageLedger,
} from "./database/schema";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedOrganization } from "./test-support/seed";

describe("monthly credit windows", () => {
  it("clamps month-end anniversaries without drifting", () => {
    const anchor = new Date("2026-01-31T10:00:00.000Z");
    const end = new Date("2027-01-31T10:00:00.000Z");
    expect(monthlyCreditWindow(anchor, new Date("2026-02-15T00:00:00.000Z"), end)).toEqual({
      start: new Date("2026-01-31T10:00:00.000Z"),
      end: new Date("2026-02-28T10:00:00.000Z"),
    });
    expect(monthlyCreditWindow(anchor, new Date("2026-03-15T00:00:00.000Z"), end)).toEqual({
      start: new Date("2026-02-28T10:00:00.000Z"),
      end: new Date("2026-03-31T10:00:00.000Z"),
    });
  });
});

describe.skipIf(!hasTestDatabase)("prospect credit accounting", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  async function paidCampaign() {
    const seeded = await seedOrganization();
    const campaignId = await seedCampaign(seeded.organizationId, seeded.userId);
    await getDatabase().insert(organizationBilling).values({
      organizationId: seeded.organizationId,
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
      planId: "price_test_growth",
      planKey: "growth",
      billingInterval: "month",
      status: "active",
      subscriptionStartedAt: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2099-09-01T00:00:00.000Z"),
    });
    return { ...seeded, campaignId };
  }

  async function candidate(input: {
    organizationId: string;
    campaignId: string;
    name: string;
  }) {
    const id = crypto.randomUUID();
    await getDatabase().insert(campaignCandidates).values({
      id,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      name: input.name,
      status: "discovered",
    });
    return id;
  }

  it("consumes a successful verification once and returns a failed reservation", async () => {
    const paid = await paidCampaign();
    const successful = await candidate({ ...paid, name: "Successful" });
    const failed = await candidate({ ...paid, name: "Failed" });
    expect((await getBillingOverview(paid.organizationId)).credits.available).toBe(600);

    await reserveProspectCredits({
      organizationId: paid.organizationId,
      campaignId: paid.campaignId,
      candidateIds: [successful, failed],
    });
    expect((await getBillingOverview(paid.organizationId)).credits.available).toBe(598);

    await consumeProspectCredit({
      organizationId: paid.organizationId,
      campaignId: paid.campaignId,
      candidateId: successful,
    });
    await consumeProspectCredit({
      organizationId: paid.organizationId,
      campaignId: paid.campaignId,
      candidateId: successful,
    });
    await releaseProspectCredits(paid.organizationId, [failed]);

    expect((await getBillingOverview(paid.organizationId)).credits.available).toBe(599);
    const [metered] = await getDatabase()
      .select({ total: sql<number>`count(*)::int` })
      .from(usageLedger)
      .where(
        and(
          eq(usageLedger.organizationId, paid.organizationId),
          eq(usageLedger.kind, "verified_prospect"),
        ),
      );
    expect(metered?.total).toBe(1);
  });

  it("uses included credits before a 12-month top-up and fulfills top-ups idempotently", async () => {
    const paid = await paidCampaign();
    await getBillingOverview(paid.organizationId);
    await getDatabase()
      .update(prospectCreditGrants)
      .set({ remaining: 1, quantity: 600 })
      .where(eq(prospectCreditGrants.source, "subscription"));

    expect(
      await grantTopUpCredits({
        organizationId: paid.organizationId,
        packageKey: "credits_100",
        checkoutSessionId: "cs_topup_once",
        purchasedAt: new Date(),
      }),
    ).toMatchObject({ granted: true, credits: 100 });
    expect(
      await grantTopUpCredits({
        organizationId: paid.organizationId,
        packageKey: "credits_100",
        checkoutSessionId: "cs_topup_once",
        purchasedAt: new Date(),
      }),
    ).toMatchObject({ granted: false, credits: 100 });
    const [topUpUsage] = await getDatabase()
      .select({ total: sql<number>`count(*)::int` })
      .from(usageLedger)
      .where(eq(usageLedger.kind, "topup_credits"));
    expect(topUpUsage?.total).toBe(1);

    const first = await candidate({ ...paid, name: "First" });
    const second = await candidate({ ...paid, name: "Second" });
    await reserveProspectCredits({
      organizationId: paid.organizationId,
      campaignId: paid.campaignId,
      candidateIds: [first, second],
    });

    const grants = await getDatabase()
      .select({ source: prospectCreditGrants.source, remaining: prospectCreditGrants.remaining })
      .from(prospectCreditGrants)
      .where(eq(prospectCreditGrants.organizationId, paid.organizationId));
    expect(grants.find((grant) => grant.source === "subscription")?.remaining).toBe(0);
    expect(grants.find((grant) => grant.source === "topup")?.remaining).toBe(99);
  });

  it("preserves used credits across upgrades and downgrades, and blocks past-due workspaces", async () => {
    const paid = await paidCampaign();
    await getBillingOverview(paid.organizationId);
    await getDatabase()
      .update(prospectCreditGrants)
      .set({ remaining: 500 })
      .where(eq(prospectCreditGrants.source, "subscription"));

    await getDatabase()
      .update(organizationBilling)
      .set({ planKey: "launch" })
      .where(eq(organizationBilling.organizationId, paid.organizationId));
    expect((await getBillingOverview(paid.organizationId)).credits.included).toBe(50);

    await getDatabase()
      .update(organizationBilling)
      .set({ planKey: "growth" })
      .where(eq(organizationBilling.organizationId, paid.organizationId));
    expect((await getBillingOverview(paid.organizationId)).credits.included).toBe(500);

    await getDatabase()
      .update(organizationBilling)
      .set({ status: "past_due" })
      .where(eq(organizationBilling.organizationId, paid.organizationId));
    await expect(requireActivePlan(paid.organizationId)).rejects.toMatchObject({ status: 402 });
  });
});
