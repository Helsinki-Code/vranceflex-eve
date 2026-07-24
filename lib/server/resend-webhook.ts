import { and, eq, inArray } from "drizzle-orm";
import { getDatabase } from "./database";
import { getReceivedEmailContent } from "./resend-receiving";
import { persistInboundEmailReply } from "./reply-store";
import {
  campaigns,
  deliveryJobs,
  leads,
  outreachMessages,
  outreachSequences,
  providerEvents,
  suppressionEntries,
} from "./database/schema";

export type ResendWebhookEvent = {
  type: string;
  created_at: string;
  data?: {
    email_id?: string;
    message_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    tags?: Record<string, string>;
    bounce?: { type?: string; message?: string };
  };
};

function safeEventPayload(event: ResendWebhookEvent) {
  return {
    to: event.data?.to ?? [],
    subject: event.data?.subject?.slice(0, 300) ?? null,
    tags: event.data?.tags ?? {},
    bounceType: event.data?.bounce?.type ?? null,
  };
}

async function reconcileCampaignAndSequence(
  campaignId: string,
  sequenceId: string,
) {
  const database = getDatabase();
  const now = new Date();
  const sequenceMessages = await database
    .select({ status: outreachMessages.status })
    .from(outreachMessages)
    .where(eq(outreachMessages.sequenceId, sequenceId));
  if (
    sequenceMessages.length &&
    sequenceMessages.every(({ status }) =>
      ["sent", "delivered", "bounced", "failed", "cancelled"].includes(status),
    )
  ) {
    await database
      .update(outreachSequences)
      .set({ status: "completed", updatedAt: now })
      .where(
        and(
          eq(outreachSequences.id, sequenceId),
          inArray(outreachSequences.status, ["scheduled", "active"]),
        ),
      );
  }

  const campaignMessages = await database
    .select({
      messageStatus: outreachMessages.status,
      sequenceStatus: outreachSequences.status,
    })
    .from(outreachMessages)
    .innerJoin(
      outreachSequences,
      eq(outreachMessages.sequenceId, outreachSequences.id),
    )
    .where(eq(outreachMessages.campaignId, campaignId));
  const activeBatch = campaignMessages.filter(({ sequenceStatus }) =>
    ["scheduled", "active", "completed", "stopped"].includes(sequenceStatus),
  );
  if (!activeBatch.length) return;

  const [campaign] = await database
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign) return;

  const allProviderFinal = activeBatch.every(({ messageStatus }) =>
    ["sent", "delivered", "bounced", "failed", "cancelled"].includes(
      messageStatus,
    ),
  );
  const anyProviderSent = activeBatch.some(({ messageStatus }) =>
    ["sent", "delivered"].includes(messageStatus),
  );
  const allDelivered = activeBatch.every(
    ({ messageStatus }) => messageStatus === "delivered",
  );
  if (campaign.status === "scheduled" && allProviderFinal && anyProviderSent) {
    await database
      .update(campaigns)
      .set({ status: "sent", updatedAt: now })
      .where(eq(campaigns.id, campaignId));
  }
  if (
    allDelivered &&
    (campaign.status === "sent" ||
      (campaign.status === "scheduled" && allProviderFinal))
  ) {
    if (campaign.status === "scheduled") {
      await database
        .update(campaigns)
        .set({ status: "sent", updatedAt: now })
        .where(eq(campaigns.id, campaignId));
    }
    await database
      .update(campaigns)
      .set({ status: "delivered", updatedAt: now })
      .where(eq(campaigns.id, campaignId));
  }
}

