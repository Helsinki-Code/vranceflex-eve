import { and, desc, eq, inArray } from "drizzle-orm";
import type { ApiActor } from "./api-actor";
import { classifyReply } from "./reply-classifier";
import {
  messageIdFromRecipients,
  normalizeEmailAddress,
} from "./reply-address";
import { suppressLeadForUnsubscribe } from "./suppression";
import { getDatabase, hasDatabaseConfiguration } from "./database";
import { isDemoModeEnabled } from "../auth/config";
import { demoReplies } from "./demo-replies";
import {
  auditEvents,
  campaigns,
  deliveryJobs,
  inboundReplies,
  leads,
  outreachMessages,
  outreachSequences,
  providerEvents,
} from "./database/schema";

export type InboundEmailInput = {
  providerEventId: string;
  providerReplyId: string;
  messageHeaderId: string | null;
  from: string;
  to: string[];
  subject: string | null;
  text: string;
  html: string | null;
  receivedAt: Date;
  /** Org the connected-account webhook URL belongs to; a resolved message
   * for a different org means this event doesn't belong to that webhook. */
  expectedOrganizationId: string;
};

export async function persistInboundEmailReply(input: InboundEmailInput) {
  const messageId = messageIdFromRecipients(input.to);
  if (!messageId) return { linked: false as const, reason: "uncorrelated_recipient" };

  const database = getDatabase();
  const [context] = await database
    .select({
      message: outreachMessages,
      sequence: outreachSequences,
      lead: leads,
    })
    .from(outreachMessages)
    .innerJoin(
      outreachSequences,
      eq(outreachMessages.sequenceId, outreachSequences.id),
    )
    .innerJoin(leads, eq(outreachMessages.leadId, leads.id))
    .where(eq(outreachMessages.id, messageId))
    .limit(1);
  if (!context) return { linked: false as const, reason: "unknown_message" };
  if (context.message.organizationId !== input.expectedOrganizationId) {
    return { linked: false as const, reason: "organization_mismatch" };
  }
  if (
    !context.lead.email ||
    normalizeEmailAddress(input.from) !==
      normalizeEmailAddress(context.lead.email)
  ) {
    return { linked: false as const, reason: "sender_mismatch" };
  }

  return recordInboundReply(context, {
    provider: "resend",
    providerEventId: input.providerEventId,
    providerReplyId: input.providerReplyId,
    messageHeaderId: input.messageHeaderId,
    channel: "email",
    fromAddress: normalizeEmailAddress(input.from),
    toAddresses: input.to.map(normalizeEmailAddress),
    subject: input.subject,
    text: input.text,
    html: input.html,
    receivedAt: input.receivedAt,
  });
}

type ReplyContext = {
  message: typeof outreachMessages.$inferSelect;
  sequence: typeof outreachSequences.$inferSelect;
  lead: typeof leads.$inferSelect;
};

type ReplyRecordInput = {
  provider: "resend" | "twilio";
  providerEventId: string | null;
  providerReplyId: string;
  messageHeaderId: string | null;
  channel: "email" | "sms";
  fromAddress: string;
  toAddresses: string[];
  subject: string | null;
  text: string;
  html: string | null;
  receivedAt: Date;
  /** Carrier-level opt-out (Twilio STOP) — suppress regardless of wording. */
  forceUnsubscribe?: boolean;
};

function unsubscribeClassification(): ReturnType<typeof classifyReply> {
  return { ...classifyReply("unsubscribe"), intent: "UNSUBSCRIBE" };
}

