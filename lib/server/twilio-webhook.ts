import { and, desc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "./database";
import { leads, outreachMessages, outreachSequences } from "./database/schema";
import { recordInboundReply } from "./reply-store";

// Keywords carriers and Twilio treat as an opt-out. Twilio's Advanced Opt-Out
// also sends OptOutType=STOP, but the keyword check covers services without it.
const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "revoke"]);

export function normalizePhone(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") || trimmed.startsWith("00") ? `+${digits.replace(/^00/, "")}` : digits;
}

export function isStopMessage(body: string, optOutType?: string | null) {
  if (optOutType?.toUpperCase() === "STOP") return true;
  return STOP_KEYWORDS.has(body.trim().toLowerCase().replace(/[^a-z]/g, ""));
}

const deliveredStatuses = new Set(["delivered", "read"]);
const failedStatuses = new Set(["failed", "undelivered"]);

export type TwilioWebhookParams = Record<string, string>;

export async function processTwilioWebhook(organizationId: string, params: TwilioWebhookParams) {
  const messageSid = params.MessageSid ?? params.SmsSid;
  if (!messageSid) return { handled: false as const, reason: "missing_sid" };

  // Status callbacks for messages we sent carry MessageStatus but no inbound Body.
  if (params.MessageStatus && params.Body === undefined) {
    return applyStatusCallback(organizationId, messageSid, params.MessageStatus, params.ErrorCode ?? null);
  }

  const from = normalizePhone(params.From);
  const body = params.Body ?? "";
  if (!from) return { handled: false as const, reason: "missing_sender" };

  const database = getDatabase();
  // Most recent SMS this workspace sent; matched to the sender in code because
  // stored phone numbers keep whatever formatting research returned.
  const recent = await database
    .select({ message: outreachMessages, sequence: outreachSequences, lead: leads })
    .from(outreachMessages)
    .innerJoin(outreachSequences, eq(outreachMessages.sequenceId, outreachSequences.id))
    .innerJoin(leads, eq(outreachMessages.leadId, leads.id))
    .where(and(
      eq(outreachMessages.organizationId, organizationId),
      eq(outreachMessages.channel, "sms"),
      inArray(outreachMessages.status, ["sent", "delivered", "replied"]),
    ))
    .orderBy(desc(outreachMessages.sentAt))
    .limit(500);
  const context = recent.find((row) => normalizePhone(row.lead.phone) === from);
  if (!context) return { handled: false as const, reason: "unknown_sender" };

  const result = await recordInboundReply(context, {
    provider: "twilio",
    providerEventId: null,
    providerReplyId: messageSid,
    messageHeaderId: null,
    channel: "sms",
    fromAddress: from,
    toAddresses: params.To ? [normalizePhone(params.To)] : [],
    subject: null,
    text: body,
    html: null,
    receivedAt: new Date(),
    forceUnsubscribe: isStopMessage(body, params.OptOutType),
  });
  return { handled: true as const, ...result };
}

async function applyStatusCallback(organizationId: string, messageSid: string, status: string, errorCode: string | null) {
  const normalized = status.toLowerCase();
  const next = deliveredStatuses.has(normalized) ? "delivered" as const : failedStatuses.has(normalized) ? "failed" as const : null;
  if (!next) return { handled: true as const, ignored: normalized };
  const now = new Date();
  const updated = await getDatabase()
    .update(outreachMessages)
    .set({
      status: next,
      lastError: next === "failed" ? `Twilio reported ${normalized}${errorCode ? ` (error ${errorCode})` : ""}.` : null,
      updatedAt: now,
    })
    .where(and(
      eq(outreachMessages.organizationId, organizationId),
      eq(outreachMessages.providerMessageId, messageSid),
      // Never move a message backwards once a reply has been recorded.
      inArray(outreachMessages.status, ["sending", "sent", "delivered"]),
    ))
    .returning({ id: outreachMessages.id });
  return { handled: true as const, status: next, updated: updated.length };
}
