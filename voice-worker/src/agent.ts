import { fileURLToPath } from "node:url";
import { cli, defineAgent, llm, voice, WorkerOptions, type JobContext, type JobProcess } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { ParticipantKind, type RemoteParticipant } from "@livekit/rtc-node";
import { z } from "zod";
import { GreetingGate, hasCallEnded, isCallAnswered, type ParticipantLine } from "./answer-gate.js";
import { CallState, STOP_ACKNOWLEDGEMENT, WRAP_UP_PROMPT } from "./call-state.js";
import { sendReport } from "./report.js";

/**
 * One call. The app decides who to call and builds the script; this process
 * only holds the conversation. Everything about the call arrives in the job
 * metadata (set by the app when it dispatches the agent), and the result goes
 * back to the app as a signed report.
 *
 * Rules enforced here in code, not left to the model:
 *  - nothing is said, and no time is counted, until the call is really answered;
 *  - the AI disclosure is the first thing said, word for word, uninterruptible,
 *    right after the person's own "Hello?";
 *  - a request to stop ends the call at once;
 *  - the call is wrapped up before its time cap;
 *  - a report is always sent, however the call ends.
 *
 * The app dispatches this worker BEFORE the phone rings (so the agent is ready
 * the moment someone picks up), which means the callee's participant can appear
 * while the phone is still ringing. "Answered" is therefore decided in
 * answer-gate.ts, never by the participant merely existing.
 */

const metadataSchema = z.object({
  callId: z.string().uuid(),
  level: z.enum(["meetings", "qualify", "sell"]),
  instructions: z.string().min(1),
  openingLine: z.string().min(1),
  maxSeconds: z.number().int().positive(),
  reportUrl: z.string().url(),
});

const WRAP_UP_BEFORE_END_SECONDS = 45;
/** How long the phone may ring (the app rings for 30s) before the worker gives up waiting. */
const RING_WAIT_MS = 100_000;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function lineOf(participant: RemoteParticipant): ParticipantLine {
  if (participant.kind === ParticipantKind.CONNECTOR) return "connector";
  if (participant.kind === ParticipantKind.SIP) return "sip";
  return "other";
}

/** Resolves true when the call is answered, false if it hangs up, the person leaves, or it rings too long. */
function waitUntilAnswered(ctx: JobContext, participant: RemoteParticipant, line: ParticipantLine, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const check = () => {
      if (hasCallEnded(participant.attributes)) return false;
      return isCallAnswered({ line, attributes: participant.attributes }) ? true : null;
    };
    const first = check();
    if (first !== null) return resolve(first);

    const finish = (answered: boolean) => {
      clearTimeout(timer);
      ctx.room.off("participantAttributesChanged", onAttributes);
      ctx.room.off("participantDisconnected", onLeft);
      resolve(answered);
    };
    const onAttributes = (_changed: Record<string, string>, who: { identity: string }) => {
      if (who.identity !== participant.identity) return;
      const result = check();
      if (result !== null) finish(result);
    };
    const onLeft = (who: { identity: string }) => {
      if (who.identity === participant.identity) finish(false);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    ctx.room.on("participantAttributesChanged", onAttributes);
    ctx.room.on("participantDisconnected", onLeft);
  });
}

/**
 * The model never replies before the disclosure has been said: until then, a
 * finished turn from the other person (their "Hello?") is heard but not answered.
 */
