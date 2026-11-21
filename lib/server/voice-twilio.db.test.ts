import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "./api-actor";
import { pinClock, unpinClock } from "./test-support/clock";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedLead, seedOrganization } from "./test-support/seed";
import type { CallJobMetadata, VoiceConnector, VoiceDialer } from "./voice-dialer";
import type { TwilioCaller } from "./voice-twilio";

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64url");
process.env.VOICE_WORKER_SECRET = "a-long-test-secret-for-voice-calls";

const NOW = new Date("2030-01-15T15:00:00Z");
const DAY = 86_400_000;
const EVIDENCE = "Agreed on our website form on 2030-01-10 to receive a call from an AI voice assistant.";
const REPORT_URL = "https://app.example.com/api/voice/worker/report";
const LINE = { accountSid: `AC${"a".repeat(32)}`, keySid: `SK${"b".repeat(32)}`, keySecret: "secret-secret-secret-1234", callerNumber: "+14155550100" };

async function schema() { return import("./database/schema"); }
async function db() { return (await import("./database")).getDatabase(); }

function fakeCaller(handler: () => { callSid: string } = () => ({ callSid: "CA00000000000000000000000000000001" })) {
  return { place: vi.fn(async () => handler()), hangUp: vi.fn() } satisfies TwilioCaller;
}
function fakeConnector() {
  return { connectTwilioCall: vi.fn(async ({ callId }: { callId: string; metadata: CallJobMetadata }) => ({ room: `call-${callId}`, connectUrl: "wss://example.livekit.cloud/twilio/abc" })) } satisfies VoiceConnector;
}
const noSipDialer = { ensureTrunk: vi.fn(), dial: vi.fn(), hangUp: vi.fn() } as unknown as VoiceDialer & { dial: ReturnType<typeof vi.fn> };

