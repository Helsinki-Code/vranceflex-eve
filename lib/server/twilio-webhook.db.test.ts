import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedDeliveryJob, seedLead, seedOrganization } from "./test-support/seed";

vi.mock("./reply-ai", () => ({ scheduleReplyRefinement: vi.fn() }));

describe.skipIf(!hasTestDatabase)("Twilio inbound webhook", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  async function sentSms(phone: string) {
    const { getDatabase } = await import("./database");
    const { outreachMessages } = await import("./database/schema");
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId, { phone });
    const job = await seedDeliveryJob({ organizationId, campaignId, leadId, channel: "sms" });
    await getDatabase().update(outreachMessages).set({ status: "sent", sentAt: new Date(), providerMessageId: "SM_out_1" }).where(eq(outreachMessages.id, job.messageId));
    return { organizationId, leadId, ...job };
  }

  it("records a text reply against the matching lead and pauses the sequence", async () => {
    const { processTwilioWebhook } = await import("./twilio-webhook");
    const { getDatabase } = await import("./database");
    const { inboundReplies, outreachSequences } = await import("./database/schema");
    const sent = await sentSms("+1 (555) 555-0100");

    const result = await processTwilioWebhook(sent.organizationId, { MessageSid: "SM_in_1", From: "+15555550100", To: "+15555559999", Body: "Sure, Thursday at 10 works" });
    expect(result).toMatchObject({ handled: true, linked: true, suppressed: false });
    const [reply] = await getDatabase().select().from(inboundReplies).where(eq(inboundReplies.leadId, sent.leadId));
    expect(reply).toMatchObject({ channel: "sms", provider: "twilio", text: "Sure, Thursday at 10 works" });
    const [sequence] = await getDatabase().select().from(outreachSequences).where(eq(outreachSequences.id, sent.sequenceId));
    expect(sequence?.status).toBe("paused");

    // Twilio retries deliver the same MessageSid; it must not create a second reply.
    await processTwilioWebhook(sent.organizationId, { MessageSid: "SM_in_1", From: "+15555550100", Body: "Sure, Thursday at 10 works" });
    expect(await getDatabase().select().from(inboundReplies)).toHaveLength(1);
  });

  it("suppresses the phone number on STOP", async () => {
    const { processTwilioWebhook } = await import("./twilio-webhook");
    const { getDatabase } = await import("./database");
    const { leads, suppressionEntries } = await import("./database/schema");
    const sent = await sentSms("+15555550100");
    const result = await processTwilioWebhook(sent.organizationId, { MessageSid: "SM_in_2", From: "+15555550100", Body: "STOP", OptOutType: "STOP" });
    expect(result).toMatchObject({ handled: true, suppressed: true });
    const [lead] = await getDatabase().select().from(leads).where(eq(leads.id, sent.leadId));
    expect(lead).toMatchObject({ doNotContact: true, status: "suppressed" });
    const entries = await getDatabase().select().from(suppressionEntries);
    expect(entries).toEqual([expect.objectContaining({ channel: "sms", destination: "+15555550100", source: "twilio_inbound" })]);
  });

  it("applies delivery status callbacks and ignores unknown senders", async () => {
    const { processTwilioWebhook } = await import("./twilio-webhook");
    const { getDatabase } = await import("./database");
    const { outreachMessages } = await import("./database/schema");
    const sent = await sentSms("+15555550100");
    await processTwilioWebhook(sent.organizationId, { MessageSid: "SM_out_1", MessageStatus: "delivered" });
    const [message] = await getDatabase().select().from(outreachMessages).where(eq(outreachMessages.id, sent.messageId));
    expect(message?.status).toBe("delivered");
    expect(await processTwilioWebhook(sent.organizationId, { MessageSid: "SM_in_3", From: "+19999999999", Body: "hi" })).toMatchObject({ handled: false, reason: "unknown_sender" });
  });
});
