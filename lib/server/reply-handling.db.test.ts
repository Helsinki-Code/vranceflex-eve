import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedDeliveryJob, seedLead, seedOrganization } from "./test-support/seed";

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";

const DAY = 86_400_000;
// Tuesday 2030-01-15 10:00 UTC
const received = new Date("2030-01-15T10:00:00Z");

async function schema() {
  return import("./database/schema");
}
async function db() {
  return (await import("./database")).getDatabase();
}

describe.skipIf(!hasTestDatabase)("out-of-office and automatic replies", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAllTables();
  });

  /** A lead with a three-step sequence due in 3, 7 and 12 days. */
  async function leadWithSequence(domain: string | null = "acme.example", name = "Jamie One") {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    return { organizationId, userId, campaignId, ...(await addSequence(organizationId, campaignId, domain, name)) };
  }
  async function addSequence(organizationId: string, campaignId: string, domain: string | null, name: string) {
    const leadId = await seedLead(organizationId, campaignId, { companyDomain: domain, personName: name });
    const first = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email", scheduledFor: new Date(received.getTime() + 3 * DAY), stepNumber: 1 });
    const second = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email", scheduledFor: new Date(received.getTime() + 7 * DAY), stepNumber: 2, sequenceId: first.sequenceId });
    const third = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email", scheduledFor: new Date(received.getTime() + 12 * DAY), stepNumber: 3, sequenceId: first.sequenceId });
    return { leadId, sequenceId: first.sequenceId, jobs: [first.jobId, second.jobId, third.jobId], messages: [first.messageId, second.messageId, third.messageId] };
  }

  async function reply(ids: { leadId: string; sequenceId: string; messages: string[] }, text: string, options: { autoReply?: boolean } = {}) {
    const { leads, outreachMessages, outreachSequences } = await schema();
    const database = await db();
    const [message] = await database.select().from(outreachMessages).where(eq(outreachMessages.id, ids.messages[0]));
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
        subject: "Automatic reply",
        text,
        html: null,
        receivedAt: received,
        ...options,
      },
    );
  }

  async function jobTimes(jobIds: string[]) {
    const { deliveryJobs } = await schema();
    const database = await db();
    const rows = await Promise.all(jobIds.map(async (id) => (await database.select().from(deliveryJobs).where(eq(deliveryJobs.id, id)))[0]));
    return rows.map((row) => ({ status: row.status, scheduledFor: row.scheduledFor.getTime(), availableAt: row.availableAt.getTime() }));
  }
  async function sequenceStatus(sequenceId: string) {
    const { outreachSequences } = await schema();
    return (await (await db()).select().from(outreachSequences).where(eq(outreachSequences.id, sequenceId)))[0].status;
  }
  async function storedReply(leadId: string) {
    const { inboundReplies } = await schema();
    return (await (await db()).select().from(inboundReplies).where(eq(inboundReplies.leadId, leadId)))[0];
  }

  it("holds follow-ups until the day after the return date and keeps the gaps between steps", async () => {
    const ids = await leadWithSequence();
    // Back Monday 2030-01-21 -> resume Tuesday 2030-01-22 00:00 UTC.
    await reply(ids, "I am out of the office and will be back on Monday.");

    const resume = Date.parse("2030-01-22T00:00:00Z");
    const [first, second, third] = await jobTimes(ids.jobs);
    expect(first.scheduledFor).toBe(resume);
    // Originally 4 and 9 days after the first step; the gaps are unchanged.
    expect(second.scheduledFor - first.scheduledFor).toBe(4 * DAY);
    expect(third.scheduledFor - first.scheduledFor).toBe(9 * DAY);
    expect([first.status, second.status, third.status]).toEqual(["queued", "queued", "queued"]);
    for (const job of [first, second, third]) expect(job.availableAt).toBeGreaterThanOrEqual(job.scheduledFor);
  });

  it("keeps the sequence running instead of pausing or cancelling it", async () => {
    const ids = await leadWithSequence();
    await reply(ids, "Out of office until January 22nd.");

    expect(await sequenceStatus(ids.sequenceId)).toBe("active");
    const { outreachMessages } = await schema();
    for (const messageId of ids.messages) {
      const [message] = await (await db()).select().from(outreachMessages).where(eq(outreachMessages.id, messageId));
      expect(message.status).toBe("scheduled");
    }
    const row = await storedReply(ids.leadId);
    expect(row.intent).toBe("OUT_OF_OFFICE");
    expect(row.flagForHuman).toBe(false);
    expect(row.actionDetail).toMatch(/held until 2030-01-23/);
  });

  it("moves each message's own scheduled time too", async () => {
    const ids = await leadWithSequence();
    await reply(ids, "Out of office, back on 2030-01-25.");
    const { outreachMessages } = await schema();
    const [message] = await (await db()).select().from(outreachMessages).where(eq(outreachMessages.id, ids.messages[0]));
    expect(message.scheduledFor?.getTime()).toBe(Date.parse("2030-01-26T00:00:00Z"));
  });

  it("falls back to a week and asks a person to look when no date is given", async () => {
    const ids = await leadWithSequence();
    await reply(ids, "Thank you for your message. I am out of the office.");

    // First step was due in 3 days (< 7), so it moves to a week after the reply.
    const [first] = await jobTimes(ids.jobs);
    expect(first.scheduledFor).toBe(received.getTime() + 7 * DAY);
    const row = await storedReply(ids.leadId);
    expect(row.flagForHuman).toBe(true);
    expect(row.flagReason).toMatch(/without a return date/);
  });

  it("leaves steps alone when the person is back before they are due", async () => {
    const ids = await leadWithSequence();
    const before = await jobTimes(ids.jobs);
    // Back tomorrow: the first step is not due for 3 days.
    await reply(ids, "I am out of the office, back on Wednesday.");
    expect(await jobTimes(ids.jobs)).toEqual(before);
  });

  it("does not pause colleagues at the same company", async () => {
    const ids = await leadWithSequence();
    const colleague = await addSequence(ids.organizationId, ids.campaignId, "acme.example", "Sam Two");
    await reply(ids, "Out of the office until January 29th.");
    expect(await sequenceStatus(colleague.sequenceId)).toBe("active");
    expect((await jobTimes(colleague.jobs)).every((job) => job.status === "queued")).toBe(true);
  });

  it("trusts the headers: an auto-responder's unsubscribe footer does not opt the person out", async () => {
    const ids = await leadWithSequence();
    const result = await reply(ids, "I'm away this month. To unsubscribe from our newsletter, click here.", { autoReply: true });

    expect(result).toMatchObject({ intent: "OUT_OF_OFFICE", suppressed: false });
    const { leads } = await schema();
    const [lead] = await (await db()).select().from(leads).where(eq(leads.id, ids.leadId));
    expect(lead.doNotContact).toBe(false);
    expect(await sequenceStatus(ids.sequenceId)).toBe("active");
  });

  it("still stops everything for a real human reply, unchanged", async () => {
    const ids = await leadWithSequence();
    await reply(ids, "Thanks, let's talk next week.");
    expect(await sequenceStatus(ids.sequenceId)).toBe("paused");
    expect((await jobTimes(ids.jobs)).every((job) => job.status === "cancelled")).toBe(true);
  });

  it("a second out-of-office reply doesn't move the steps again", async () => {
    const ids = await leadWithSequence();
    await reply(ids, "Out of office until January 22nd.");
    const once = await jobTimes(ids.jobs);
    await reply(ids, "Out of office until January 22nd.");
    expect(await jobTimes(ids.jobs)).toEqual(once);
  });
});

