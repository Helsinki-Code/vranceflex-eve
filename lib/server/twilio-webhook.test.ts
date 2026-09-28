import { describe, expect, it } from "vitest";
import { isStopMessage, normalizePhone } from "./twilio-webhook";

describe("Twilio inbound helpers", () => {
  it("normalizes stored and inbound phone formats to one shape", () => {
    expect(normalizePhone("+31 20 555 0184")).toBe("+31205550184");
    expect(normalizePhone("0031 (20) 555-0184")).toBe("+31205550184");
    expect(normalizePhone("+31205550184")).toBe(normalizePhone("+31 20-555 0184"));
    expect(normalizePhone(null)).toBe("");
  });

  it("treats carrier opt-out keywords and OptOutType as STOP", () => {
    for (const body of ["STOP", "stop", " Unsubscribe ", "STOPALL", "Quit."]) expect(isStopMessage(body)).toBe(true);
    expect(isStopMessage("Please stop by our booth", null)).toBe(false);
    expect(isStopMessage("Sure, Thursday works", "STOP")).toBe(true);
  });
});
