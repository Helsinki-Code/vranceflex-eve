import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { playbookSchema, voiceLevels } from "../domain/voice";
import type { ApiActor } from "./api-actor";
import { AuthRequestError } from "./auth-errors";
import { getDatabase } from "./database";
import { auditEvents, campaigns, inboundReplies, leads, voiceCallTargets, voiceCalls, voiceCampaigns } from "./database/schema";
import { getVoiceAddon } from "./voice-credits";
import { hasCallConsent, isNumberBlocked, toE164 } from "./voice-consent";
import { priorityScore } from "./voice-scheduling";
import { getVoiceSettings } from "./voice-settings";

export const voiceCampaignInputSchema = z
  .object({
    campaignId: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    level: z.enum(voiceLevels),
    playbook: playbookSchema,
    maxAttempts: z.number().int().min(1).max(5).default(3),
    retryGapHours: z.number().int().min(1).max(72).default(24),
  })
  .strict();

export const voiceCampaignPatchSchema = voiceCampaignInputSchema.omit({ campaignId: true }).partial().strict();

function requireReviewer(actor: ApiActor) {
  if (!["admin", "reviewer"].includes(actor.organizationRole)) {
    throw new AuthRequestError("Admin or reviewer permission is required to manage voice campaigns.", 403);
  }
}

async function audit(actor: ApiActor, action: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await getDatabase().insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    actorId: actor.userId,
    campaignId: null,
    action,
    entityType: "voice_campaign",
    entityId,
    metadata,
  });
}

async function loadOwned(actor: ApiActor, id: string) {
  const [row] = await getDatabase()
    .select()
    .from(voiceCampaigns)
    .where(and(eq(voiceCampaigns.id, id), eq(voiceCampaigns.organizationId, actor.organizationId)))
    .limit(1);
  if (!row) throw new AuthRequestError("That voice campaign wasn't found.", 404);
  return row;
}

export async function createVoiceCampaign(actor: ApiActor, input: z.infer<typeof voiceCampaignInputSchema>) {
  requireReviewer(actor);
  const [campaign] = await getDatabase()
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.organizationId, actor.organizationId)))
    .limit(1);
  if (!campaign) throw new AuthRequestError("That outreach campaign wasn't found.", 404);
  const id = crypto.randomUUID();
  await getDatabase().insert(voiceCampaigns).values({
    id,
    organizationId: actor.organizationId,
    campaignId: input.campaignId,
    name: input.name,
    level: input.level,
    playbook: input.playbook,
    maxAttempts: input.maxAttempts,
    retryGapHours: input.retryGapHours,
    createdBy: actor.userId,
  });
  await audit(actor, "voice.campaign_created", id, { level: input.level });
  return id;
}

/**
 * Editing the script, level or limits takes a campaign back to draft: what a
 * person approved is exactly what runs, so any change needs approving again.
 */
export async function updateVoiceCampaign(actor: ApiActor, id: string, patch: z.infer<typeof voiceCampaignPatchSchema>) {
  requireReviewer(actor);
  const row = await loadOwned(actor, id);
  if (row.status === "running") throw new AuthRequestError("Pause the campaign before changing it.", 409);
  if (row.status === "completed" || row.status === "cancelled") throw new AuthRequestError("This campaign has finished.", 409);
  const now = new Date();
  await getDatabase()
    .update(voiceCampaigns)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.level !== undefined ? { level: patch.level } : {}),
      ...(patch.playbook !== undefined ? { playbook: patch.playbook } : {}),
      ...(patch.maxAttempts !== undefined ? { maxAttempts: patch.maxAttempts } : {}),
      ...(patch.retryGapHours !== undefined ? { retryGapHours: patch.retryGapHours } : {}),
      status: "draft",
      approvedBy: null,
      approvedAt: null,
      pausedReason: null,
      updatedAt: now,
    })
    .where(eq(voiceCampaigns.id, id));
  await audit(actor, "voice.campaign_edited", id, { changed: Object.keys(patch) });
}

// ---- Who gets called -------------------------------------------------------------

const REPLY_RANK = ["OFFER_ACCEPTED", "HOT", "WARM", "NEUTRAL", "OBJECTION"] as const;

