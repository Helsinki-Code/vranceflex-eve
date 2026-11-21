import { and, eq } from "drizzle-orm";
import { getDatabase } from "./database";
import { voiceCalls } from "./database/schema";
import type { CallJobMetadata, VoiceConnector } from "./voice-dialer";
import { finalizeCall, finalizeInputFromReport, type FinalizeInput, type WorkerReport } from "./voice-reports";
import { HANGUP_TWIML, isMachineAnswer, streamTwiml, TWILIO_FINAL_STATUSES, unansweredOutcome } from "./voice-twilio";

/**
 * What happens on a Twilio call after it is placed.
 *
 *  1. Twilio places the call and listens for a human or a machine.
 *  2. When someone picks up, Twilio asks us what to do (the answer webhook, below). A voicemail
 *     is hung up on here, with no LiveKit room, agent or model ever used. A person is bridged
 *     into LiveKit, where the voice agent is waiting.
 *  3. Twilio reports the call's progress and its final duration (the status callback, below).
 *
 * A call is charged once both the worker's report and Twilio's "completed" have arrived, and
 * never for more than either says the call lasted.
 */

type CompletedReport = Extract<WorkerReport, { event: "completed" }>;

export async function loadTwilioCall(callId: string) {
  const [call] = await getDatabase().select().from(voiceCalls).where(eq(voiceCalls.id, callId)).limit(1);
  return call && call.lineType === "twilio" ? call : null;
}

// ---- Someone picked up -----------------------------------------------------------------------

export async function handleTwilioAnswer(input: {
  callId: string;
  callSid: string | null;
  answeredBy: string | null;
  connector: VoiceConnector;
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  const database = getDatabase();
  const call = await loadTwilioCall(input.callId);
  // Anything but a call we're still waiting on (already ended, reaped, unknown): hang up.
  if (!call || call.status !== "dialing") return HANGUP_TWIML;

  await database
    .update(voiceCalls)
    .set({ answeredBy: input.answeredBy, ...(input.callSid && !call.providerCallSid ? { providerCallSid: input.callSid } : {}), updatedAt: now })
    .where(eq(voiceCalls.id, call.id));

  // A voicemail greeting or a fax: hang up. Nothing was used on our side, so nothing is charged.
  if (isMachineAnswer(input.answeredBy)) {
    await finalizeCall({ callId: call.id, outcome: "voicemail", summary: "Reached voicemail, so the call was ended.", now });
    return HANGUP_TWIML;
  }

  const metadata = call.jobMetadata as CallJobMetadata | null;
  if (!metadata) {
    await finalizeCall({ callId: call.id, outcome: "failed", error: "The call's script was missing when it was answered.", now });
    return HANGUP_TWIML;
  }
  try {
    const { room, connectUrl } = await input.connector.connectTwilioCall({ callId: call.id, metadata });
    await database
      .update(voiceCalls)
      .set({ status: "in_progress", room, updatedAt: new Date() })
      .where(and(eq(voiceCalls.id, call.id), eq(voiceCalls.status, "dialing")));
    return streamTwiml(connectUrl);
  } catch (error) {
    await finalizeCall({ callId: call.id, outcome: "failed", error: `The call couldn't be connected: ${error instanceof Error ? error.message : "unknown error"}`.slice(0, 300), now });
    return HANGUP_TWIML;
  }
}

// ---- Twilio says how the call is going ---------------------------------------------------------

export type TwilioStatusInput = {
  callId: string;
  callSid: string | null;
  callStatus: string;
  callDuration: number | null;
  answeredBy: string | null;
  now?: Date;
};

export async function handleTwilioStatus(input: TwilioStatusInput) {
  const now = input.now ?? new Date();
  const database = getDatabase();
  const call = await loadTwilioCall(input.callId);
  if (!call) return { found: false as const };

  const final = TWILIO_FINAL_STATUSES.has(input.callStatus);
  // Remember what Twilio said. Never move a call backwards: once it has a final status it keeps it.
  if (!TWILIO_FINAL_STATUSES.has(call.providerStatus ?? "")) {
    await database
      .update(voiceCalls)
      .set({
        providerStatus: input.callStatus,
        ...(input.callSid && !call.providerCallSid ? { providerCallSid: input.callSid } : {}),
        ...(input.answeredBy ? { answeredBy: input.answeredBy } : {}),
        ...(final && input.callDuration != null ? { providerDurationSeconds: Math.max(0, Math.round(input.callDuration)) } : {}),
        updatedAt: now,
      })
      .where(eq(voiceCalls.id, call.id));
  }
  if (!final) return { found: true as const, final: false as const };
  if (call.status === "completed" || call.status === "failed") return { found: true as const, final: true as const, alreadyFinished: true as const };

  const answeredBy = input.answeredBy ?? call.answeredBy;
  const providerDurationSeconds = input.callDuration != null ? Math.max(0, Math.round(input.callDuration)) : call.providerDurationSeconds;

  // Nobody picked up, it was busy, it failed, or it was a machine: no conversation took place.
  if (input.callStatus !== "completed" || isMachineAnswer(answeredBy)) {
    const outcome = unansweredOutcome(input.callStatus, answeredBy);
    const result = await finalizeCall({
      callId: call.id,
      outcome,
      summary: outcome === "voicemail" ? "Reached voicemail, so the call was ended." : undefined,
      error: outcome === "failed" ? `Twilio reported the call as ${input.callStatus}.` : null,
      now,
    });
    return { found: true as const, final: true as const, finalized: true as const, result };
  }

  // The call ended normally but we never bridged it (our answer webhook wasn't reached).
  if (call.status === "dialing") {
    const result = await finalizeCall({ callId: call.id, outcome: "failed", error: "Twilio answered the call but our answer webhook wasn't reached.", now });
    return { found: true as const, final: true as const, finalized: true as const, result };
  }

  // A conversation took place. If the worker has already reported, finish the call now.
  if (call.heldReport) {
    const result = await finalizeCall(finalizeInputFromReport(call.heldReport as CompletedReport, { providerDurationSeconds, now }) satisfies FinalizeInput);
    return { found: true as const, final: true as const, finalized: true as const, result };
  }
  // Otherwise wait for the worker's report; applyWorkerReport finishes the call when it arrives,
  // and the reaper does if it never does.
  return { found: true as const, final: true as const, finalized: false as const, waitingForWorker: true as const };
}

