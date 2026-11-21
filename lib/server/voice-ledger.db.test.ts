import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "./api-actor";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedCampaign, seedLead, seedOrganization } from "./test-support/seed";
import type { VoiceDialer } from "./voice-dialer";

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64url");

const DAY = 86_400_000;
const actorFor = (organizationId: string, userId: string, organizationRole: ApiActor["organizationRole"] = "admin"): ApiActor => ({ userId, organizationId, organizationRole });
async function schema() { return import("./database/schema"); }
async function db() { return (await import("./database")).getDatabase(); }

describe.skipIf(!hasTestDatabase)("voice minutes", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it("has nothing without the add-on or a pack", async () => {
    const { organizationId } = await seedOrganization();
    const { getVoiceBalance, maxSecondsForNextCall } = await import("./voice-credits");
    expect(await getVoiceBalance(organizationId)).toMatchObject({ availableSeconds: 0, addonActive: false });
    expect(await maxSecondsForNextCall(organizationId)).toBe(0);
  });

  it("grants the included minutes once per period and lets them expire with it", async () => {
    const { organizationId } = await seedOrganization();
    const { setVoiceAddon, getVoiceBalance, syncVoiceAllowance } = await import("./voice-credits");
    const periodStart = new Date(Date.now() - 2 * DAY);
    const periodEnd = new Date(Date.now() + 28 * DAY);
    await setVoiceAddon({ organizationId, active: true, monthlySeconds: 100 * 60, periodStart, periodEnd });
    await syncVoiceAllowance(organizationId);
    await syncVoiceAllowance(organizationId);

    const balance = await getVoiceBalance(organizationId);
    expect(balance).toMatchObject({ availableSeconds: 6_000, includedSeconds: 6_000, packSeconds: 0, addonActive: true });
    expect(balance.nextExpiry?.toISOString()).toBe(periodEnd.toISOString());
    // After the period, nothing is left.
    expect((await getVoiceBalance(organizationId, new Date(periodEnd.getTime() + 1))).availableSeconds).toBe(0);
  });

  it("grants nothing when the add-on is off", async () => {
    const { organizationId } = await seedOrganization();
    const { setVoiceAddon, getVoiceBalance } = await import("./voice-credits");
    await setVoiceAddon({ organizationId, active: false, monthlySeconds: 6_000, periodStart: new Date(Date.now() - DAY), periodEnd: new Date(Date.now() + DAY) });
    expect((await getVoiceBalance(organizationId)).availableSeconds).toBe(0);
  });

  it("adds a purchased pack once, however many times the purchase is replayed", async () => {
    const { organizationId } = await seedOrganization();
    const { grantVoiceTopUp, getVoiceBalance } = await import("./voice-credits");
    expect((await grantVoiceTopUp({ organizationId, purchaseKey: "cs_1", minutes: 60 })).granted).toBe(true);
    expect((await grantVoiceTopUp({ organizationId, purchaseKey: "cs_1", minutes: 60 })).granted).toBe(false);
    expect(await getVoiceBalance(organizationId)).toMatchObject({ availableSeconds: 3_600, packSeconds: 3_600, includedSeconds: 0 });
  });

  it("spends included minutes before a pack, then the pack", async () => {
    const { organizationId } = await seedOrganization();
    const { setVoiceAddon, grantVoiceTopUp, settleCallSeconds, getVoiceBalance } = await import("./voice-credits");
    await setVoiceAddon({ organizationId, active: true, monthlySeconds: 600, periodStart: new Date(Date.now() - DAY), periodEnd: new Date(Date.now() + 29 * DAY) });
    await grantVoiceTopUp({ organizationId, purchaseKey: "cs_2", minutes: 10 });

    const first = await settleCallSeconds({ organizationId, callId: crypto.randomUUID(), seconds: 500 });
    expect(first).toMatchObject({ billedSeconds: 500, shortfallSeconds: 0 });
    expect(await getVoiceBalance(organizationId)).toMatchObject({ includedSeconds: 100, packSeconds: 600 });

    // The next call outlasts what's left of the included minutes and spills into the pack.
    const second = await settleCallSeconds({ organizationId, callId: crypto.randomUUID(), seconds: 250 });
    expect(second.billedSeconds).toBe(250);
    expect(await getVoiceBalance(organizationId)).toMatchObject({ includedSeconds: 0, packSeconds: 450 });
  });

  it("charges a call only once", async () => {
    const { organizationId } = await seedOrganization();
    const { grantVoiceTopUp, settleCallSeconds, getVoiceBalance } = await import("./voice-credits");
    await grantVoiceTopUp({ organizationId, purchaseKey: "cs_3", minutes: 10 });
    const callId = crypto.randomUUID();
    await settleCallSeconds({ organizationId, callId, seconds: 120 });
    const again = await settleCallSeconds({ organizationId, callId, seconds: 120 });
    expect(again).toMatchObject({ billedSeconds: 120, alreadySettled: true });
    expect((await getVoiceBalance(organizationId)).availableSeconds).toBe(480);
  });

  it("rounds a partial second up, charges nothing for zero, and reports a shortfall rather than going negative", async () => {
    const { organizationId } = await seedOrganization();
    const { grantVoiceTopUp, settleCallSeconds, getVoiceBalance } = await import("./voice-credits");
    await grantVoiceTopUp({ organizationId, purchaseKey: "cs_4", minutes: 1 });
    expect((await settleCallSeconds({ organizationId, callId: crypto.randomUUID(), seconds: 0 })).billedSeconds).toBe(0);
    expect((await settleCallSeconds({ organizationId, callId: crypto.randomUUID(), seconds: 10.2 })).billedSeconds).toBe(11);
    const over = await settleCallSeconds({ organizationId, callId: crypto.randomUUID(), seconds: 100 });
    expect(over).toMatchObject({ billedSeconds: 49, shortfallSeconds: 51 });
    expect((await getVoiceBalance(organizationId)).availableSeconds).toBe(0);
  });

  it("caps the next call at what's left, and won't start one with too little", async () => {
    const { organizationId } = await seedOrganization();
    const { grantVoiceTopUp, maxSecondsForNextCall, settleCallSeconds } = await import("./voice-credits");
    await grantVoiceTopUp({ organizationId, purchaseKey: "cs_5", minutes: 60 });
    expect(await maxSecondsForNextCall(organizationId)).toBe(900); // never longer than 15 minutes
    await settleCallSeconds({ organizationId, callId: crypto.randomUUID(), seconds: 3_600 - 300 });
    expect(await maxSecondsForNextCall(organizationId)).toBe(300);
    await settleCallSeconds({ organizationId, callId: crypto.randomUUID(), seconds: 200 });
    expect(await maxSecondsForNextCall(organizationId)).toBe(0); // 100s left, under the 120s minimum
  });

  it("never spends a grant that has expired or hasn't started", async () => {
    const { organizationId } = await seedOrganization();
    const { grantVoiceSeconds, getVoiceBalance } = await import("./voice-credits");
    await grantVoiceSeconds({ organizationId, source: "adjustment", sourceKey: "old", seconds: 600, validFrom: new Date(Date.now() - 10 * DAY), expiresAt: new Date(Date.now() - DAY) });
    await grantVoiceSeconds({ organizationId, source: "adjustment", sourceKey: "future", seconds: 600, validFrom: new Date(Date.now() + DAY), expiresAt: new Date(Date.now() + 30 * DAY) });
    expect((await getVoiceBalance(organizationId)).availableSeconds).toBe(0);
  });

  it("shares one pool across a workspace family", async () => {
    const parent = await seedOrganization("Parent");
    const child = await seedOrganization("Child");
    const { organizations } = await schema();
    await (await db()).update(organizations).set({ billingOrganizationId: parent.organizationId }).where(eq(organizations.id, child.organizationId));
    const { grantVoiceTopUp, getVoiceBalance } = await import("./voice-credits");
    await grantVoiceTopUp({ organizationId: parent.organizationId, purchaseKey: "cs_6", minutes: 10 });
    expect((await getVoiceBalance(child.organizationId)).availableSeconds).toBe(600);
  });
});

