import { allowedOutcome, callOutcomes, isStopRequest, outcomesForLevel, type CallOutcome, type VoiceLevel } from "../../lib/domain/voice";

/**
 * Everything the worker decides about a call that doesn't need a phone or a
 * model, so it can be tested on its own. The LiveKit wiring in agent.ts only
 * feeds this events and sends what it produces.
 */

export type Turn = { role: "agent" | "prospect"; text: string; at: string };

export type CallReport = {
  event: "completed";
  callId: string;
  outcome: CallOutcome;
  summary?: string;
  followUp?: string;
  callbackAt?: string;
  answeredAt: string;
  endedAt: string;
  transcript: Turn[];
  error?: string;
};

/** What the agent says when someone asks to stop. Fixed; never model-written. */
export const STOP_ACKNOWLEDGEMENT = "Of course, I'll remove your number right away. I'm sorry to have bothered you. Goodbye.";

/** Said when the time cap is close, so a call never ends mid-sentence. */
export const WRAP_UP_PROMPT = "We're almost out of time on this call. Wrap up politely in one or two sentences, record the outcome, and say goodbye.";

export class CallState {
  readonly turns: Turn[] = [];
  private outcome: CallOutcome | null = null;
  private summary: string | undefined;
  private followUp: string | undefined;
  private callbackAt: string | undefined;
  private stopHeard = false;
  private error: string | undefined;

  constructor(
    readonly callId: string,
    readonly level: VoiceLevel,
    readonly answeredAt: Date,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The outcomes this call's level may record, for the tool's schema. */
  get allowedOutcomes() {
    return outcomesForLevel[this.level];
  }

  addAgentTurn(text: string) {
    this.add("agent", text);
  }

  /**
   * A finished sentence from the other person. Returns true when it was a
   * request to stop, in which case the call must end now: this is decided here,
   * in code, never left to the model.
   */
  addProspectTurn(text: string) {
    this.add("prospect", text);
    if (isStopRequest(text)) {
      this.stopHeard = true;
      return true;
    }
    return false;
  }

  /** The model's `record_outcome`. A stop request already heard always wins. */
  recordOutcome(input: { outcome: string; summary?: string; followUp?: string; callbackAt?: string }) {
    const requested = (callOutcomes as readonly string[]).includes(input.outcome) ? (input.outcome as CallOutcome) : "needs_human";
    this.outcome = this.stopHeard ? "do_not_call" : allowedOutcome(this.level, requested);
    this.summary = input.summary?.slice(0, 2_000);
    this.followUp = input.followUp?.slice(0, 1_000);
    const when = input.callbackAt ? new Date(input.callbackAt) : null;
    this.callbackAt = when && !Number.isNaN(when.getTime()) ? when.toISOString() : undefined;
  }

  recordError(message: string) {
    this.error = message.slice(0, 500);
  }

  get hasOutcome() {
    return this.outcome !== null || this.stopHeard;
  }

  get heardStop() {
    return this.stopHeard;
  }

  /** The report to send when the call is over, whatever way it ended. */
  buildReport(): CallReport {
    const spoke = this.turns.some((turn) => turn.role === "prospect");
    let outcome = this.outcome;
    let summary = this.summary;
    if (this.stopHeard) {
      outcome = "do_not_call";
      summary ??= "They asked not to be called again.";
    } else if (!outcome) {
      // The call ended with no outcome recorded: a person should look, unless nobody ever spoke.
      outcome = spoke ? "needs_human" : "no_answer";
      summary ??= spoke ? "The call ended before an outcome was recorded." : "No one spoke on the call.";
    }
    return {
      event: "completed",
      callId: this.callId,
      outcome,
      summary,
      followUp: this.followUp,
      callbackAt: this.callbackAt,
      answeredAt: this.answeredAt.toISOString(),
      endedAt: this.clock().toISOString(),
      transcript: this.turns,
      ...(this.error ? { error: this.error } : {}),
    };
  }

  private add(role: Turn["role"], text: string) {
    const clean = text.trim();
    if (!clean) return;
    this.turns.push({ role, text: clean.slice(0, 2_000), at: this.clock().toISOString() });
  }
}
