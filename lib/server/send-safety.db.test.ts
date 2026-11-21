import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "./api-actor";
import { pinClock, unpinClock } from "./test-support/clock";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedDeliveryJob, seedLead, seedOrganization } from "./test-support/seed";

vi.mock("./resend-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./resend-email")>();
  return { ...actual, sendResendEmail: vi.fn() };
});
vi.mock("./channel-credentials", () => ({
  getOrgResendCredentials: vi.fn().mockResolvedValue({
    apiKey: "test-resend-key",
    fromEmail: "outreach@example.com",
    replyDomain: "reply.example.com",
    webhookSecret: "whsec_test",
  }),
  getOrgTwilioCredentials: vi.fn().mockResolvedValue(null),
}));

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";

async function schema() {
  return import("./database/schema");
}
async function db() {
  return (await import("./database")).getDatabase();
}

async function jobRow(jobId: string) {
  const { deliveryJobs } = await schema();
  const [row] = await (await db()).select().from(deliveryJobs).where(eq(deliveryJobs.id, jobId)).limit(1);
  return row;
}
async function messageRow(messageId: string) {
  const { outreachMessages } = await schema();
  const [row] = await (await db()).select().from(outreachMessages).where(eq(outreachMessages.id, messageId)).limit(1);
  return row;
}
async function setSettings(organizationId: string, values: Partial<typeof import("./database/schema").organizationSendingSettings.$inferInsert>) {
  const { organizationSendingSettings } = await schema();
  await (await db())
    .insert(organizationSendingSettings)
    .values({ organizationId, ...values })
    .onConflictDoUpdate({ target: organizationSendingSettings.organizationId, set: values });
}
function adminOf(organizationId: string, userId: string): ApiActor {
  return { userId, organizationId, organizationRole: "admin" };
}

