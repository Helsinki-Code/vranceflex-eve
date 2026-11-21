/**
 * Recognising automatic replies (out-of-office, vacation responders, ticket
 * acknowledgements) and reading when the person is back.
 *
 * Headers are far more reliable than guessing from wording: an auto-responder's
 * footer often says "to unsubscribe click here", which must never be read as
 * the recipient opting out.
 */

type HeaderBag = { get(name: string): unknown } | null | undefined;

const headerText = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

/**
 * True when the message's headers say a machine wrote it (RFC 3834 and the
 * common vendor headers).
 */
export function isAutomatedReply(headers: HeaderBag) {
  if (!headers) return false;

  // RFC 3834: anything other than "no" means automatically generated.
  const autoSubmitted = headerText(headers.get("auto-submitted"));
  if (autoSubmitted && autoSubmitted !== "no") return true;

  // Vendor headers: their presence alone marks an auto-response.
  if (headers.get("x-autoreply") !== undefined || headers.get("x-autorespond") !== undefined) return true;

  const precedence = headerText(headers.get("precedence"));
  return ["auto_reply", "auto-reply", "bulk", "junk"].includes(precedence);
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};
const WEEKDAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY = "(monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const RETURN_WORDS = /\b(?:until|till|through|returning|returns?|back|resum(?:e|es|ing)|out)\b/g;

const DAY_MS = 86_400_000;
const MAX_AHEAD_DAYS = 120;

const utcMidnight = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));

function validDate(date: Date, year: number, month: number, day: number) {
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day;
}

/** Reads one date out of a short phrase that follows a "back/until/returning" word. */
function dateInPhrase(phrase: string, receivedAt: Date): Date | null {
  const received = utcMidnight(receivedAt.getUTCFullYear(), receivedAt.getUTCMonth(), receivedAt.getUTCDate());

  const iso = phrase.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = utcMidnight(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return validDate(date, Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) ? date : null;
  }

  const monthFirst = phrase.match(new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`));
  const dayFirst = phrase.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\.?(?:,?\\s+(20\\d{2}))?\\b`));
  const named = monthFirst
    ? { month: MONTHS[monthFirst[1]], day: Number(monthFirst[2]), year: monthFirst[3] ? Number(monthFirst[3]) : null }
    : dayFirst
      ? { month: MONTHS[dayFirst[2]], day: Number(dayFirst[1]), year: dayFirst[3] ? Number(dayFirst[3]) : null }
      : null;
  if (named && named.month !== undefined) {
    let year = named.year ?? received.getUTCFullYear();
    let date = utcMidnight(year, named.month, named.day);
    // "back on March 3" in December means next March.
    if (!named.year && date.getTime() < received.getTime() - DAY_MS) {
      year += 1;
      date = utcMidnight(year, named.month, named.day);
    }
    return validDate(date, year, named.month, named.day) ? date : null;
  }

  const weekday = phrase.match(new RegExp(`\\b(?:on\\s+)?(?:next\\s+)?${WEEKDAY}\\b`));
  if (weekday) {
    const target = WEEKDAYS[weekday[1]];
    const ahead = (target - received.getUTCDay() + 7) % 7 || 7;
    return new Date(received.getTime() + ahead * DAY_MS);
  }

  if (/\bnext week\b/.test(phrase)) {
    const ahead = (1 - received.getUTCDay() + 7) % 7 || 7;
    return new Date(received.getTime() + ahead * DAY_MS);
  }
  return null;
}

/**
 * When an out-of-office says the person is back. Only dates that follow a
 * "back / until / returning" style word are considered, so a quoted
 * "On Mon, Jan 15, 2030 at 10:00, Sam wrote:" is never mistaken for one.
 * Returns the return day (midnight UTC), or null when none can be read or it
 * is in the past or more than four months away.
 */
export function parseReturnDate(text: string, receivedAt: Date): Date | null {
  const lowered = text.toLowerCase().replace(/\s+/g, " ");
  const floor = receivedAt.getTime() - DAY_MS;
  const ceiling = receivedAt.getTime() + MAX_AHEAD_DAYS * DAY_MS;
  for (const match of lowered.matchAll(RETURN_WORDS)) {
    const phrase = lowered.slice(match.index, (match.index ?? 0) + 70);
    const date = dateInPhrase(phrase, receivedAt);
    if (date && date.getTime() >= floor && date.getTime() <= ceiling) return date;
  }
  return null;
}

/** How long to wait when an auto-reply gives no usable date. */
export const DEFAULT_AUTO_REPLY_DELAY_MS = 7 * DAY_MS;

/**
 * The moment follow-ups should resume: the day after the person is back (so
 * they can clear their inbox first), or a week from the reply when no date is
 * given. `dated` says which.
 */
export function followUpResumeTime(text: string, receivedAt: Date) {
  const back = parseReturnDate(text, receivedAt);
  if (back) return { resumeAt: new Date(back.getTime() + DAY_MS), returnDate: back, dated: true as const };
  return { resumeAt: new Date(receivedAt.getTime() + DEFAULT_AUTO_REPLY_DELAY_MS), returnDate: null, dated: false as const };
}
