import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedDeliveryJob, seedLead, seedOrganization } from "./test-support/seed";

vi.mock("./mailbox-smtp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mailbox-smtp")>();
  return { ...actual, sendViaMailbox: vi.fn() };
});
vi.mock("./mailbox-imap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mailbox-imap")>();
  return { ...actual, scanInbox: vi.fn(), appendToSent: vi.fn().mockResolvedValue(undefined) };
});

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64url");

describe.skipIf(!hasTestDatabase)("mailbox delivery", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAllTables();
  });

  async function db() {
    const { getDatabase } = await import("./database");
    return { database: getDatabase(), schema: await import("./database/schema") };
  }

  async function seedMailbox(organizationId: string, overrides: Record<string, unknown> = {}) {
    const { database, schema } = await db();
    const { encryptCredentialPayload } = await import("./credential-crypto");
    const id = crypto.randomUUID();
    await database.insert(schema.sendingMailboxes).values({
      id,
      organizationId,
      email: `sender-${id.slice(0, 6)}@getacme.com`,
      fromName: "Priya",
      provider: "google",
      encryptedPayload: encryptCredentialPayload({ username: "sender@getacme.com", password: "abcdefghijklmnop", smtp: { host: "smtp.gmail.com", port: 465, secure: true }, imap: { host: "imap.gmail.com", port: 993, secure: true } }),
      dailyLimit: 30,
      rampUp: false,
      nextSendAt: new Date(Date.now() - 60_000),
      imapUidValidity: 1,
      imapLastUid: 10,
      ...overrides,
    });
    return id;
  }

  async function sendOk() {
    const { sendViaMailbox } = await import("./mailbox-smtp");
    vi.mocked(sendViaMailbox).mockImplementation(async (_secret, message) => ({ providerMessageId: message.messageId, raw: Buffer.from(""), response: "250 OK" }));
    return vi.mocked(sendViaMailbox);
  }

  it("sends from a mailbox, marks the message sent and pins the lead to it", async () => {
    const send = await sendOk();
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const mailboxId = await seedMailbox(organizationId);
    const { jobId, messageId, sequenceId } = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(summary.accepted).toBe(1);
    expect(send).toHaveBeenCalledOnce();
    const sent = send.mock.calls[0]![1];
    expect(sent.messageId).toMatch(new RegExp(`^vf-${messageId}@getacme\\.com$`));
    expect(sent.inReplyTo).toBeNull();
    expect(sent.text).toContain("Hello, this is a test outreach message.");

    const { database, schema } = await db();
    const [message] = await database.select().from(schema.outreachMessages).where(eq(schema.outreachMessages.id, messageId));
    expect(message?.status).toBe("sent");
    expect(message?.senderMailboxId).toBe(mailboxId);
    expect(message?.rfcMessageId).toBe(sent.messageId);
    const [sequence] = await database.select().from(schema.outreachSequences).where(eq(schema.outreachSequences.id, sequenceId));
    expect(sequence?.senderMailboxId).toBe(mailboxId);
    expect(sequence?.threadMessageId).toBe(sent.messageId);
    const [job] = await database.select().from(schema.deliveryJobs).where(eq(schema.deliveryJobs.id, jobId));
    expect(job?.status).toBe("completed");
    const [mailbox] = await database.select().from(schema.sendingMailboxes).where(eq(schema.sendingMailboxes.id, mailboxId));
    expect(mailbox!.nextSendAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
  });

  it("threads a follow-up from the same mailbox", async () => {
    const send = await sendOk();
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    await seedMailbox(organizationId);
    await seedMailbox(organizationId);
    const { sequenceId } = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });
    const { processDueDeliveryJobs } = await import("./delivery-worker");
    await processDueDeliveryJobs();
    const firstCall = send.mock.calls[0]![1];

    const { database, schema } = await db();
    const [sequence] = await database.select().from(schema.outreachSequences).where(eq(schema.outreachSequences.id, sequenceId));
    const stickyId = sequence!.senderMailboxId!;
    await database.update(schema.sendingMailboxes).set({ nextSendAt: new Date(Date.now() - 1_000) });
    const followUpId = crypto.randomUUID();
    const past = new Date(Date.now() - 1_000);
    await database.insert(schema.outreachMessages).values({ id: followUpId, organizationId, campaignId, sequenceId, leadId, channel: "email", stepNumber: 2, dayOffset: 3, subject: "Re: Quick question", content: "Just bumping this.", status: "scheduled", idempotencyKey: `message/${followUpId}`, scheduledFor: past });
    await database.insert(schema.deliveryJobs).values({ id: crypto.randomUUID(), organizationId, campaignId, sequenceId, messageId: followUpId, leadId, channel: "email", status: "queued", scheduledFor: past, availableAt: past, idempotencyKey: `outreach/${followUpId}` });

    await processDueDeliveryJobs();
    expect(send).toHaveBeenCalledTimes(2);
    const followUp = send.mock.calls[1]![1];
    expect(followUp.inReplyTo).toBe(firstCall.messageId);
    expect(followUp.fromEmail).toBe(firstCall.fromEmail);
    const [message] = await database.select().from(schema.outreachMessages).where(eq(schema.outreachMessages.id, followUpId));
    expect(message?.senderMailboxId).toBe(stickyId);
  });

  it("defers without using an attempt when every mailbox is at its cap", async () => {
    const send = await sendOk();
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    await seedMailbox(organizationId, { dailyLimit: 1 });
    await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });
    const second = await seedDeliveryJob({ organizationId, campaignId, leadId: await seedLead(organizationId, campaignId), channel: "email" });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    const summary = await processDueDeliveryJobs();
    expect(send).toHaveBeenCalledOnce();
    expect(summary.limited).toBe(1);
    const { database, schema } = await db();
    const [job] = await database.select().from(schema.deliveryJobs).where(eq(schema.deliveryJobs.id, second.jobId));
    expect(job?.status).toBe("retry");
    expect(job?.attemptCount).toBe(0);
    expect(job!.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(job?.lastError).toMatch(/limit/);
  });

  it("takes a mailbox out of rotation when its password is rejected", async () => {
    const { sendViaMailbox, MailboxDeliveryError } = await import("./mailbox-smtp");
    vi.mocked(sendViaMailbox).mockRejectedValue(new MailboxDeliveryError("Google rejected this App Password.", { retryable: true, authFailed: true }));
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    const mailboxId = await seedMailbox(organizationId);
    const { jobId } = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    await processDueDeliveryJobs();
    const { database, schema } = await db();
    const [mailbox] = await database.select().from(schema.sendingMailboxes).where(eq(schema.sendingMailboxes.id, mailboxId));
    expect(mailbox?.status).toBe("error");
    expect(mailbox?.statusReason).toMatch(/App Password/);
    const [job] = await database.select().from(schema.deliveryJobs).where(eq(schema.deliveryJobs.id, jobId));
    expect(job?.status).toBe("retry");
  });

  it("blocks replay when the connection drops mid-send", async () => {
    const { sendViaMailbox, MailboxDeliveryError } = await import("./mailbox-smtp");
    vi.mocked(sendViaMailbox).mockRejectedValue(new MailboxDeliveryError("The connection dropped while sending.", { retryable: false, ambiguous: true }));
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId);
    await seedMailbox(organizationId);
    const { jobId } = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });

    const { processDueDeliveryJobs } = await import("./delivery-worker");
    await processDueDeliveryJobs();
    const { database, schema } = await db();
    const [job] = await database.select().from(schema.deliveryJobs).where(eq(schema.deliveryJobs.id, jobId));
    expect(job?.status).toBe("failed");
    expect(job?.lastError).toMatch(/may have accepted this email/);
  });

  it("records inbox replies and bounces from a polled mailbox", async () => {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadEmail = "jamie@prospect.co";
    const leadId = await seedLead(organizationId, campaignId, { email: leadEmail });
    const bouncedLeadId = await seedLead(organizationId, campaignId, { email: "gone@prospect.co" });
    const mailboxId = await seedMailbox(organizationId);
    const replied = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "email" });
    const bounced = await seedDeliveryJob({ organizationId, campaignId, leadId: bouncedLeadId, channel: "email" });
    const { database, schema } = await db();
    await database.update(schema.outreachMessages).set({ status: "sent", sentAt: new Date(), senderMailboxId: mailboxId });

    const { scanInbox } = await import("./mailbox-imap");
    vi.mocked(scanInbox).mockResolvedValue({
      uidValidity: 1,
      lastUid: 14,
      reset: false,
      items: [
        { kind: "reply", uid: 12, outreachId: replied.messageId, headerMessageId: "<CAF1@mail.gmail.com>", parsed: { from: { value: [{ address: leadEmail, name: "Jamie" }], text: "Jamie", html: "" }, to: { value: [{ address: "sender@getacme.com", name: "" }], text: "", html: "" }, subject: "Re: Quick question", text: "Yes, let's talk Thursday.\n\nOn Mon, Priya wrote:\n> Hello", date: new Date() } as never },
        { kind: "bounce", uid: 13, outreachId: bounced.messageId, hard: true, diagnostic: "550 5.1.1 no such user" },
      ],
    });

    const { pollMailboxReplies } = await import("./mailbox-poller");
    const results = await pollMailboxReplies();
    expect(results).toHaveLength(1);

    const replies = await database.select().from(schema.inboundReplies);
    expect(replies).toHaveLength(1);
    expect(replies[0]?.provider).toBe("mailbox");
    expect(replies[0]?.text).toBe("Yes, let's talk Thursday.");
    const [sequence] = await database.select().from(schema.outreachSequences).where(eq(schema.outreachSequences.id, replied.sequenceId));
    expect(sequence?.status).toBe("paused");

    const [bouncedMessage] = await database.select().from(schema.outreachMessages).where(eq(schema.outreachMessages.id, bounced.messageId));
    expect(bouncedMessage?.status).toBe("bounced");
    const suppressions = await database.select().from(schema.suppressionEntries);
    expect(suppressions.map((entry) => [entry.destination, entry.reason])).toEqual([["gone@prospect.co", "hard_bounce"]]);

    const [mailbox] = await database.select().from(schema.sendingMailboxes).where(eq(schema.sendingMailboxes.id, mailboxId));
    expect(mailbox?.imapLastUid).toBe(14);

    // A second tick inside five minutes doesn't re-read the inbox.
    expect(await pollMailboxReplies()).toHaveLength(0);
  });
});
