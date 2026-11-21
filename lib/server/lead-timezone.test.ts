import { describe, expect, it } from "vitest";
import { timezoneForLocation } from "./lead-timezone";
import { assertValidTimezone } from "./timezone";

describe("timezoneForLocation", () => {
  it.each([
    ["Austin, TX", "America/Chicago"],
    ["Denver, CO", "America/Denver"],
    ["San Francisco", "America/Los_Angeles"],
    ["New York, NY, USA", "America/New_York"],
    ["Texas", "America/Chicago"],
    ["Ontario, Canada", "America/Toronto"],
    ["Toronto", "America/Toronto"],
    ["London, UK", "Europe/London"],
    ["Germany", "Europe/Berlin"],
    ["Sydney, Australia", "Australia/Sydney"],
    ["Bengaluru, India", "Asia/Kolkata"],
    ["  berlin ", "Europe/Berlin"],
  ])("maps %j to %s", (location, expected) => {
    expect(timezoneForLocation(location)).toBe(expected);
  });

  it.each([
    ["United States"],
    ["USA"],
    ["Canada"],
    ["Australia"],
    ["Brazil"],
    ["Global"],
    ["Worldwide"],
    ["Europe"],
    ["North America"],
    [""],
    [null],
    [undefined],
    ["Somewhere unknown"],
  ])("returns null for the ambiguous or unknown %j", (location) => {
    expect(timezoneForLocation(location as string | null | undefined)).toBeNull();
  });

  it("does not read ordinary words as state codes", () => {
    expect(timezoneForLocation("in or around London")).toBeNull();
    expect(timezoneForLocation("OR")).toBeNull();
  });

  it("only ever returns zones the runtime accepts", () => {
    const samples = [
      "Austin, TX", "Alaska", "Hawaii", "Indiana", "Manitoba", "Nova Scotia", "Dublin", "Cape Town", "Hong Kong",
      "Saudi Arabia", "Chile", "Argentina", "Colombia", "Mexico City", "São Paulo", "Perth", "Auckland", "Qatar",
    ];
    for (const sample of samples) {
      const zone = timezoneForLocation(sample);
      expect(zone, sample).not.toBeNull();
      expect(() => assertValidTimezone(zone!), `${sample} -> ${zone}`).not.toThrow();
    }
  });
});
