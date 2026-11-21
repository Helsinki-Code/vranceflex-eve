import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { callOutcomes, outcomesNeedingReview, type CallOutcome } from "../domain/voice";
import type { ApiActor } from "./api-actor";
import { AuthRequestError } from "./auth-errors";
import { getDatabase } from "./database";
import { auditEvents, callConsents, leads, voiceCallTargets, voiceCalls, voiceCampaigns } from "./database/schema";

/** The after-call review queue: what happened, what was agreed, and what needs a person. */

export const callFilters = ["needs_review", "all", ...callOutcomes] as const;
export type CallFilter = (typeof callFilters)[number];

export type CallSummary = {
  id: string;
  campaignName: string;
  level: "meetings" | "qualify" | "sell";
  leadId: string;
  personName: string;
  companyName: string;
  phone: string;
  status: string;
  outcome: CallOutcome | null;
  summary: string | null;
  followUp: string | null;
  callbackAt: string | null;
  durationSeconds: number;
  billedSeconds: number;
  flags: string[];
  reviewStatus: "unreviewed" | "reviewed";
  reviewNote: string | null;
  startedAt: string;
};

function toSummary(row: {
  call: typeof voiceCalls.$inferSelect;
  lead: typeof leads.$inferSelect;
  campaignName: string;
}): CallSummary {
  const { call, lead } = row;
  return {
    id: call.id,
    campaignName: row.campaignName,
    level: call.level,
    leadId: lead.id,
    personName: lead.personName,
    companyName: lead.companyName,
    phone: call.phone,
    status: call.status,
    outcome: (call.outcome as CallOutcome | null) ?? null,
    summary: call.summary,
    followUp: call.followUp,
    callbackAt: call.callbackAt?.toISOString() ?? null,
    durationSeconds: call.durationSeconds,
    billedSeconds: call.billedSeconds,
    flags: call.flags,
    reviewStatus: call.reviewStatus,
    reviewNote: call.reviewNote,
    startedAt: call.startedAt.toISOString(),
  };
}

/** Outcomes that call for a person, as a SQL list. */
const REVIEW_OUTCOMES = [...outcomesNeedingReview];

export async function listCalls(organizationId: string, options: { filter?: CallFilter; limit?: number } = {}) {
  const filter = options.filter ?? "needs_review";
  const database = getDatabase();
  const condition =
    filter === "all"
      ? undefined
      : filter === "needs_review"
        ? and(eq(voiceCalls.reviewStatus, "unreviewed"), inArray(voiceCalls.outcome, REVIEW_OUTCOMES))
        : eq(voiceCalls.outcome, filter);
  const rows = await database
    .select({ call: voiceCalls, lead: leads, campaignName: voiceCampaigns.name })
    .from(voiceCalls)
    .innerJoin(leads, eq(leads.id, voiceCalls.leadId))
    .innerJoin(voiceCampaigns, eq(voiceCampaigns.id, voiceCalls.voiceCampaignId))
    .where(and(eq(voiceCalls.organizationId, organizationId), condition))
    .orderBy(desc(voiceCalls.startedAt))
    .limit(Math.min(options.limit ?? 100, 200));
  const [needing] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(voiceCalls)
    .where(and(eq(voiceCalls.organizationId, organizationId), eq(voiceCalls.reviewStatus, "unreviewed"), inArray(voiceCalls.outcome, REVIEW_OUTCOMES)));
  return { calls: rows.map(toSummary), needsReview: Number(needing?.count ?? 0) };
}

export async function getCall(organizationId: string, id: string) {
  const [row] = await getDatabase()
    .select({ call: voiceCalls, lead: leads, campaignName: voiceCampaigns.name })
    .from(voiceCalls)
    .innerJoin(leads, eq(leads.id, voiceCalls.leadId))
    .innerJoin(voiceCampaigns, eq(voiceCampaigns.id, voiceCalls.voiceCampaignId))
    .where(and(eq(voiceCalls.id, id), eq(voiceCalls.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new AuthRequestError("That call wasn't found.", 404);
  return { ...toSummary(row), transcript: row.call.transcript };
}

export const reviewInputSchema = z.object({ reviewed: z.boolean(), note: z.string().trim().max(1_000).optional() }).strict();

export async function reviewCall(actor: ApiActor, id: string, input: z.infer<typeof reviewInputSchema>) {
  if (!["admin", "reviewer", "member"].includes(actor.organizationRole)) throw new AuthRequestError("You can't review calls.", 403);
  const now = new Date();
  const updated = await getDatabase()
    .update(voiceCalls)
    .set({
      reviewStatus: input.reviewed ? "reviewed" : "unreviewed",
      reviewedBy: input.reviewed ? actor.userId : null,
      reviewedAt: input.reviewed ? now : null,
      ...(input.note !== undefined ? { reviewNote: input.note || null } : {}),
      updatedAt: now,
    })
    .where(and(eq(voiceCalls.id, id), eq(voiceCalls.organizationId, actor.organizationId)))
    .returning({ id: voiceCalls.id });
  if (!updated.length) throw new AuthRequestError("That call wasn't found.", 404);
  await getDatabase().insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    actorId: actor.userId,
    campaignId: null,
    action: input.reviewed ? "voice.call_reviewed" : "voice.call_review_reopened",
    entityType: "voice_call",
    entityId: id,
    metadata: {},
  });
}

// ---- Which leads can be called -------------------------------------------------------------

export type CallableLead = {
  leadId: string;
  personName: string;
  companyName: string;
  jobTitle: string;
  phone: string | null;
  consent: "granted" | "revoked" | "none";
  inCampaign: boolean;
};

/** The outreach campaign's leads with a phone number, with each one's consent state. */
export async function listCallableLeads(organizationId: string, voiceCampaignId: string): Promise<CallableLead[]> {
  const database = getDatabase();
  const [campaign] = await database
    .select({ campaignId: voiceCampaigns.campaignId })
    .from(voiceCampaigns)
    .where(and(eq(voiceCampaigns.id, voiceCampaignId), eq(voiceCampaigns.organizationId, organizationId)))
    .limit(1);
  if (!campaign) throw new AuthRequestError("That voice campaign wasn't found.", 404);
  const rows = await database
    .select()
    .from(leads)
    .where(and(eq(leads.organizationId, organizationId), eq(leads.campaignId, campaign.campaignId)))
    .orderBy(desc(leads.confidence));
  const consents = await database
    .select({ leadId: callConsents.leadId, status: callConsents.status })
    .from(callConsents)
    .where(eq(callConsents.organizationId, organizationId));
  const inCampaign = new Set(
    (await database.select({ leadId: voiceCallTargets.leadId }).from(voiceCallTargets).where(eq(voiceCallTargets.voiceCampaignId, voiceCampaignId))).map((row) => row.leadId),
  );
  const consentByLead = new Map<string, "granted" | "revoked">();
  for (const consent of consents) {
    if (consent.status === "granted" || !consentByLead.has(consent.leadId)) consentByLead.set(consent.leadId, consent.status);
  }
  return rows
    .filter((lead) => lead.phone)
    .map((lead) => ({
      leadId: lead.id,
      personName: lead.personName,
      companyName: lead.companyName,
      jobTitle: lead.jobTitle,
      phone: lead.phone,
      consent: consentByLead.get(lead.id) ?? "none",
      inCampaign: inCampaign.has(lead.id),
    }));
}
