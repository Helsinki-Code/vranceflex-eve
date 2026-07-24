import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedLead, seedOrganization } from "./test-support/seed";
import type { ApiActor } from "./api-actor";

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= Buffer.alloc(32, 5).toString("base64url");

function adminActor(organizationId: string, userId: string): ApiActor {
  return { userId, organizationId, organizationRole: "admin", email: "owner@example.com" };
}

async function seedApprovedEmailSequence(organizationId: string, campaignId: string, leadId: string) {
  const { getDatabase } = await import("./database");
  const { outreachSequences, outreachMessages } = await import("./database/schema");
  const database = getDatabase();
  const sequenceId = crypto.randomUUID();
  const messageId = crypto.randomUUID();

  await database.insert(outreachSequences).values({
    id: sequenceId,
    organizationId,
    campaignId,
    leadId,
    channel: "email",
    name: "Sequence",
    status: "approved",
  });
  await database.insert(outreachMessages).values({
    id: messageId,
    organizationId,
    campaignId,
    sequenceId,
    leadId,
    channel: "email",
    stepNumber: 1,
    dayOffset: 0,
    subject: "Hello",
    content: "Hello there.",
    status: "approved",
    idempotencyKey: `message/${messageId}`,
  });

  return sequenceId;
}

const scheduleInput = {
  sequenceIds: [] as string[],
  startDate: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString().slice(0, 10),
  sendTime: "09:00",
  timezone: "UTC",
};

describe.skipIf(!hasTestDatabase)("scheduling-store BYOK gating", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables();
  });

  it("blocks scheduling an email sequence until Resend is connected", async () => {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const sequenceId = await seedApprovedEmailSequence(organizationId, campaignId, leadId);

    const { scheduleCampaignSequences } = await import("./scheduling-store");
    await expect(
      scheduleCampaignSequences(adminActor(organizationId, userId), campaignId, {
        ...scheduleInput,
        sequenceIds: [sequenceId],
      }),
    ).rejects.toThrow(/connect this workspace's resend account/i);
  });

  it("allows scheduling once Resend is connected", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const sequenceId = await seedApprovedEmailSequence(organizationId, campaignId, leadId);

    const { connectResend } = await import("./channel-credentials");
    await connectResend(adminActor(organizationId, userId), {
      apiKey: "re_test_key",
      fromEmail: "Acme <outreach@acme.example.com>",
      replyDomain: "reply.acme.example.com",
      webhookSecret: "whsec_test_secret",
    });

    const { scheduleCampaignSequences } = await import("./scheduling-store");
    const result = await scheduleCampaignSequences(
      adminActor(organizationId, userId),
      campaignId,
      { ...scheduleInput, sequenceIds: [sequenceId] },
    );
    expect(result.sequenceIds).toEqual([sequenceId]);
  });
});