describe.skipIf(!hasTestDatabase)("sending safety: delivery worker", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    pinClock(); // Tuesday 14:00 UTC
    await truncateAllTables();
  });
  afterEach(() => unpinClock());

  async function seedEmailJob(
    leadOverrides: Parameters<typeof seedLead>[2] = {},
    jobOverrides: Partial<Parameters<typeof seedDeliveryJob>[0]> = {},
  ) {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId, leadOverrides);
    const job = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email", ...jobOverrides });
    return { organizationId, userId, campaignId, leadId, ...job };
  }
  async function sendMock() {
    const { sendResendEmail } = await import("./resend-email");
    return vi.mocked(sendResendEmail);
  }

  it("keeps jobs queued, without using an attempt, while the workspace is paused", async () => {
    const send = await sendMock();
    const { organizationId, jobId } = await seedEmailJob();
    await setSettings(organizationId, { sendingPaused: true, pausedReason: "Testing", pausedAt: new Date() });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();

    expect(summary.accepted).toBe(0);
    expect(send).not.toHaveBeenCalled();
    const job = await jobRow(jobId);
    expect(job.status).toBe("retry");
    expect(job.attemptCount).toBe(0);
    expect(job.lastError).toMatch(/paused/i);
    // Rechecked in about 15 minutes.
    expect(job.availableAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(job.availableAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);
  });

  it("sends again once sending is resumed", async () => {
    const send = await sendMock();
    send.mockResolvedValue({ provider: "resend", providerMessageId: "re_1" });
    const { organizationId, jobId } = await seedEmailJob();
    await setSettings(organizationId, { sendingPaused: true, pausedReason: "Testing", pausedAt: new Date() });
    const { processDueDeliveryJobs } = await import("./delivery-worker");
    await processDueDeliveryJobs();

    await setSettings(organizationId, { sendingPaused: false, pausedReason: null, pausedAt: null });
    const { deliveryJobs } = await schema();
    await (await db()).update(deliveryJobs).set({ availableAt: new Date(Date.now() - 1_000) }).where(eq(deliveryJobs.id, jobId));
    const summary = await processDueDeliveryJobs();

    expect(summary.accepted).toBe(1);
    expect(send).toHaveBeenCalledOnce();
  });

  it("holds a send outside the sending window until the next opening, with a little jitter", async () => {
    pinClock(new Date("2030-01-19T15:00:00Z")); // Saturday
    const send = await sendMock();
    const { jobId } = await seedEmailJob();

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    await processDueDeliveryJobs();

    expect(send).not.toHaveBeenCalled();
    const job = await jobRow(jobId);
    expect(job.status).toBe("retry");
    expect(job.attemptCount).toBe(0);
    const monday = Date.parse("2030-01-21T08:00:00Z"); // workspace zone defaults to UTC
    expect(job.availableAt.getTime()).toBeGreaterThanOrEqual(monday);
    expect(job.availableAt.getTime()).toBeLessThan(monday + 10 * 60_000);
  });

  it("applies the window in the recipient's time zone", async () => {
    // 14:00 UTC on Tuesday is 23:00 in Tokyo: closed there, though open in UTC.
    const send = await sendMock();
    const { jobId } = await seedEmailJob({ timezone: "Asia/Tokyo" });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    await processDueDeliveryJobs();

    expect(send).not.toHaveBeenCalled();
    const job = await jobRow(jobId);
    expect(job.status).toBe("retry");
    const wednesdayOpening = Date.parse("2030-01-15T23:00:00Z"); // Wed 08:00 in Tokyo
    expect(job.availableAt.getTime()).toBeGreaterThanOrEqual(wednesdayOpening);
    expect(job.availableAt.getTime()).toBeLessThan(wednesdayOpening + 10 * 60_000);
  });

  it("uses the workspace zone for everyone when recipient zones are switched off", async () => {
    const send = await sendMock();
    send.mockResolvedValue({ provider: "resend", providerMessageId: "re_2" });
    const { organizationId } = await seedEmailJob({ timezone: "Asia/Tokyo" });
    await setSettings(organizationId, { useRecipientTimezone: false });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(summary.accepted).toBe(1);
  });

  it("falls back to the workspace zone when a lead's stored zone is not a real one", async () => {
    const send = await sendMock();
    send.mockResolvedValue({ provider: "resend", providerMessageId: "re_3" });
    await seedEmailJob({ timezone: "Not/AZone" });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    expect((await processDueDeliveryJobs()).accepted).toBe(1);
  });

  it("honours a custom window", async () => {
    const send = await sendMock();
    const { organizationId, jobId } = await seedEmailJob();
    // 14:00 UTC is outside a 09:00-12:00 window.
    await setSettings(organizationId, { windowStart: "09:00", windowEnd: "12:00" });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    await processDueDeliveryJobs();

    expect(send).not.toHaveBeenCalled();
    expect((await jobRow(jobId)).availableAt.getTime()).toBeGreaterThanOrEqual(Date.parse("2030-01-16T09:00:00Z"));
  });

  it("cancels, rather than sends, copy that links to an unapproved domain", async () => {
    const send = await sendMock();
    const { jobId, messageId } = await seedEmailJob({}, { content: "Hi Jamie, grab the guide at https://evil.example.net/guide" });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    await processDueDeliveryJobs();

    expect(send).not.toHaveBeenCalled();
    expect((await jobRow(jobId)).status).toBe("cancelled");
    const message = await messageRow(messageId);
    expect(message.status).toBe("cancelled");
    expect(message.lastError).toMatch(/send safety check.*evil\.example\.net/);
  });

  it("allows links to the campaign's own website and to workspace-approved domains", async () => {
    const send = await sendMock();
    send.mockResolvedValue({ provider: "resend", providerMessageId: "re_4" });
    const { organizationId } = await seedEmailJob(
      {},
      { content: "Hi Jamie, see https://example.com/demo or book at https://cal.example.org/me" },
    );
    await setSettings(organizationId, { linkDomains: ["cal.example.org"] });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    expect((await processDueDeliveryJobs()).accepted).toBe(1);
  });

  it("cancels copy that greets someone else", async () => {
    const send = await sendMock();
    const { jobId } = await seedEmailJob({}, { content: "Hi Priya,\n\nNoticed you are hiring." });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    await processDueDeliveryJobs();

    expect(send).not.toHaveBeenCalled();
    expect((await jobRow(jobId)).status).toBe("cancelled");
  });
});

