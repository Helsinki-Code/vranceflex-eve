import { describe, expect, it } from "vitest";
import { followUpResumeTime, isAutomatedReply, parseReturnDate } from "./auto-reply";

const headers = (entries: Record<string, unknown>) => new Map(Object.entries(entries));

describe("isAutomatedReply", () => {
  it.each([
    [{ "auto-submitted": "auto-replied" }],
    [{ "auto-submitted": "auto-generated" }],
    [{ "x-autoreply": "yes" }],
    [{ "x-autorespond": "" }],
    [{ precedence: "auto_reply" }],
    [{ precedence: "Bulk" }],
    [{ precedence: "junk" }],
  ])("recognises %j", (entries) => {
    expect(isAutomatedReply(headers(entries))).toBe(true);
  });

  it.each([
    [{}],
    [{ "auto-submitted": "no" }],
    [{ "auto-submitted": " No " }],
    [{ precedence: "first-class" }],
    [{ subject: "Re: hello" }],
  ])("leaves %j alone", (entries) => {
    expect(isAutomatedReply(headers(entries))).toBe(false);
  });

  it("copes with missing headers", () => {
    expect(isAutomatedReply(null)).toBe(false);
    expect(isAutomatedReply(undefined)).toBe(false);
  });
});

// Tuesday 2030-01-15
const received = new Date("2030-01-15T10:00:00Z");
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

describe("parseReturnDate", () => {
  it.each([
    ["I am out of the office until January 22nd.", "2030-01-22"],
    ["I will be back on 22 January.", "2030-01-22"],
    ["Returning Jan 22, 2030 with limited access.", "2030-01-22"],
    ["Out of office - back on Monday", "2030-01-21"],
    ["I'm away and will return on next Friday.", "2030-01-18"],
    ["Away until 2030-02-04, please contact my colleague.", "2030-02-04"],
    ["I am out of the office and will be back next week.", "2030-01-21"],
    ["On leave through March 3rd", "2030-03-03"],
    ["Back on the 3rd of March", "2030-03-03"],
    ["OUT OF OFFICE UNTIL FEBRUARY 5", "2030-02-05"],
  ])("reads %j", (text, expected) => {
    expect(iso(parseReturnDate(text, received))).toBe(expected);
  });

  it("treats a weekday as the next one, never today", () => {
    expect(iso(parseReturnDate("back on Tuesday", received))).toBe("2030-01-22");
  });

  it("rolls a month already passed into next year", () => {
    expect(iso(parseReturnDate("back on January 3", new Date("2030-12-20T10:00:00Z")))).toBe("2031-01-03");
  });

  it.each([
    ["On Mon, Jan 15, 2030 at 10:00 AM Sam wrote: hello"],
    ["Thanks for your email. I will reply soon."],
    ["Back soon!"],
    ["I am out of the office."],
    ["back on February 30"],
    ["until 2030-13-45"],
    ["back on 1 January"], // already in the past this year -> next year, but beyond four months
    ["away until December 1, 2031"],
    ["back on January 1, 2020"],
  ])("returns null for %j", (text) => {
    expect(parseReturnDate(text, received)).toBeNull();
  });

  it("ignores a date that only appears in quoted history", () => {
    const text = "I am out of the office, back soon.\n\nOn Mon, Jan 14, 2030 at 9:00 AM, Sam wrote:\n> see you March 3";
    expect(parseReturnDate(text, received)).toBeNull();
  });
});

describe("followUpResumeTime", () => {
  it("resumes the day after the stated return date", () => {
    const result = followUpResumeTime("back on Monday", received);
    expect(result.dated).toBe(true);
    expect(iso(result.returnDate)).toBe("2030-01-21");
    expect(result.resumeAt.toISOString()).toBe("2030-01-22T00:00:00.000Z");
  });

  it("falls back to a week when there is no date", () => {
    const result = followUpResumeTime("I am out of the office.", received);
    expect(result.dated).toBe(false);
    expect(result.returnDate).toBeNull();
    expect(result.resumeAt.toISOString()).toBe("2030-01-22T10:00:00.000Z");
  });
});
