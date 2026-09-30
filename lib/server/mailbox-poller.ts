import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { emailDomain, isConsumerAddress } from "../domain/mailboxes";
import { getDatabase } from "./database";
import { leads, outreachMessages, outreachSequences, sendingMailboxes } from "./database/schema";
import { replyBody, scanInbox, type InboxItem } from "./mailbox-imap";
import { MailboxDeliveryError } from "./mailbox-smtp";
import { decryptMailboxSecret, markMailboxError } from "./mailbox-store";
import { normalizeEmailAddress } from "./reply-address";
import { recordInboundReply, type ReplyContext } from "./reply-store";
import { suppressLeadForUnsubscribe } from "./suppression";

const pollEveryMs = 5 * 60_000;
const bounceWindowMs = 7 * 86_400_000;
const bouncePauseRate = 0.08;
const bouncePauseMinimum = 20;

async function loadContext(outreachId: string, organizationId: string): Promise<ReplyContext | null> {
  const [context] = await getDatabase()
    .select({ message: outreachMessages, sequence: outreachSequences, lead: leads })
    .from(outreachMessages)
    .innerJoin(outreachSequences, eq(outreachMessages.sequenceId, outreachSequences.id))
    .innerJoin(leads, eq(outreachMessages.leadId, leads.id))
    .where(and(eq(outreachMessages.id, outreachId), eq(outreachMessages.organizationId, organizationId)))
    .limit(1);
  return context ?? null;
}

/** The lead themselves, or a colleague on the same company domain replying for them. */
export function senderBelongsToLead(from: string, leadEmail: string | null) {
  if (!leadEmail) return false;
  const sender = normalizeEmailAddress(from);
  const lead = normalizeEmailAddress(leadEmail);
  if (sender === lead) return true;
  return !isConsumerAddress(lead) && emailDomain(sender) === emailDomain(lead);
}

async function handleReply(mailbox: typeof sendingMailboxes.$inferSelect, uidValidity: number, item: Extract<InboxItem, { kind: "reply" }>) {
  const context = await loadContext(item.outreachId, mailbox.organizationId);
  if (!context) return "unknown_message";
  const from = item.parsed.from?.value[0]?.address ?? "";
  if (!senderBelongsToLead(from, context.lead.email)) return "sender_mismatch";
  const to = [item.parsed.to].flat().flatMap((group) => group?.value ?? []).map((entry) => normalizeEmailAddress(entry.address ?? "")).filter(Boolean);
  await recordInboundReply(context, {
    provider: "mailbox",
    providerEventId: null,
    providerReplyId: `${mailbox.id}:${uidValidity}:${item.uid}`,
    messageHeaderId: item.headerMessageId,
    channel: "email",
    fromAddress: normalizeEmailAddress(from),
    toAddresses: to.length ? to : [mailbox.email],
    subject: item.parsed.subject ?? null,
    text: replyBody(item.parsed).slice(0, 20_000),
    html: typeof item.parsed.html === "string" ? item.parsed.html.slice(0, 200_000) : null,
    receivedAt: item.parsed.date ?? new Date(),
  });
  return "recorded";
}

async function handleBounce(mailbox: typeof sendingMailboxes.$inferSelect, item: Extract<InboxItem, { kind: "bounce" }>) {
  const context = await loadContext(item.outreachId, mailbox.organizationId);
  if (!context) return "unknown_message";
  const now = new Date();
  await getDatabase().transaction(async (transaction) => {
    await transaction
      .update(outreachMessages)
      .set({ status: "bounced", lastError: item.diagnostic ? `Bounced: ${item.diagnostic}` : "The recipient address bounced.", updatedAt: now })
      .where(and(eq(outreachMessages.id, context.message.id), inArray(outreachMessages.status, ["sending", "sent", "delivered"])));
    if (item.hard) {
      await suppressLeadForUnsubscribe(transaction, {
        organizationId: mailbox.organizationId,
        leadId: context.lead.id,
        email: context.lead.email ?? undefined,
        source: "mailbox_bounce",
        reason: "hard_bounce",
        campaignId: context.message.campaignId,
      });
    }
  });
  return "bounced";
}

