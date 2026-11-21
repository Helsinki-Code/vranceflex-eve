import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ApiActor } from "./api-actor";
import { AuthRequestError } from "./auth-errors";
import { decryptCredentialPayload, encryptCredentialPayload } from "./credential-crypto";
import { getDatabase } from "./database";
import { auditEvents, voiceSettings } from "./database/schema";
import { toE164 } from "./voice-consent";
import type { SipConnection, VoiceDialer } from "./voice-dialer";
import { callingWindowProblem, DEFAULT_CALLING_WINDOW, type CallingWindow } from "./voice-scheduling";

export type VoiceSettings = {
  window: CallingWindow;
  maxConcurrentCalls: number;
  dailyCallLimit: number;
  voicePaused: boolean;
  pausedReason: string | null;
  consentAttestedAt: string | null;
  telephonyConnected: boolean;
  sipAddress: string | null;
  callerNumber: string | null;
  livekitTrunkId: string | null;
};

const DEFAULTS: VoiceSettings = {
  window: DEFAULT_CALLING_WINDOW,
  maxConcurrentCalls: 2,
  dailyCallLimit: 100,
  voicePaused: false,
  pausedReason: null,
  consentAttestedAt: null,
  telephonyConnected: false,
  sipAddress: null,
  callerNumber: null,
  livekitTrunkId: null,
};

type Row = typeof voiceSettings.$inferSelect;

export function voiceSettingsFromRow(row: Row | undefined | null): VoiceSettings {
  if (!row) return DEFAULTS;
  return {
    window: { days: row.callDays, start: row.callStart, end: row.callEnd },
    maxConcurrentCalls: row.maxConcurrentCalls,
    dailyCallLimit: row.dailyCallLimit,
    voicePaused: row.voicePaused,
    pausedReason: row.pausedReason,
    consentAttestedAt: row.consentAttestedAt?.toISOString() ?? null,
    telephonyConnected: Boolean(row.telephonyConnectedAt && row.livekitTrunkId && row.encryptedSipCredentials),
    sipAddress: row.sipAddress,
    callerNumber: row.callerNumber,
    livekitTrunkId: row.livekitTrunkId,
  };
}

export async function getVoiceSettings(organizationId: string) {
  const [row] = await getDatabase().select().from(voiceSettings).where(eq(voiceSettings.organizationId, organizationId)).limit(1);
  return voiceSettingsFromRow(row);
}

function requireAdmin(actor: ApiActor) {
  if (actor.organizationRole !== "admin") throw new AuthRequestError("Admin permission is required to change voice settings.", 403);
}

async function audit(actor: ApiActor, action: string, metadata: Record<string, unknown> = {}) {
  await getDatabase().insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    actorId: actor.userId,
    campaignId: null,
    action,
    entityType: "voice_settings",
    entityId: actor.organizationId,
    metadata,
  });
}

async function upsert(organizationId: string, values: Partial<typeof voiceSettings.$inferInsert>) {
  const set = { ...values, updatedAt: new Date() };
  await getDatabase()
    .insert(voiceSettings)
    .values({ organizationId, ...set })
    .onConflictDoUpdate({ target: voiceSettings.organizationId, set });
}

// ---- The attestation: "we hold consent for the leads we call" -----------------

export async function attestCallConsent(actor: ApiActor) {
  requireAdmin(actor);
  await upsert(actor.organizationId, { consentAttestedAt: new Date(), consentAttestedBy: actor.userId });
  await audit(actor, "voice.consent_attested");
  return getVoiceSettings(actor.organizationId);
}

// ---- Calling window and limits ------------------------------------------------

export const voiceSettingsInputSchema = z
  .object({
    callDays: z.array(z.number().int()).max(7),
    callStart: z.string(),
    callEnd: z.string(),
    maxConcurrentCalls: z.number().int().min(1).max(10),
    dailyCallLimit: z.number().int().min(1).max(1_000),
  })
  .partial()
  .strict();

export async function updateVoiceSettings(actor: ApiActor, input: z.infer<typeof voiceSettingsInputSchema>) {
  requireAdmin(actor);
  const current = await getVoiceSettings(actor.organizationId);
  const window: CallingWindow = {
    days: input.callDays ? [...new Set(input.callDays)].sort((a, b) => a - b) : current.window.days,
    start: input.callStart ?? current.window.start,
    end: input.callEnd ?? current.window.end,
  };
  const problem = callingWindowProblem(window);
  if (problem) throw new AuthRequestError(problem, 400);
  await upsert(actor.organizationId, {
    callDays: window.days,
    callStart: window.start,
    callEnd: window.end,
    ...(input.maxConcurrentCalls !== undefined ? { maxConcurrentCalls: input.maxConcurrentCalls } : {}),
    ...(input.dailyCallLimit !== undefined ? { dailyCallLimit: input.dailyCallLimit } : {}),
  });
  await audit(actor, "voice.settings_updated", { changed: Object.keys(input) });
  return getVoiceSettings(actor.organizationId);
}

