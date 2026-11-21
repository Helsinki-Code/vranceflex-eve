import { and, eq, inArray, ne } from "drizzle-orm";
import { isConsumerAddress } from "../domain/mailboxes";
import type { getDatabase } from "./database";
import {
  auditEvents,
  deliveryJobs,
  leads,
  organizationSendingSettings,
  outreachMessages,
  outreachSequences,
} from "./database/schema";
import { normalizeDomain } from "./send-gate";

type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * When one person at a company replies, a colleague receiving email #3 the
 * next morning looks automated and ignores the reply that just came in. This
 * pauses everyone else at that company (any campaign in the workspace) so a
 * human can decide what happens next. Paused, not stopped: a person can resume.
 *
 * Out-of-office and other automatic replies must not call this; one person
 * being away says nothing about their colleagues.
 *
 * Returns how many people's outreach was paused.
 */
export async function pauseColleagueOutreach(
  transaction: Transaction,
  input: {
    organizationId: string;
    repliedLeadId: string;
    companyDomain: string | null;
    campaignId: string;
    replyId: string;
  },
) {
  const domain = input.companyDomain ? normalizeDomain(input.companyDomain) : "";
  // A shared mail host (gmail.com) says nothing about who works together.
  if (!domain || isConsumerAddress(`someone@${domain}`)) return 0;

  const [settings] = await transaction
    .select({ stopCompanyOnReply: organizationSendingSettings.stopCompanyOnReply })
    .from(organizationSendingSettings)
    .where(eq(organizationSendingSettings.organizationId, input.organizationId))
    .limit(1);
  if (settings && !settings.stopCompanyOnReply) return 0;

  const colleagues = await transaction
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, input.organizationId),
        // Stored domains are normally bare, but tolerate a www. variant.
        inArray(leads.companyDomain, [domain, `www.${domain}`]),
        ne(leads.id, input.repliedLeadId),
        eq(leads.doNotContact, false),
      ),
    );
  if (!colleagues.length) return 0;
  const leadIds = colleagues.map((lead) => lead.id);

  const now = new Date();
  const reason = "Paused because a colleague at this company replied.";
  const paused = await transaction
    .update(outreachSequences)
    .set({ status: "paused", updatedAt: now })
    .where(
      and(
        eq(outreachSequences.organizationId, input.organizationId),
        inArray(outreachSequences.leadId, leadIds),
        inArray(outreachSequences.status, ["approved", "scheduled", "active"]),
      ),
    )
    .returning({ id: outreachSequences.id });
  if (!paused.length) return 0;
  const sequenceIds = paused.map((sequence) => sequence.id);

  await transaction
    .update(outreachMessages)
    .set({ status: "cancelled", lastError: reason, updatedAt: now })
    .where(
      and(
        inArray(outreachMessages.sequenceId, sequenceIds),
        inArray(outreachMessages.status, ["approved", "scheduled"]),
      ),
    );
  await transaction
    .update(deliveryJobs)
    .set({ status: "cancelled", lastError: reason, completedAt: now, updatedAt: now })
    .where(
      and(inArray(deliveryJobs.sequenceId, sequenceIds), inArray(deliveryJobs.status, ["queued", "retry"])),
    );
  await transaction.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    actorId: null,
    campaignId: input.campaignId,
    action: "reply.company_outreach_paused",
    entityType: "inbound_reply",
    entityId: input.replyId,
    metadata: { companyDomain: domain, pausedSequences: sequenceIds.length },
  });
  return sequenceIds.length;
}
