import { createHmac, timingSafeEqual } from "node:crypto";

// Unsubscribe links carry an HMAC of the message ID so a link can't be
// forged for someone else's message. The key is derived from AUTH_SECRET with
// a purpose label so it never matches session or OTP hashes.
function unsubscribeKey() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update("vranceflex:unsubscribe:v1").digest();
}

export function signUnsubscribeToken(messageId: string) {
  const key = unsubscribeKey();
  if (!key) return null;
  return createHmac("sha256", key).update(messageId).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribeToken(messageId: string, token: string | null | undefined) {
  if (!token) return false;
  const expected = signUnsubscribeToken(messageId);
  if (!expected) return false;
  const given = Buffer.from(token);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