// ---- Pause --------------------------------------------------------------------

export async function pauseVoice(actor: ApiActor, reason?: string) {
  requireAdmin(actor);
  const text = reason?.trim().slice(0, 300) || "Paused by an admin.";
  await upsert(actor.organizationId, { voicePaused: true, pausedReason: text, pausedAt: new Date() });
  await audit(actor, "voice.paused", { reason: text });
  return getVoiceSettings(actor.organizationId);
}

export async function resumeVoice(actor: ApiActor) {
  requireAdmin(actor);
  await upsert(actor.organizationId, { voicePaused: false, pausedReason: null, pausedAt: null });
  await audit(actor, "voice.resumed");
  return getVoiceSettings(actor.organizationId);
}

// ---- The customer's own Twilio SIP trunk -------------------------------------

export const telephonyInputSchema = z
  .object({
    // The Twilio Elastic SIP Trunk's termination URI, like "acme.pstn.twilio.com".
    sipAddress: z
      .string()
      .trim()
      .toLowerCase()
      .transform((value) => value.replace(/^sips?:/, "").replace(/\/.*$/, ""))
      .refine((value) => /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pstn\.twilio\.com$/.test(value), "Enter your Twilio termination URI, like yourname.pstn.twilio.com."),
    username: z.string().trim().min(1).max(128),
    password: z.string().min(1).max(256),
    callerNumber: z.string().trim().refine((value) => toE164(value) !== null, "Enter the Twilio number to call from in international format, like +14155550100."),
  })
  .strict();

export async function connectTelephony(actor: ApiActor, input: z.infer<typeof telephonyInputSchema>, dialer: VoiceDialer) {
  requireAdmin(actor);
  const callerNumber = toE164(input.callerNumber)!;
  const connection: SipConnection = { address: input.sipAddress, username: input.username, password: input.password, callerNumber };
  const [existing] = await getDatabase().select({ trunk: voiceSettings.livekitTrunkId }).from(voiceSettings).where(eq(voiceSettings.organizationId, actor.organizationId)).limit(1);
  let trunkId: string;
  try {
    trunkId = await dialer.ensureTrunk({ organizationId: actor.organizationId, sip: connection, existingTrunkId: existing?.trunk });
  } catch (error) {
    throw new AuthRequestError(`The phone line couldn't be set up: ${error instanceof Error ? error.message : "unknown error"}.`, 502);
  }
  await upsert(actor.organizationId, {
    sipAddress: connection.address,
    callerNumber,
    // The password is stored encrypted and never returned.
    encryptedSipCredentials: encryptCredentialPayload({ username: connection.username, password: connection.password }),
    livekitTrunkId: trunkId,
    telephonyConnectedAt: new Date(),
  });
  await audit(actor, "voice.telephony_connected", { sipAddress: connection.address, callerNumber });
  return getVoiceSettings(actor.organizationId);
}

export async function disconnectTelephony(actor: ApiActor) {
  requireAdmin(actor);
  await upsert(actor.organizationId, {
    sipAddress: null,
    callerNumber: null,
    encryptedSipCredentials: null,
    livekitTrunkId: null,
    telephonyConnectedAt: null,
  });
  await audit(actor, "voice.telephony_disconnected");
  return getVoiceSettings(actor.organizationId);
}

/** The decrypted SIP connection. Server-side only: never sent to a browser. */
export async function getSipConnection(organizationId: string): Promise<(SipConnection & { trunkId: string }) | null> {
  const [row] = await getDatabase().select().from(voiceSettings).where(eq(voiceSettings.organizationId, organizationId)).limit(1);
  if (!row?.sipAddress || !row.callerNumber || !row.encryptedSipCredentials || !row.livekitTrunkId) return null;
  const { username, password } = decryptCredentialPayload<{ username: string; password: string }>(row.encryptedSipCredentials);
  return { address: row.sipAddress, callerNumber: row.callerNumber, username, password, trunkId: row.livekitTrunkId };
}
