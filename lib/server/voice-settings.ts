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
import { TwilioLineError, verifyTwilioLine, type TwilioLine, type TwilioLineVerifier } from "./voice-twilio";

export type VoiceSettings = {
  window: CallingWindow;
  maxConcurrentCalls: number;
  dailyCallLimit: number;
  voicePaused: boolean;
  pausedReason: string | null;
  consentAttestedAt: string | null;
  telephonyConnected: boolean;
  /** Which kind of phone line is connected: the customer's Twilio account, or a SIP trunk. */
  lineType: "twilio" | "sip";
  sipAddress: string | null;
  callerNumber: string | null;
  livekitTrunkId: string | null;
  /** The Twilio account the line belongs to. The key is never returned. */
  twilioAccountSid: string | null;
};

const DEFAULTS: VoiceSettings = {
  window: DEFAULT_CALLING_WINDOW,
  maxConcurrentCalls: 2,
  dailyCallLimit: 100,
  voicePaused: false,
  pausedReason: null,
  consentAttestedAt: null,
  telephonyConnected: false,
  lineType: "twilio",
  sipAddress: null,
  callerNumber: null,
  livekitTrunkId: null,
  twilioAccountSid: null,
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
    telephonyConnected: Boolean(
      row.telephonyConnectedAt &&
        row.callerNumber &&
        (row.lineType === "twilio" ? row.twilioAccountSid && row.encryptedTwilioKey : row.livekitTrunkId && row.encryptedSipCredentials),
    ),
    lineType: row.lineType,
    sipAddress: row.sipAddress,
    callerNumber: row.callerNumber,
    livekitTrunkId: row.livekitTrunkId,
    twilioAccountSid: row.twilioAccountSid,
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
    lineType: "sip",
    sipAddress: connection.address,
    callerNumber,
    // The password is stored encrypted and never returned.
    encryptedSipCredentials: encryptCredentialPayload({ username: connection.username, password: connection.password }),
    livekitTrunkId: trunkId,
    twilioAccountSid: null,
    encryptedTwilioKey: null,
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
    twilioAccountSid: null,
    encryptedTwilioKey: null,
    telephonyConnectedAt: null,
  });
  await audit(actor, "voice.telephony_disconnected");
  return getVoiceSettings(actor.organizationId);
}

// ---- The customer's own Twilio account ----------------------------------------------------

export const twilioLineInputSchema = z
  .object({
    accountSid: z.string().trim().regex(/^AC[0-9a-fA-F]{32}$/, "The Account SID starts with AC and is 34 characters long."),
    // A restricted API key, never the Auth Token.
    keySid: z.string().trim().regex(/^SK[0-9a-fA-F]{32}$/, "The API key SID starts with SK and is 34 characters long."),
    keySecret: z.string().trim().min(16, "Paste the API key secret.").max(128),
    callerNumber: z.string().trim().refine((value) => toE164(value) !== null, "Enter the Twilio number to call from in international format, like +14155550100."),
  })
  .strict();

const CREDENTIAL_PAUSE_PREFIX = "Twilio rejected";

export async function connectTwilioLine(actor: ApiActor, input: z.infer<typeof twilioLineInputSchema>, verify: TwilioLineVerifier = verifyTwilioLine) {
  requireAdmin(actor);
  const callerNumber = toE164(input.callerNumber)!;
  const line: TwilioLine = { accountSid: input.accountSid, keySid: input.keySid, keySecret: input.keySecret, callerNumber };
  try {
    await verify(line);
  } catch (error) {
    if (error instanceof TwilioLineError) throw new AuthRequestError(error.message, error.status === 502 ? 502 : 400);
    throw error;
  }
  const current = await getVoiceSettings(actor.organizationId);
  await upsert(actor.organizationId, {
    lineType: "twilio",
    twilioAccountSid: line.accountSid,
    // The key is stored encrypted and never returned.
    encryptedTwilioKey: encryptCredentialPayload({ keySid: line.keySid, keySecret: line.keySecret }),
    callerNumber,
    sipAddress: null,
    encryptedSipCredentials: null,
    livekitTrunkId: null,
    telephonyConnectedAt: new Date(),
    // A working key clears a pause that was caused by a rejected one.
    ...(current.voicePaused && current.pausedReason?.startsWith(CREDENTIAL_PAUSE_PREFIX) ? { voicePaused: false, pausedReason: null, pausedAt: null } : {}),
  });
  await audit(actor, "voice.telephony_connected", { lineType: "twilio", accountSid: line.accountSid, callerNumber });
  return getVoiceSettings(actor.organizationId);
}

/** Stops all calling for a workspace because Twilio no longer accepts its key. Server-side. */
export async function pauseVoiceForRejectedKey(organizationId: string) {
  await upsert(organizationId, {
    voicePaused: true,
    pausedReason: `${CREDENTIAL_PAUSE_PREFIX} your API key. Reconnect your phone line with a valid key to continue.`,
    pausedAt: new Date(),
  });
  await getDatabase().insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId,
    actorId: null,
    campaignId: null,
    action: "voice.paused",
    entityType: "voice_settings",
    entityId: organizationId,
    metadata: { reason: "Twilio rejected the API key" },
  });
}

/** The phone line a call will be placed on. Server-side only: it holds decrypted credentials. */
export type PhoneLine =
  | { type: "twilio"; twilio: TwilioLine }
  | { type: "sip"; sip: SipConnection & { trunkId: string } };

export async function getPhoneLine(organizationId: string): Promise<PhoneLine | null> {
  const [row] = await getDatabase().select().from(voiceSettings).where(eq(voiceSettings.organizationId, organizationId)).limit(1);
  if (!row?.callerNumber) return null;
  if (row.lineType === "twilio") {
    if (!row.twilioAccountSid || !row.encryptedTwilioKey) return null;
    const { keySid, keySecret } = decryptCredentialPayload<{ keySid: string; keySecret: string }>(row.encryptedTwilioKey);
    return { type: "twilio", twilio: { accountSid: row.twilioAccountSid, keySid, keySecret, callerNumber: row.callerNumber } };
  }
  const sip = await getSipConnection(organizationId);
  return sip ? { type: "sip", sip } : null;
}

/** The decrypted SIP connection. Server-side only: never sent to a browser. */
export async function getSipConnection(organizationId: string): Promise<(SipConnection & { trunkId: string }) | null> {
  const [row] = await getDatabase().select().from(voiceSettings).where(eq(voiceSettings.organizationId, organizationId)).limit(1);
  if (!row?.sipAddress || !row.callerNumber || !row.encryptedSipCredentials || !row.livekitTrunkId) return null;
  const { username, password } = decryptCredentialPayload<{ username: string; password: string }>(row.encryptedSipCredentials);
  return { address: row.sipAddress, callerNumber: row.callerNumber, username, password, trunkId: row.livekitTrunkId };
}
