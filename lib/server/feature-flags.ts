/**
 * Server-side feature flags. These are read at call time (not import time) so
 * tests and deployments can change the environment without a rebuild.
 */

/**
 * SMS outreach is off unless `VRANCEFLEX_SMS_ENABLED=true`. Cold text messages
 * carry real legal exposure (for example the US TCPA), so the channel stays
 * hidden and blocked until email is proven and compliance review is done.
 *
 * Inbound handling is deliberately NOT gated: a STOP reply to a text that was
 * already sent must always be honored, whatever this flag says.
 */
export function isSmsEnabled() {
  return process.env.VRANCEFLEX_SMS_ENABLED?.trim().toLowerCase() === "true";
}

export const SMS_DISABLED_MESSAGE =
  "SMS outreach is not available yet. Use email for now.";