describe.skipIf(!hasTestDatabase)("voice calls on a Twilio line", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    pinClock(NOW);
    await truncateAllTables();
  });
  afterEach(() => unpinClock());

  async function workspace() {
    const { organizationId, userId } = await seedOrganization();
    const actor: ApiActor = { userId, organizationId, organizationRole: "admin" };
    const campaignId = await seedCampaign(organizationId, userId);
    const credits = await import("./voice-credits");
    await credits.setVoiceAddon({ organizationId, active: true, monthlySeconds: 6_000, periodStart: new Date(NOW.getTime() - 2 * DAY), periodEnd: new Date(NOW.getTime() + 28 * DAY) });
    const settings = await import("./voice-settings");
    await settings.attestCallConsent(actor);
    await settings.connectTwilioLine(actor, settings.twilioLineInputSchema.parse(LINE), async () => undefined);
    const leadId = await seedLead(organizationId, campaignId, { phone: "+14155550111", timezone: "America/New_York", personName: "Sam Example" });
    const { recordCallConsent } = await import("./voice-consent");
    await recordCallConsent(actor, { leadId, source: "web_form", evidence: EVIDENCE });
    const m = await import("./voice-campaigns");
    const id = await m.createVoiceCampaign(actor, m.voiceCampaignInputSchema.parse({ campaignId, name: "Q1", level: "meetings", maxAttempts: 3, playbook: { productFacts: "Acme Widget cuts month-end close from eight days to two by automating reconciliation for finance teams." } }));
    await m.addCallTargets(actor, id);
    await m.approveVoiceCampaign(actor, id);
    await m.startVoiceCampaign(actor, id);
    return { organizationId, actor, campaignId, leadId };
  }

  async function tick(caller: TwilioCaller) {
    const { processVoiceQueue } = await import("./voice-orchestrator");
    return processVoiceQueue({ dialer: noSipDialer, twilioCaller: caller, reportUrl: REPORT_URL, now: NOW, random: () => 0 });
  }
  const calls = async () => (await db()).select().from((await schema()).voiceCalls);
  const targets = async () => (await db()).select().from((await schema()).voiceCallTargets);

  const answer = async (callId: string, answeredBy = "human", connector = fakeConnector()) => {
    const { handleTwilioAnswer } = await import("./voice-twilio-calls");
    return { connector, twiml: await handleTwilioAnswer({ callId, callSid: "CA1", answeredBy, connector, now: NOW }) };
  };
  const status = async (callId: string, callStatus: string, extra: { callDuration?: number; answeredBy?: string } = {}) => {
    const { handleTwilioStatus } = await import("./voice-twilio-calls");
    return handleTwilioStatus({ callId, callSid: "CA1", callStatus, callDuration: extra.callDuration ?? null, answeredBy: extra.answeredBy ?? null, now: NOW });
  };
  const workerReport = async (callId: string, secondsAgo: number, outcome: import("../domain/voice").CallOutcome = "meeting_requested") => {
    const { applyWorkerReport } = await import("./voice-reports");
    return applyWorkerReport({
      event: "completed", callId, outcome, summary: "Sam agreed to a meeting.", transcript: [],
      answeredAt: new Date(NOW.getTime() - secondsAgo * 1_000).toISOString(), endedAt: NOW.toISOString(),
    }, NOW);
  };
  const balance = async (organizationId: string) => (await (await import("./voice-credits")).getVoiceBalance(organizationId, NOW)).availableSeconds;

  describe("connecting the line", () => {
    it("checks the key, stores it encrypted, and never returns it", async () => {
      const { organizationId, actor } = await workspace();
      const settings = await import("./voice-settings");
      const result = await settings.getVoiceSettings(organizationId);
      expect(result).toMatchObject({ lineType: "twilio", telephonyConnected: true, twilioAccountSid: LINE.accountSid, callerNumber: "+14155550100" });
      expect(JSON.stringify(result)).not.toContain(LINE.keySecret);
      const { voiceSettings } = await schema();
      const [row] = await (await db()).select().from(voiceSettings).where(eq(voiceSettings.organizationId, organizationId));
      expect(row!.encryptedTwilioKey).toBeTruthy();
      expect(row!.encryptedTwilioKey).not.toContain(LINE.keySecret);
      expect(await settings.getPhoneLine(organizationId)).toEqual({ type: "twilio", twilio: LINE });
      expect(actor.organizationRole).toBe("admin");
    });

    it("refuses a key Twilio rejects, and anyone who isn't an admin", async () => {
      const { organizationId, actor } = await workspace();
      const settings = await import("./voice-settings");
      const { TwilioLineError } = await import("./voice-twilio");
      const input = settings.twilioLineInputSchema.parse(LINE);
      await expect(settings.connectTwilioLine(actor, input, async () => { throw new TwilioLineError("Twilio rejected this API key."); })).rejects.toThrow(/rejected this API key/);
      await expect(settings.connectTwilioLine({ ...actor, organizationRole: "member" } as ApiActor, input, async () => undefined)).rejects.toThrow(/Admin permission/);
      expect((await settings.getVoiceSettings(organizationId)).telephonyConnected).toBe(true);
    });

    it("only accepts an Account SID, a key SID and a number in the right shape", async () => {
      const { twilioLineInputSchema } = await import("./voice-settings");
      expect(() => twilioLineInputSchema.parse({ ...LINE, accountSid: "nope" })).toThrow();
      expect(() => twilioLineInputSchema.parse({ ...LINE, keySid: `AC${"b".repeat(32)}` })).toThrow();
      expect(() => twilioLineInputSchema.parse({ ...LINE, callerNumber: "555" })).toThrow();
    });
  });

  describe("placing the call", () => {
    it("asks Twilio to dial with voicemail detection and a cap, and touches nothing on LiveKit", async () => {
      await workspace();
      const caller = fakeCaller();
      expect(await tick(caller)).toMatchObject({ dialed: 1, failed: 0 });
      expect(noSipDialer.dial).not.toHaveBeenCalled();

      const [line, request] = caller.place.mock.calls[0] as unknown as [typeof LINE, { to: string; answerUrl: string; statusUrl: string; ringSeconds: number; maxSeconds: number }];
      expect(line).toEqual(LINE);
      expect(request).toMatchObject({ to: "+14155550111", ringSeconds: 30, maxSeconds: 900 });
      const [call] = await calls();
      expect(request.answerUrl).toContain(`https://app.example.com/api/voice/twilio/twiml?call=${call!.id}&token=`);
      expect(request.statusUrl).toContain(`/api/voice/twilio/status?call=${call!.id}&token=`);
      expect(call).toMatchObject({ status: "dialing", lineType: "twilio", providerCallSid: "CA00000000000000000000000000000001", answeredAt: null, room: null });
      const metadata = call!.jobMetadata as unknown as CallJobMetadata;
      expect(metadata.openingLine).toMatch(/This call is automated/);
      expect(metadata.maxSeconds).toBe(900);
    });

    it("pauses all calling when Twilio rejects the key, instead of failing every call", async () => {
      const { organizationId } = await workspace();
      const caller = fakeCaller(() => { throw Object.assign(new Error("Authenticate"), { code: 20003, status: 401 }); });
      expect(await tick(caller)).toMatchObject({ failed: 1 });
      const settings = await import("./voice-settings");
      expect(await settings.getVoiceSettings(organizationId)).toMatchObject({ voicePaused: true });
      expect((await settings.getVoiceSettings(organizationId)).pausedReason).toMatch(/Twilio rejected your API key/);
      const [call] = await calls();
      expect(call).toMatchObject({ status: "failed", billedSeconds: 0 });
      // Reconnecting with a working key lifts that pause.
      const { actor } = { actor: { userId: (await (await db()).select().from((await schema()).users))[0]!.id, organizationId, organizationRole: "admin" } as ApiActor };
      await settings.connectTwilioLine(actor, settings.twilioLineInputSchema.parse(LINE), async () => undefined);
      expect(await settings.getVoiceSettings(organizationId)).toMatchObject({ voicePaused: false, pausedReason: null });
    });

    it("drops a number Twilio can't call, or a country the account may not call, without retrying", async () => {
      await workspace();
      const caller = fakeCaller(() => { throw Object.assign(new Error("invalid"), { code: 21211 }); });
      await tick(caller);
      expect((await targets())[0]).toMatchObject({ status: "skipped" });
      expect((await targets())[0]!.skipReason).toMatch(/isn't a number/);
    });
  });

  describe("when someone picks up", () => {
    async function placed() {
      const ws = await workspace();
      await tick(fakeCaller());
      const [call] = await calls();
      return { ...ws, callId: call!.id };
    }

    it("bridges a person into LiveKit with the call's script, and starts nothing before then", async () => {
      const { callId } = await placed();
      const { connector, twiml } = await answer(callId, "human");
      expect(twiml).toBe('<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://example.livekit.cloud/twilio/abc"/></Connect></Response>');
      expect(connector.connectTwilioCall).toHaveBeenCalledTimes(1);
      expect(connector.connectTwilioCall.mock.calls[0]![0].metadata).toMatchObject({ callId, level: "meetings", maxSeconds: 900, reportUrl: REPORT_URL });
      expect((await calls())[0]).toMatchObject({ status: "in_progress", room: `call-${callId}`, answeredBy: "human", answeredAt: null });
    });

    it("also bridges when Twilio can't tell (unknown), so a quiet person isn't hung up on", async () => {
      const { callId } = await placed();
      expect((await answer(callId, "unknown")).twiml).toContain("<Stream");
    });

    it("hangs up on a voicemail greeting or a fax, uses no LiveKit, and charges nothing", async () => {
      for (const answeredBy of ["machine_start", "machine_end_beep", "fax"]) {
        const { organizationId, callId } = await placed();
        const { connector, twiml } = await answer(callId, answeredBy);
        expect(twiml).toContain("<Hangup/>");
        expect(connector.connectTwilioCall).not.toHaveBeenCalled();
        expect((await calls()).find((row) => row.id === callId)).toMatchObject({ status: "completed", outcome: "voicemail", billedSeconds: 0 });
        expect(await balance(organizationId)).toBe(6_000);
        await truncateAllTables();
      }
    });

    it("hangs up on a call that already ended or doesn't exist, and on a LiveKit failure", async () => {
      const { callId } = await placed();
      const { handleTwilioAnswer } = await import("./voice-twilio-calls");
      const connector = fakeConnector();
      expect(await handleTwilioAnswer({ callId: crypto.randomUUID(), callSid: null, answeredBy: "human", connector })).toContain("<Hangup/>");
      connector.connectTwilioCall.mockRejectedValueOnce(new Error("LiveKit unavailable"));
      expect(await handleTwilioAnswer({ callId, callSid: null, answeredBy: "human", connector, now: NOW })).toContain("<Hangup/>");
      expect((await calls())[0]).toMatchObject({ status: "failed", billedSeconds: 0 });
      expect(await handleTwilioAnswer({ callId, callSid: null, answeredBy: "human", connector, now: NOW })).toContain("<Hangup/>");
      expect(connector.connectTwilioCall).toHaveBeenCalledTimes(1);
    });
  });

  describe("when Twilio reports the end of a call", () => {
    async function connected() {
      const ws = await workspace();
      await tick(fakeCaller());
      const [call] = await calls();
      await answer(call!.id, "human");
      return { ...ws, callId: call!.id };
    }

    it("records a missed call as no answer, charges nothing, and queues the retry", async () => {
      await workspace();
      await tick(fakeCaller());
      const [call] = await calls();
      await status(call!.id, "no-answer");
      expect((await calls())[0]).toMatchObject({ status: "completed", outcome: "no_answer", billedSeconds: 0, providerStatus: "no-answer" });
      expect((await targets())[0]).toMatchObject({ status: "queued", lastOutcome: "no_answer" });
    });

    it("records a failed call as failed", async () => {
      await workspace();
      await tick(fakeCaller());
      const [call] = await calls();
      await status(call!.id, "failed");
      expect((await calls())[0]).toMatchObject({ status: "failed", outcome: "failed", billedSeconds: 0 });
    });

    it("ignores progress updates, and never moves a finished call backwards", async () => {
      const { callId } = await connected();
      expect(await status(callId, "ringing")).toMatchObject({ final: false });
      expect(await status(callId, "in-progress")).toMatchObject({ final: false });
      expect((await calls())[0]).toMatchObject({ status: "in_progress" });
      await status(callId, "completed", { callDuration: 125 });
      await status(callId, "in-progress");
      expect((await calls())[0]!.providerStatus).toBe("completed");
    });

    it("charges once when the worker reports first, then Twilio says the call is over", async () => {
      const { organizationId, callId } = await connected();
      expect(await workerReport(callId, 130)).toMatchObject({ held: true });
      // Not charged yet: still waiting for Twilio.
      expect(await balance(organizationId)).toBe(6_000);
      expect((await calls())[0]).toMatchObject({ status: "in_progress" });

      await status(callId, "completed", { callDuration: 140 });
      const [call] = await calls();
      expect(call).toMatchObject({ status: "completed", outcome: "meeting_requested", billedSeconds: 130, providerDurationSeconds: 140, heldReport: null });
      expect(await balance(organizationId)).toBe(6_000 - 130);
    });

    it("charges once when Twilio reports first, then the worker", async () => {
      const { organizationId, callId } = await connected();
      expect(await status(callId, "completed", { callDuration: 125 })).toMatchObject({ waitingForWorker: true });
      expect(await balance(organizationId)).toBe(6_000);
      await workerReport(callId, 130);
      expect((await calls())[0]).toMatchObject({ status: "completed", billedSeconds: 125, providerDurationSeconds: 125 });
      expect(await balance(organizationId)).toBe(6_000 - 125);
    });

    it("never charges more than Twilio says the call lasted, even if the worker's clock says longer", async () => {
      const { organizationId, callId } = await connected();
      await status(callId, "completed", { callDuration: 60 });
      await workerReport(callId, 600);
      expect((await calls())[0]!.billedSeconds).toBe(60);
      expect(await balance(organizationId)).toBe(6_000 - 60);
    });

    it("is safe when Twilio or the worker repeats itself", async () => {
      const { organizationId, callId } = await connected();
      await workerReport(callId, 130);
      await status(callId, "completed", { callDuration: 140 });
      await status(callId, "completed", { callDuration: 140 });
      await workerReport(callId, 130);
      expect(await balance(organizationId)).toBe(6_000 - 130);
    });

    it("never charges a voicemail, whatever the worker says", async () => {
      const { organizationId, callId } = await connected();
      await workerReport(callId, 40, "voicemail");
      await status(callId, "completed", { callDuration: 45 });
      expect((await calls())[0]).toMatchObject({ outcome: "voicemail", billedSeconds: 0 });
      expect(await balance(organizationId)).toBe(6_000);
    });
  });

  describe("when one of the two reports never arrives", () => {
    async function connected() {
      const ws = await workspace();
      await tick(fakeCaller());
      const [call] = await calls();
      await answer(call!.id, "human");
      return { ...ws, callId: call!.id };
    }
    const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

    it("finishes from the worker's report when Twilio never says the call ended", async () => {
      const { organizationId, callId } = await connected();
      await workerReport(callId, 130);
      const { reapStaleCalls } = await import("./voice-reports");
      expect(await reapStaleCalls(later(5))).toEqual({ reaped: 0 });
      expect(await reapStaleCalls(later(11))).toEqual({ reaped: 1 });
      expect((await calls())[0]).toMatchObject({ status: "completed", outcome: "meeting_requested", billedSeconds: 130 });
      expect(await balance(organizationId)).toBe(6_000 - 130);
    });

    it("charges nothing when Twilio ended the call but the worker never reported", async () => {
      const { organizationId, callId } = await connected();
      await status(callId, "completed", { callDuration: 200 });
      const { reapStaleCalls } = await import("./voice-reports");
      expect(await reapStaleCalls(later(11))).toEqual({ reaped: 1 });
      expect((await calls())[0]).toMatchObject({ status: "failed", billedSeconds: 0, providerDurationSeconds: 200 });
      expect(await balance(organizationId)).toBe(6_000);
    });
  });
});