class CallAgent extends voice.Agent {
  disclosed = false;
  override async onUserTurnCompleted(): Promise<void> {
    if (!this.disclosed) throw new voice.StopResponse();
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const metadata = metadataSchema.parse(JSON.parse(ctx.job.metadata));
    const secret = requiredEnv("VOICE_WORKER_SECRET");
    const report = (payload: Record<string, unknown>) => sendReport({ url: metadata.reportUrl, secret, payload });

    await ctx.connect();
    // The agent is dispatched before the phone rings, so the callee can appear in the room while it
    // is still ringing. Nothing is said and nothing is counted until the call is really answered.
    const participant = await ctx.waitForParticipant();
    const line = lineOf(participant);
    const answered = await waitUntilAnswered(ctx, participant, line, RING_WAIT_MS);
    if (!answered) {
      // Never answered: report it with no answer time, so the app charges nothing.
      await report({ event: "completed", callId: metadata.callId, outcome: "no_answer", summary: "The call was not answered.", transcript: [], endedAt: new Date().toISOString() });
      ctx.shutdown("not answered");
      return;
    }
    const answeredAt = new Date();
    void report({ event: "answered", callId: metadata.callId, answeredAt: answeredAt.toISOString() });

    const state = new CallState(metadata.callId, metadata.level, answeredAt);
    let finished = false;

    const finish = async (error?: string) => {
      if (finished) return;
      finished = true;
      if (error) state.recordError(error);
      await report(state.buildReport());
      ctx.shutdown("call finished");
    };

    const recordOutcomeTool = llm.tool({
      description:
        "Record how the call ended. Call this exactly once, when the conversation is finished, then say a polite goodbye. " +
        `Allowed outcomes: ${state.allowedOutcomes.join(", ")}.`,
      parameters: z.object({
        outcome: z.string().describe("One of the allowed outcomes."),
        summary: z.string().describe("Two or three sentences: what happened and what was agreed."),
        follow_up: z.string().optional().describe("Anything a person needs to do next."),
        callback_at: z.string().optional().describe("ISO 8601 date-time for an agreed meeting or callback."),
      }),
      execute: async ({ outcome, summary, follow_up, callback_at }) => {
        state.recordOutcome({ outcome, summary, followUp: follow_up, callbackAt: callback_at });
        // Let the goodbye finish before the line is closed.
        setTimeout(() => void finish(), 6_000);
        return "Recorded. Say a brief goodbye now.";
      },
    });

    const agent = new CallAgent({
      instructions: metadata.instructions,
      tools: { record_outcome: recordOutcomeTool },
    });
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: new deepgram.STT(),
      llm: new openai.LLM({ model: process.env.VOICE_LLM_MODEL?.trim() || "gpt-4o-mini" }),
      tts: new openai.TTS({ voice: (process.env.VOICE_TTS_VOICE?.trim() || "alloy") as "alloy" }),
      // The model must not start a reply of its own before the disclosure has been said.
      preemptiveGeneration: false,
    });

    // Lets the person's first words ("Hello?") finish before the disclosure goes out.
    const gate = new GreetingGate(Date.now());
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
      if (event.newState === "speaking") gate.speechStarted(Date.now());
      else if (event.oldState === "speaking") gate.speechEnded(Date.now());
    });

    // What was said, for the transcript.
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      const item = event.item as { type?: string; role?: string; textContent?: string };
      if (item.type !== "message" || !item.textContent) return;
      if (item.role === "assistant") state.addAgentTurn(item.textContent);
    });
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      if (!event.isFinal) return;
      const stop = state.addProspectTurn(event.transcript);
      if (stop && !finished) {
        // A request to stop is handled here, in code: acknowledge, report, hang up.
        void (async () => {
          try {
            await session.say(STOP_ACKNOWLEDGEMENT, { allowInterruptions: false });
          } finally {
            await finish();
          }
        })();
      }
    });

    ctx.room.on("participantDisconnected", () => void finish());
    ctx.addShutdownCallback(async () => {
      await finish();
    });

    // Recording is off: the only record of the call is the transcript the app stores.
    await session.start({ agent, room: ctx.room, record: false });

    // The person speaks first ("Hello?"), then the disclosure: fixed words, never interrupted.
    while (!finished && !gate.ready(Date.now())) await sleep(100);
    if (finished) return;
    await session.say(metadata.openingLine, { allowInterruptions: false });
    agent.disclosed = true;

    // Wrap up before the hard cap so the call never ends mid-sentence.
    const wrapUpIn = Math.max(5, metadata.maxSeconds - WRAP_UP_BEFORE_END_SECONDS) * 1_000;
    setTimeout(() => {
      if (finished) return;
      session.generateReply({ instructions: WRAP_UP_PROMPT });
      setTimeout(() => void finish(), 40_000);
    }, wrapUpIn);
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.LIVEKIT_AGENT_NAME?.trim() || "vranceflex-caller",
  }),
);
