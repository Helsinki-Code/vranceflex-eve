import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedOrganization } from "./test-support/seed";

describe.skipIf(!hasTestDatabase)("workspace families share one plan", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  async function agencyWithChild() {
    const { getDatabase } = await import("./database");
    const { organizationBilling, organizations, organizationMemberships } = await import("./database/schema");
    const parent = await seedOrganization("Agency HQ");
    await getDatabase().insert(organizationMemberships).values({ organizationId: parent.organizationId, userId: parent.userId, role: "admin" });
    await getDatabase().insert(organizationBilling).values({
      organizationId: parent.organizationId,
      stripeCustomerId: "cus_agency",
      stripeSubscriptionId: "sub_agency",
      planId: "price_agency",
      planKey: "agency",
      billingInterval: "month",
      status: "active",
      subscriptionStartedAt: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2099-09-01T00:00:00.000Z"),
    });
    const childId = crypto.randomUUID();
    await getDatabase().insert(organizations).values({ id: childId, name: "Client A", billingOrganizationId: parent.organizationId });
    await getDatabase().insert(organizationMemberships).values({ organizationId: childId, userId: parent.userId, role: "admin" });
    return { parentId: parent.organizationId, childId, userId: parent.userId };
  }

  it("lets a child workspace spend the parent's credits and reports it as billed through the parent", async () => {
    const { getBillingOverview, reserveProspectCredits } = await import("./billing-entitlements");
    const { getDatabase } = await import("./database");
    const { campaignCandidates } = await import("./database/schema");
    const family = await agencyWithChild();
    const campaignId = await seedCampaign(family.childId, family.userId);
    const candidateId = crypto.randomUUID();
    await getDatabase().insert(campaignCandidates).values({ id: candidateId, organizationId: family.childId, campaignId, name: "Prospect", status: "discovered" });

    const before = await getBillingOverview(family.childId);
    expect(before).toMatchObject({ active: true, planKey: "agency", billedThrough: { id: family.parentId, name: "Agency HQ" } });
    expect(before.credits.available).toBe(2_000);

    await reserveProspectCredits({ organizationId: family.childId, campaignId, candidateIds: [candidateId] });
    // One pool: the parent sees the child's reservation too.
    expect((await getBillingOverview(family.parentId)).credits.available).toBe(1_999);
    expect((await getBillingOverview(family.parentId)).billedThrough).toBeNull();
    expect((await getBillingOverview(family.parentId)).usage).toMatchObject({ workspaces: 2, activeCampaigns: 1, seats: 1 });
  });

  it("stops creating workspaces at the plan limit and refuses child-level billing changes", async () => {
    const { assertWorkspaceCapacity } = await import("./billing-entitlements");
    const { getDatabase } = await import("./database");
    const { organizations } = await import("./database/schema");
    const { createSubscriptionCheckout } = await import("./billing-store");
    const family = await agencyWithChild();
    await expect(assertWorkspaceCapacity(family.childId)).resolves.toMatchObject({ billingOrganizationId: family.parentId });
    for (let index = 0; index < 3; index += 1) {
      await getDatabase().insert(organizations).values({ id: crypto.randomUUID(), name: `Client ${index}`, billingOrganizationId: family.parentId });
    }
    await expect(assertWorkspaceCapacity(family.parentId)).rejects.toMatchObject({ status: 402 });

    const [child] = await getDatabase().select().from(organizations).where(eq(organizations.id, family.childId));
    expect(child?.billingOrganizationId).toBe(family.parentId);
    await expect(createSubscriptionCheckout({ userId: family.userId, organizationId: family.childId, organizationRole: "admin", email: "a@example.com" }, { plan: "growth", interval: "month" }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("counts seats once per person across the family", async () => {
    const { assertSeatAvailable } = await import("./billing-entitlements");
    const { getDatabase } = await import("./database");
    const { organizationBilling } = await import("./database/schema");
    const family = await agencyWithChild();
    await getDatabase().update(organizationBilling).set({ planKey: "launch" }).where(eq(organizationBilling.organizationId, family.parentId));
    // Launch has 2 seats; the same admin in two workspaces uses one of them.
    await expect(assertSeatAvailable(family.childId)).resolves.toBeTruthy();
  });
});