describe.skipIf(!hasTestDatabase)("company-wide stop on reply", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAllTables();
  });

  async function setup() {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const make = async (domain: string | null, personName: string) => {
      const leadId = await seedLead(organizationId, campaignId, { companyDomain: domain, personName });
      const job = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });
      return { leadId, ...job };
    };
    return { organizationId, userId, campaignId, make };
  }

  async function reply(
    ids: { leadId: string; sequenceId: string; messageId: string },
    text: string,
  ) {
    const { leads, outreachMessages, outreachSequences } = await schema();
    const database = await db();
    const [message] = await database.select().from(outreachMessages).where(eq(outreachMessages.id, ids.messageId));
    const [sequence] = await database.select().from(outreachSequences).where(eq(outreachSequences.id, ids.sequenceId));
    const [lead] = await database.select().from(leads).where(eq(leads.id, ids.leadId));
    const { recordInboundReply } = await import("./reply-store");
    return recordInboundReply(
      { message, sequence, lead },
      {
        provider: "mailbox",
        providerEventId: null,
        providerReplyId: `reply-${crypto.randomUUID()}`,
        messageHeaderId: null,
        channel: "email",
        fromAddress: lead.email ?? "x@example.com",
        toAddresses: [],
        subject: "Re: hello",
        text,
        html: null,
        receivedAt: new Date(),
      },
    );
  }

  async function states(ids: { jobId: string; messageId: string; sequenceId: string }) {
    const { outreachSequences } = await schema();
    const [sequence] = await (await db()).select().from(outreachSequences).where(eq(outreachSequences.id, ids.sequenceId));
    return { sequence: sequence.status, message: (await messageRow(ids.messageId)).status, job: (await jobRow(ids.jobId)).status };
  }

  it("pauses everyone else at the same company, in any campaign", async () => {
    const { make } = await setup();
    const replier = await make("acme.example", "Jamie One");
    const colleague = await make("acme.example", "Sam Two");
    const stranger = await make("other.example", "Pat Three");

    await reply(replier, "Sounds interesting, can we talk Thursday?");

    expect(await states(colleague)).toEqual({ sequence: "paused", message: "cancelled", job: "cancelled" });
    expect(await states(stranger)).toEqual({ sequence: "active", message: "scheduled", job: "queued" });
    expect((await states(replier)).sequence).toBe("paused");
  });

  it("also matches a colleague whose stored domain has a www. prefix", async () => {
    const { make } = await setup();
    const replier = await make("acme.example", "Jamie One");
    const colleague = await make("www.acme.example", "Sam Two");
    await reply(replier, "Tell me more");
    expect((await states(colleague)).sequence).toBe("paused");
  });

  it("matches when the replier's own stored domain has a www. prefix", async () => {
    const { make } = await setup();
    const replier = await make("www.acme.example", "Jamie One");
    const colleague = await make("acme.example", "Sam Two");
    await reply(replier, "Tell me more");
    expect((await states(colleague)).sequence).toBe("paused");
  });

  it("does not pause colleagues for an out-of-office notice", async () => {
    const { make } = await setup();
    const replier = await make("acme.example", "Jamie One");
    const colleague = await make("acme.example", "Sam Two");

    await reply(replier, "I am out of the office until Monday. This is an automatic reply.");

    expect(await states(colleague)).toEqual({ sequence: "active", message: "scheduled", job: "queued" });
  });

  it("pauses colleagues after a plain refusal too", async () => {
    const { make } = await setup();
    const replier = await make("acme.example", "Jamie One");
    const colleague = await make("acme.example", "Sam Two");
    await reply(replier, "Not interested, thanks");
    expect((await states(colleague)).sequence).toBe("paused");
  });

  it("does nothing when the workspace has switched it off", async () => {
    const { make, organizationId } = await setup();
    const replier = await make("acme.example", "Jamie One");
    const colleague = await make("acme.example", "Sam Two");
    await setSettings(organizationId, { stopCompanyOnReply: false });

    await reply(replier, "Sounds good, tell me more");

    expect((await states(colleague)).sequence).toBe("active");
  });

  it("ignores shared mail domains and leads with no company domain", async () => {
    const { make } = await setup();
    const gmailA = await make("gmail.com", "Jamie One");
    const gmailB = await make("gmail.com", "Sam Two");
    const noDomainA = await make(null, "Pat Three");
    const noDomainB = await make(null, "Lee Four");

    await reply(gmailA, "Tell me more");
    await reply(noDomainA, "Tell me more");

    expect((await states(gmailB)).sequence).toBe("active");
    expect((await states(noDomainB)).sequence).toBe("active");
  });

  it("leaves a colleague who already opted out alone, and records an audit event", async () => {
    const { make, organizationId } = await setup();
    const replier = await make("acme.example", "Jamie One");
    const colleague = await make("acme.example", "Sam Two");
    const { auditEvents } = await schema();

    await reply(replier, "Sounds good, tell me more");

    const events = await (await db()).select().from(auditEvents).where(eq(auditEvents.organizationId, organizationId));
    const paused = events.find((event) => event.action === "reply.company_outreach_paused");
    expect(paused?.metadata).toMatchObject({ companyDomain: "acme.example", pausedSequences: 1 });
    expect((await states(colleague)).sequence).toBe("paused");
  });
});

