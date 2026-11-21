import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "./api-actor";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedOrganization } from "./test-support/seed";

vi.mock("./parallel-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./parallel-client")>();
  return {
    ...actual,
    getEnrichmentRunStatus: vi.fn(),
    getEnrichmentRunResult: vi.fn(),
    getEnrichmentGroupStatus: vi.fn().mockResolvedValue({ status: { is_active: false } }),
  };
});
vi.mock("./billing-entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing-entitlements")>();
  return { ...actual, consumeProspectCredit: vi.fn(), releaseProspectCredits: vi.fn() };
});

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";

type Found = { email?: string; contact_number?: string; linkedin_url?: string; company?: string; job_title?: string };

// Imported one after another on purpose: importing the mocked modules and the
// module that uses them concurrently can create two copies of a mock.
async function modules() {
  const parallel = await import("./parallel-client");
  const billing = await import("./billing-entitlements");
  const store = await import("./candidate-store");
  const { getDatabase } = await import("./database");
  const schema = await import("./database/schema");
  return { database: getDatabase(), schema, parallel, billing, store };
}

/** Pretends to be the email verifier: the address decides the answer. */
function stubVerifier(answers: Record<string, unknown> | "outage") {
  vi.stubEnv("REOON_API_KEY", "test-key");
  const fetchMock = vi.fn(async (input: string) => {
    if (answers === "outage") return { ok: false, status: 500, json: async () => ({}) };
    const email = new URL(input).searchParams.get("email") ?? "";
    return { ok: true, status: 200, json: async () => answers[email] ?? { status: "unknown" } };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe.skipIf(!hasTestDatabase)("candidate email verification", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await truncateAllTables();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function setup(found: Found, options: { allowRisky?: boolean } = {}) {
    const { database, schema, parallel } = await modules();
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    await database.update(schema.campaigns).set({ status: "enriching" }).where(eq(schema.campaigns.id, campaignId));
    await database.insert(schema.enrichmentGroups).values({ campaignId, organizationId, taskgroupId: "tg_test", active: true });
    if (options.allowRisky) {
      await database.insert(schema.organizationSendingSettings).values({ organizationId, allowRiskyEmail: true });
    }
    const candidateId = crypto.randomUUID();
    await database.insert(schema.campaignCandidates).values({
      id: candidateId,
      organizationId,
      campaignId,
      name: "Sam Example",
      url: "https://acme.example",
      status: "enriching",
      parallelRunId: `run_${candidateId}`,
    });
    vi.mocked(parallel.getEnrichmentRunStatus).mockResolvedValue({ run_id: "r", status: "completed" });
    vi.mocked(parallel.getEnrichmentRunResult).mockResolvedValue({ output: { content: { linkedin_url: "https://linkedin.example/in/sam", company: "Acme", job_title: "Head of Ops", ...found } } } as never);
    const actor: ApiActor = { userId, organizationId, organizationRole: "admin" };
    return { actor, organizationId, campaignId, candidateId };
  }

  async function refresh(ctx: { actor: ApiActor; campaignId: string }) {
    const { store } = await modules();
    return store.refreshEnrichment(ctx.actor, ctx.campaignId);
  }
  async function candidate(candidateId: string) {
    const { database, schema } = await modules();
    const [row] = await database.select().from(schema.campaignCandidates).where(eq(schema.campaignCandidates.id, candidateId));
    return row;
  }

  it("verifies a deliverable address, charges the credit and records the verifier's cost", async () => {
    stubVerifier({ "sam@acme.example": { status: "safe" } });
    const ctx = await setup({ email: "sam@acme.example" });
    await refresh(ctx);

    const row = await candidate(ctx.candidateId);
    expect(row).toMatchObject({ status: "verified", emailStatus: "verified", emailVerifier: "reoon", email: "sam@acme.example" });
    expect(row.emailCheckedAt).not.toBeNull();
    const { billing, database, schema } = await modules();
    expect(billing.consumeProspectCredit).toHaveBeenCalledOnce();
    expect(billing.releaseProspectCredits).not.toHaveBeenCalled();
    const ledger = await database.select().from(schema.usageLedger).where(eq(schema.usageLedger.organizationId, ctx.organizationId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: "email_verification", quantity: 1, metadata: { verifier: "reoon", status: "verified" } });
  });

  it("does not charge for an address that would bounce", async () => {
    stubVerifier({ "sam@acme.example": { status: "invalid" } });
    const ctx = await setup({ email: "sam@acme.example" });
    await refresh(ctx);

    const row = await candidate(ctx.candidateId);
    expect(row).toMatchObject({ status: "failed", emailStatus: "invalid" });
    expect(row.errorMessage).toMatch(/would bounce.*not charged/);
    const { billing } = await modules();
    expect(billing.consumeProspectCredit).not.toHaveBeenCalled();
    expect(billing.releaseProspectCredits).toHaveBeenCalledOnce();
  });

  it("holds back a catch-all address unless the workspace allows risky sends", async () => {
    stubVerifier({ "sam@acme.example": { status: "catch_all" } });
    const blocked = await setup({ email: "sam@acme.example" });
    await refresh(blocked);
    const blockedRow = await candidate(blocked.candidateId);
    expect(blockedRow).toMatchObject({ status: "failed", emailStatus: "risky" });
    expect(blockedRow.errorMessage).toMatch(/Allow risky addresses/);

    await truncateAllTables();
    const allowed = await setup({ email: "sam@acme.example" }, { allowRisky: true });
    await refresh(allowed);
    expect(await candidate(allowed.candidateId)).toMatchObject({ status: "verified", emailStatus: "risky" });
  });

  it("fails clearly, without charging, when no verifier is configured", async () => {
    vi.stubEnv("REOON_API_KEY", "");
    vi.stubEnv("ZEROBOUNCE_API_KEY", "");
    const ctx = await setup({ email: "sam@acme.example" });
    await refresh(ctx);

    const row = await candidate(ctx.candidateId);
    expect(row).toMatchObject({ status: "failed", emailStatus: "unknown" });
    expect(row.errorMessage).toMatch(/verification isn't configured/);
    const { billing } = await modules();
    expect(billing.consumeProspectCredit).not.toHaveBeenCalled();
  });

  it("leaves the candidate in progress to retry when the verifier is down", async () => {
    stubVerifier("outage");
    const ctx = await setup({ email: "sam@acme.example" });
    await refresh(ctx);

    expect(await candidate(ctx.candidateId)).toMatchObject({ status: "enriching", emailStatus: "unknown" });
    const { billing } = await modules();
    expect(billing.consumeProspectCredit).not.toHaveBeenCalled();
    expect(billing.releaseProspectCredits).not.toHaveBeenCalled();
  });

  it("does not count a phone number as a usable channel while SMS is off", async () => {
    stubVerifier({});
    const ctx = await setup({ contact_number: "+15555550100" });
    await refresh(ctx);
    expect(await candidate(ctx.candidateId)).toMatchObject({ status: "failed" });
    const { billing } = await modules();
    expect(billing.releaseProspectCredits).toHaveBeenCalledOnce();
  });

  it("counts a phone number once SMS is enabled", async () => {
    vi.stubEnv("VRANCEFLEX_SMS_ENABLED", "true");
    stubVerifier({});
    const ctx = await setup({ contact_number: "+15555550100" });
    await refresh(ctx);
    expect(await candidate(ctx.candidateId)).toMatchObject({ status: "verified" });
  });

  describe("approving into leads", () => {
    async function approved(status: "safe" | "catch_all", allowRisky: boolean) {
      stubVerifier({ "sam@acme.example": { status } });
      const ctx = await setup({ email: "sam@acme.example" }, { allowRisky });
      await refresh(ctx);
      const { store, database, schema } = await modules();
      await store.approveCandidates(ctx.actor, ctx.campaignId, [ctx.candidateId]);
      const [lead] = await database.select().from(schema.leads).where(eq(schema.leads.organizationId, ctx.organizationId));
      return { ...ctx, lead, database, schema };
    }

    it("a verified address becomes a sendable lead and keeps its verification details", async () => {
      const { lead } = await approved("safe", false);
      expect(lead).toMatchObject({ emailStatus: "verified", emailVerified: true, emailVerifier: "reoon", timezone: null });
      expect(lead.emailCheckedAt).not.toBeNull();
    });

    it("a risky address is sendable only while the workspace allows it", async () => {
      const { lead, organizationId, actor, database, schema } = await approved("catch_all", true);
      expect(lead).toMatchObject({ emailStatus: "risky", emailVerified: true });

      const { updateSendingSafetySettings } = await import("./sending-settings");
      await updateSendingSafetySettings(actor, { allowRiskyEmail: false });
      const [off] = await database.select().from(schema.leads).where(eq(schema.leads.organizationId, organizationId));
      expect(off).toMatchObject({ emailStatus: "risky", emailVerified: false });

      await updateSendingSafetySettings(actor, { allowRiskyEmail: true });
      const [on] = await database.select().from(schema.leads).where(eq(schema.leads.organizationId, organizationId));
      expect(on.emailVerified).toBe(true);
    });
  });
});
