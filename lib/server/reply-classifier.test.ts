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

  describe("refusals are never HOT", () => {
    const refusals = [
      "Not interested, thanks",
      "We are not interested at this time",
      "No thanks.",
      "No thank you, we're all set",
      "Not looking for this right now",
      "We'll pass",
      "I will pass on this one",
      "Please don't call me",
      "Do not call this number again",
    ];
    it.each(refusals)("classifies %j as NOT_FIT and flags it for a human", (text) => {
      const result = classifyReply(text);
      expect(result.intent).toBe("NOT_FIT");
      expect(result.nextAction).toBe("pause_sequence");
      expect(result.flagForHuman).toBe(true);
    });

    const negatedAvailability = [
      "I'm not available this week",
      "We can't do a call right now",
      "No meeting needed",
    ];
    it.each(negatedAvailability)("does not treat %j as interest", (text) => {
      expect(classifyReply(text).intent).not.toBe("HOT");
    });
  });

  describe("genuine interest is still HOT", () => {
    const interested = [
      "Interested! Are you free Thursday?",
      "Yes, let's book a call",
      "I'm available tomorrow afternoon",
      "Can you send over a demo?",
    ];
    it.each(interested)("classifies %j as HOT", (text) => {
      expect(classifyReply(text).intent).toBe("HOT");
    });
  });

  it("keeps opt-outs ahead of everything else", () => {
    expect(classifyReply("Not interested, please unsubscribe me").intent).toBe("UNSUBSCRIBE");
  });

  it("keeps out-of-office replies ahead of refusals and interest", () => {
    expect(classifyReply("Automatic reply: I am out of the office and not available").intent).toBe(
      "OUT_OF_OFFICE",
    );
  });

  it("falls back to NEUTRAL with human review required for ambiguous text", () => {
    const result = classifyReply("ok");
    expect(result.intent).toBe("NEUTRAL");
    expect(result.flagForHuman).toBe(true);
  });
});
