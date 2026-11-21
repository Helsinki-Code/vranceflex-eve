import { describe, expect, it, vi } from "vitest";
import { signWorkerReport } from "../../lib/domain/voice-signature";
import { verifyWorkerReport } from "../../lib/server/voice-reports";
import { CallState, STOP_ACKNOWLEDGEMENT } from "./call-state";
import { sendReport } from "./report";

const T0 = new Date("2030-01-15T15:00:00Z");
const state = (level: "meetings" | "qualify" | "sell" = "qualify") => {
  let tick = 0;
  return new CallState("11111111-1111-4111-8111-111111111111", level, T0, () => new Date(T0.getTime() + tick++ * 1_000));
};

describe("CallState", () => {
  it("builds a completed report with the transcript and the recorded outcome", () => {
    const call = state("qualify");
    call.addAgentTurn("Hi Sam, do you have a minute?");
    call.addProspectTurn("Sure, go ahead");
    call.recordOutcome({ outcome: "qualified", summary: "A fit with budget.", followUp: "Send the proposal.", callbackAt: "2030-01-17T19:00:00Z" });
    const report = call.buildReport();
    expect(report).toMatchObject({
      event: "completed", callId: "11111111-1111-4111-8111-111111111111", outcome: "qualified", summary: "A fit with budget.",
      followUp: "Send the proposal.", callbackAt: "2030-01-17T19:00:00.000Z", answeredAt: T0.toISOString(),
    });
    expect(report.transcript.map((turn) => turn.role)).toEqual(["agent", "prospect"]);
  });

  it("ignores empty turns and trims long ones", () => {
    const call = state();
    call.addAgentTurn("   ");
    call.addProspectTurn("x".repeat(5_000));
    expect(call.turns).toHaveLength(1);
    expect(call.turns[0]!.text).toHaveLength(2_000);
  });

  describe("a request to stop", () => {
    it("is spotted in code and ends the call as do-not-call, whatever the model says", () => {
      const call = state("sell");
      call.addAgentTurn("Do you have a minute?");
      expect(call.addProspectTurn("Please don't call me again")).toBe(true);
      expect(call.heardStop).toBe(true);
      call.recordOutcome({ outcome: "deal_progressed", summary: "They agreed to a trial!" });
      expect(call.buildReport()).toMatchObject({ outcome: "do_not_call", summary: "They agreed to a trial!" });
    });

    it("still produces a do-not-call report if the model never recorded anything", () => {
      const call = state();
      call.addProspectTurn("Take me off your list");
      expect(call.buildReport()).toMatchObject({ outcome: "do_not_call", summary: "They asked not to be called again." });
    });

    it("is not triggered by ordinary replies", () => {
      const call = state();
      for (const text of ["Sure, call me tomorrow", "What does it cost?", "Not interested, thanks"]) expect(call.addProspectTurn(text)).toBe(false);
      expect(call.heardStop).toBe(false);
    });

    it("has a fixed, polite acknowledgement", () => {
      expect(STOP_ACKNOWLEDGEMENT).toMatch(/remove your number/);
      expect(STOP_ACKNOWLEDGEMENT).toMatch(/Goodbye/);
    });
  });

  describe("outcomes", () => {
    it("folds an outcome beyond the level back, as the app would", () => {
      const meetings = state("meetings");
      meetings.recordOutcome({ outcome: "deal_progressed" });
      expect(meetings.buildReport().outcome).toBe("meeting_requested");
      const qualify = state("qualify");
      qualify.recordOutcome({ outcome: "deal_progressed" });
      expect(qualify.buildReport().outcome).toBe("qualified");
    });

    it("treats an outcome the model made up as needing a person", () => {
      const call = state();
      call.recordOutcome({ outcome: "they_loved_it" });
      expect(call.buildReport().outcome).toBe("needs_human");
    });

    it("offers each level only the outcomes it may record", () => {
      expect(state("meetings").allowedOutcomes).not.toContain("qualified");
      expect(state("qualify").allowedOutcomes).toContain("qualified");
      expect(state("sell").allowedOutcomes).toContain("deal_progressed");
    });

    it("drops an unreadable callback time rather than sending nonsense", () => {
      const call = state();
      call.recordOutcome({ outcome: "callback_requested", callbackAt: "tomorrow-ish" });
      expect(call.buildReport().callbackAt).toBeUndefined();
    });

    it("asks a person to look when the call ended without an outcome", () => {
      const talked = state();
      talked.addProspectTurn("Hello?");
      expect(talked.buildReport()).toMatchObject({ outcome: "needs_human" });
      expect(talked.buildReport().summary).toMatch(/before an outcome was recorded/);
      const silent = state();
      silent.addAgentTurn("Hi, is this Sam?");
      expect(silent.buildReport()).toMatchObject({ outcome: "no_answer", summary: "No one spoke on the call." });
    });

    it("carries an error through for the review queue", () => {
      const call = state();
      call.recordError("speech service unavailable");
      expect(call.buildReport().error).toBe("speech service unavailable");
    });
  });
});

