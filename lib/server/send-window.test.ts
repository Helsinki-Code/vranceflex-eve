import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEND_WINDOW,
  isInsideSendWindow,
  isoWeekday,
  nextWindowOpening,
  sendWindowProblem,
} from "./send-window";

const NY = "America/New_York";

describe("isoWeekday", () => {
  it("maps dates to ISO weekdays", () => {
    expect(isoWeekday("2030-01-14")).toBe(1); // Monday
    expect(isoWeekday("2030-01-15")).toBe(2);
    expect(isoWeekday("2030-01-19")).toBe(6); // Saturday
    expect(isoWeekday("2030-01-20")).toBe(7); // Sunday
  });
});

describe("isInsideSendWindow", () => {
  it("is true on a weekday during office hours in the recipient's zone", () => {
    // 2030-01-15 15:00 UTC = 10:00 in New York (EST).
    expect(isInsideSendWindow(new Date("2030-01-15T15:00:00Z"), NY, DEFAULT_SEND_WINDOW)).toBe(true);
  });

  it("uses the recipient's local time, not UTC", () => {
    // 01:00 UTC is 10:00 on Tuesday in Tokyo but 20:00 on Monday in New York.
    const instant = new Date("2030-01-15T01:00:00Z");
    expect(isInsideSendWindow(instant, "Asia/Tokyo", DEFAULT_SEND_WINDOW)).toBe(true);
    expect(isInsideSendWindow(instant, NY, DEFAULT_SEND_WINDOW)).toBe(false);
  });

  it("is false before the window opens and from the minute it closes", () => {
    expect(isInsideSendWindow(new Date("2030-01-15T12:59:00Z"), NY, DEFAULT_SEND_WINDOW)).toBe(false); // 07:59
    expect(isInsideSendWindow(new Date("2030-01-15T13:00:00Z"), NY, DEFAULT_SEND_WINDOW)).toBe(true); // 08:00
    expect(isInsideSendWindow(new Date("2030-01-15T21:59:00Z"), NY, DEFAULT_SEND_WINDOW)).toBe(true); // 16:59
    expect(isInsideSendWindow(new Date("2030-01-15T22:00:00Z"), NY, DEFAULT_SEND_WINDOW)).toBe(false); // 17:00
  });

  it("is false on a day that is not allowed", () => {
    // Saturday 2030-01-19, 10:00 New York.
    expect(isInsideSendWindow(new Date("2030-01-19T15:00:00Z"), NY, DEFAULT_SEND_WINDOW)).toBe(false);
    expect(isInsideSendWindow(new Date("2030-01-19T15:00:00Z"), NY, { ...DEFAULT_SEND_WINDOW, days: [6] })).toBe(true);
  });
});

describe("nextWindowOpening", () => {
  it("returns now when already inside the window", () => {
    const now = new Date("2030-01-15T15:00:00Z");
    expect(nextWindowOpening(now, NY, DEFAULT_SEND_WINDOW).toISOString()).toBe(now.toISOString());
  });

  it("waits until today's opening when it is too early", () => {
    expect(nextWindowOpening(new Date("2030-01-15T09:00:00Z"), NY, DEFAULT_SEND_WINDOW).toISOString()).toBe(
      "2030-01-15T13:00:00.000Z", // 08:00 EST
    );
  });

  it("rolls to the next allowed day after closing", () => {
    // Tuesday 18:00 New York -> Wednesday 08:00.
    expect(nextWindowOpening(new Date("2030-01-15T23:00:00Z"), NY, DEFAULT_SEND_WINDOW).toISOString()).toBe(
      "2030-01-16T13:00:00.000Z",
    );
  });

  it("skips the weekend", () => {
    // Friday 2030-01-18 18:00 New York -> Monday 2030-01-21 08:00.
    expect(nextWindowOpening(new Date("2030-01-18T23:00:00Z"), NY, DEFAULT_SEND_WINDOW).toISOString()).toBe(
      "2030-01-21T13:00:00.000Z",
    );
  });

  it("handles a daylight saving change", () => {
    // Fri 2030-03-08 18:00 EST -> Mon 2030-03-11 08:00 EDT (UTC-4) = 12:00Z.
    expect(nextWindowOpening(new Date("2030-03-08T23:00:00Z"), NY, DEFAULT_SEND_WINDOW).toISOString()).toBe(
      "2030-03-11T12:00:00.000Z",
    );
  });
});

describe("sendWindowProblem", () => {
  it("accepts the default window", () => {
    expect(sendWindowProblem(DEFAULT_SEND_WINDOW)).toBeNull();
  });

  it.each([
    [{ ...DEFAULT_SEND_WINDOW, days: [] }, /at least one day/],
    [{ ...DEFAULT_SEND_WINDOW, days: [0, 1] }, /Monday \(1\) and Sunday \(7\)/],
    [{ ...DEFAULT_SEND_WINDOW, days: [1, 1] }, /not repeat/],
    [{ ...DEFAULT_SEND_WINDOW, start: "8am" }, /look like 08:00/],
    [{ ...DEFAULT_SEND_WINDOW, start: "17:00", end: "08:00" }, /at least one hour/],
    [{ ...DEFAULT_SEND_WINDOW, start: "09:00", end: "09:30" }, /at least one hour/],
  ])("rejects %j", (window, message) => {
    expect(sendWindowProblem(window)).toMatch(message);
  });
});
