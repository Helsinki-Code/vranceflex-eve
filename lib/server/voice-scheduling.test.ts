import { describe, expect, it } from "vitest";
import { callbackTime, callingWindowProblem, DEFAULT_CALLING_WINDOW, nextAttemptTime, priorityScore, shouldRetry } from "./voice-scheduling";

const NY = "America/New_York";

describe("callingWindowProblem", () => {
  it("accepts the default and any window inside the legal hours", () => {
    expect(callingWindowProblem(DEFAULT_CALLING_WINDOW)).toBeNull();
    expect(callingWindowProblem({ days: [1, 2, 3], start: "08:00", end: "21:00" })).toBeNull();
  });

  it("refuses a window that starts before 08:00 or ends after 21:00", () => {
    expect(callingWindowProblem({ days: [1], start: "07:30", end: "12:00" })).toMatch(/between 08:00 and 21:00/);
    expect(callingWindowProblem({ days: [1], start: "09:00", end: "21:30" })).toMatch(/between 08:00 and 21:00/);
  });

  it("still applies the ordinary window rules", () => {
    expect(callingWindowProblem({ days: [], start: "09:00", end: "17:00" })).toMatch(/at least one day/);
    expect(callingWindowProblem({ days: [1], start: "12:00", end: "12:20" })).toMatch(/at least one hour/);
  });
});

describe("priorityScore", () => {
  it("ranks a warm email reply above a better-fitting cold lead", () => {
    const warm = priorityScore({ leadConfidence: 60, emailReplyIntent: "HOT", attempts: 0 });
    const cold = priorityScore({ leadConfidence: 95, emailReplyIntent: null, attempts: 0 });
    expect(warm).toBeGreaterThan(cold);
  });

  it("ranks replies in order of how warm they are", () => {
    const score = (intent: string | null) => priorityScore({ leadConfidence: 50, emailReplyIntent: intent, attempts: 0 });
    expect(score("OFFER_ACCEPTED")).toBeGreaterThan(score("HOT"));
    expect(score("HOT")).toBeGreaterThan(score("WARM"));
    expect(score("WARM")).toBeGreaterThan(score("NEUTRAL"));
    expect(score("NEUTRAL")).toBeGreaterThan(score(null));
    expect(score("UNSUBSCRIBE")).toBe(score(null));
  });

  it("puts leads already tried behind fresh ones, and never goes below zero", () => {
    expect(priorityScore({ leadConfidence: 80, attempts: 0 })).toBeGreaterThan(priorityScore({ leadConfidence: 80, attempts: 2 }));
    expect(priorityScore({ leadConfidence: 0, attempts: 5 })).toBe(0);
  });

  it("clamps a fit score outside 0-100", () => {
    expect(priorityScore({ leadConfidence: 500, attempts: 0 })).toBe(50);
    expect(priorityScore({ leadConfidence: -20, attempts: 0 })).toBe(0);
  });
});

describe("shouldRetry", () => {
  it("retries unanswered calls up to the limit", () => {
    expect(shouldRetry("no_answer", 1, 3)).toBe(true);
    expect(shouldRetry("voicemail", 2, 3)).toBe(true);
    expect(shouldRetry("failed", 1, 3)).toBe(true);
    expect(shouldRetry("no_answer", 3, 3)).toBe(false);
  });

  it("never retries a conversation that reached an outcome", () => {
    for (const outcome of ["meeting_requested", "not_interested", "do_not_call", "wrong_person", "needs_human", "qualified", "interested"] as const) {
      expect(shouldRetry(outcome, 1, 5)).toBe(false);
    }
  });
});

describe("nextAttemptTime", () => {
  // Tuesday 2030-01-15 15:00 UTC = 10:00 in New York.
  const now = new Date("2030-01-15T15:00:00Z");
  const base = { now, gapHours: 24, timezone: NY, window: DEFAULT_CALLING_WINDOW };

  it("tries the afternoon after a first attempt, at least a day later", () => {
    // Earliest is Wed 10:00 NY; afternoon target 14:00 NY = 19:00 UTC.
    expect(nextAttemptTime({ ...base, attemptsMade: 1 }).toISOString()).toBe("2030-01-16T19:00:00.000Z");
  });

  it("goes back to the morning after a second attempt", () => {
    // Earliest Wed 10:00; morning target 10:00 NY = 15:00 UTC, which is not before the earliest.
    expect(nextAttemptTime({ ...base, attemptsMade: 2 }).toISOString()).toBe("2030-01-16T15:00:00.000Z");
  });

  it("skips the weekend", () => {
    // Fri 2030-01-18 10:00 NY + 24h = Sat; next allowed day is Monday.
    const friday = new Date("2030-01-18T15:00:00Z");
    expect(nextAttemptTime({ ...base, now: friday, attemptsMade: 1 }).toISOString()).toBe("2030-01-21T19:00:00.000Z");
  });

  it("never lands outside the calling window, even for a narrow one", () => {
    const narrow = { days: [1, 2, 3, 4, 5], start: "09:00", end: "10:30" };
    const result = nextAttemptTime({ ...base, window: narrow, attemptsMade: 1 });
    const local = result.toLocaleString("en-US", { timeZone: NY, hour12: false, hour: "2-digit", minute: "2-digit" });
    expect(local <= "10:00" && local >= "09:00").toBe(true);
  });

  it("is always at least the gap away", () => {
    for (let attempts = 1; attempts <= 4; attempts += 1) {
      for (const gapHours of [1, 6, 24, 72]) {
        const next = nextAttemptTime({ ...base, attemptsMade: attempts, gapHours });
        expect(next.getTime()).toBeGreaterThanOrEqual(now.getTime() + gapHours * 3_600_000);
      }
    }
  });

  it("works in the recipient's zone", () => {
    // 14:00 in Tokyo is 05:00 UTC.
    const result = nextAttemptTime({ ...base, timezone: "Asia/Tokyo", attemptsMade: 1 });
    expect(result.toISOString().slice(11, 16)).toBe("05:00");
  });
});

describe("callbackTime", () => {
  const now = new Date("2030-01-15T15:00:00Z"); // Tue 10:00 NY
  const base = { now, timezone: NY, window: DEFAULT_CALLING_WINDOW };

  it("honours a request inside the window", () => {
    const requested = new Date("2030-01-16T18:30:00Z"); // Wed 13:30 NY
    expect(callbackTime({ ...base, requested }).toISOString()).toBe(requested.toISOString());
  });

  it("moves an after-hours request to the next opening", () => {
    const requested = new Date("2030-01-16T23:30:00Z"); // Wed 18:30 NY
    expect(callbackTime({ ...base, requested }).toISOString()).toBe("2030-01-17T14:00:00.000Z"); // Thu 09:00 NY
  });

  it("moves a weekend request to Monday morning", () => {
    const requested = new Date("2030-01-19T16:00:00Z"); // Saturday
    expect(callbackTime({ ...base, requested }).toISOString()).toBe("2030-01-21T14:00:00.000Z");
  });

  it("treats a time already past as now", () => {
    const requested = new Date("2030-01-10T10:00:00Z");
    expect(callbackTime({ ...base, requested }).toISOString()).toBe(now.toISOString());
  });
});