describe("sendReport", () => {
  const payload = { event: "answered", callId: "11111111-1111-4111-8111-111111111111" };
  const noSleep = async () => undefined;

  it("signs the exact body so the app accepts it", async () => {
    let received: { headers: Record<string, string>; body: string } | null = null;
    const now = new Date("2030-01-15T15:00:00Z");
    const result = await sendReport({
      url: "https://app.example.com/api/voice/worker/report", secret: "shh", payload, now: () => now.getTime(), sleep: noSleep,
      post: async (_url, init) => { received = { headers: init.headers, body: init.body }; return { ok: true, status: 200 }; },
    });
    expect(result).toEqual({ delivered: true, attempts: 1 });
    expect(JSON.parse(received!.body)).toEqual(payload);
    expect(verifyWorkerReport({ secret: "shh", timestamp: received!.headers["x-vranceflex-timestamp"]!, signature: received!.headers["x-vranceflex-signature"]!, body: received!.body, now })).toBe(true);
    expect(received!.headers["x-vranceflex-signature"]).toBe(signWorkerReport("shh", String(now.getTime()), received!.body));
  });

  it("retries a server error or a dropped connection, with a fresh timestamp each time", async () => {
    const stamps: string[] = [];
    const sleeps: number[] = [];
    let attempt = 0;
    let clock = 1_000;
    const result = await sendReport({
      url: "u", secret: "s", payload, now: () => (clock += 60_000), sleep: async (ms) => { sleeps.push(ms); },
      post: async (_url, init) => {
        stamps.push(init.headers["x-vranceflex-timestamp"]!);
        attempt += 1;
        if (attempt === 1) throw new Error("connection reset");
        if (attempt === 2) return { ok: false, status: 503 };
        return { ok: true, status: 200 };
      },
    });
    expect(result).toEqual({ delivered: true, attempts: 3 });
    expect(new Set(stamps).size).toBe(3);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it("does not retry a refusal", async () => {
    const post = vi.fn(async () => ({ ok: false, status: 401 }));
    expect(await sendReport({ url: "u", secret: "s", payload, post, sleep: noSleep })).toEqual({ delivered: false, attempts: 1, refused: 401 });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempts are used", async () => {
    const post = vi.fn(async () => ({ ok: false, status: 500 }));
    expect(await sendReport({ url: "u", secret: "s", payload, post, sleep: noSleep, attempts: 3 })).toEqual({ delivered: false, attempts: 3 });
    expect(post).toHaveBeenCalledTimes(3);
  });
});

describe("CallState usage", () => {
  it("includes what the call used in the report, once it is known", () => {
    const call = state();
    call.addProspectTurn("Hello?");
    expect(call.buildReport()).not.toHaveProperty("usage");
    call.setUsage({ llmInputTokens: 3_500, llmOutputTokens: 195, ttsCharacters: 600, sttSeconds: 60 });
    expect(call.buildReport().usage).toEqual({ llmInputTokens: 3_500, llmOutputTokens: 195, ttsCharacters: 600, sttSeconds: 60 });
  });
});