/** Takes a mailbox out of rotation when too much of its recent mail bounces. */
async function pauseOnHighBounceRate(mailboxId: string) {
  const since = new Date(Date.now() - bounceWindowMs);
  const [stats] = await getDatabase()
    .select({
      sent: sql<number>`count(*)::int`,
      bounced: sql<number>`(count(*) filter (where ${outreachMessages.status} = 'bounced'))::int`,
    })
    .from(outreachMessages)
    .where(and(eq(outreachMessages.senderMailboxId, mailboxId), gte(outreachMessages.sentAt, since)));
  const sent = Number(stats?.sent ?? 0);
  const bounced = Number(stats?.bounced ?? 0);
  if (sent >= bouncePauseMinimum && bounced / sent >= bouncePauseRate) {
    await getDatabase()
      .update(sendingMailboxes)
      .set({
        status: "paused",
        statusReason: `Paused automatically: ${bounced} of the last ${sent} emails bounced (${Math.round((bounced / sent) * 100)}%). Clean the lead list before resuming.`,
        updatedAt: new Date(),
      })
      .where(and(eq(sendingMailboxes.id, mailboxId), eq(sendingMailboxes.status, "active")));
  }
}

export async function pollMailbox(mailbox: typeof sendingMailboxes.$inferSelect) {
  const database = getDatabase();
  try {
    const scan = await scanInbox(decryptMailboxSecret(mailbox), { uidValidity: mailbox.imapUidValidity, lastUid: mailbox.imapLastUid });
    let bounced = 0;
    for (const item of scan.items) {
      try {
        if (item.kind === "reply") await handleReply(mailbox, scan.uidValidity, item);
        else if ((await handleBounce(mailbox, item)) === "bounced") bounced += 1;
      } catch (error) {
        console.error("[mailbox-poller] could not record inbox item", { mailboxId: mailbox.id, uid: item.uid, error: error instanceof Error ? error.message : error });
      }
    }
    await database
      .update(sendingMailboxes)
      .set({ imapUidValidity: scan.uidValidity, imapLastUid: scan.lastUid, lastPolledAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sendingMailboxes.id, mailbox.id));
    if (bounced) await pauseOnHighBounceRate(mailbox.id);
    return { mailboxId: mailbox.id, items: scan.items.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inbox check failed.";
    if (error instanceof MailboxDeliveryError && error.authFailed) await markMailboxError(mailbox.id, message);
    else await database.update(sendingMailboxes).set({ lastError: message.slice(0, 1_000), updatedAt: new Date() }).where(eq(sendingMailboxes.id, mailbox.id));
    return { mailboxId: mailbox.id, error: message };
  }
}

/**
 * Checks each connected mailbox's inbox for replies and bounces, at most every
 * five minutes per mailbox. Paused mailboxes are still read: pausing stops
 * sending, not listening.
 */
export async function pollMailboxReplies(limit = 10) {
  const database = getDatabase();
  const cutoff = new Date(Date.now() - pollEveryMs);
  const due = await database
    .select({ id: sendingMailboxes.id })
    .from(sendingMailboxes)
    .where(and(inArray(sendingMailboxes.status, ["active", "paused"]), or(isNull(sendingMailboxes.lastPolledAt), lt(sendingMailboxes.lastPolledAt, cutoff))))
    .orderBy(sql`${sendingMailboxes.lastPolledAt} asc nulls first`)
    .limit(limit);
  const results = [];
  for (const { id } of due) {
    // Claim by bumping last_polled_at so an overlapping tick skips it.
    const [claimed] = await database
      .update(sendingMailboxes)
      .set({ lastPolledAt: new Date() })
      .where(and(eq(sendingMailboxes.id, id), or(isNull(sendingMailboxes.lastPolledAt), lt(sendingMailboxes.lastPolledAt, cutoff))))
      .returning();
    if (claimed) results.push(await pollMailbox(claimed));
  }
  return results;
}