async function bestReplyIntents(organizationId: string, leadIds: string[]) {
  if (!leadIds.length) return new Map<string, string>();
  const rows = await getDatabase()
    .select({ leadId: inboundReplies.leadId, intent: inboundReplies.intent })
    .from(inboundReplies)
    .where(and(eq(inboundReplies.organizationId, organizationId), inArray(inboundReplies.leadId, leadIds)));
  const best = new Map<string, string>();
  for (const row of rows) {
    if (!row.intent) continue;
    const rank = REPLY_RANK.indexOf(row.intent as (typeof REPLY_RANK)[number]);
    if (rank < 0) continue;
    const current = best.get(row.leadId);
    if (!current || rank < REPLY_RANK.indexOf(current as (typeof REPLY_RANK)[number])) best.set(row.leadId, row.intent);
  }
  return best;
}

export type TargetSkip = { leadId: string; reason: string };

/**
 * Adds leads to call. Only leads with a number in international format, a
 * current consent record, no opt-out and a number that isn't on the
 * do-not-call list are added; everything else is returned with the reason.
 * With no `leadIds`, every lead in the outreach campaign is considered.
 */
export async function addCallTargets(actor: ApiActor, id: string, leadIds?: string[]) {
  requireReviewer(actor);
  const campaign = await loadOwned(actor, id);
  if (campaign.status === "completed" || campaign.status === "cancelled") throw new AuthRequestError("This campaign has finished.", 409);
  const database = getDatabase();
  const candidates = await database
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, actor.organizationId),
        leadIds?.length ? inArray(leads.id, leadIds) : eq(leads.campaignId, campaign.campaignId),
      ),
    );
  const existing = new Set(
    (await database.select({ leadId: voiceCallTargets.leadId }).from(voiceCallTargets).where(eq(voiceCallTargets.voiceCampaignId, id))).map((row) => row.leadId),
  );
  const intents = await bestReplyIntents(actor.organizationId, candidates.map((lead) => lead.id));
  const now = new Date();
  const added: string[] = [];
  const skipped: TargetSkip[] = [];
  const seenNumbers = new Set<string>();

  for (const lead of candidates) {
    const skip = (reason: string) => skipped.push({ leadId: lead.id, reason });
    if (existing.has(lead.id)) { skip("Already in this campaign."); continue; }
    if (lead.doNotContact || lead.status === "suppressed") { skip("Asked not to be contacted."); continue; }
    const phone = toE164(lead.phone);
    if (!phone) { skip("No phone number in international format."); continue; }
    if (seenNumbers.has(phone)) { skip("Another lead already uses this number."); continue; }
    if (await isNumberBlocked(actor.organizationId, phone)) { skip("This number asked not to be called."); continue; }
    if (!(await hasCallConsent(actor.organizationId, lead.id, phone))) { skip("No call consent recorded."); continue; }
    seenNumbers.add(phone);
    await database.insert(voiceCallTargets).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      voiceCampaignId: id,
      leadId: lead.id,
      phone,
      priority: priorityScore({ leadConfidence: lead.confidence, emailReplyIntent: intents.get(lead.id) ?? null, attempts: 0 }),
      nextAttemptAt: now,
    });
    added.push(lead.id);
  }
  if (added.length) await audit(actor, "voice.targets_added", id, { added: added.length, skipped: skipped.length });
  return { added: added.length, skipped };
}

// ---- Approval and running ----------------------------------------------------------

/** Everything that has to be true before a campaign may be approved, as plain sentences. */
export async function approvalBlockers(organizationId: string, id: string) {
  const blockers: string[] = [];
  const addon = await getVoiceAddon(organizationId);
  if (!addon?.active) blockers.push("Voice calling is a paid add-on. Add it in Settings → Billing.");
  const settings = await getVoiceSettings(organizationId);
  if (!settings.telephonyConnected) blockers.push("Connect your Twilio phone line in Settings → Voice.");
  if (!settings.consentAttestedAt) blockers.push("An admin needs to confirm in Settings → Voice that the people you call have consented.");
  const [queued] = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(voiceCallTargets)
    .where(and(eq(voiceCallTargets.voiceCampaignId, id), eq(voiceCallTargets.status, "queued")));
  if (Number(queued?.count ?? 0) === 0) blockers.push("Add at least one lead with recorded call consent.");
  return blockers;
}

