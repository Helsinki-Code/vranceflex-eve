import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "../../../../lib/server/test-support/db";
import { seedCampaign, seedDeliveryJob, seedLead, seedOrganization } from "../../../../lib/server/test-support/seed";

describe.skipIf(!hasTestDatabase)("unsubscribe links", () => {
  beforeEach(async () => {
    await truncateAllTables();
    vi.stubEnv("AUTH_SECRET", "unsubscribe-test-secret-with-plenty-of-length");
  });

  async function message(signed: boolean) {
    const { getDatabase } = await import("../../../../lib/server/database");
    const { outreachMessages } = await import("../../../../lib/server/database/schema");
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const job = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });
    await getDatabase().update(outreachMessages).set({ status: "sent", unsubscribeSigned: signed }).where(eq(outreachMessages.id, job.messageId));
    return { ...job, leadId };
  }

  const call = async (method: "GET" | "POST", messageId: string, token?: string) => {
    const route = await import("./route");
    const url = `https://app.example.com/api/unsubscribe/${messageId}${token ? `?t=${token}` : ""}`;
    const request = new Request(url, { method, headers: method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {} });
    return route[method](request, { params: Promise.resolve({ messageId }) });
  };

  it("suppresses with a valid signed token and rejects a forged one", async () => {
    const { signUnsubscribeToken } = await import("../../../../lib/server/unsubscribe-token");
    const { getDatabase } = await import("../../../../lib/server/database");
    const { leads } = await import("../../../../lib/server/database/schema");
    const sent = await message(true);
    expect((await call("GET", sent.messageId, "forged-token-forged-token-forged")).status).toBe(404);
    expect((await call("POST", sent.messageId)).status).toBe(404);
    expect((await call("GET", sent.messageId, signUnsubscribeToken(sent.messageId)!)).status).toBe(200);
    expect((await call("POST", sent.messageId, signUnsubscribeToken(sent.messageId)!)).status).toBe(200);
    const [lead] = await getDatabase().select().from(leads).where(eq(leads.id, sent.leadId));
    expect(lead?.doNotContact).toBe(true);
  });

  it("keeps unsigned links from before signing working", async () => {
    const { getDatabase } = await import("../../../../lib/server/database");
    const { leads } = await import("../../../../lib/server/database/schema");
    const legacy = await message(false);
    expect((await call("POST", legacy.messageId)).status).toBe(200);
    const [lead] = await getDatabase().select().from(leads).where(eq(leads.id, legacy.leadId));
    expect(lead?.doNotContact).toBe(true);
  });
});
