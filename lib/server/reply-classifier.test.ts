import { describe, expect, it } from "vitest";
import { classifyReply } from "./reply-classifier";

describe("classifyReply", () => {
  const cases: Array<[string, string]> = [
    ["Please unsubscribe me from this list", "UNSUBSCRIBE"],
    ["Stop contacting me", "UNSUBSCRIBE"],
    ["I am currently out of the office, returning on Monday", "OUT_OF_OFFICE"],
    ["This is an automatic reply while I am away", "OUT_OF_OFFICE"],
    ["Sounds interesting, can we schedule a call?", "HOT"],
    ["This is too expensive for our current budget", "OBJECTION"],
    ["This is not a fit for us right now", "NOT_FIT"],
    ["Sounds good, tell me more", "WARM"],
    ["asdkjasd random text with no clear signal", "NEUTRAL"],
  ];

  it.each(cases)("classifies %j as %s", (text, expectedIntent) => {
    expect(classifyReply(text).intent).toBe(expectedIntent);
  });

  it("always marks UNSUBSCRIBE as not requiring human review", () => {
    const result = classifyReply("Please remove me from this list, unsubscribe");
    expect(result.intent).toBe("UNSUBSCRIBE");
    expect(result.flagForHuman).toBe(false);
  });

  it("flags HOT, OBJECTION, NOT_FIT and WARM replies for human review", () => {
    expect(classifyReply("let's talk this week").flagForHuman).toBe(true);
    expect(classifyReply("the price is a concern for us").flagForHuman).toBe(true);
    expect(classifyReply("wrong person, not responsible for this").flagForHuman).toBe(true);
    expect(classifyReply("curious, tell me more").flagForHuman).toBe(true);
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(classifyReply("   UNSUBSCRIBE   me   please   ").intent).toBe("UNSUBSCRIBE");
  });

  it("falls back to NEUTRAL with human review required for ambiguous text", () => {
    const result = classifyReply("ok");
    expect(result.intent).toBe("NEUTRAL");
    expect(result.flagForHuman).toBe(true);
  });
});
