import { createHmac } from "node:crypto";

/**
 * The signature a voice worker puts on a report: HMAC-SHA256 over
 * "<timestamp>.<body>" with a secret shared only by the worker and the app.
 * Pure on purpose (no database), so the worker can import it too.
 */
export function signWorkerReport(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export const REPORT_TIMESTAMP_HEADER = "x-vranceflex-timestamp";
export const REPORT_SIGNATURE_HEADER = "x-vranceflex-signature";
