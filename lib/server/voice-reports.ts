import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { signWorkerReport } from "../domain/voice-signature";
import { allowedOutcome, callOutcomes, isStopRequest, outcomeLabels, outcomesNeedingReview, type CallOutcome } from "../domain/voice";
import { getDatabase } from "./database";
import {
  auditEvents,
  callConsents,
  leads,
  voiceCallTargets,
  voiceCalls,
  voiceCampaigns,
  voiceDoNotCall,
} from "./database/schema";
import { suppressLeadForUnsubscribe } from "./suppression";
import { MAX_CALL_SECONDS, settleCallSeconds } from "./voice-credits";
import { TWILIO_FINAL_STATUSES } from "./voice-twilio";
import { callbackTime, nextAttemptTime, shouldRetry } from "./voice-scheduling";
import { getVoiceSettings } from "./voice-settings";
import { organizationTimezone } from "./mailbox-store";
import { assertValidTimezone } from "./timezone";

/**
 * How a call ends. Used by the voice worker's report, by an unanswered or
 * failed dial, and by the sweep that rescues calls whose worker vanished.
 *
 * The rules that matter live here, in code, not in the model: a stop request in
 * the transcript always wins, an outcome beyond the agent's level is folded
 * back, only answered time is charged, and every end is idempotent.
 */

export const transcriptTurnSchema = z.object({
  role: z.enum(["agent", "prospect"]),
  text: z.string().max(2_000),
  at: z.string().max(40).optional(),
});

export const workerReportSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("answered"), callId: z.string().uuid(), answeredAt: z.string().datetime().optional() }),
  z.object({
    event: z.literal("completed"),
    callId: z.string().uuid(),
    outcome: z.enum(callOutcomes),
    summary: z.string().max(4_000).optional(),
    followUp: z.string().max(1_000).optional(),
    callbackAt: z.string().datetime().optional(),
    answeredAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    transcript: z.array(transcriptTurnSchema).max(600).default([]),
    error: z.string().max(1_000).optional(),
  }),
]);
export type WorkerReport = z.infer<typeof workerReportSchema>;

// ---- Authenticating the worker --------------------------------------------------

const SIGNATURE_MAX_AGE_MS = 5 * 60_000;

export { signWorkerReport };