describe.skipIf(!hasTestDatabase)("replies to an offer", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAllTables();
  });

  async function seed(offer: string | null) {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const { campaigns, leads, outreachMessages, outreachSequences } = await schema();
    const database = await db();
    await database.update(campaigns).set({ offer }).where(eq(campaigns.id, campaignId));
    const leadId = await seedLead(organizationId, campaignId, { companyDomain: "acme.example" });
    const job = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });
    const [message] = await database.select().from(outreachMessages).where(eq(outreachMessages.id, job.messageId));
    const [sequence] = await database.select().from(outreachSequences).where(eq(outreachSequences.id, job.sequenceId));
    const [lead] = await database.select().from(leads).where(eq(leads.id, leadId));
    return { leadId, sequenceId: job.sequenceId, context: { message, sequence, lead } };
  }
  async function record(context: Awaited<ReturnType<typeof seed>>["context"], text: string) {
    const { recordInboundReply } = await import("./reply-store");
    return recordInboundReply(context, {
      provider: "mailbox", providerEventId: null, providerReplyId: `r-${crypto.randomUUID()}`, messageHeaderId: null,
      channel: "email", fromAddress: "x@example.com", toAddresses: [], subject: "Re: hello", text, html: null, receivedAt: new Date(),
    });
  }

  it("marks a yes as taking the offer, flags it for delivery and stops the follow-ups", async () => {
    const { context, leadId, sequenceId } = await seed("A written plan for getting you onto page one");
    const result = await record(context, "Yes please, send it over");
    expect(result.intent).toBe("OFFER_ACCEPTED");

    const { inboundReplies, outreachSequences } = await schema();
    const [reply] = await (await db()).select().from(inboundReplies).where(eq(inboundReplies.leadId, leadId));
    expect(reply).toMatchObject({ intent: "OFFER_ACCEPTED", flagForHuman: true, nextAction: "escalate_to_human" });
    expect(reply.flagReason).toMatch(/deliver it/);
    expect(reply.suggestedResponse).toMatch(/put that together/);
    const [sequence] = await (await db()).select().from(outreachSequences).where(eq(outreachSequences.id, sequenceId));
    expect(sequence.status).toBe("paused");
  });

  it("does not treat the same words as taking an offer when the campaign has none", async () => {
    const { context } = await seed(null);
    expect((await record(context, "Yes please, send it over")).intent).not.toBe("OFFER_ACCEPTED");
  });

  it("still treats a request for a call as hot", async () => {
    const { context } = await seed("A written plan for getting you onto page one");
    expect((await record(context, "Yes, let's talk Thursday")).intent).toBe("HOT");
  });
});
