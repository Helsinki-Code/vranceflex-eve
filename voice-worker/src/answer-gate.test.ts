import { describe, expect, it } from "vitest";
import { GREETING_MAX_MS, GREETING_WAIT_MS, GreetingGate, hasCallEnded, isCallAnswered } from "./answer-gate";

describe("isCallAnswered", () => {
  it("is not answered while a SIP call is still dialing or ringing", () => {
    expect(isCallAnswered({ line: "sip", attributes: { "sip.callStatus": "dialing" } })).toBe(false);
    expect(isCallAnswered({ line: "sip", attributes: { "sip.callStatus": "ringing" } })).toBe(false);
    expect(isCallAnswered({ line: "sip", attributes: {} })).toBe(false);
    expect(isCallAnswered({ line: "sip", attributes: undefined })).toBe(false);
  });

  it("is answered when a SIP call becomes active", () => {
    expect(isCallAnswered({ line: "sip", attributes: { "sip.callStatus": "active" } })).toBe(true);
  });

  it("treats a connector participant as answered, because it only appears after the person accepts", () => {
    expect(isCallAnswered({ line: "connector", attributes: {} })).toBe(true);
  });

  it("notices a call that hung up before it was answered", () => {
    expect(hasCallEnded({ "sip.callStatus": "hangup" })).toBe(true);
    expect(hasCallEnded({ "sip.callStatus": "active" })).toBe(false);
    expect(hasCallEnded(undefined)).toBe(false);
  });
});

describe("GreetingGate", () => {
  it("waits a short silence, then lets the disclosure go", () => {
    const gate = new GreetingGate(0);
    expect(gate.ready(GREETING_WAIT_MS - 1)).toBe(false);
    expect(gate.ready(GREETING_WAIT_MS)).toBe(true);
  });

  it("lets the person finish their first words before the disclosure", () => {
    const gate = new GreetingGate(0);
    gate.speechStarted(800);
    expect(gate.ready(3_000)).toBe(false);
    gate.speechEnded(1_400);
    expect(gate.ready(1_400)).toBe(true);
  });

  it("does not wait forever for someone who keeps talking", () => {
    const gate = new GreetingGate(0);
    gate.speechStarted(500);
    expect(gate.ready(500 + GREETING_MAX_MS - 1)).toBe(false);
    expect(gate.ready(500 + GREETING_MAX_MS)).toBe(true);
  });

  it("ignores an end of speech that had no start", () => {
    const gate = new GreetingGate(0);
    gate.speechEnded(100);
    expect(gate.ready(100)).toBe(false);
  });
});
