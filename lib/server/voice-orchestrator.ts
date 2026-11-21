import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { buildVoiceInstructions, openingDisclosure, playbookSchema } from "../domain/voice";
import { getDatabase } from "./database";
import { campaigns, leads, voiceCallTargets, voiceCalls, voiceCampaigns } from "./database/schema";
import { organizationTimezone } from "./mailbox-store";
import { isInsideSendWindow, nextWindowOpening } from "./send-window";
import { assertValidTimezone, localDayBounds } from "./timezone";
import { hasCallConsent, isNumberBlocked, toE164 } from "./voice-consent";
import { getVoiceAddon, maxSecondsForNextCall } from "./voice-credits";
import type { CallJobMetadata, VoiceDialer } from "./voice-dialer";
import { finalizeCall, reapStaleCalls } from "./voice-reports";
import { getPhoneLine, getVoiceSettings, pauseVoiceForRejectedKey, type PhoneLine } from "./voice-settings";
import { classifyTwilioError, createTwilioCaller, twilioCallbackUrls, type TwilioCaller } from "./voice-twilio";

/**
 * Decides, every minute, which calls to place right now. A call is placed only
 * when every check passes at that moment: the lead hasn't opted out, there's a
 * current consent record, the number isn't on the do-not-call list, it's inside
 * the person's calling hours in THEIR time zone, the workspace has minutes, a
 * free line, and room under its daily limit. Anything not ready is rescheduled
 * or dropped with a reason, never dialed.
 */

const RING_SECONDS = 30;
const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof"]);
const JITTER_MS = 10 * 60_000;

export function firstNameOf(personName: string) {
  const parts = personName.replace(/[,.]/g, " ").split(/\s+/).filter(Boolean).filter((part) => !TITLES.has(part.toLowerCase()));
  return parts[0] ?? null;
}

function validZone(zone: string | null | undefined, fallback: string) {
  if (!zone) return fallback;
  try {
    assertValidTimezone(zone);
    return zone;
  } catch {
    return fallback;
  }
}

function localTimeText(now: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", hour: "numeric", minute: "2-digit" }).format(now);
}

export type QueueSummary = {
  dialed: number;
  unanswered: number;
  failed: number;
  rescheduled: number;
  skipped: number;
  pausedCampaigns: number;
  reaped: number;
};

export type OrchestratorDeps = {
  dialer: VoiceDialer;
  /** Where the worker posts results, like "https://app.example.com/api/voice/worker/report". */
  reportUrl: string;
  now?: Date;
  random?: () => number;
  /** Calls allowed at once across every workspace (the LiveKit plan's agent-session limit). */
  platformMaxConcurrentCalls?: number;
  /** Places calls on a customer's Twilio account. */
  twilioCaller?: TwilioCaller;
};

/** The default sits just under LiveKit's Ship plan limit of 20 agent sessions. */
export const DEFAULT_PLATFORM_MAX_CONCURRENT_CALLS = 18;