describe.skipIf(!hasTestDatabase)("call consent", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  async function setup(phone: string | null = "+14155550100") {
    const { organizationId, userId } = await seedOrganization();
    const campaignId = await seedCampaign(organizationId, userId);
    const leadId = await seedLead(organizationId, campaignId, { phone: phone ?? undefined });
    if (phone === null) {
      const { leads } = await schema();
      await (await db()).update(leads).set({ phone: null }).where(eq(leads.id, leadId));
    }
    return { organizationId, userId, leadId, actor: actorFor(organizationId, userId) };
  }
  const evidence = "Agreed on our website form on 2030-01-10 to receive a call from an AI voice assistant.";

  it("records consent with where and when, and recognises it", async () => {
    const { actor, organizationId, leadId } = await setup();
    const { recordCallConsent, hasCallConsent } = await import("./voice-consent");
    expect(await hasCallConsent(organizationId, leadId, "+14155550100")).toBe(false);
    await recordCallConsent(actor, { leadId, source: "web_form", evidence });
    expect(await hasCallConsent(organizationId, leadId, "+14155550100")).toBe(true);
    // Consent is for that number only.
    expect(await hasCallConsent(organizationId, leadId, "+14155550199")).toBe(false);
  });

  it("requires real evidence, a valid number, and a reviewer or admin", async () => {
    const { actor, leadId, organizationId, userId } = await setup();
    const { recordCallConsent, consentInputSchema } = await import("./voice-consent");
    expect(consentInputSchema.safeParse({ leadId, source: "web_form", evidence: "yes" }).success).toBe(false);
    await expect(recordCallConsent(actorFor(organizationId, userId, "member"), { leadId, source: "web_form", evidence })).rejects.toThrow(/Admin or reviewer/);
    const noPhone = await setup(null);
    await expect(recordCallConsent(noPhone.actor, { leadId: noPhone.leadId, source: "web_form", evidence })).rejects.toThrow(/international format/);
    expect(actor.organizationRole).toBe("admin");
  });

  it("won't record consent for a lead who opted out, or a number on the do-not-call list", async () => {
    const { actor, leadId, organizationId } = await setup();
    const { recordCallConsent } = await import("./voice-consent");
    const { voiceDoNotCall, leads } = await schema();
    await (await db()).insert(voiceDoNotCall).values({ id: crypto.randomUUID(), organizationId, phone: "+14155550100", reason: "asked" });
    await expect(recordCallConsent(actor, { leadId, source: "web_form", evidence })).rejects.toThrow(/asked not to be called/);

    const other = await setup("+14155550111");
    await (await db()).update(leads).set({ doNotContact: true }).where(eq(leads.id, other.leadId));
    await expect(recordCallConsent(other.actor, { leadId: other.leadId, source: "web_form", evidence })).rejects.toThrow(/asked not to be contacted/);
  });

  it("revokes consent, which stops it counting", async () => {
    const { actor, organizationId, leadId } = await setup();
    const { recordCallConsent, revokeCallConsent, hasCallConsent } = await import("./voice-consent");
    await recordCallConsent(actor, { leadId, source: "recorded_verbal", evidence });
    expect(await revokeCallConsent(actor, leadId, "They emailed to withdraw")).toEqual({ revoked: 1 });
    expect(await hasCallConsent(organizationId, leadId, "+14155550100")).toBe(false);
    expect(await revokeCallConsent(actor, leadId, "again")).toEqual({ revoked: 0 });
  });

  it("audits who recorded it", async () => {
    const { actor, organizationId, leadId, userId } = await setup();
    const { recordCallConsent } = await import("./voice-consent");
    await recordCallConsent(actor, { leadId, source: "existing_customer", evidence });
    const { auditEvents } = await schema();
    const events = (await (await db()).select().from(auditEvents).where(eq(auditEvents.organizationId, organizationId))).filter((event) => event.action === "voice.consent_recorded");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: userId, entityId: leadId, metadata: { source: "existing_customer" } });
  });

  it("converts numbers to international format or refuses them", async () => {
    const { toE164 } = await import("./voice-consent");
    expect(toE164("+1 (415) 555-0100")).toBe("+14155550100");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    for (const bad of ["4155550100", "555-0100", "", null, undefined, "+0123456", "+1"]) expect(toE164(bad)).toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)("voice settings", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });
  it("starts with safe defaults and no phone line", async () => {
    const { organizationId } = await seedOrganization();
    const { getVoiceSettings } = await import("./voice-settings");
    expect(await getVoiceSettings(organizationId)).toMatchObject({
      window: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }, voicePaused: false, consentAttestedAt: null, telephonyConnected: false,
    });
  });

  it("only lets an admin attest consent, and records it", async () => {
    const { organizationId, userId } = await seedOrganization();
    const { attestCallConsent, getVoiceSettings } = await import("./voice-settings");
    await expect(attestCallConsent(actorFor(organizationId, userId, "member"))).rejects.toThrow(/Admin permission/);
    const saved = await attestCallConsent(actorFor(organizationId, userId));
    expect(saved.consentAttestedAt).not.toBeNull();
    expect((await getVoiceSettings(organizationId)).consentAttestedAt).toBe(saved.consentAttestedAt);
  });

  it("keeps the calling window inside the legal hours", async () => {
    const { organizationId, userId } = await seedOrganization();
    const { updateVoiceSettings } = await import("./voice-settings");
    const admin = actorFor(organizationId, userId);
    await expect(updateVoiceSettings(admin, { callStart: "07:00" })).rejects.toThrow(/between 08:00 and 21:00/);
    await expect(updateVoiceSettings(admin, { callEnd: "22:00" })).rejects.toThrow(/between 08:00 and 21:00/);
    const saved = await updateVoiceSettings(admin, { callDays: [2, 4, 4], callStart: "08:30", callEnd: "20:00", maxConcurrentCalls: 5 });
    expect(saved).toMatchObject({ window: { days: [2, 4], start: "08:30", end: "20:00" }, maxConcurrentCalls: 5 });
  });

  it("connects a SIP trunk, stores the password encrypted, and never returns it", async () => {
    const { organizationId, userId } = await seedOrganization();
    const { connectTelephony, telephonyInputSchema, getSipConnection, getVoiceSettings } = await import("./voice-settings");
    const input = telephonyInputSchema.parse({ sipAddress: "sip:Acme.PSTN.twilio.com/", username: "caller", password: "s3cret-pass", callerNumber: "+1 415 555 0100" });
    expect(input.sipAddress).toBe("acme.pstn.twilio.com");
    const saved = await connectTelephony(actorFor(organizationId, userId), input);

    expect(saved).toMatchObject({ telephonyConnected: true, lineType: "sip", sipAddress: "acme.pstn.twilio.com", callerNumber: "+14155550100" });
    expect(JSON.stringify(saved)).not.toContain("s3cret-pass");
    const { voiceSettings } = await schema();
    const [row] = await (await db()).select().from(voiceSettings).where(eq(voiceSettings.organizationId, organizationId));
    expect(row.encryptedSipCredentials).not.toContain("s3cret-pass");
    expect(await getSipConnection(organizationId)).toEqual({ address: "acme.pstn.twilio.com", callerNumber: "+14155550100", username: "caller", password: "s3cret-pass" });
    expect((await getVoiceSettings(organizationId)).telephonyConnected).toBe(true);
  });

  it("replaces the details when reconnecting, accepts any carrier's SIP host, and rejects malformed details", async () => {
    const { organizationId, userId } = await seedOrganization();
    const { connectTelephony, telephonyInputSchema, getSipConnection } = await import("./voice-settings");
    const admin = actorFor(organizationId, userId);
    await connectTelephony(admin, telephonyInputSchema.parse({ sipAddress: "acme.pstn.twilio.com", username: "u", password: "p", callerNumber: "+14155550100" }));
    const telnyx = telephonyInputSchema.parse({ sipAddress: "sip.telnyx.com", username: "u2", password: "p2", callerNumber: "+14155550100" });
    expect(telnyx.sipAddress).toBe("sip.telnyx.com");
    await connectTelephony(admin, telnyx);
    expect(await getSipConnection(organizationId)).toMatchObject({ address: "sip.telnyx.com", username: "u2" });

    for (const bad of [
      { sipAddress: "nodots", username: "u", password: "p", callerNumber: "+14155550100" },
      { sipAddress: "bad host.example.com", username: "u", password: "p", callerNumber: "+14155550100" },
      { sipAddress: "acme.pstn.twilio.com", username: "", password: "p", callerNumber: "+14155550100" },
      { sipAddress: "acme.pstn.twilio.com", username: "u", password: "p", callerNumber: "4155550100" },
    ]) expect(telephonyInputSchema.safeParse(bad).success).toBe(false);
  });

  it("switches between a Twilio account and a SIP trunk, forgetting the other's credentials", async () => {
    const { organizationId, userId } = await seedOrganization();
    const settings = await import("./voice-settings");
    const admin = actorFor(organizationId, userId);
    await settings.connectTwilioLine(admin, settings.twilioLineInputSchema.parse({ accountSid: `AC${"a".repeat(32)}`, keySid: `SK${"b".repeat(32)}`, keySecret: "secret-secret-secret-1234", callerNumber: "+14155550100" }), async () => undefined);
    expect(await settings.getPhoneLine(organizationId)).toMatchObject({ type: "twilio" });
    await settings.connectTelephony(admin, settings.telephonyInputSchema.parse({ sipAddress: "sip.telnyx.com", username: "u", password: "p", callerNumber: "+14155550100" }));
    expect(await settings.getPhoneLine(organizationId)).toMatchObject({ type: "sip", sip: { address: "sip.telnyx.com" } });
    expect(await settings.getVoiceSettings(organizationId)).toMatchObject({ lineType: "sip", twilioAccountSid: null });
  });

  it("pauses and resumes voice, and disconnects the line", async () => {
    const { organizationId, userId } = await seedOrganization();
    const { pauseVoice, resumeVoice, disconnectTelephony, connectTelephony, telephonyInputSchema } = await import("./voice-settings");
    const admin = actorFor(organizationId, userId);
    expect(await pauseVoice(admin, "Reviewing scripts")).toMatchObject({ voicePaused: true, pausedReason: "Reviewing scripts" });
    expect(await resumeVoice(admin)).toMatchObject({ voicePaused: false, pausedReason: null });
    await connectTelephony(admin, telephonyInputSchema.parse({ sipAddress: "acme.pstn.twilio.com", username: "u", password: "p", callerNumber: "+14155550100" }));
    expect(await disconnectTelephony(admin)).toMatchObject({ telephonyConnected: false, sipAddress: null });
  });
});