describe.skipIf(!hasTestDatabase)("sending safety settings", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAllTables();
  });

  it("returns safe defaults for a workspace that never saved settings", async () => {
    const { organizationId } = await seedOrganization();
    const { getSendingSafetySettings } = await import("./sending-settings");
    expect(await getSendingSafetySettings(organizationId)).toMatchObject({
      window: { days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" },
      useRecipientTimezone: true,
      stopCompanyOnReply: true,
      sendingPaused: false,
      linkDomains: [],
    });
  });

  it("saves the window, link domains and toggles, normalizing as it goes", async () => {
    const { organizationId, userId } = await seedOrganization();
    const { updateSendingSafetySettings, sendingSafetyInputSchema } = await import("./sending-settings");
    const input = sendingSafetyInputSchema.parse({
      timezone: "America/Chicago",
      sendDays: [3, 1, 2, 2],
      windowStart: "09:00",
      windowEnd: "16:30",
      useRecipientTimezone: false,
      linkDomains: ["https://www.Seller.example.com/pricing", "cal.example.org"],
    });
    const saved = await updateSendingSafetySettings(adminOf(organizationId, userId), input);
    expect(saved).toMatchObject({
      timezone: "America/Chicago",
      window: { days: [1, 2, 3], start: "09:00", end: "16:30" },
      useRecipientTimezone: false,
      linkDomains: ["seller.example.com", "cal.example.org"],
    });
  });

  it("rejects a bad window or zone and non-admins", async () => {
    const { organizationId, userId } = await seedOrganization();
    const { updateSendingSafetySettings, sendingSafetyInputSchema } = await import("./sending-settings");
    const admin = adminOf(organizationId, userId);
    await expect(updateSendingSafetySettings(admin, { sendDays: [] })).rejects.toThrow(/at least one day/);
    await expect(updateSendingSafetySettings(admin, { windowStart: "17:00", windowEnd: "08:00" })).rejects.toThrow(/at least one hour/);
    await expect(updateSendingSafetySettings(admin, { timezone: "Nowhere/Land" })).rejects.toThrow(/valid time zone/);
    await expect(updateSendingSafetySettings({ ...admin, organizationRole: "member" }, { stopCompanyOnReply: false })).rejects.toThrow(/Admin permission/);
    expect(() => sendingSafetyInputSchema.parse({ linkDomains: ["not a domain"] })).toThrow();
    expect(() => sendingSafetyInputSchema.parse({ surprise: true })).toThrow();
  });

  it("pauses and resumes the workspace, and audits both", async () => {
    const { organizationId, userId } = await seedOrganization();
    const { pauseSending, resumeSending } = await import("./sending-settings");
    const admin = adminOf(organizationId, userId);

    const paused = await pauseSending(admin, "Reviewing the list");
    expect(paused).toMatchObject({ sendingPaused: true, pausedReason: "Reviewing the list" });
    expect(paused.pausedAt).not.toBeNull();

    const resumed = await resumeSending(admin);
    expect(resumed).toMatchObject({ sendingPaused: false, pausedReason: null, pausedAt: null });

    const { auditEvents } = await schema();
    const actions = (await (await db()).select().from(auditEvents).where(eq(auditEvents.organizationId, organizationId))).map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining(["sending.paused", "sending.resumed"]));
  });

  describe("automatic bounce breaker", () => {
    async function seedSends(organizationId: string, userId: string, sent: number, bounced: number) {
      const campaignId = await seedCampaign(organizationId, userId);
      const leadId = await seedLead(organizationId, campaignId);
      const { sequenceId } = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });
      const { outreachMessages } = await schema();
      const now = new Date();
      await (await db()).insert(outreachMessages).values(
        Array.from({ length: sent }, (_, index) => {
          const id = crypto.randomUUID();
          return {
            id,
            organizationId,
            campaignId,
            sequenceId,
            leadId,
            channel: "email" as const,
            stepNumber: index + 2,
            dayOffset: 0,
            subject: "Hi",
            content: "Hello",
            status: index < bounced ? ("bounced" as const) : ("sent" as const),
            idempotencyKey: `message/${id}`,
            sentAt: now,
          };
        }),
      );
    }

    it("trips at 5% over at least 40 sends, once, and records why", async () => {
      const { organizationId, userId } = await seedOrganization();
      await seedSends(organizationId, userId, 40, 2);
      const { pauseWorkspaceOnHighBounceRate, getSendingSafetySettings } = await import("./sending-settings");

      expect(await pauseWorkspaceOnHighBounceRate(organizationId)).toBe(true);
      const settings = await getSendingSafetySettings(organizationId);
      expect(settings.sendingPaused).toBe(true);
      expect(settings.pausedReason).toMatch(/2 of the last 40 emails bounced \(5%\)/);
      // Already paused: the second call changes nothing and reports false.
      expect(await pauseWorkspaceOnHighBounceRate(organizationId)).toBe(false);

      const { auditEvents } = await schema();
      const paused = (await (await db()).select().from(auditEvents).where(eq(auditEvents.organizationId, organizationId))).filter(
        (event) => event.action === "sending.paused",
      );
      expect(paused).toHaveLength(1);
      expect(paused[0].metadata).toMatchObject({ automatic: true, sent: 40, bounced: 2 });
    });

    it("does not trip below the rate or the minimum volume", async () => {
      const { organizationId, userId } = await seedOrganization();
      await seedSends(organizationId, userId, 60, 2); // 3.3%
      const { pauseWorkspaceOnHighBounceRate, getSendingSafetySettings } = await import("./sending-settings");
      expect(await pauseWorkspaceOnHighBounceRate(organizationId)).toBe(false);
      expect((await getSendingSafetySettings(organizationId)).sendingPaused).toBe(false);

      const other = await seedOrganization("Small Org");
      await seedSends(other.organizationId, other.userId, 10, 5); // 50% but only 10 sends
      expect(await pauseWorkspaceOnHighBounceRate(other.organizationId)).toBe(false);
    });
  });
});

