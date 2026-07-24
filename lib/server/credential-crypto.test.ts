import { beforeEach, describe, expect, it } from "vitest";
import {
  CredentialsConfigurationError,
  decryptCredentialPayload,
  encryptCredentialPayload,
} from "./credential-crypto";

describe("credential-crypto", () => {
  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
  });

  it("round-trips a payload through encrypt/decrypt", () => {
    const payload = { apiKey: "re_123", fromEmail: "outreach@example.com" };
    const blob = encryptCredentialPayload(payload);
    expect(blob).not.toContain("re_123");
    expect(decryptCredentialPayload(blob)).toEqual(payload);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const payload = { apiKey: "re_123" };
    expect(encryptCredentialPayload(payload)).not.toBe(encryptCredentialPayload(payload));
  });

  it("fails closed when CREDENTIALS_ENCRYPTION_KEY is missing", () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptCredentialPayload({ a: 1 })).toThrow(CredentialsConfigurationError);
  });

  it("fails closed when CREDENTIALS_ENCRYPTION_KEY is the wrong length", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64url");
    expect(() => encryptCredentialPayload({ a: 1 })).toThrow(CredentialsConfigurationError);
  });

  it("rejects a tampered ciphertext", () => {
    const blob = encryptCredentialPayload({ apiKey: "re_123" });
    const buffer = Buffer.from(blob, "base64url");
    buffer[buffer.length - 1] ^= 0xff;
    expect(() => decryptCredentialPayload(buffer.toString("base64url"))).toThrow();
  });
});