// Shared by email and SMS: store the reply, pause (or stop) the sequence,
// cancel pending sends and, for opt-outs, suppress the lead on that channel.
export async function recordInboundReply(context: ReplyContext, input: ReplyRecordInput) {
  const database = getDatabase();
  const classification = input.forceUnsubscribe ? unsubscribeClassification() : classifyReply(input.text);
  const replyId = crypto.randomUUID();
  const now = new Date();
  const suppress = classification.intent === "UNSUBSCRIBE";

  const result = await database.transaction(async (transaction) => {
    const [inserted] = await transaction
      .insert(inboundReplies)
      .values({
        id: replyId,
        organizationId: context.message.organizationId,
        campaignId: context.message.campaignId,
        leadId: context.message.leadId,
        sequenceId: context.message.sequenceId,
        outreachMessageId: context.message.id,
        provider: input.provider,
        providerReplyId: input.providerReplyId,
        messageHeaderId: input.messageHeaderId,
        channel: input.channel,
        fromAddress: input.fromAddress,
        toAddresses: input.toAddresses,
        subject: input.subject,
        text: input.text,
        html: input.html,
        intent: classification.intent,
        sentimentScore: classification.sentimentScore,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        nextAction: classification.nextAction,
        actionDetail: classification.actionDetail,
        suggestedResponse: classification.suggestedResponse,
        flagForHuman: classification.flagForHuman,
        flagReason: classification.flagReason,
        status: "classified",
        receivedAt: input.receivedAt,
      })
      .onConflictDoNothing()
      .returning({ id: inboundReplies.id });
    if (!inserted) {
      const [existing] = await transaction
        .select({ id: inboundReplies.id })
        .from(inboundReplies)
        .where(
          and(
            eq(inboundReplies.provider, input.provider),
            eq(inboundReplies.providerReplyId, input.providerReplyId),
          ),
        )
        .limit(1);
      return { id: existing?.id ?? replyId, duplicate: true };
    }

    await transaction
      .update(outreachMessages)
      .set({ status: "replied", updatedAt: now })
      .where(eq(outreachMessages.id, context.message.id));
    await transaction
      .update(outreachSequences)
      .set({ status: suppress ? "stopped" : "paused", updatedAt: now })
      .where(eq(outreachSequences.id, context.sequence.id));
    await transaction
      .update(outreachMessages)
      .set({
        status: "cancelled",
        lastError: suppress
          ? "Future outreach stopped after an unsubscribe request."
          : "Future outreach paused after a recipient reply.",
        updatedAt: now,
      })
      .where(
        and(
          eq(outreachMessages.sequenceId, context.sequence.id),
          inArray(outreachMessages.status, ["approved", "scheduled"]),
        ),
      );
    await transaction
      .update(deliveryJobs)
      .set({
        status: "cancelled",
        lastError: suppress
          ? "Future outreach stopped after an unsubscribe request."
          : "Future outreach paused after a recipient reply.",
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(deliveryJobs.sequenceId, context.sequence.id),
          inArray(deliveryJobs.status, ["queued", "retry"]),
        ),
      );
    await transaction
      .update(campaigns)
      .set({ status: "replied", updatedAt: now })
      .where(
        and(
          eq(campaigns.id, context.message.campaignId),
          inArray(campaigns.status, ["scheduled", "sent", "delivered"]),
        ),
      );
    if (suppress) {
      await suppressLeadForUnsubscribe(transaction, {
        organizationId: context.message.organizationId,
        leadId: context.lead.id,
        ...(input.channel === "sms" ? { sms: context.lead.phone ?? input.fromAddress } : { email: context.lead.email ?? input.fromAddress }),
        source: input.provider === "twilio" ? "twilio_inbound" : "resend_inbound",
        campaignId: context.message.campaignId,
        writeAuditEvent: false,
      });
    }
    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: context.message.organizationId,
      actorId: null,
      campaignId: context.message.campaignId,
      action: suppress ? "reply.unsubscribe_received" : "reply.received",
      entityType: "inbound_reply",
      entityId: replyId,
      metadata: {
        leadId: context.lead.id,
        sequenceId: context.sequence.id,
        messageId: context.message.id,
        intent: classification.intent,
      },
    });
    if (input.providerEventId) {
      await transaction
        .update(providerEvents)
        .set({
          organizationId: context.message.organizationId,
          campaignId: context.message.campaignId,
          messageId: context.message.id,
        })
        .where(
          and(
            eq(providerEvents.provider, input.provider),
            eq(providerEvents.providerEventId, input.providerEventId),
          ),
        );
    }
    return { id: replyId, duplicate: false };
  });

  return {
    linked: true as const,
    replyId: result.id,
    duplicate: result.duplicate,
    intent: classification.intent,
    suppressed: suppress,
  };
}

function usesDemoReplies() {
  return !hasDatabaseConfiguration() && isDemoModeEnabled();
}

export async function listInboundReplies(actor: ApiActor) {
  if (usesDemoReplies()) return demoReplies;
  const database = getDatabase();
  return database
    .select({
      reply: inboundReplies,
      leadName: leads.personName,
      companyName: leads.companyName,
      campaignName: campaigns.productName,
    })
    .from(inboundReplies)
    .innerJoin(leads, eq(inboundReplies.leadId, leads.id))
    .innerJoin(campaigns, eq(inboundReplies.campaignId, campaigns.id))
    .where(eq(inboundReplies.organizationId, actor.organizationId))
    .orderBy(desc(inboundReplies.receivedAt))
    .limit(200);
}

export async function updateReplyReview(
  actor: ApiActor,
  replyId: string,
  status: "reviewed" | "archived",
) {
  if (usesDemoReplies()) {
    const row = demoReplies.find((item) => item.reply.id === replyId);
    if (!row) return null;
    row.reply.status = status;
    return { id: row.reply.id, campaignId: row.reply.campaignId };
  }
  const database = getDatabase();
  const now = new Date();
  return database.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(inboundReplies)
      .set({ status, updatedAt: now })
      .where(
        and(
          eq(inboundReplies.id, replyId),
          eq(inboundReplies.organizationId, actor.organizationId),
        ),
      )
      .returning({
        id: inboundReplies.id,
        campaignId: inboundReplies.campaignId,
      });
    if (!updated) return null;
    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId: updated.campaignId,
      action: `reply.${status}`,
      entityType: "inbound_reply",
      entityId: replyId,
      metadata: {},
    });
    return { id: replyId, status, updatedAt: now.toISOString() };
  });
}
