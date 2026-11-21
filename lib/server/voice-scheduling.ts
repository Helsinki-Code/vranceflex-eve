import type { CallOutcome } from "../domain/voice";
import { DEFAULT_SEND_WINDOW, sendWindowProblem, type SendWindow } from "./send-window";
import { addLocalDays, localDateTimeAt, zonedDateTimeToUtc } from "./timezone";
import { isoWeekday } from "./send-window";

/**
 * Who to call first, and when to try again.
 *
 * Calls only ever go out inside a calling window in the RECIPIENT's local
 * time. The window can be narrower than the legal limit but never wider:
 * nothing before 08:00 or at/after 21:00 their time.
 */
export type CallingWindow = SendWindow;

export const DEFAULT_CALLING_WINDOW: CallingWindow = { ...DEFAULT_SEND_WINDOW, start: "09:00", end: "17:00" };

export const LEGAL_EARLIEST_START = "08:00";
export const LEGAL_LATEST_END = "21:00";

export function callingWindowProblem(window: CallingWindow): string | null {
  const base = sendWindowProblem(window);
  if (base) return base;
  if (window.start < LEGAL_EARLIEST_START || window.end > LEGAL_LATEST_END) {
    return `Calls can only be made between ${LEGAL_EARLIEST_START} and ${LEGAL_LATEST_END} in the recipient's local time.`;
  }
  return null;
}

// ---- Who first ------------------------------------------------------------------

export type PriorityInput = {
  /** The lead's fit score, 0-100. */
  leadConfidence: number;
  /** How the lead responded to email, when they did. */
  emailReplyIntent?: "OFFER_ACCEPTED" | "HOT" | "WARM" | "NEUTRAL" | "OBJECTION" | string | null;
  /** Calls already made to this lead in this campaign. */
  attempts: number;
};

const REPLY_BONUS: Record<string, number> = { OFFER_ACCEPTED: 40, HOT: 35, WARM: 20, NEUTRAL: 5, OBJECTION: 5 };
const ATTEMPT_PENALTY = 10;

/**
 * Higher is called sooner. A warm email reply beats raw fit, a fresh lead beats
 * one that has already been tried, and nobody ever scores below zero.
 */
export function priorityScore(input: PriorityInput) {
  const fit = Math.max(0, Math.min(100, input.leadConfidence)) / 2;
  const reply = input.emailReplyIntent ? (REPLY_BONUS[input.emailReplyIntent] ?? 0) : 0;
  return Math.max(0, Math.round(fit + reply - input.attempts * ATTEMPT_PENALTY));
}

// ---- When to retry --------------------------------------------------------------

/** Outcomes where trying again later makes sense. */
const RETRYABLE: ReadonlySet<CallOutcome> = new Set(["no_answer", "voicemail", "failed"]);

export function shouldRetry(outcome: CallOutcome, attemptsMade: number, maxAttempts: number) {
  return RETRYABLE.has(outcome) && attemptsMade < maxAttempts;
}

const MORNING = "10:00";
const AFTERNOON = "14:00";

function clockMinutes(clock: string) {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours! * 60 + minutes!;
}
function clockString(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The target time of day, kept at least half an hour inside the window. */
function targetTime(preferred: string, window: CallingWindow) {
  const lo = clockMinutes(window.start);
  const hi = Math.max(lo, clockMinutes(window.end) - 30);
  return clockString(Math.min(hi, Math.max(lo, clockMinutes(preferred))));
}

/**
 * When to try again after an unanswered call: at least `gapHours` later, on an
 * allowed day, alternating between morning and afternoon so the second attempt
 * isn't at the same hour that already failed.
 *
 * `attemptsMade` is how many calls have been tried so far (1 after the first).
 */
export function nextAttemptTime(input: { now: Date; attemptsMade: number; gapHours: number; timezone: string; window: CallingWindow }) {
  const earliest = new Date(input.now.getTime() + input.gapHours * 3_600_000);
  const time = targetTime(input.attemptsMade % 2 === 1 ? AFTERNOON : MORNING, input.window);
  const startDate = localDateTimeAt(earliest, input.timezone).date;
  for (let offset = 0; offset <= 14; offset += 1) {
    const date = addLocalDays(startDate, offset);
    if (!input.window.days.includes(isoWeekday(date))) continue;
    const candidate = zonedDateTimeToUtc(date, time, input.timezone);
    if (candidate.getTime() >= earliest.getTime()) return candidate;
  }
  return new Date(earliest.getTime() + 86_400_000);
}

/** A callback someone asked for: honoured if it falls in the window, else the next opening. */
export function callbackTime(input: { requested: Date; now: Date; timezone: string; window: CallingWindow }) {
  const at = input.requested.getTime() < input.now.getTime() ? input.now : input.requested;
  const local = localDateTimeAt(at, input.timezone);
  const minutes = clockMinutes(local.time);
  const inside =
    input.window.days.includes(isoWeekday(local.date)) &&
    minutes >= clockMinutes(input.window.start) &&
    minutes < clockMinutes(input.window.end);
  if (inside) return at;
  for (let offset = 0; offset <= 14; offset += 1) {
    const date = addLocalDays(local.date, offset);
    if (!input.window.days.includes(isoWeekday(date))) continue;
    const opening = zonedDateTimeToUtc(date, input.window.start, input.timezone);
    if (opening.getTime() >= at.getTime()) return opening;
  }
  return new Date(at.getTime() + 86_400_000);
}
