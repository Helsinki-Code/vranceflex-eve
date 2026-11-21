import { createHmac } from "node:crypto";

/**
 * The signature a voice worker puts on a report: HMAC-SHA256 over
 * "<timestamp>.<body>" with a secret shared only by the worker and the app.
 * Pure on purpose (no database), so the worker can import it too.
 */
export function signWorkerReport(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * The token that goes in the URLs we give Twilio for one call (the answer webhook and the status
 * callback): HMAC-SHA256 of "twilio-call:<callId>" with the shared secret. Twilio's own request
 * signature needs the customer's Auth Token, which we deliberately never hold, so each call's
 * URLs carry their own proof instead. It authorises one call's callbacks and nothing else.
 */
export function signCallToken(secret: string, callId: string) {
  return createHmac("sha256", secret).update(`twilio-call:${callId}`).digest("hex");
}

export const REPORT_TIMESTAMP_HEADER = "x-vranceflex-timestamp";
export const REPORT_SIGNATURE_HEADER = "x-vranceflex-signature";
