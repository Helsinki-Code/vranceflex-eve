import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import {
  seedCampaign,
  seedDeliveryJob,
  seedLead,
  seedOrganization,
} from "./test-support/seed";

vi.mock("./resend-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./resend-email")>();
  return { ...actual, sendResendEmail: vi.fn() };
});
vi.mock("./twilio-sms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./twilio-sms")>();
  return { ...actual, sendTwilioSms: vi.fn() };
});
// Every org in these tests is treated as having already connected both
// channels — BYOK connection gating itself is covered separately in
// channel-credentials.test.ts / scheduling-store behavior, not here.
vi.mock("./channel-credentials", () => ({
  getOrgResendCredentials: vi.fn().mockResolvedValue({
    apiKey: "test-resend-key",
    fromEmail: "outreach@example.com",
    replyDomain: "reply.example.com",
    webhookSecret: "whsec_test",
  }),
  getOrgTwilioCredentials: vi.fn().mockResolvedValue({
    accountSid: "AC00000000000000000000000000000000",
    authToken: "test-auth-token",
    messagingServiceSid: "MG00000000000000000000000000000000",
  }),
}));

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";

describe.skipIf(!hasTestDatabase)("delivery-worker", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAllTables();
  });

  async function jobStatus(jobId: string) {
    const { getDatabase } = await import("./database");
    const { deliveryJobs } = await import("./database/schema");
    const database = getDatabase();
    const [row] = await database
      .select()
      .from(deliveryJobs)
      .where(eq(deliveryJobs.id, jobId))
      .limit(1);
    return row;
  }

  it("sends an eligible email job and marks it completed", async () => {
    const { sendResendEmail } = await import("./resend-email");
    vi.mocked(sendResendEmail).mockResolvedValue({
      provider: "resend",
      providerMessageId: "resend_123",
    });

    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const { jobId } = await seedDeliveryJob({
      organizationId,
      campaignId,
      leadId,
      channel: "email",
    });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(summary.accepted).toBe(1);

    const job = await jobStatus(jobId);
    expect(job?.status).toBe("completed");
  });

  it("sends an eligible sms job via Twilio and marks it completed", async () => {
    const { sendTwilioSms } = await import("./twilio-sms");
    vi.mocked(sendTwilioSms).mockResolvedValue({
      provider: "twilio",
      providerMessageId: "SM123",
    });

    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const { getDatabase } = await import("./database");
    const { organizationSendingSettings } = await import("./database/schema");
    await getDatabase()
      .insert(organizationSendingSettings)
      .values({ organizationId, dailySmsLimit: 10 });

    const { jobId } = await seedDeliveryJob({
      organizationId,
      campaignId,
      leadId,
      channel: "sms",
    });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(summary.accepted).toBe(1);
    expect(vi.mocked(sendTwilioSms)).toHaveBeenCalledOnce();

    const job = await jobStatus(jobId);
    expect(job?.status).toBe("completed");
  });

  it("cancels a job for a suppressed (do-not-contact) lead", async () => {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId, { doNotContact: true });
    const { jobId } = await seedDeliveryJob({
      organizationId,
      campaignId,
      leadId,
      channel: "email",
    });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(summary.cancelled).toBe(1);

    const job = await jobStatus(jobId);
    expect(job?.status).toBe("cancelled");
  });

  it("cancels a job whose destination is permanently suppressed", async () => {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const email = "suppressed@example.com";
    const leadId = await seedLead(organizationId, campaignId, { email });
    const { getDatabase } = await import("./database");
    const { suppressionEntries } = await import("./database/schema");
    await getDatabase().insert(suppressionEntries).values({
      id: crypto.randomUUID(),
      organizationId,
      leadId,
      channel: "email",
      destination: email,
      reason: "unsubscribe",
      source: "test",
    });
    const { jobId } = await seedDeliveryJob({
      organizationId,
      campaignId,
      leadId,
      channel: "email",
    });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(summary.cancelled).toBe(1);

    const job = await jobStatus(jobId);
    expect(job?.status).toBe("cancelled");
  });

  it("retries a job after a retryable provider failure", async () => {
    const { sendResendEmail, ResendDeliveryError } = await import("./resend-email");
    vi.mocked(sendResendEmail).mockRejectedValue(
      new ResendDeliveryError("Temporary provider failure", 500, true),
    );

    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const { jobId } = await seedDeliveryJob({
      organizationId,
      campaignId,
      leadId,
      channel: "email",
    });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(summary.retried).toBe(1);

    const job = await jobStatus(jobId);
    expect(job?.status).toBe("retry");
    expect(job?.availableAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("fails a job permanently after a non-retryable provider failure", async () => {
    const { sendResendEmail, ResendDeliveryError } = await import("./resend-email");
    vi.mocked(sendResendEmail).mockRejectedValue(
      new ResendDeliveryError("Invalid recipient", 400, false),
    );

    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const { jobId } = await seedDeliveryJob({
      organizationId,
      campaignId,
      leadId,
      channel: "email",
    });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(summary.failed).toBe(1);

    const job = await jobStatus(jobId);
    expect(job?.status).toBe("failed");
  });

  it("fails a job once max attempts are reached", async () => {
    const { sendResendEmail, ResendDeliveryError } = await import("./resend-email");
    vi.mocked(sendResendEmail).mockRejectedValue(
      new ResendDeliveryError("Temporary provider failure", 500, true),
    );

    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const { jobId } = await seedDeliveryJob({
      organizationId,
      campaignId,
      leadId,
      channel: "email",
      maxAttempts: 1,
    });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(summary.failed).toBe(1);

    const job = await jobStatus(jobId);
    expect(job?.status).toBe("failed");
  });

  it("queues a job for retry when daily capacity is exhausted", async () => {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const { getDatabase } = await import("./database");
    const { organizationSendingSettings } = await import("./database/schema");
    await getDatabase()
      .insert(organizationSendingSettings)
      .values({ organizationId, dailyEmailLimit: 0 });

    const { jobId } = await seedDeliveryJob({
      organizationId,
      campaignId,
      leadId,
      channel: "email",
    });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(summary.limited).toBe(1);

    const job = await jobStatus(jobId);
    expect(job?.status).toBe("retry");
    expect(job?.lastError).toMatch(/daily email limit/i);
  });
});