export async function approveVoiceCampaign(actor: ApiActor, id: string) {
  requireReviewer(actor);
  const row = await loadOwned(actor, id);
  if (row.status !== "draft") throw new AuthRequestError("Only a draft campaign can be approved.", 409);
  const blockers = await approvalBlockers(actor.organizationId, id);
  if (blockers.length) throw new AuthRequestError(blockers.join(" "), 409);
  const now = new Date();
  await getDatabase().update(voiceCampaigns).set({ status: "approved", approvedBy: actor.userId, approvedAt: now, updatedAt: now }).where(eq(voiceCampaigns.id, id));
  await audit(actor, "voice.campaign_approved", id, { level: row.level });
}

export async function startVoiceCampaign(actor: ApiActor, id: string) {
  requireReviewer(actor);
  const row = await loadOwned(actor, id);
  if (!["approved", "paused"].includes(row.status) || !row.approvedAt) throw new AuthRequestError("Approve the campaign before starting it.", 409);
  await getDatabase().update(voiceCampaigns).set({ status: "running", pausedReason: null, updatedAt: new Date() }).where(eq(voiceCampaigns.id, id));
  await audit(actor, "voice.campaign_started", id);
}

export async function pauseVoiceCampaign(actor: ApiActor, id: string, reason = "Paused by a person.") {
  requireReviewer(actor);
  const row = await loadOwned(actor, id);
  if (row.status !== "running") throw new AuthRequestError("Only a running campaign can be paused.", 409);
  await getDatabase().update(voiceCampaigns).set({ status: "paused", pausedReason: reason.slice(0, 300), updatedAt: new Date() }).where(eq(voiceCampaigns.id, id));
  await audit(actor, "voice.campaign_paused", id, { reason });
}

export async function cancelVoiceCampaign(actor: ApiActor, id: string) {
  requireReviewer(actor);
  const row = await loadOwned(actor, id);
  if (row.status === "completed" || row.status === "cancelled") return;
  const now = new Date();
  await getDatabase().transaction(async (transaction) => {
    await transaction.update(voiceCampaigns).set({ status: "cancelled", updatedAt: now }).where(eq(voiceCampaigns.id, id));
    await transaction
      .update(voiceCallTargets)
      .set({ status: "skipped", skipReason: "Campaign cancelled", updatedAt: now })
      .where(and(eq(voiceCallTargets.voiceCampaignId, id), eq(voiceCallTargets.status, "queued")));
  });
  await audit(actor, "voice.campaign_cancelled", id);
}

// ---- Reading ----------------------------------------------------------------------------

export async function listVoiceCampaigns(organizationId: string) {
  const database = getDatabase();
  const rows = await database.select().from(voiceCampaigns).where(eq(voiceCampaigns.organizationId, organizationId)).orderBy(desc(voiceCampaigns.createdAt));
  const targetCounts = await database
    .select({ id: voiceCallTargets.voiceCampaignId, status: voiceCallTargets.status, count: sql<number>`count(*)::int` })
    .from(voiceCallTargets)
    .where(eq(voiceCallTargets.organizationId, organizationId))
    .groupBy(voiceCallTargets.voiceCampaignId, voiceCallTargets.status);
  const callCounts = await database
    .select({ id: voiceCalls.voiceCampaignId, outcome: voiceCalls.outcome, count: sql<number>`count(*)::int` })
    .from(voiceCalls)
    .where(eq(voiceCalls.organizationId, organizationId))
    .groupBy(voiceCalls.voiceCampaignId, voiceCalls.outcome);
  return rows.map((row) => {
    const targets: Record<string, number> = {};
    for (const count of targetCounts.filter((item) => item.id === row.id)) targets[count.status] = Number(count.count);
    const outcomes: Record<string, number> = {};
    for (const count of callCounts.filter((item) => item.id === row.id)) outcomes[count.outcome ?? "in_progress"] = Number(count.count);
    return {
      id: row.id,
      campaignId: row.campaignId,
      name: row.name,
      level: row.level,
      status: row.status,
      pausedReason: row.pausedReason,
      maxAttempts: row.maxAttempts,
      retryGapHours: row.retryGapHours,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      playbook: row.playbook,
      targets,
      outcomes,
    };
  });
}