export function verifyWorkerReport(input: { secret: string | undefined; timestamp: string | null; signature: string | null; body: string; now?: Date }) {
  if (!input.secret || !input.timestamp || !input.signature) return false;
  const sentAt = Number(input.timestamp);
  const now = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > SIGNATURE_MAX_AGE_MS) return false;
  const expected = Buffer.from(signWorkerReport(input.secret, input.timestamp, input.body), "hex");
  const given = Buffer.from(input.signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---- Ending a call --------------------------------------------------------------

export type FinalizeInput = {
  callId: string;
  outcome: CallOutcome;
  summary?: string;
  followUp?: string;
  callbackAt?: Date | null;
  transcript?: Array<{ role: "agent" | "prospect"; text: string; at?: string }>;
  answeredAt?: Date | null;
  endedAt?: Date | null;
  error?: string | null;
  /** What the carrier says the call lasted. The charge is never more than this. */
  providerDurationSeconds?: number | null;
  now?: Date;
};

const UNANSWERED_OUTCOMES: ReadonlySet<CallOutcome> = new Set(["no_answer", "voicemail", "failed"]);

export async function finalizeCall(input: FinalizeInput) {
  const now = input.now ?? new Date();
  const database = getDatabase();
  const [call] = await database.select().from(voiceCalls).where(eq(voiceCalls.id, input.callId)).limit(1);
  if (!call) return { found: false as const };
  if (call.status === "completed" || call.status === "failed") return { found: true as const, alreadyFinished: true as const, outcome: call.outcome as CallOutcome | null };

  const flags: string[] = [];
  const transcript = (input.transcript ?? []).slice(0, 600).map((turn) => ({ ...turn, text: turn.text.slice(0, 2_000) }));
  const answeredAt = input.answeredAt ?? call.answeredAt ?? null;

  // 1. What the conversation ended in, corrected by the rules.
  let outcome = input.outcome;
  const heardStop = transcript.some((turn) => turn.role === "prospect" && isStopRequest(turn.text));
  if (heardStop && outcome !== "do_not_call") {
    outcome = "do_not_call";
    flags.push("They asked to stop, so the number was removed.");
  } else {
    const adjusted = allowedOutcome(call.level, outcome);
    if (adjusted !== outcome) {
      flags.push(`The agent reported "${outcomeLabels[outcome]}", which is beyond this campaign's level, so it was recorded as "${outcomeLabels[adjusted]}".`);
      outcome = adjusted;
    }
  }
  if (!answeredAt && !UNANSWERED_OUTCOMES.has(outcome)) {
    outcome = "no_answer";
  }

  // 2. Only time on a live call is charged.
  const endedAt = input.endedAt ?? now;
  // A call nobody answered, that reached a voicemail greeting, or that failed is never charged,
  // whatever timestamps arrive with it.
  const talkSeconds = answeredAt && !UNANSWERED_OUTCOMES.has(outcome) ? Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1_000)) : 0;
  // When the carrier reported a duration too, the charge can never exceed either figure, so a
  // skewed clock on one side can't overcharge.
  const rawSeconds = input.providerDurationSeconds != null ? Math.min(talkSeconds, Math.max(0, input.providerDurationSeconds)) : talkSeconds;
  const durationSeconds = Math.min(rawSeconds, MAX_CALL_SECONDS);
  const settled = await settleCallSeconds({ organizationId: call.organizationId, callId: call.id, seconds: durationSeconds, now });
  if (settled.shortfallSeconds > 0) flags.push("The workspace ran out of minutes during this call.");

  if (outcomesNeedingReview.has(outcome)) flags.push(`Needs a look: ${outcomeLabels[outcome]}.`);
  if (input.error) flags.push(input.error.slice(0, 300));

  const failed = outcome === "failed";
  await database
    .update(voiceCalls)
    .set({
      status: failed ? "failed" : "completed",
      answeredAt,
      endedAt,
      durationSeconds,
      billedSeconds: settled.billedSeconds,
      outcome,
      summary: input.summary?.slice(0, 4_000) ?? null,
      followUp: input.followUp?.slice(0, 1_000) ?? null,
      callbackAt: input.callbackAt ?? null,
      transcript,
      flags,
      error: input.error?.slice(0, 1_000) ?? null,
      heldReport: null,
      updatedAt: now,
    })
    .where(eq(voiceCalls.id, call.id));

  await updateTargetAfterCall({ call, outcome, callbackAt: input.callbackAt ?? null, now });

  await database.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: call.organizationId,
    actorId: null,
    campaignId: null,
    action: "voice.call_completed",
    entityType: "voice_call",
    entityId: call.id,
    metadata: { outcome, durationSeconds, billedSeconds: settled.billedSeconds },
  });
  return { found: true as const, alreadyFinished: false as const, outcome, billedSeconds: settled.billedSeconds };
}

