import { timingSafeEqual } from "node:crypto";
import twilio from "twilio";
import { signCallToken } from "../domain/voice-signature";

/**
 * Everything about talking to the customer's own Twilio account for a call.
 *
 * We hold only a restricted API key (create/read/update Calls, read their numbers), never the
 * Auth Token. The key places the call and Twilio does the voicemail detection; LiveKit is only
 * involved once a person has actually picked up.
 */

export type TwilioLine = {
  accountSid: string;
  keySid: string;
  keySecret: string;
  callerNumber: string;
};

// ---- Per-call URLs and tokens -----------------------------------------------------------

export function callToken(callId: string, secret = process.env.VOICE_WORKER_SECRET?.trim()) {
  if (!secret) throw new Error("VOICE_WORKER_SECRET is not set.");
  return signCallToken(secret, callId);
}

export function verifyCallToken(callId: string | null, token: string | null, secret = process.env.VOICE_WORKER_SECRET?.trim()) {
  if (!secret || !callId || !token) return false;
  const expected = Buffer.from(signCallToken(secret, callId), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(token, "hex");
  } catch {
    return false;
  }
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function twilioCallbackUrls(input: { baseUrl: string; callId: string; secret?: string }) {
  const token = callToken(input.callId, input.secret);
  const query = `call=${encodeURIComponent(input.callId)}&token=${token}`;
  return {
    answerUrl: `${input.baseUrl}/api/voice/twilio/twiml?${query}`,
    statusUrl: `${input.baseUrl}/api/voice/twilio/status?${query}`,
  };
}

// ---- What Twilio tells us ----------------------------------------------------------------

/** Twilio's voicemail detection result, as we use it. */
export function isMachineAnswer(answeredBy: string | null | undefined) {
  return Boolean(answeredBy && (answeredBy.startsWith("machine") || answeredBy === "fax"));
}

export type TwilioFinalStatus = "completed" | "busy" | "no-answer" | "failed" | "canceled";
export const TWILIO_FINAL_STATUSES: ReadonlySet<string> = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);

/** How a call that Twilio says is over should be recorded when no conversation took place. */
export function unansweredOutcome(status: string, answeredBy: string | null | undefined): "no_answer" | "voicemail" | "failed" {
  if (isMachineAnswer(answeredBy)) return "voicemail";
  if (status === "failed") return "failed";
  return "no_answer";
}

// ---- The TwiML we answer with -------------------------------------------------------------

const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
export const HANGUP_TWIML = xml("<Hangup/>");

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Bridges the call to LiveKit. The URL is the connector's WebSocket address. */
export function streamTwiml(connectUrl: string) {
  return xml(`<Connect><Stream url="${escapeXml(connectUrl)}"/></Connect>`);
}

// ---- Twilio errors -----------------------------------------------------------------------

export type TwilioFailure = {
  kind: "credentials" | "invalid_number" | "blocked_country" | "other";
  message: string;
};

/** Turns a Twilio API error into what we should do about it, in plain words. */
export function classifyTwilioError(error: unknown): TwilioFailure {
  const code = typeof (error as { code?: unknown })?.code === "number" ? (error as { code: number }).code : null;
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : null;
  const text = error instanceof Error ? error.message : "The call could not be placed.";
  if (code === 20003 || status === 401) return { kind: "credentials", message: "Twilio rejected your API key. Reconnect your phone line with a valid key." };
  if (code === 21211 || code === 21214 || code === 21217) return { kind: "invalid_number", message: "Twilio says this isn't a number it can call." };
  if (code === 21215 || code === 21219 || code === 21408 || code === 13227) {
    return { kind: "blocked_country", message: "Your Twilio account isn't allowed to call this country. Enable it in Twilio's voice dialing permissions." };
  }
  return { kind: "other", message: text.slice(0, 300) };
}

// ---- Placing a call ----------------------------------------------------------------------

export type PlaceTwilioCallInput = {
  to: string;
  answerUrl: string;
  statusUrl: string;
  ringSeconds: number;
  /** The most the call may last, so a call can never run past the minutes available. */
  maxSeconds: number;
};

export interface TwilioCaller {
  /** Starts the call. Returns at once with Twilio's call id; the rest arrives by callback. */
  place(line: TwilioLine, input: PlaceTwilioCallInput): Promise<{ callSid: string }>;
  /** Ends a call in progress. */
  hangUp(line: TwilioLine, callSid: string): Promise<void>;
}

export function createTwilioCaller(): TwilioCaller {
  const client = (line: TwilioLine) => twilio(line.keySid, line.keySecret, { accountSid: line.accountSid });
  return {
    async place(line, input) {
      const call = await client(line).calls.create({
        to: input.to,
        from: line.callerNumber,
        url: input.answerUrl,
        method: "POST",
        // Twilio listens for a human or a machine before the call reaches us, so a voicemail
        // is hung up on without any model, agent or disclosure being used.
        machineDetection: "Enable",
        // A person says "Hello?" quickly; a greeting runs on. These thresholds favour not
        // mistaking a short greeting for a machine.
        machineDetectionSpeechThreshold: 2400,
        machineDetectionSpeechEndThreshold: 1200,
        machineDetectionSilenceTimeout: 5000,
        machineDetectionTimeout: 15,
        timeout: input.ringSeconds,
        timeLimit: input.maxSeconds,
        statusCallback: input.statusUrl,
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["answered", "completed"],
      });
      return { callSid: call.sid };
    },
    async hangUp(line, callSid) {
      await client(line).calls(callSid).update({ status: "completed" });
    },
  };
}

// ---- Checking a customer's connection -------------------------------------------------------

export type TwilioLineVerifier = (line: TwilioLine) => Promise<void>;

export class TwilioLineError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Confirms the key works and the caller number belongs to the account, by asking Twilio with
 * the restricted key itself. Needs only the "read Incoming Phone Numbers" permission.
 */
export const verifyTwilioLine: TwilioLineVerifier = async (line) => {
  const basic = Buffer.from(`${line.keySid}:${line.keySecret}`).toString("base64");
  const ask = async (resource: string) => {
    let response: Response;
    try {
      response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${line.accountSid}/${resource}.json?PhoneNumber=${encodeURIComponent(line.callerNumber)}`, { headers: { Authorization: `Basic ${basic}` } });
    } catch {
      throw new TwilioLineError("Could not reach Twilio to check these details. Try again.", 502);
    }
    if (response.status === 401) throw new TwilioLineError("Twilio rejected this API key. Check the Account SID, key SID and secret.");
    if (response.status === 403) throw new TwilioLineError("This API key isn't allowed to read phone numbers. Give it the \"Incoming Phone Numbers: read\" permission.");
    if (!response.ok) throw new TwilioLineError("Twilio couldn't check this phone line right now.", 502);
    const body = (await response.json()) as { incoming_phone_numbers?: unknown[]; outgoing_caller_ids?: unknown[] };
    return (body.incoming_phone_numbers?.length ?? 0) + (body.outgoing_caller_ids?.length ?? 0) > 0;
  };
  if (await ask("IncomingPhoneNumbers")) return;
  if (await ask("OutgoingCallerIds")) return;
  throw new TwilioLineError("That number isn't on this Twilio account. Use a number you bought or verified in Twilio.");
};