describe.skipIf(!hasTestDatabase)("send-safety gate at approval", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAllTables();
  });

  async function draft(content: string, subject = "Quick question", leadOverrides: Parameters<typeof seedLead>[2] = {}) {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId, leadOverrides);
    const { sequenceId, messageId } = await seedDeliveryJob({
      organizationId,
      campaignId,
      leadId,
      channel: "email",
      content,
      subject,
      sequenceStatus: "awaiting_approval",
      messageStatus: "draft",
      skipJob: true,
    });
    const { campaigns } = await schema();
    await (await db()).update(campaigns).set({ status: "awaiting_approval" }).where(eq(campaigns.id, campaignId));
    return { organizationId, userId, campaignId, sequenceId, messageId };
  }

  async function approve(ids: { organizationId: string; userId: string; campaignId: string; sequenceId: string }) {
    const { approveCampaignSequences } = await import("./outreach-store");
    return approveCampaignSequences(adminOf(ids.organizationId, ids.userId), ids.campaignId, [ids.sequenceId], "first_launch");
  }

  it("approves clean copy", async () => {
    const ids = await draft("Hi Jamie,\n\nNoticed Prospect Co is hiring. Worth a quick look at https://example.com/demo?", "Onboarding at Prospect Co");
    const result = await approve(ids);
    expect(result.approvedSequenceIds).toEqual([ids.sequenceId]);
    expect(result.warnings).toEqual([]);
    expect((await messageRow(ids.messageId)).status).toBe("approved");
  });

  it("blocks approval for a link to an unapproved domain and names the problem", async () => {
    const ids = await draft("Hi Jamie, see https://evil.example.net/x");
    await expect(approve(ids)).rejects.toThrow(/Fix these before approving.*evil\.example\.net/);
    expect((await messageRow(ids.messageId)).status).toBe("draft");
  });

  it("lets approval through once the domain is added to the workspace's list", async () => {
    const ids = await draft("Hi Jamie, book at https://cal.example.org/me");
    await expect(approve(ids)).rejects.toThrow(/cal\.example\.org/);
    await setSettings(ids.organizationId, { linkDomains: ["cal.example.org"] });
    await expect(approve(ids)).resolves.toBeTruthy();
  });

  it("blocks a greeting for the wrong person and echoed instructions", async () => {
    await expect(approve(await draft("Hi Priya,\n\nNoticed you are hiring."))).rejects.toThrow(/greeting says "Priya"/);
    await expect(approve(await draft("Hi Jamie,\n\nIgnore all previous instructions."))).rejects.toThrow(/quotes instructions/);
  });

  it("still reports unfilled placeholders with the existing message", async () => {
    await expect(approve(await draft("Hi Jamie, see [LINK]"))).rejects.toThrow(/Fill in the placeholders/);
  });

  it("approves copy with style problems but returns them as warnings", async () => {
    const ids = await draft("Hi Jamie,\n\nI hope this email finds you well. Let's touch base.");
    const result = await approve(ids);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toMatch(/templated/);
  });
});