export async function processResendWebhook(
  providerEventId: string,
  event: ResendWebhookEvent,
  expectedOrganizationId: string,
  orgResendApiKey: string,
) {
  const database = getDatabase();
  const providerMessageId = event.data?.email_id ?? null;
  const [rawMessage] = providerMessageId
    ? await database
        .select()
        .from(outreachMessages)
        .where(eq(outreachMessages.providerMessageId, providerMessageId))
        .limit(1)
    : [];
  // A message only ever belongs to the org whose own Resend account sent it —
  // a mismatch here means this webhook URL is being hit with someone else's
  // event, so treat it exactly like "no message found".
  const message =
    rawMessage && rawMessage.organizationId === expectedOrganizationId
      ? rawMessage
      : undefined;
  const occurredAt = new Date(event.created_at);
  const safeOccurredAt = Number.isNaN(occurredAt.getTime())
    ? new Date()
    : occurredAt;

  const [inserted] = await database
    .insert(providerEvents)
    .values({
      id: crypto.randomUUID(),
      provider: "resend",
      providerEventId,
      eventType: event.type,
      providerMessageId,
      organizationId: message?.organizationId ?? null,
      campaignId: message?.campaignId ?? null,
      messageId: message?.id ?? null,
      payload: safeEventPayload(event),
      occurredAt: safeOccurredAt,
    })
    .onConflictDoNothing()
    .returning({ id: providerEvents.id, processedAt: providerEvents.processedAt });
  let eventRecord = inserted;
  if (!eventRecord) {
    const [existing] = await database
      .select({
        id: providerEvents.id,
        processedAt: providerEvents.processedAt,
      })
      .from(providerEvents)
      .where(
        and(
          eq(providerEvents.provider, "resend"),
          eq(providerEvents.providerEventId, providerEventId),
        ),
      )
      .limit(1);
    if (existing?.processedAt) {
      return { duplicate: true, linked: Boolean(message) };
    }
    eventRecord = existing;
  }
  if (!eventRecord) throw new Error("The provider event could not be reserved.");

  if (
    event.type === "email.received" &&
    event.data?.email_id &&
    event.data.from
  ) {
    const content = await getReceivedEmailContent(event.data.email_id, orgResendApiKey);
    const reply = await persistInboundEmailReply({
      providerEventId,
      providerReplyId: event.data.email_id,
      messageHeaderId: event.data.message_id ?? null,
      from: event.data.from,
      to: event.data.to ?? [],
      subject: event.data.subject ?? null,
      text: content.text?.trim() || "",
      html: content.html ?? null,
      receivedAt: safeOccurredAt,
      expectedOrganizationId,
    });
    await database
      .update(providerEvents)
      .set({ processedAt: new Date(), processingError: null })
      .where(eq(providerEvents.id, eventRecord.id));
    return { duplicate: false, ...reply };
  }

  if (!message) {
    await database
      .update(providerEvents)
      .set({ processedAt: new Date(), processingError: null })
      .where(eq(providerEvents.id, eventRecord.id));
    return { duplicate: false, linked: false };
  }

  const now = new Date();
  if (event.type === "email.sent") {
    await database.transaction(async (transaction) => {
      await transaction
        .update(outreachMessages)
        .set({ status: "sent", sentAt: safeOccurredAt, updatedAt: now })
        .where(eq(outreachMessages.id, message.id));
      await transaction
        .update(outreachSequences)
        .set({ status: "active", updatedAt: now })
        .where(
          and(
            eq(outreachSequences.id, message.sequenceId),
            eq(outreachSequences.status, "scheduled"),
          ),
        );
    });
  } else if (event.type === "email.delivered") {
    await database.transaction(async (transaction) => {
      await transaction
        .update(outreachMessages)
        .set({
          status: "delivered",
          sentAt: message.sentAt ?? safeOccurredAt,
          deliveredAt: safeOccurredAt,
          updatedAt: now,
        })
        .where(eq(outreachMessages.id, message.id));
      await transaction
        .update(outreachSequences)
        .set({ status: "active", updatedAt: now })
        .where(
          and(
            eq(outreachSequences.id, message.sequenceId),
            eq(outreachSequences.status, "scheduled"),
          ),
        );
    });
  } else if (
    event.type === "email.bounced" ||
    event.type === "email.suppressed"
  ) {
    const [lead] = await database
      .select()
      .from(leads)
      .where(eq(leads.id, message.leadId))
      .limit(1);
    await database.transaction(async (transaction) => {
      await transaction
        .update(outreachMessages)
        .set({
          status: event.type === "email.bounced" ? "bounced" : "cancelled",
          lastError:
            event.type === "email.bounced"
              ? "The recipient address bounced."
              : "Resend suppressed this recipient.",
          updatedAt: now,
        })
        .where(eq(outreachMessages.id, message.id));
      await transaction
        .update(leads)
        .set({ doNotContact: true, status: "suppressed", updatedAt: now })
        .where(eq(leads.id, message.leadId));
      await transaction
        .update(outreachSequences)
        .set({ status: "stopped", updatedAt: now })
        .where(
          and(
            eq(outreachSequences.leadId, message.leadId),
            inArray(outreachSequences.status, [
              "draft",
              "awaiting_approval",
              "approved",
              "scheduled",
              "active",
              "paused",
            ]),
          ),
        );
      await transaction
        .update(outreachMessages)
        .set({
          status: "cancelled",
          lastError: "Future outreach stopped after provider suppression.",
          updatedAt: now,
        })
        .where(
          and(
            eq(outreachMessages.leadId, message.leadId),
            inArray(outreachMessages.status, [
              "draft",
              "approved",
              "scheduled",
            ]),
          ),
        );
      await transaction
        .update(deliveryJobs)
        .set({
          status: "cancelled",
          lastError: "Future outreach stopped after provider suppression.",
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(deliveryJobs.leadId, message.leadId),
            inArray(deliveryJobs.status, ["queued", "retry"]),
          ),
        );
      if (lead?.email) {
        await transaction
          .insert(suppressionEntries)
          .values({
            id: crypto.randomUUID(),
            organizationId: message.organizationId,
            leadId: message.leadId,
            channel: "email",
            destination: lead.email.trim().toLowerCase(),
            reason: event.type,
            source: "resend_webhook",
          })
          .onConflictDoNothing();
      }
    });
  } else if (event.type === "email.failed") {
    await database
      .update(outreachMessages)
      .set({
        status: "failed",
        lastError: "Resend reported a terminal delivery failure.",
        updatedAt: now,
      })
      .where(eq(outreachMessages.id, message.id));
  }

  await reconcileCampaignAndSequence(message.campaignId, message.sequenceId);
  await database
    .update(providerEvents)
    .set({ processedAt: new Date(), processingError: null })
    .where(eq(providerEvents.id, eventRecord.id));
  return { duplicate: false, linked: true };
}
