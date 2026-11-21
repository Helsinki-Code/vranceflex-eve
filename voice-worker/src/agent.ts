import { fileURLToPath } from "node:url";
import { cli, defineAgent, llm, voice, WorkerOptions, type JobContext, type JobProcess } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { z } from "zod";
import { CallState, STOP_ACKNOWLEDGEMENT, WRAP_UP_PROMPT } from "./call-state.js";
import { sendReport } from "./report.js";

/**
 * One call. The app decides who to call and builds the script; this process
 * only holds the conversation. Everything about the call arrives in the job
 * metadata (set by the app when it dispatches the agent), and the result goes
 * back to the app as a signed report.
 *
 * Rules enforced here in code, not left to the model:
 *  - the AI disclosure is the first thing said, word for word, uninterruptible;
 *  - a request to stop ends the call at once;
 *  - the call is wrapped up before its time cap;
 *  - a report is always sent, however the call ends.
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

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const metadata = metadataSchema.parse(JSON.parse(ctx.job.metadata));
    const secret = requiredEnv("VOICE_WORKER_SECRET");
    const report = (payload: Record<string, unknown>) => sendReport({ url: metadata.reportUrl, secret, payload });

    await ctx.connect();
    // The app only dispatches once the call has been answered, so the person is already in the room.
    await ctx.waitForParticipant();
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

    const agent = new voice.Agent({
      instructions: metadata.instructions,
      tools: { record_outcome: recordOutcomeTool },
    });
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: new deepgram.STT(),
      llm: new openai.LLM({ model: process.env.VOICE_LLM_MODEL?.trim() || "gpt-4o-mini" }),
      tts: new openai.TTS({ voice: (process.env.VOICE_TTS_VOICE?.trim() || "alloy") as "alloy" }),
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

    await session.start({ agent, room: ctx.room });

    // The disclosure: fixed words, said first, never interrupted.
    await session.say(metadata.openingLine, { allowInterruptions: false });

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