export function platformMaxConcurrentCalls(env: Record<string, string | undefined> = process.env) {
  const value = Number(env.VOICE_PLATFORM_MAX_CONCURRENT_CALLS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_PLATFORM_MAX_CONCURRENT_CALLS;
}

export async function processVoiceQueue(deps: OrchestratorDeps): Promise<QueueSummary> {
  const now = deps.now ?? new Date();
  const random = deps.random ?? Math.random;
  const database = getDatabase();
  const summary: QueueSummary = { dialed: 0, unanswered: 0, failed: 0, rescheduled: 0, skipped: 0, pausedCampaigns: 0, reaped: 0 };

  summary.reaped = (await reapStaleCalls(now)).reaped;

  const running = await database.select().from(voiceCampaigns).where(eq(voiceCampaigns.status, "running"));
  const organizationIds = [...new Set(running.map((campaign) => campaign.organizationId))];

  // LiveKit limits agent sessions per project, so all workspaces share one ceiling. When it's
  // reached nothing is failed or skipped: the calls simply wait for the next minute.
  const [platformActive] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(voiceCalls)
    .where(inArray(voiceCalls.status, ["dialing", "in_progress"]));
  let platformRemaining = (deps.platformMaxConcurrentCalls ?? platformMaxConcurrentCalls()) - Number(platformActive?.count ?? 0);

  for (const organizationId of organizationIds) {
    if (platformRemaining <= 0) break;
    const settings = await getVoiceSettings(organizationId);
    if (settings.voicePaused || !settings.telephonyConnected) continue;
    const line = await getPhoneLine(organizationId);
    if (!line) continue;

    const workspaceZone = await organizationTimezone(organizationId);
    const [active] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(voiceCalls)
      .where(and(eq(voiceCalls.organizationId, organizationId), inArray(voiceCalls.status, ["dialing", "in_progress"])));
    const { start } = localDayBounds(now, workspaceZone);
    const [today] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(voiceCalls)
      .where(and(eq(voiceCalls.organizationId, organizationId), gte(voiceCalls.startedAt, start)));
    const capacity = Math.min(settings.maxConcurrentCalls - Number(active?.count ?? 0), settings.dailyCallLimit - Number(today?.count ?? 0), platformRemaining);
    if (capacity <= 0) continue;

    // The paid add-on lapsed (cancelled or unpaid): calls can't run, whatever minutes remain.
    if (!(await getVoiceAddon(organizationId))?.active) {
      const ids = running.filter((campaign) => campaign.organizationId === organizationId).map((campaign) => campaign.id);
      await database
        .update(voiceCampaigns)
        .set({ status: "paused", pausedReason: "The voice calling add-on isn't active. Add it again to continue.", updatedAt: now })
        .where(inArray(voiceCampaigns.id, ids));
      summary.pausedCampaigns += ids.length;
      continue;
    }

    // Out of minutes: stop the workspace's campaigns rather than dialing calls that can't be paid for.
    const maxSeconds = await maxSecondsForNextCall(organizationId, now);
    if (maxSeconds === 0) {
      const ids = running.filter((campaign) => campaign.organizationId === organizationId).map((campaign) => campaign.id);
      await database
        .update(voiceCampaigns)
        .set({ status: "paused", pausedReason: "You've used all your voice minutes. Add a minutes pack to continue.", updatedAt: now })
        .where(inArray(voiceCampaigns.id, ids));
      summary.pausedCampaigns += ids.length;
      continue;
    }

    const campaignIds = running.filter((campaign) => campaign.organizationId === organizationId).map((campaign) => campaign.id);
    const due = await database
      .select({
        target: voiceCallTargets,
        lead: leads,
        voiceCampaign: voiceCampaigns,
        campaign: campaigns,
      })
      .from(voiceCallTargets)
      .innerJoin(leads, eq(leads.id, voiceCallTargets.leadId))
      .innerJoin(voiceCampaigns, eq(voiceCampaigns.id, voiceCallTargets.voiceCampaignId))
      .innerJoin(campaigns, eq(campaigns.id, voiceCampaigns.campaignId))
      .where(and(inArray(voiceCallTargets.voiceCampaignId, campaignIds), eq(voiceCallTargets.status, "queued"), lte(voiceCallTargets.nextAttemptAt, now)))
      .orderBy(desc(voiceCallTargets.priority), asc(voiceCallTargets.nextAttemptAt))
      .limit(capacity * 4);

    const placements: Array<Promise<"dialed" | "unanswered" | "failed">> = [];
    let slots = capacity;
    for (const { target, lead, voiceCampaign, campaign } of due) {
      if (slots <= 0) break;
      const skip = async (reason: string) => {
        await database.update(voiceCallTargets).set({ status: "skipped", skipReason: reason, updatedAt: now }).where(eq(voiceCallTargets.id, target.id));
        summary.skipped += 1;
      };

      // Every rule, checked at the moment of dialing.
      if (lead.doNotContact || lead.status === "suppressed") { await skip("Asked not to be contacted."); continue; }
      const phone = toE164(target.phone);
      if (!phone) { await skip("No valid phone number."); continue; }
      if (await isNumberBlocked(organizationId, phone)) { await skip("This number asked not to be called."); continue; }
      if (!(await hasCallConsent(organizationId, lead.id, phone))) { await skip("No current call consent."); continue; }

      const zone = validZone(lead.timezone, workspaceZone);
      if (!isInsideSendWindow(now, zone, settings.window)) {
        const opening = nextWindowOpening(now, zone, settings.window);
        await database
          .update(voiceCallTargets)
          .set({ nextAttemptAt: new Date(opening.getTime() + Math.floor(random() * JITTER_MS)), updatedAt: now })
          .where(eq(voiceCallTargets.id, target.id));
        summary.rescheduled += 1;
        continue;
      }

      // Claim it atomically so two ticks can never dial the same person.
      const [claimed] = await database
        .update(voiceCallTargets)
        .set({ status: "in_progress", attempts: target.attempts + 1, updatedAt: now })
        .where(and(eq(voiceCallTargets.id, target.id), eq(voiceCallTargets.status, "queued")))
        .returning({ id: voiceCallTargets.id });
      if (!claimed) continue;

      slots -= 1;
      placements.push(
        placeCall({
          deps, now, organizationId, line, maxSeconds, phone, zone, target, lead, voiceCampaign, campaign,
        }),
      );
    }

    platformRemaining -= placements.length;
    for (const result of await Promise.all(placements)) summary[result] += 1;
  }
  return summary;
}

async function placeCall(input: {
  deps: OrchestratorDeps;
  now: Date;
  organizationId: string;
  line: PhoneLine;
  maxSeconds: number;
  phone: string;
  zone: string;
  target: typeof voiceCallTargets.$inferSelect;
  lead: typeof leads.$inferSelect;
  voiceCampaign: typeof voiceCampaigns.$inferSelect;
  campaign: typeof campaigns.$inferSelect;
}): Promise<"dialed" | "unanswered" | "failed"> {
  const { deps, now, lead, voiceCampaign, campaign } = input;
  const database = getDatabase();
  const callId = crypto.randomUUID();
  await database.insert(voiceCalls).values({
    id: callId,
    organizationId: input.organizationId,
    voiceCampaignId: voiceCampaign.id,
    targetId: input.target.id,
    leadId: lead.id,
    phone: input.phone,
    level: voiceCampaign.level,
    status: "dialing",
    lineType: input.line.type,
    startedAt: now,
  });

  try {
    const playbook = playbookSchema.parse(voiceCampaign.playbook);
    const metadata: CallJobMetadata = {
      callId,
      level: voiceCampaign.level,
      instructions: buildVoiceInstructions({
        level: voiceCampaign.level,
        playbook,
        businessName: campaign.businessName,
        productName: campaign.productName,
        lead: { firstName: firstNameOf(lead.personName), personName: lead.personName, jobTitle: lead.jobTitle, companyName: lead.companyName },
        localTime: localTimeText(now, input.zone),
      }),
      openingLine: openingDisclosure({ firstName: firstNameOf(lead.personName), agentName: playbook.agentName, businessName: campaign.businessName }),
      maxSeconds: input.maxSeconds,
      reportUrl: deps.reportUrl,
    };
    if (input.line.type === "twilio") return await placeTwilioCall({ ...input, callId, metadata });

    const sip = input.line.sip;
    const result = await deps.dialer.dial({
      callId,
      to: input.phone,
      sip: { address: sip.address, username: sip.username, password: sip.password, callerNumber: sip.callerNumber },
      trunkId: sip.trunkId,
      metadata,
      ringSeconds: RING_SECONDS,
    });
    if (result.status === "answered") {
      // The answer time is NOT set here: `now` is when this tick started, before the phone rang,
      // so using it would bill the ringing. The worker reports the real answer time.
      await database
        .update(voiceCalls)
        .set({ status: "in_progress", room: result.room, updatedAt: new Date() })
        .where(eq(voiceCalls.id, callId));
      return "dialed";
    }
    await database.update(voiceCalls).set({ room: result.room }).where(eq(voiceCalls.id, callId));
    await finalizeCall({ callId, outcome: "no_answer", summary: result.reason.slice(0, 300), now });
    return "unanswered";
  } catch (error) {
    await finalizeCall({ callId, outcome: "failed", error: error instanceof Error ? error.message : "The call could not be placed.", now });
    return "failed";
  }
}

/**
 * A call on the customer's Twilio account. Twilio does the dialing and the voicemail detection,
 * so this returns as soon as Twilio accepts the call: whether it was answered, missed or reached
 * a machine arrives later through Twilio's callbacks. Nothing is created on LiveKit yet.
 */
async function placeTwilioCall(input: {
  deps: OrchestratorDeps;
  now: Date;
  organizationId: string;
  line: PhoneLine;
  maxSeconds: number;
  phone: string;
  target: typeof voiceCallTargets.$inferSelect;
  callId: string;
  metadata: CallJobMetadata;
}): Promise<"dialed" | "unanswered" | "failed"> {
  if (input.line.type !== "twilio") throw new Error("Not a Twilio line.");
  const { deps, now, callId } = input;
  const database = getDatabase();
  const caller = deps.twilioCaller ?? createTwilioCaller();
  const urls = twilioCallbackUrls({ baseUrl: new URL(deps.reportUrl).origin, callId });
  // What the agent needs when the call is answered is kept with the call, so the answer webhook
  // doesn't have to rebuild the script.
  await database.update(voiceCalls).set({ jobMetadata: input.metadata as unknown as Record<string, unknown> }).where(eq(voiceCalls.id, callId));
  try {
    const { callSid } = await caller.place(input.line.twilio, { to: input.phone, ...urls, ringSeconds: RING_SECONDS, maxSeconds: input.maxSeconds });
    await database.update(voiceCalls).set({ providerCallSid: callSid, updatedAt: new Date() }).where(eq(voiceCalls.id, callId));
    return "dialed";
  } catch (error) {
    const failure = classifyTwilioError(error);
    await finalizeCall({ callId, outcome: "failed", error: failure.message, now });
    if (failure.kind === "credentials") {
      // Nothing will connect until the key is fixed, so stop calling instead of failing every call.
      await pauseVoiceForRejectedKey(input.organizationId);
    } else if (failure.kind === "invalid_number" || failure.kind === "blocked_country") {
      // Retrying can't help; drop the person with the reason.
      await database.update(voiceCallTargets).set({ status: "skipped", skipReason: failure.message, updatedAt: new Date() }).where(eq(voiceCallTargets.id, input.target.id));
    }
    return "failed";
  }
}
