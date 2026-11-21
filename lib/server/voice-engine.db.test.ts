import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "./api-actor";
import { pinClock, unpinClock } from "./test-support/clock";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedDeliveryJob, seedLead, seedOrganization } from "./test-support/seed";
import type { DialRequest, DialResult, VoiceDialer } from "./voice-dialer";

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64url");

// Tuesday 2030-01-15 15:00 UTC = 10:00 in New York, inside the default calling window.
const NOW = new Date("2030-01-15T15:00:00Z");
const DAY = 86_400_000;
const EVIDENCE = "Agreed on our website form on 2030-01-10 to receive a call from an AI voice assistant.";
const REPORT_URL = "https://app.example.com/api/voice/worker/report";

async function schema() { return import("./database/schema"); }
async function db() { return (await import("./database")).getDatabase(); }

type Dialer = VoiceDialer & { dial: ReturnType<typeof vi.fn> };
function fakeDialer(handler: (request: DialRequest) => DialResult | Promise<DialResult> = (request) => ({ status: "answered", room: `call-${request.callId}` })): Dialer {
  return { ensureTrunk: vi.fn(async () => "ST_trunk_1"), dial: vi.fn(async (request: DialRequest) => handler(request)), hangUp: vi.fn() } as Dialer;
}

describe.skipIf(!hasTestDatabase)("voice engine", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    pinClock(NOW);
    await truncateAllTables();
  });
  afterEach(() => unpinClock());

  /** A workspace that is ready to call: add-on with minutes, phone line, consent attested. */
  async function workspace(options: { minutes?: number; role?: ApiActor["organizationRole"] } = {}) {
    const { organizationId, userId } = await seedOrganization();
    const actor: ApiActor = { userId, organizationId, organizationRole: options.role ?? "admin" };
    const campaignId = await seedCampaign(organizationId, userId);
    const credits = await import("./voice-credits");
    await credits.setVoiceAddon({ organizationId, active: true, monthlySeconds: (options.minutes ?? 100) * 60, periodStart: new Date(NOW.getTime() - 2 * DAY), periodEnd: new Date(NOW.getTime() + 28 * DAY) });
    const settings = await import("./voice-settings");
    await settings.attestCallConsent(actor);
    await settings.connectTelephony(actor, settings.telephonyInputSchema.parse({ sipAddress: "acme.pstn.twilio.com", username: "caller", password: "pw", callerNumber: "+14155550100" }), fakeDialer());
    return { organizationId, userId, actor, campaignId };
  }

  async function lead(ws: { organizationId: string; campaignId: string; actor: ApiActor }, phone: string, overrides: { timezone?: string; consent?: boolean; name?: string; confidence?: number } = {}) {
    const leadId = await seedLead(ws.organizationId, ws.campaignId, { phone, timezone: overrides.timezone ?? "America/New_York", personName: overrides.name ?? "Sam Example" });
    if (overrides.confidence !== undefined) {
      const { leads } = await schema();
      await (await db()).update(leads).set({ confidence: overrides.confidence }).where(eq(leads.id, leadId));
    }
    if (overrides.consent !== false) {
      const { recordCallConsent } = await import("./voice-consent");
      await recordCallConsent(ws.actor, { leadId, source: "web_form", evidence: EVIDENCE });
    }
    return leadId;
  }

  async function campaign(ws: { actor: ApiActor; campaignId: string }, options: { level?: "meetings" | "qualify" | "sell"; maxAttempts?: number; start?: boolean } = {}) {
    const m = await import("./voice-campaigns");
    const id = await m.createVoiceCampaign(
      ws.actor,
      m.voiceCampaignInputSchema.parse({
        campaignId: ws.campaignId,
        name: "Q1 calls",
        level: options.level ?? "meetings",
        maxAttempts: options.maxAttempts ?? 3,
        playbook: { productFacts: "Acme Widget cuts month-end close from eight days to two by automating reconciliation for finance teams." },
      }),
    );
    const added = await m.addCallTargets(ws.actor, id);
    if (options.start !== false) {
      await m.approveVoiceCampaign(ws.actor, id);
      await m.startVoiceCampaign(ws.actor, id);
    }
    return { id, added };
  }

  async function tick(dialer: Dialer, now = NOW, extra: { platformMaxConcurrentCalls?: number } = {}) {
    const { processVoiceQueue } = await import("./voice-orchestrator");
    return processVoiceQueue({ dialer, reportUrl: REPORT_URL, now, random: () => 0, ...extra });
  }
  async function targets() {
    const { voiceCallTargets } = await schema();
    return (await db()).select().from(voiceCallTargets);
  }
  async function calls() {
    const { voiceCalls } = await schema();
    return (await db()).select().from(voiceCalls);
  }

  // ---- Dialing -----------------------------------------------------------------------

  describe("placing calls", () => {
    it("dials a consented lead with the script, the AI disclosure and a hard time cap", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111", { name: "Dr. Sam Example" });
      await campaign(ws, { level: "meetings" });
      const dialer = fakeDialer();

      expect(await tick(dialer)).toMatchObject({ dialed: 1, unanswered: 0, failed: 0 });
      const request = dialer.dial.mock.calls[0]![0] as DialRequest;
      expect(request.to).toBe("+14155550111");
      expect(request.trunkId).toBe("ST_trunk_1");
      expect(request.sip).toMatchObject({ address: "acme.pstn.twilio.com", username: "caller", password: "pw", callerNumber: "+14155550100" });
      expect(request.ringSeconds).toBe(30);
      expect(request.metadata.reportUrl).toBe(REPORT_URL);
      expect(request.metadata.maxSeconds).toBe(900);
      expect(request.metadata.level).toBe("meetings");
      expect(request.metadata.openingLine).toBe("Hi, is this Sam? This is Alex, an AI assistant calling on behalf of Acme Inc. This call is automated and may be transcribed. Do you have a minute?");
      expect(request.metadata.instructions).toContain("Sam Example, Head of Operations at Prospect Co");
      expect(request.metadata.instructions).toContain("Acme Widget cuts month-end close");
      expect(request.metadata.instructions).toContain("It is Tuesday");

      const [call] = await calls();
      expect(call).toMatchObject({ status: "in_progress", level: "meetings", phone: "+14155550111", room: `call-${call.id}` });
      expect((await targets())[0]).toMatchObject({ status: "in_progress", attempts: 1 });
    });

    it("calls the warmest lead first, and respects the concurrent-call limit", async () => {
      const ws = await workspace();
      const cold = await lead(ws, "+14155550111", { confidence: 95, name: "Cold Lead" });
      const warm = await lead(ws, "+14155550122", { confidence: 50, name: "Warm Lead" });
      const { inboundReplies, outreachMessages } = await schema();
      const job = await seedDeliveryJob({ organizationId: ws.organizationId, campaignId: ws.campaignId, leadId: warm, channel: "email" });
      const [message] = await (await db()).select().from(outreachMessages).where(eq(outreachMessages.id, job.messageId));
      await (await db()).insert(inboundReplies).values({
        id: crypto.randomUUID(), organizationId: ws.organizationId, campaignId: ws.campaignId, leadId: warm, sequenceId: message.sequenceId, outreachMessageId: message.id,
        provider: "mailbox", providerReplyId: "r1", channel: "email", fromAddress: "x@example.com", text: "tell me more", intent: "HOT", status: "classified", receivedAt: new Date(),
      });
      await campaign(ws);
      const settings = await import("./voice-settings");
      await settings.updateVoiceSettings(ws.actor, { maxConcurrentCalls: 1 });

      const dialer = fakeDialer();
      expect(await tick(dialer)).toMatchObject({ dialed: 1 });
      expect((dialer.dial.mock.calls[0]![0] as DialRequest).to).toBe("+14155550122");
      // The line is busy, so the next tick doesn't dial the second lead until the first ends.
      expect(await tick(dialer)).toMatchObject({ dialed: 0 });
      expect(cold).toBeTruthy();
    });

    it("stops at the platform-wide ceiling and waits, without failing or skipping anyone", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111", { name: "First Lead" });
      await lead(ws, "+14155550122", { name: "Second Lead" });
      await campaign(ws);

      const dialer = fakeDialer();
      // LiveKit limits agent sessions per project; with room for one call, only one is placed.
      expect(await tick(dialer, NOW, { platformMaxConcurrentCalls: 1 })).toMatchObject({ dialed: 1, skipped: 0, failed: 0 });
      expect(dialer.dial).toHaveBeenCalledTimes(1);
      // Still full on the next minute: nothing more is dialed, and the other lead is still queued.
      expect(await tick(dialer, NOW, { platformMaxConcurrentCalls: 1 })).toMatchObject({ dialed: 0, skipped: 0 });
      expect((await targets()).filter((target) => target.status === "queued")).toHaveLength(1);
    });

    it("dispatches the agent without restarting it, and leaves the answer time to the worker", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      await campaign(ws);
      await tick(fakeDialer());
      // The tick started before the phone rang, so it must not stamp an answer time of its own.
      const [call] = await calls();
      expect(call).toMatchObject({ status: "in_progress", answeredAt: null });
    });

    it("never dials two calls for one lead, even if two ticks run at once", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      await campaign(ws);
      const dialer = fakeDialer();
      await Promise.all([tick(dialer), tick(dialer)]);
      expect(dialer.dial).toHaveBeenCalledTimes(1);
      expect(await calls()).toHaveLength(1);
    });

    it("stops at the daily call limit", async () => {
      const ws = await workspace();
      for (let index = 0; index < 3; index += 1) await lead(ws, `+1415555020${index}`, { name: `Lead ${index}` });
      await campaign(ws);
      const settings = await import("./voice-settings");
      await settings.updateVoiceSettings(ws.actor, { maxConcurrentCalls: 10, dailyCallLimit: 2 });
      expect(await tick(fakeDialer())).toMatchObject({ dialed: 2 });
      expect(await tick(fakeDialer())).toMatchObject({ dialed: 0 });
    });

    it("does nothing while voice is paused, the line is disconnected, or the campaign isn't running", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      const { id } = await campaign(ws);
      const settings = await import("./voice-settings");
      const m = await import("./voice-campaigns");

      await settings.pauseVoice(ws.actor, "Reviewing");
      expect(await tick(fakeDialer())).toMatchObject({ dialed: 0 });
      await settings.resumeVoice(ws.actor);
      await settings.disconnectTelephony(ws.actor);
      expect(await tick(fakeDialer())).toMatchObject({ dialed: 0 });
      await settings.connectTelephony(ws.actor, settings.telephonyInputSchema.parse({ sipAddress: "acme.pstn.twilio.com", username: "u", password: "p", callerNumber: "+14155550100" }), fakeDialer());
      await m.pauseVoiceCampaign(ws.actor, id);
      const dialer = fakeDialer();
      expect(await tick(dialer)).toMatchObject({ dialed: 0 });
      expect(dialer.dial).not.toHaveBeenCalled();
    });
  });

  // ---- The rules at the moment of dialing ---------------------------------------------------

  describe("rules checked at the moment of dialing", () => {
    it("drops a lead whose consent was withdrawn after they were added", async () => {
      const ws = await workspace();
      const leadId = await lead(ws, "+14155550111");
      await campaign(ws);
      const { revokeCallConsent } = await import("./voice-consent");
      await revokeCallConsent(ws.actor, leadId, "They emailed to withdraw");
      const dialer = fakeDialer();
      expect(await tick(dialer)).toMatchObject({ dialed: 0, skipped: 1 });
      expect(dialer.dial).not.toHaveBeenCalled();
      expect((await targets())[0]).toMatchObject({ status: "skipped", skipReason: "No current call consent." });
    });

    it("drops a lead who opted out of email, and a number on the do-not-call list", async () => {
      const ws = await workspace();
      const optedOut = await lead(ws, "+14155550111", { name: "Opted Out" });
      await lead(ws, "+14155550122", { name: "Blocked Number" });
      await campaign(ws);
      const { leads, voiceDoNotCall } = await schema();
      await (await db()).update(leads).set({ doNotContact: true, status: "suppressed" }).where(eq(leads.id, optedOut));
      await (await db()).insert(voiceDoNotCall).values({ id: crypto.randomUUID(), organizationId: ws.organizationId, phone: "+14155550122", reason: "asked" });
      const dialer = fakeDialer();
      expect(await tick(dialer)).toMatchObject({ dialed: 0, skipped: 2 });
      expect(dialer.dial).not.toHaveBeenCalled();
      expect((await targets()).map((target) => target.skipReason).sort()).toEqual(["Asked not to be contacted.", "This number asked not to be called."]);
    });

    it("holds a call outside the person's calling hours and reschedules it to the next opening", async () => {
      const ws = await workspace();
      // 15:00 UTC is 00:00 the next day in Tokyo, far outside 09:00-17:00.
      await lead(ws, "+81312345678", { timezone: "Asia/Tokyo" });
      await campaign(ws);
      const dialer = fakeDialer();
      expect(await tick(dialer)).toMatchObject({ dialed: 0, rescheduled: 1 });
      expect(dialer.dial).not.toHaveBeenCalled();
      // Wednesday 09:00 Tokyo = Tuesday 2030-01-15 00:00 UTC... which is before NOW; the next opening is Wednesday 09:00 JST.
      const [target] = await targets();
      expect(target.status).toBe("queued");
      expect(target.nextAttemptAt.getTime()).toBeGreaterThan(NOW.getTime());
      expect(target.nextAttemptAt.toISOString()).toBe("2030-01-16T00:00:00.000Z");
    });

    it("uses each lead's own time zone: one is called, the other waits", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111", { timezone: "America/New_York", name: "In Hours" });
      await lead(ws, "+14155550122", { timezone: "Asia/Tokyo", name: "Asleep" });
      await campaign(ws);
      const dialer = fakeDialer();
      expect(await tick(dialer)).toMatchObject({ dialed: 1, rescheduled: 1 });
      expect((dialer.dial.mock.calls[0]![0] as DialRequest).to).toBe("+14155550111");
    });

    it("pauses the campaign instead of dialing when the minutes have run out", async () => {
      const ws = await workspace({ minutes: 1 });
      await lead(ws, "+14155550111");
      const { id } = await campaign(ws);
      const dialer = fakeDialer();
      expect(await tick(dialer)).toMatchObject({ dialed: 0, pausedCampaigns: 1 });
      expect(dialer.dial).not.toHaveBeenCalled();
      const { voiceCampaigns } = await schema();
      const [row] = await (await db()).select().from(voiceCampaigns).where(eq(voiceCampaigns.id, id));
      expect(row).toMatchObject({ status: "paused" });
      expect(row.pausedReason).toMatch(/used all your voice minutes/);
    });

    it("pauses the campaign when the paid add-on lapses, whatever minutes remain", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      const { id } = await campaign(ws);
      const { grantVoiceTopUp, setVoiceAddon } = await import("./voice-credits");
      await grantVoiceTopUp({ organizationId: ws.organizationId, purchaseKey: "cs_left", minutes: 60 });
      await setVoiceAddon({ organizationId: ws.organizationId, active: false, monthlySeconds: 0, periodStart: null, periodEnd: null });
      const dialer = fakeDialer();
      expect(await tick(dialer)).toMatchObject({ dialed: 0, pausedCampaigns: 1 });
      expect(dialer.dial).not.toHaveBeenCalled();
      const { voiceCampaigns } = await schema();
      const [row] = await (await db()).select().from(voiceCampaigns).where(eq(voiceCampaigns.id, id));
      expect(row.pausedReason).toMatch(/add-on isn't active/);
    });

    it("caps a call at the minutes that are left", async () => {
      const ws = await workspace({ minutes: 4 });
      await lead(ws, "+14155550111");
      await campaign(ws);
      const dialer = fakeDialer();
      await tick(dialer);
      expect((dialer.dial.mock.calls[0]![0] as DialRequest).metadata.maxSeconds).toBe(240);
    });
  });

  // ---- When nobody answers ------------------------------------------------------------------

  describe("unanswered calls", () => {
    it("ends as no answer, charges nothing, and retries in the afternoon a day later", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      await campaign(ws);
      const dialer = fakeDialer(() => ({ status: "not_answered", room: "r", reason: "busy" }));
      expect(await tick(dialer)).toMatchObject({ dialed: 0, unanswered: 1 });

      const [call] = await calls();
      expect(call).toMatchObject({ status: "completed", outcome: "no_answer", billedSeconds: 0 });
      const [target] = await targets();
      expect(target).toMatchObject({ status: "queued", attempts: 1, lastOutcome: "no_answer" });
      // Wednesday 14:00 New York = 19:00 UTC.
      expect(target.nextAttemptAt.toISOString()).toBe("2030-01-16T19:00:00.000Z");
      const { getVoiceBalance } = await import("./voice-credits");
      expect((await getVoiceBalance(ws.organizationId, NOW)).availableSeconds).toBe(6_000);
    });

    it("gives up after the maximum number of attempts", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      await campaign(ws, { maxAttempts: 2 });
      const dialer = fakeDialer(() => ({ status: "not_answered", room: "r", reason: "no answer" }));
      await tick(dialer);
      const { voiceCallTargets } = await schema();
      await (await db()).update(voiceCallTargets).set({ nextAttemptAt: NOW });
      await tick(dialer);
      expect(dialer.dial).toHaveBeenCalledTimes(2);
      expect((await targets())[0]).toMatchObject({ status: "done", attempts: 2, lastOutcome: "no_answer" });
      const { voiceCampaigns } = await schema();
      expect((await (await db()).select().from(voiceCampaigns))[0]!.status).toBe("completed");
    });

    it("records a dial error as a failed call and tries again", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      await campaign(ws);
      const dialer = fakeDialer(() => { throw new Error("LiveKit unavailable"); });
      expect(await tick(dialer)).toMatchObject({ failed: 1 });
      const [call] = await calls();
      expect(call).toMatchObject({ status: "failed", outcome: "failed", billedSeconds: 0 });
      expect(call.flags.join(" ")).toMatch(/LiveKit unavailable/);
      expect((await targets())[0]!.status).toBe("queued");
    });
  });

  // ---- How a conversation ends -------------------------------------------------------------

  describe("finishing a call", () => {
    async function liveCall(options: { level?: "meetings" | "qualify" | "sell"; answeredSecondsAgo?: number } = {}) {
      const ws = await workspace();
      const leadId = await lead(ws, "+14155550111");
      const { id } = await campaign(ws, { level: options.level ?? "meetings" });
      await tick(fakeDialer());
      const [call] = await calls();
      const { voiceCalls } = await schema();
      await (await db()).update(voiceCalls).set({ answeredAt: new Date(NOW.getTime() - (options.answeredSecondsAgo ?? 125) * 1_000) }).where(eq(voiceCalls.id, call.id));
      return { ws, leadId, voiceCampaignId: id, callId: call.id };
    }
    const finish = async (callId: string, input: Partial<import("./voice-reports").FinalizeInput> & { outcome: import("../domain/voice").CallOutcome }) => {
      const { finalizeCall } = await import("./voice-reports");
      return finalizeCall({ callId, now: NOW, endedAt: NOW, ...input });
    };

    it("records the outcome and summary, charges the talk time, and flags it for review", async () => {
      const { ws, callId } = await liveCall({ answeredSecondsAgo: 125 });
      const result = await finish(callId, {
        outcome: "meeting_requested",
        summary: "Sam agreed to a meeting Thursday at 2pm ET.",
        callbackAt: new Date("2030-01-17T19:00:00Z"),
        transcript: [{ role: "agent", text: "Hi Sam" }, { role: "prospect", text: "Sure, Thursday works" }],
      });
      expect(result).toMatchObject({ outcome: "meeting_requested", billedSeconds: 125 });
      const [call] = await calls();
      expect(call).toMatchObject({ status: "completed", outcome: "meeting_requested", durationSeconds: 125, billedSeconds: 125, reviewStatus: "unreviewed" });
      expect(call.summary).toMatch(/Thursday at 2pm/);
      expect(call.transcript).toHaveLength(2);
      expect(call.flags.join(" ")).toMatch(/Needs a look: Meeting agreed/);
      expect((await targets())[0]).toMatchObject({ status: "done", lastOutcome: "meeting_requested" });
      const { getVoiceBalance } = await import("./voice-credits");
      expect((await getVoiceBalance(ws.organizationId, NOW)).availableSeconds).toBe(6_000 - 125);
    });

    it("never charges a call nobody answered, a voicemail or a failure, whatever times arrive", async () => {
      const { getVoiceBalance } = await import("./voice-credits");
      for (const outcome of ["no_answer", "voicemail", "failed"] as const) {
        const { ws, callId } = await liveCall({ answeredSecondsAgo: 300 });
        await finish(callId, { outcome });
        const call = (await calls()).find((row) => row.id === callId)!;
        expect(call.billedSeconds).toBe(0);
        expect((await getVoiceBalance(ws.organizationId, NOW)).availableSeconds).toBe(6_000);
        await truncateAllTables();
      }
    });

    it("ends the campaign once its last lead is finished", async () => {
      const { callId } = await liveCall();
      await finish(callId, { outcome: "not_interested" });
      const { voiceCampaigns } = await schema();
      expect((await (await db()).select().from(voiceCampaigns))[0]!.status).toBe("completed");
    });

    it("treats a stop request in the transcript as do-not-call, whatever the agent concluded", async () => {
      const { ws, leadId, callId } = await liveCall();
      const second = await lead(ws, "+14155550111", { name: "Same Number Other Lead", consent: false });
      expect(second).toBeTruthy();
      await finish(callId, {
        outcome: "interested",
        transcript: [{ role: "agent", text: "Do you have a minute?" }, { role: "prospect", text: "Please don't call me again." }],
      });

      const [call] = await calls();
      expect(call.outcome).toBe("do_not_call");
      expect(call.flags.join(" ")).toMatch(/asked to stop/);
      const { voiceDoNotCall, leads, callConsents } = await schema();
      expect(await (await db()).select().from(voiceDoNotCall)).toHaveLength(1);
      const [theLead] = await (await db()).select().from(leads).where(eq(leads.id, leadId));
      expect(theLead).toMatchObject({ doNotContact: true, status: "suppressed" });
      const consent = (await (await db()).select().from(callConsents).where(eq(callConsents.leadId, leadId)))[0]!;
      expect(consent.status).toBe("revoked");
      expect((await targets()).find((target) => target.leadId === leadId)).toMatchObject({ status: "done", lastOutcome: "do_not_call" });
    });

    it("stops other queued calls to that number and the lead's email sequence too", async () => {
      const { ws, leadId, callId } = await liveCall();
      const job = await seedDeliveryJob({ organizationId: ws.organizationId, campaignId: ws.campaignId, leadId, channel: "email" });
      await finish(callId, { outcome: "do_not_call" });
      const { deliveryJobs } = await schema();
      const [emailJob] = await (await db()).select().from(deliveryJobs).where(eq(deliveryJobs.id, job.jobId));
      expect(emailJob!.status).toBe("cancelled");
    });

    it("folds an outcome beyond the campaign's level back and says so", async () => {
      const { callId } = await liveCall({ level: "meetings" });
      await finish(callId, { outcome: "deal_progressed", summary: "They want a proposal." });
      const [call] = await calls();
      expect(call.outcome).toBe("meeting_requested");
      expect(call.flags.join(" ")).toMatch(/beyond this campaign's level/);
    });

    it("lets the sales level record a deal moving forward", async () => {
      const { callId } = await liveCall({ level: "sell" });
      await finish(callId, { outcome: "deal_progressed", summary: "Agreed to a 14-day trial; proposal to follow." });
      expect((await calls())[0]!.outcome).toBe("deal_progressed");
    });

    it("never charges for a call that was never answered, even if the agent claims a conversation", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      await campaign(ws);
      await tick(fakeDialer());
      const [call] = await calls();
      const { voiceCalls } = await schema();
      await (await db()).update(voiceCalls).set({ answeredAt: null }).where(eq(voiceCalls.id, call.id));
      await finish(call.id, { outcome: "interested" });
      expect((await calls())[0]).toMatchObject({ outcome: "no_answer", billedSeconds: 0 });
    });

    it("requeues a callback at the requested time inside the window, without using up an attempt", async () => {
      const { callId } = await liveCall();
      await finish(callId, { outcome: "callback_requested", callbackAt: new Date("2030-01-16T18:30:00Z") });
      expect((await targets())[0]).toMatchObject({ status: "queued", attempts: 0, lastOutcome: "callback_requested" });
      expect((await targets())[0]!.nextAttemptAt.toISOString()).toBe("2030-01-16T18:30:00.000Z");
    });

    it("moves a callback asked for after hours to the next morning", async () => {
      const { callId } = await liveCall();
      await finish(callId, { outcome: "callback_requested", callbackAt: new Date("2030-01-16T23:30:00Z") });
      expect((await targets())[0]!.nextAttemptAt.toISOString()).toBe("2030-01-17T14:00:00.000Z");
    });

    it("is safe to report twice", async () => {
      const { ws, callId } = await liveCall({ level: "qualify", answeredSecondsAgo: 130 });
      await finish(callId, { outcome: "qualified", summary: "A fit." });
      const again = await finish(callId, { outcome: "not_interested" });
      expect(again).toMatchObject({ alreadyFinished: true });
      expect((await calls())[0]).toMatchObject({ outcome: "qualified" });
      const { getVoiceBalance } = await import("./voice-credits");
      expect((await getVoiceBalance(ws.organizationId, NOW)).availableSeconds).toBe(6_000 - 130);
    });

    it("caps what is charged at the 15-minute call limit", async () => {
      const { callId } = await liveCall({ answeredSecondsAgo: 3_000 });
      await finish(callId, { outcome: "interested" });
      expect((await calls())[0]).toMatchObject({ durationSeconds: 900, billedSeconds: 900 });
    });
  });

  // ---- Rescuing calls whose worker vanished ----------------------------------------------------

  describe("stale calls", () => {
    it("ends a call that was never reported, charges nothing, and retries the person", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      await campaign(ws);
      await tick(fakeDialer());
      const { voiceCalls } = await schema();
      const [call] = await calls();
      await (await db()).update(voiceCalls).set({ answeredAt: new Date(NOW.getTime() - 30 * 60_000), startedAt: new Date(NOW.getTime() - 30 * 60_000) }).where(eq(voiceCalls.id, call.id));
      const { reapStaleCalls } = await import("./voice-reports");
      expect(await reapStaleCalls(NOW)).toEqual({ reaped: 1 });
      expect((await calls())[0]).toMatchObject({ status: "failed", outcome: "failed", billedSeconds: 0 });
      expect((await calls())[0]!.flags.join(" ")).toMatch(/No report was received/);
      expect((await targets())[0]!.status).toBe("queued");
    });

    it("leaves a call that is still within its time alone", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      await campaign(ws);
      await tick(fakeDialer());
      const { reapStaleCalls } = await import("./voice-reports");
      expect(await reapStaleCalls(new Date(NOW.getTime() + 60_000))).toEqual({ reaped: 0 });
    });
  });

  // ---- Reports from the voice worker -----------------------------------------------------------

  describe("worker reports", () => {
    it("accepts only reports signed with the shared secret, within five minutes", async () => {
      const { signWorkerReport, verifyWorkerReport } = await import("./voice-reports");
      const body = JSON.stringify({ event: "answered", callId: crypto.randomUUID() });
      const timestamp = String(NOW.getTime());
      const signature = signWorkerReport("shh", timestamp, body);
      const check = (overrides: Partial<Parameters<typeof verifyWorkerReport>[0]> = {}) =>
        verifyWorkerReport({ secret: "shh", timestamp, signature, body, now: NOW, ...overrides });
      expect(check()).toBe(true);
      expect(check({ secret: "other" })).toBe(false);
      expect(check({ body: body.replace("answered", "completed") })).toBe(false);
      expect(check({ signature: signature.slice(0, -2) + "00" })).toBe(false);
      expect(check({ now: new Date(NOW.getTime() + 6 * 60_000) })).toBe(false);
      expect(check({ timestamp: "soon" })).toBe(false);
      expect(check({ secret: undefined })).toBe(false);
      expect(check({ signature: null })).toBe(false);
      expect(check({ signature: "zz" })).toBe(false);
    });

    it("validates the report shape", async () => {
      const { workerReportSchema } = await import("./voice-reports");
      const callId = crypto.randomUUID();
      expect(workerReportSchema.safeParse({ event: "answered", callId }).success).toBe(true);
      expect(workerReportSchema.safeParse({ event: "completed", callId, outcome: "meeting_requested" }).success).toBe(true);
      expect(workerReportSchema.safeParse({ event: "completed", callId, outcome: "made_up" }).success).toBe(false);
      expect(workerReportSchema.safeParse({ event: "completed", callId: "nope", outcome: "qualified" }).success).toBe(false);
      expect(workerReportSchema.safeParse({ event: "exploded", callId }).success).toBe(false);
    });

    it("applies an answered report and then a completed report", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      await campaign(ws, { level: "qualify" });
      await tick(fakeDialer());
      const [call] = await calls();
      const { applyWorkerReport } = await import("./voice-reports");
      await applyWorkerReport({ event: "answered", callId: call.id, answeredAt: new Date(NOW.getTime() - 200_000).toISOString() }, NOW);
      await applyWorkerReport({ event: "completed", callId: call.id, outcome: "qualified", summary: "Good fit; budget approved.", endedAt: NOW.toISOString(), transcript: [{ role: "prospect", text: "Yes we have budget" }] }, NOW);
      expect((await calls())[0]).toMatchObject({ status: "completed", outcome: "qualified", durationSeconds: 200, billedSeconds: 200 });
    });

    it("ignores a report for a call that doesn't exist", async () => {
      const { applyWorkerReport } = await import("./voice-reports");
      expect(await applyWorkerReport({ event: "completed", callId: crypto.randomUUID(), outcome: "qualified", transcript: [] }, NOW)).toEqual({ found: false });
    });
  });

  // ---- Setting a campaign up ---------------------------------------------------------------------

  describe("campaigns", () => {
    it("only adds leads that can lawfully be called, and says why the others were left out", async () => {
      const ws = await workspace();
      const ok = await lead(ws, "+14155550111", { name: "Consented" });
      await lead(ws, "+14155550122", { consent: false, name: "No Consent" });
      await seedLead(ws.organizationId, ws.campaignId, { phone: "555-0100", personName: "Bad Number" });
      const optedOut = await seedLead(ws.organizationId, ws.campaignId, { phone: "+14155550133", personName: "Opted Out" });
      const { leads, voiceDoNotCall } = await schema();
      await (await db()).update(leads).set({ doNotContact: true }).where(eq(leads.id, optedOut));
      const blocked = await lead(ws, "+14155550144", { name: "Blocked" });
      await (await db()).insert(voiceDoNotCall).values({ id: crypto.randomUUID(), organizationId: ws.organizationId, phone: "+14155550144", reason: "asked" });
      const duplicate = await lead(ws, "+14155550111", { name: "Duplicate Number" });

      const { added } = await campaign(ws, { start: false });
      expect(added.added).toBe(1);
      expect(added.skipped.map((item) => item.reason).sort()).toEqual([
        "Another lead already uses this number.",
        "Asked not to be contacted.",
        "No call consent recorded.",
        "No phone number in international format.",
        "This number asked not to be called.",
      ].sort());
      expect((await targets())[0]!.leadId).toBe(ok);
      expect(blocked).toBeTruthy();
      expect(duplicate).toBeTruthy();
    });

    it("won't be approved until the add-on, phone line, attestation and a lead are all in place", async () => {
      const { organizationId, userId } = await seedOrganization();
      const actor: ApiActor = { userId, organizationId, organizationRole: "admin" };
      const campaignId = await seedCampaign(organizationId, userId);
      const m = await import("./voice-campaigns");
      const id = await m.createVoiceCampaign(actor, m.voiceCampaignInputSchema.parse({
        campaignId, name: "Q1", level: "qualify", playbook: { productFacts: "Acme Widget cuts month-end close from eight days to two for finance teams." },
      }));
      const blockers = await m.approvalBlockers(organizationId, id);
      expect(blockers).toHaveLength(4);
      expect(blockers.join(" ")).toMatch(/paid add-on/);
      expect(blockers.join(" ")).toMatch(/Connect your Twilio phone line/);
      expect(blockers.join(" ")).toMatch(/have consented/);
      expect(blockers.join(" ")).toMatch(/at least one lead/);
      await expect(m.approveVoiceCampaign(actor, id)).rejects.toThrow(/paid add-on/);
    });

    it("approves and starts a campaign that is ready, and needs approval before starting", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      const m = await import("./voice-campaigns");
      const { id } = await campaign(ws, { start: false });
      await expect(m.startVoiceCampaign(ws.actor, id)).rejects.toThrow(/Approve the campaign/);
      await m.approveVoiceCampaign(ws.actor, id);
      await m.startVoiceCampaign(ws.actor, id);
      expect((await m.listVoiceCampaigns(ws.organizationId))[0]).toMatchObject({ status: "running", targets: { queued: 1 } });
    });

    it("takes a campaign back to draft when it's edited, so what runs is what was approved", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      const m = await import("./voice-campaigns");
      const { id } = await campaign(ws, { start: false });
      await m.approveVoiceCampaign(ws.actor, id);
      await m.updateVoiceCampaign(ws.actor, id, { level: "sell" });
      const [row] = await m.listVoiceCampaigns(ws.organizationId);
      expect(row).toMatchObject({ status: "draft", level: "sell", approvedAt: null });
      await expect(m.startVoiceCampaign(ws.actor, id)).rejects.toThrow(/Approve the campaign/);
      await m.approveVoiceCampaign(ws.actor, id);
      await m.startVoiceCampaign(ws.actor, id);
      await expect(m.updateVoiceCampaign(ws.actor, id, { name: "Renamed" })).rejects.toThrow(/Pause the campaign/);
    });

    it("cancels a campaign and drops its waiting calls", async () => {
      const ws = await workspace();
      await lead(ws, "+14155550111");
      const m = await import("./voice-campaigns");
      const { id } = await campaign(ws);
      await m.cancelVoiceCampaign(ws.actor, id);
      expect((await targets())[0]).toMatchObject({ status: "skipped", skipReason: "Campaign cancelled" });
      const dialer = fakeDialer();
      await tick(dialer);
      expect(dialer.dial).not.toHaveBeenCalled();
    });

    it("lets only an admin or reviewer manage voice campaigns", async () => {
      const ws = await workspace();
      const m = await import("./voice-campaigns");
      const member: ApiActor = { ...ws.actor, organizationRole: "member" };
      await expect(m.createVoiceCampaign(member, m.voiceCampaignInputSchema.parse({
        campaignId: ws.campaignId, name: "Q1", level: "meetings", playbook: { productFacts: "Acme Widget cuts month-end close from eight days to two for finance teams." },
      }))).rejects.toThrow(/Admin or reviewer/);
    });

    it("keeps one workspace's campaigns away from another's", async () => {
      const ws = await workspace();
      const other = await workspace();
      const m = await import("./voice-campaigns");
      const { id } = await campaign(ws, { start: false });
      await expect(m.approveVoiceCampaign(other.actor, id)).rejects.toThrow(/wasn't found/);
      await expect(m.createVoiceCampaign(other.actor, m.voiceCampaignInputSchema.parse({
        campaignId: ws.campaignId, name: "Sneaky", level: "meetings", playbook: { productFacts: "Acme Widget cuts month-end close from eight days to two for finance teams." },
      }))).rejects.toThrow(/outreach campaign wasn't found/);
    });
  });
});
