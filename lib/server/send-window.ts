import { addLocalDays, localDateTimeAt, zonedDateTimeToUtc } from "./timezone";

/**
 * When a workspace allows outreach to go out, in the RECIPIENT's local time:
 * a 3 a.m. email marks the sender as automated, and weekend sends to business
 * addresses are opened least. Days are ISO weekdays (1 = Monday … 7 = Sunday).
 */
export type SendWindow = {
  days: number[];
  /** "HH:MM", 24-hour, inclusive. */
  start: string;
  /** "HH:MM", 24-hour, exclusive. */
  end: string;
};

export const DEFAULT_SEND_WINDOW: SendWindow = {
  days: [1, 2, 3, 4, 5],
  start: "08:00",
  end: "17:00",
};

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MIN_WINDOW_MINUTES = 60;

function clockMinutes(clock: string) {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a "YYYY-MM-DD" calendar date. */
export function isoWeekday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** A human-readable problem with the window, or null when it is valid. */
export function sendWindowProblem(window: SendWindow): string | null {
  if (!window.days.length) return "Choose at least one day to send on.";
  if (window.days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    return "Send days must be between Monday (1) and Sunday (7).";
  }
  if (new Set(window.days).size !== window.days.length) return "Send days must not repeat.";
  if (!CLOCK.test(window.start) || !CLOCK.test(window.end)) {
    return "Send hours must look like 08:00.";
  }
  if (clockMinutes(window.end) - clockMinutes(window.start) < MIN_WINDOW_MINUTES) {
    return "The sending window must be at least one hour long and end after it starts.";
  }
  return null;
}

export function isInsideSendWindow(now: Date, timezone: string, window: SendWindow) {
  const local = localDateTimeAt(now, timezone);
  if (!window.days.includes(isoWeekday(local.date))) return false;
  const minutes = clockMinutes(local.time);
  return minutes >= clockMinutes(window.start) && minutes < clockMinutes(window.end);
}

/**
 * The earliest moment at or after `now` when sending is allowed: `now` itself
 * when already inside the window, otherwise the next opening.
 */
export function nextWindowOpening(now: Date, timezone: string, window: SendWindow) {
  const today = localDateTimeAt(now, timezone).date;
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addLocalDays(today, offset);
    if (!window.days.includes(isoWeekday(date))) continue;
    const opening = zonedDateTimeToUtc(date, window.start, timezone);
    if (now.getTime() < opening.getTime()) return opening;
    const closing = zonedDateTimeToUtc(date, window.end, timezone);
    if (offset === 0 && now.getTime() < closing.getTime()) return now;
  }
  // Unreachable for a validated window; wait an hour rather than loop.
  return new Date(now.getTime() + 3_600_000);
}
