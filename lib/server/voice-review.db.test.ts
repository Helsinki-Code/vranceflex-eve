import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "./api-actor";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedLead, seedOrganization } from "./test-support/seed";

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64url");

async function schema() { return import("./database/schema"); }
async function db() { return (await import("./database")).getDatabase(); }

describe.skipIf(!hasTestDatabase)("after-call review", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    await truncateAllTables();
  });

  /** A voice campaign with a lead, and a call in any state, inserted directly. */
  async function setup(callOverrides: Partial<typeof import("./database/schema").voiceCalls.$inferInsert> = {}, level: "meetings" | "qualify" | "sell" = "qualify") {
    const { organizationId, userId } = await seedOrganization();
    const actor: ApiActor = { userId, organizationId, organizationRole: "admin" };
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId, { phone: "+14155550111", personName: "Sam Example" });
    const { voiceCampaigns, voiceCallTargets, voiceCalls } = await schema();
    const voiceCampaignId = crypto.randomUUID();
    const targetId = crypto.randomUUID();
    await (await db()).insert(voiceCampaigns).values({ id: voiceCampaignId, organizationId, campaignId, name: "Q1 calls", level, playbook: {}, status: "running" });
    await (await db()).insert(voiceCallTargets).values({ id: targetId, organizationId, voiceCampaignId, leadId, phone: "+14155550111", status: "in_progress", attempts: 1, nextAttemptAt: new Date() });
    const makeCall = async (overrides: Partial<typeof voiceCalls.$inferInsert> = {}) => {
      const id = crypto.randomUUID();
      await (await db()).insert(voiceCalls).values({ id, organizationId, voiceCampaignId, targetId, leadId, phone: "+14155550111", level, status: "completed", ...callOverrides, ...overrides });
      return id;
    };
    const callId = await makeCall(callOverrides);
    return { organizationId, userId, actor, campaignId, leadId, voiceCampaignId, targetId, callId, makeCall };
  }

  it("lists calls that need a person first, and the rest on request", async () => {
    const ws = await setup({ outcome: "meeting_requested", summary: "Meeting Thursday." });
    await ws.makeCall({ outcome: "no_answer" });
    await ws.makeCall({ outcome: "not_interested" });
    await ws.makeCall({ outcome: "qualified", reviewStatus: "reviewed" });
    const { listCalls } = await import("./voice-calls");

    const queue = await listCalls(ws.organizationId);
    expect(queue.needsReview).toBe(1);
    expect(queue.calls.map((call) => call.outcome)).toEqual(["meeting_requested"]);
    expect(queue.calls[0]).toMatchObject({ personName: "Sam Example", campaignName: "Q1 calls", summary: "Meeting Thursday." });

    expect((await listCalls(ws.organizationId, { filter: "all" })).calls).toHaveLength(4);
    expect((await listCalls(ws.organizationId, { filter: "not_interested" })).calls).toHaveLength(1);
  });

  it("returns the transcript for one call, and refuses another workspace's", async () => {
    const ws = await setup({ outcome: "interested", transcript: [{ role: "agent", text: "Hi Sam" }, { role: "prospect", text: "Hello" }] });
    const other = await setup();
    const { getCall } = await import("./voice-calls");
    expect((await getCall(ws.organizationId, ws.callId)).transcript).toHaveLength(2);
    await expect(getCall(other.organizationId, ws.callId)).rejects.toThrow(/wasn't found/);
  });

  it("marks a call reviewed with a note, takes it off the queue, and can reopen it", async () => {
    const ws = await setup({ outcome: "meeting_requested" });
    const { reviewCall, listCalls, getCall } = await import("./voice-calls");
    await reviewCall(ws.actor, ws.callId, { reviewed: true, note: "Booked in the calendar." });
    expect((await listCalls(ws.organizationId)).needsReview).toBe(0);
    expect(await getCall(ws.organizationId, ws.callId)).toMatchObject({ reviewStatus: "reviewed", reviewNote: "Booked in the calendar." });
    await reviewCall(ws.actor, ws.callId, { reviewed: false });
    expect((await listCalls(ws.organizationId)).needsReview).toBe(1);

    const { auditEvents } = await schema();
    const actions = (await (await db()).select().from(auditEvents).where(eq(auditEvents.organizationId, ws.organizationId))).map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining(["voice.call_reviewed", "voice.call_review_reopened"]));
  });

  it("won't let one workspace review another's call", async () => {
    const ws = await setup({ outcome: "meeting_requested" });
    const other = await setup();
    const { reviewCall } = await import("./voice-calls");
    await expect(reviewCall(other.actor, ws.callId, { reviewed: true })).rejects.toThrow(/wasn't found/);
  });

  it("shows each lead's consent state and whether they're already in the campaign", async () => {
    const ws = await setup();
    const { recordCallConsent } = await import("./voice-consent");
    const noConsent = await seedLead(ws.organizationId, ws.campaignId, { phone: "+14155550122", personName: "No Consent" });
    const noPhone = await seedLead(ws.organizationId, ws.campaignId, { personName: "No Phone" });
    const { leads } = await schema();
    await (await db()).update(leads).set({ phone: null }).where(eq(leads.id, noPhone));
    await recordCallConsent(ws.actor, { leadId: ws.leadId, source: "web_form", evidence: "Agreed on our website form on 2030-01-10 to an AI voice call." });
    const { listCallableLeads } = await import("./voice-calls");
    const list = await listCallableLeads(ws.organizationId, ws.voiceCampaignId);
    expect(list.map((lead) => lead.personName).sort()).toEqual(["No Consent", "Sam Example"]);
    expect(list.find((lead) => lead.leadId === ws.leadId)).toMatchObject({ consent: "granted", inCampaign: true });
    expect(list.find((lead) => lead.leadId === noConsent)).toMatchObject({ consent: "none", inCampaign: false });
  });

  describe("the worker report endpoint", () => {
    const SECRET = "worker-secret";
    async function post(body: string, headers: Record<string, string> = {}) {
      const { POST } = await import("../../app/api/voice/worker/report/route");
      return POST(new Request("https://app.example.com/api/voice/worker/report", { method: "POST", body, headers }));
    }
    async function signed(body: string, overrides: { secret?: string; timestamp?: string } = {}) {
      const { signWorkerReport } = await import("./voice-reports");
      const timestamp = overrides.timestamp ?? String(Date.now());
      return { "x-vranceflex-timestamp": timestamp, "x-vranceflex-signature": signWorkerReport(overrides.secret ?? SECRET, timestamp, body) };
    }

    it("records a signed report and ends the call", async () => {
      vi.stubEnv("VOICE_WORKER_SECRET", SECRET);
      const ws = await setup({ status: "in_progress", answeredAt: new Date(Date.now() - 100_000), outcome: null });
      const body = JSON.stringify({ event: "completed", callId: ws.callId, outcome: "qualified", summary: "A fit.", endedAt: new Date().toISOString(), transcript: [] });
      const response = await post(body, await signed(body));
      expect(response.status).toBe(200);
      const { voiceCalls } = await schema();
      const [call] = await (await db()).select().from(voiceCalls).where(eq(voiceCalls.id, ws.callId));
      expect(call).toMatchObject({ status: "completed", outcome: "qualified" });
    });

    it("refuses anything without a valid signature, and changes nothing", async () => {
      vi.stubEnv("VOICE_WORKER_SECRET", SECRET);
      const ws = await setup({ status: "in_progress", outcome: null });
      const body = JSON.stringify({ event: "completed", callId: ws.callId, outcome: "qualified", transcript: [] });
      const stale = String(Date.now() - 10 * 60_000);

      expect((await post(body)).status).toBe(401);
      expect((await post(body, await signed(body, { secret: "wrong" }))).status).toBe(401);
      expect((await post(body, await signed(body, { timestamp: stale }))).status).toBe(401);
      const goodHeaders = await signed(body);
      expect((await post(body.replace("qualified", "interested"), goodHeaders)).status).toBe(401);

      const { voiceCalls } = await schema();
      const [call] = await (await db()).select().from(voiceCalls).where(eq(voiceCalls.id, ws.callId));
      expect(call.status).toBe("in_progress");
    });

    it("refuses everything when no secret is configured", async () => {
      vi.stubEnv("VOICE_WORKER_SECRET", "");
      const body = JSON.stringify({ event: "answered", callId: crypto.randomUUID() });
      expect((await post(body, await signed(body, { secret: "" }))).status).toBe(401);
    });

    it("rejects a signed but malformed report", async () => {
      vi.stubEnv("VOICE_WORKER_SECRET", SECRET);
      const body = JSON.stringify({ event: "completed", callId: "not-a-uuid", outcome: "qualified" });
      expect((await post(body, await signed(body))).status).toBe(400);
      const junk = "not json";
      expect((await post(junk, await signed(junk))).status).toBe(400);
    });

    it("accepts the same report twice, charging once", async () => {
      vi.stubEnv("VOICE_WORKER_SECRET", SECRET);
      const ws = await setup({ status: "in_progress", answeredAt: new Date(Date.now() - 100_000), outcome: null });
      const { grantVoiceTopUp, getVoiceBalance } = await import("./voice-credits");
      await grantVoiceTopUp({ organizationId: ws.organizationId, purchaseKey: "cs_x", minutes: 10 });
      const body = JSON.stringify({ event: "completed", callId: ws.callId, outcome: "qualified", endedAt: new Date().toISOString(), transcript: [] });
      expect((await post(body, await signed(body))).status).toBe(200);
      expect((await post(body, await signed(body))).status).toBe(200);
      expect((await getVoiceBalance(ws.organizationId)).availableSeconds).toBeGreaterThan(600 - 105);
      expect((await getVoiceBalance(ws.organizationId)).availableSeconds).toBeLessThan(600 - 95);
    });
  });
});