async function updateTargetAfterCall(input: { call: typeof voiceCalls.$inferSelect; outcome: CallOutcome; callbackAt: Date | null; now: Date }) {
  const { call, outcome, now } = input;
  const database = getDatabase();
  const [target] = await database.select().from(voiceCallTargets).where(eq(voiceCallTargets.id, call.targetId)).limit(1);
  if (!target) return;
  const [campaign] = await database.select().from(voiceCampaigns).where(eq(voiceCampaigns.id, call.voiceCampaignId)).limit(1);
  const [lead] = await database.select().from(leads).where(eq(leads.id, call.leadId)).limit(1);
  const settings = await getVoiceSettings(call.organizationId);
  let timezone = lead?.timezone ?? null;
  try {
    if (timezone) assertValidTimezone(timezone);
  } catch {
    timezone = null;
  }
  timezone ??= await organizationTimezone(call.organizationId);

  if (outcome === "do_not_call") {
    await database.transaction(async (transaction) => {
      await transaction
        .insert(voiceDoNotCall)
        .values({ id: crypto.randomUUID(), organizationId: call.organizationId, phone: call.phone, reason: "Asked not to be called", callId: call.id })
        .onConflictDoNothing();
      await transaction
        .update(callConsents)
        .set({ status: "revoked", revokedAt: now, revokedReason: "Asked not to be called on a call", updatedAt: now })
        .where(and(eq(callConsents.organizationId, call.organizationId), eq(callConsents.phone, call.phone), eq(callConsents.status, "granted")));
      // They said stop: stop everything to this person, including email.
      if (lead) {
        await suppressLeadForUnsubscribe(transaction, {
          organizationId: call.organizationId,
          leadId: lead.id,
          ...(lead.email ? { email: lead.email } : { sms: call.phone }),
          source: "voice_call",
          writeAuditEvent: false,
        });
      }
      // Every other queued call to this number, in any campaign, is dropped too.
      await transaction
        .update(voiceCallTargets)
        .set({ status: "skipped", skipReason: "Asked not to be called", updatedAt: now })
        .where(and(eq(voiceCallTargets.organizationId, call.organizationId), eq(voiceCallTargets.phone, call.phone), inArray(voiceCallTargets.status, ["queued", "in_progress"])));
      await transaction
        .update(voiceCallTargets)
        .set({ status: "done", lastOutcome: outcome, updatedAt: now })
        .where(eq(voiceCallTargets.id, target.id));
    });
  } else if (outcome === "callback_requested") {
    // A callback isn't a failed attempt, so it doesn't use one up.
    const when = callbackTime({ requested: input.callbackAt ?? new Date(now.getTime() + 86_400_000), now, timezone, window: settings.window });
    await database
      .update(voiceCallTargets)
      .set({ status: "queued", attempts: Math.max(0, target.attempts - 1), nextAttemptAt: when, lastOutcome: outcome, updatedAt: now })
      .where(eq(voiceCallTargets.id, target.id));
  } else if (campaign && shouldRetry(outcome, target.attempts, campaign.maxAttempts)) {
    await database
      .update(voiceCallTargets)
      .set({
        status: "queued",
        nextAttemptAt: nextAttemptTime({ now, attemptsMade: target.attempts, gapHours: campaign.retryGapHours, timezone, window: settings.window }),
        lastOutcome: outcome,
        updatedAt: now,
      })
      .where(eq(voiceCallTargets.id, target.id));
  } else {
    await database.update(voiceCallTargets).set({ status: "done", lastOutcome: outcome, updatedAt: now }).where(eq(voiceCallTargets.id, target.id));
  }

  // The campaign is finished when nothing is waiting or in progress.
  if (campaign) {
    const [open] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(voiceCallTargets)
      .where(and(eq(voiceCallTargets.voiceCampaignId, campaign.id), inArray(voiceCallTargets.status, ["queued", "in_progress"])));
    if (Number(open?.count ?? 0) === 0 && campaign.status === "running") {
      await database.update(voiceCampaigns).set({ status: "completed", updatedAt: now }).where(eq(voiceCampaigns.id, campaign.id));
    }
  }
}

/** The worker says the call was answered. Idempotent. */
export async function markCallAnswered(callId: string, answeredAt: Date) {
  const updated = await getDatabase()
    .update(voiceCalls)
    .set({ status: "in_progress", answeredAt, updatedAt: new Date() })
    .where(and(eq(voiceCalls.id, callId), inArray(voiceCalls.status, ["dialing", "in_progress"])))
    .returning({ id: voiceCalls.id });
  return { updated: updated.length > 0 };
}

type CompletedReport = Extract<WorkerReport, { event: "completed" }>;

/** Turns a worker's finished report into the input for ending the call. */
export function finalizeInputFromReport(report: CompletedReport, extra: { providerDurationSeconds?: number | null; now?: Date } = {}): FinalizeInput {
  return {
    callId: report.callId,
    outcome: report.outcome,
    summary: report.summary,
    followUp: report.followUp,
    callbackAt: report.callbackAt ? new Date(report.callbackAt) : null,
    transcript: report.transcript,
    answeredAt: report.answeredAt ? new Date(report.answeredAt) : null,
    endedAt: report.endedAt ? new Date(report.endedAt) : null,
    error: report.error ?? null,
    providerDurationSeconds: extra.providerDurationSeconds ?? null,
    now: extra.now,
  };
}

