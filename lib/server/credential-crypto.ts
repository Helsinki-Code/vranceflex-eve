import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class CredentialsConfigurationError extends Error {}

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptionKey() {
  const value = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!value) {
    throw new CredentialsConfigurationError(
      "CREDENTIALS_ENCRYPTION_KEY must be configured to store client-connected channel credentials.",
    );
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(value, "base64url");
  } catch {
    throw new CredentialsConfigurationError(
      "CREDENTIALS_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.",
    );
  }
  if (buffer.length !== 32) {
    throw new CredentialsConfigurationError(
      "CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes (an AES-256 key).",
    );
  }
  return buffer;
}

export function encryptCredentialPayload(payload: Record<string, unknown>): string {
  const key = encryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

export function decryptCredentialPayload<T>(blob: string): T {
  const key = encryptionKey();
  const buffer = Buffer.from(blob, "base64url");
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
