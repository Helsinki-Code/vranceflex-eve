import { describe, expect, it } from "vitest";
import { classifyTwilioError, HANGUP_TWIML, isMachineAnswer, streamTwiml, twilioCallbackUrls, unansweredOutcome, verifyCallToken } from "./voice-twilio";

const SECRET = "a-long-test-secret-for-voice-calls";
const CALL = "11111111-1111-4111-8111-111111111111";

describe("per-call tokens", () => {
  it("accepts the token made for that call", () => {
    const { answerUrl } = twilioCallbackUrls({ baseUrl: "https://app.example.com", callId: CALL, secret: SECRET });
    const url = new URL(answerUrl);
    expect(url.pathname).toBe("/api/voice/twilio/twiml");
    expect(verifyCallToken(url.searchParams.get("call"), url.searchParams.get("token"), SECRET)).toBe(true);
  });

  it("refuses another call's token, a wrong secret, a missing or malformed token", () => {
    const token = new URL(twilioCallbackUrls({ baseUrl: "https://app.example.com", callId: CALL, secret: SECRET }).statusUrl).searchParams.get("token");
    expect(verifyCallToken("22222222-2222-4222-8222-222222222222", token, SECRET)).toBe(false);
    expect(verifyCallToken(CALL, token, "another-secret-entirely-different")).toBe(false);
    expect(verifyCallToken(CALL, null, SECRET)).toBe(false);
    expect(verifyCallToken(null, token, SECRET)).toBe(false);
    expect(verifyCallToken(CALL, "not-hex", SECRET)).toBe(false);
    expect(verifyCallToken(CALL, token, undefined)).toBe(false);
  });
});

describe("what Twilio tells us", () => {
  it("recognises machines and faxes, and treats people and unknowns as people", () => {
    for (const value of ["machine_start", "machine_end_beep", "machine_end_silence", "machine_end_other", "fax"]) expect(isMachineAnswer(value)).toBe(true);
    for (const value of ["human", "unknown", "", null, undefined]) expect(isMachineAnswer(value)).toBe(false);
  });

  it("records an unanswered call by what happened", () => {
    expect(unansweredOutcome("no-answer", null)).toBe("no_answer");
    expect(unansweredOutcome("busy", null)).toBe("no_answer");
    expect(unansweredOutcome("canceled", null)).toBe("no_answer");
    expect(unansweredOutcome("failed", null)).toBe("failed");
    expect(unansweredOutcome("completed", "machine_start")).toBe("voicemail");
  });
});

describe("TwiML", () => {
  it("bridges to the connector and escapes the address", () => {
    expect(streamTwiml("wss://example.livekit.cloud/twilio?a=1&b=2")).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://example.livekit.cloud/twilio?a=1&amp;b=2"/></Connect></Response>',
    );
  });
  it("hangs up", () => expect(HANGUP_TWIML).toContain("<Hangup/>"));
});

describe("Twilio errors", () => {
  const error = (code: number, message = "x") => Object.assign(new Error(message), { code });
  it("recognises a rejected key", () => {
    expect(classifyTwilioError(error(20003)).kind).toBe("credentials");
    expect(classifyTwilioError(Object.assign(new Error("Unauthorized"), { status: 401 })).kind).toBe("credentials");
  });
  it("recognises numbers that can't be called, and countries the account may not call", () => {
    expect(classifyTwilioError(error(21211)).kind).toBe("invalid_number");
    expect(classifyTwilioError(error(21214)).kind).toBe("invalid_number");
    expect(classifyTwilioError(error(21215)).kind).toBe("blocked_country");
    expect(classifyTwilioError(error(21219)).message).toMatch(/dialing permissions/);
  });
  it("keeps the message for anything else", () => {
    expect(classifyTwilioError(new Error("socket hang up"))).toEqual({ kind: "other", message: "socket hang up" });
  });
});