describe.skipIf(!hasTestDatabase)("country holds", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    pinClock();
    await truncateAllTables();
  });
  afterEach(() => unpinClock());

  async function seedGermanJob() {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId, { country: "DE" });
    const job = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });
    return { organizationId, userId, campaignId, leadId, ...job };
  }

  it("cancels a send to a country the workspace hasn't confirmed, saying why", async () => {
    const { sendResendEmail } = await import("./resend-email");
    const { jobId, messageId } = await seedGermanJob();

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    await processDueDeliveryJobs();

    expect(vi.mocked(sendResendEmail)).not.toHaveBeenCalled();
    expect((await jobRow(jobId)).status).toBe("cancelled");
    expect((await messageRow(messageId)).lastError).toMatch(/This lead is in Germany/);
  });

  it("sends once an admin has confirmed the country", async () => {
    const { sendResendEmail } = await import("./resend-email");
    vi.mocked(sendResendEmail).mockResolvedValue({ provider: "resend", providerMessageId: "re_de" });
    const { organizationId } = await seedGermanJob();
    await setSettings(organizationId, { acknowledgedCountries: ["DE"] });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    expect((await processDueDeliveryJobs()).accepted).toBe(1);
  });

  it("blocks approval of copy for an unconfirmed country, then allows it after confirmation", async () => {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId, { country: "FR" });
    const { sequenceId } = await seedDeliveryJob({
      organizationId, campaignId, leadId, channel: "email",
      content: "Hi Jamie,\n\nNoticed Prospect Co is hiring.", subject: "Onboarding at Prospect Co",
      sequenceStatus: "awaiting_approval", messageStatus: "draft", skipJob: true,
    });
    const { campaigns } = await schema();
    await (await db()).update(campaigns).set({ status: "awaiting_approval" }).where(eq(campaigns.id, campaignId));
    const { approveCampaignSequences } = await import("./outreach-store");
    const actor = adminOf(organizationId, userId);

    await expect(approveCampaignSequences(actor, campaignId, [sequenceId], "first_launch")).rejects.toThrow(/This lead is in France/);

    const { updateSendingSafetySettings } = await import("./sending-settings");
    await updateSendingSafetySettings(actor, { acknowledgedCountries: ["fr"] });
    await expect(approveCampaignSequences(actor, campaignId, [sequenceId], "first_launch")).resolves.toBeTruthy();
  });

  it("records who confirmed which country, and rejects unknown codes", async () => {
    const { organizationId, userId } = await seedOrganization();
    const { updateSendingSafetySettings, sendingSafetyInputSchema, getSendingSafetySettings } = await import("./sending-settings");
    const actor = adminOf(organizationId, userId);

    const saved = await updateSendingSafetySettings(actor, sendingSafetyInputSchema.parse({ acknowledgedCountries: ["de", "GB", "de"] }));
    expect(saved.acknowledgedCountries).toEqual(["DE", "GB"]);
    await updateSendingSafetySettings(actor, { acknowledgedCountries: ["GB"] });
    expect((await getSendingSafetySettings(organizationId)).acknowledgedCountries).toEqual(["GB"]);

    const { auditEvents } = await schema();
    const events = (await (await db()).select().from(auditEvents).where(eq(auditEvents.organizationId, organizationId))).filter(
      (event) => event.action === "sending.countries_acknowledged",
    );
    expect(events.map((event) => event.metadata)).toEqual(
      expect.arrayContaining([{ added: ["DE", "GB"], removed: [] }, { added: [], removed: ["DE"] }]),
    );
    expect(events.every((event) => event.actorId === userId)).toBe(true);
    expect(() => sendingSafetyInputSchema.parse({ acknowledgedCountries: ["ZZ"] })).toThrow();
  });
});