export async function applyWorkerReport(report: WorkerReport, now = new Date()) {
  if (report.event === "answered") {
    return markCallAnswered(report.callId, report.answeredAt ? new Date(report.answeredAt) : now);
  }
  const database = getDatabase();
  const [call] = await database.select().from(voiceCalls).where(eq(voiceCalls.id, report.callId)).limit(1);
  // On a Twilio line a call is charged once both halves are in: this report and Twilio's own
  // "completed". If Twilio hasn't said the call is over yet, keep the report until it does.
  if (call && call.lineType === "twilio" && (call.status === "dialing" || call.status === "in_progress") && !TWILIO_FINAL_STATUSES.has(call.providerStatus ?? "")) {
    await database.update(voiceCalls).set({ heldReport: report, updatedAt: now }).where(and(eq(voiceCalls.id, call.id), inArray(voiceCalls.status, ["dialing", "in_progress"])));
    return { found: true as const, held: true as const };
  }
  return finalizeCall(finalizeInputFromReport(report, { providerDurationSeconds: call?.providerDurationSeconds ?? null, now }));
}

/**
 * Rescues calls whose worker never reported (a crash or lost connection):
 * they are ended as failed, nothing is charged, and the person is retried.
 */
/** How long one half of a Twilio call's two reports may wait for the other. */
export const HELD_REPORT_LIMIT_MS = 10 * 60_000;

export async function reapStaleCalls(now = new Date()) {
  const database = getDatabase();
  const dialingCutoff = new Date(now.getTime() - 3 * 60_000);
  const liveCutoff = new Date(now.getTime() - (MAX_CALL_SECONDS + 120) * 1_000);
  const stale = await database
    .select({
      id: voiceCalls.id,
      status: voiceCalls.status,
      startedAt: voiceCalls.startedAt,
      answeredAt: voiceCalls.answeredAt,
      updatedAt: voiceCalls.updatedAt,
      lineType: voiceCalls.lineType,
      providerStatus: voiceCalls.providerStatus,
      providerDurationSeconds: voiceCalls.providerDurationSeconds,
      heldReport: voiceCalls.heldReport,
    })
    .from(voiceCalls)
    .where(inArray(voiceCalls.status, ["dialing", "in_progress"]));
  let reaped = 0;
  for (const call of stale) {
    const waited = now.getTime() - call.updatedAt.getTime();
    // The worker reported but Twilio never said the call ended: finish it from the worker's report,
    // still never charging more than the call can have lasted.
    if (call.heldReport && waited >= HELD_REPORT_LIMIT_MS) {
      await finalizeCall(finalizeInputFromReport(call.heldReport as CompletedReport, { providerDurationSeconds: call.providerDurationSeconds, now }));
      reaped += 1;
      continue;
    }
    // Twilio said the call ended but the worker never reported: nothing can be charged.
    if (call.lineType === "twilio" && call.providerStatus === "completed" && !call.heldReport && waited >= HELD_REPORT_LIMIT_MS) {
      await finalizeCall({ callId: call.id, outcome: "failed", error: "No report was received from the call, so it was ended and not charged.", endedAt: call.answeredAt ?? now, providerDurationSeconds: call.providerDurationSeconds, now });
      reaped += 1;
      continue;
    }
    const cutoff = call.status === "dialing" ? dialingCutoff : liveCutoff;
    if (call.startedAt.getTime() > cutoff.getTime()) continue;
    // End time equals answer time, so the unknown stretch is not charged to the customer.
    await finalizeCall({ callId: call.id, outcome: "failed", error: "No report was received from the call, so it was ended and not charged.", endedAt: call.answeredAt ?? now, now });
    reaped += 1;
  }
  return { reaped };
}
