import { afterEach, describe, expect, it, vi } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";

describe("unsubscribe tokens", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the token for its own message only", () => {
    vi.stubEnv("AUTH_SECRET", "a".repeat(40));
    const token = signUnsubscribeToken("message-1")!;
    expect(token).toHaveLength(32);
    expect(verifyUnsubscribeToken("message-1", token)).toBe(true);
    expect(verifyUnsubscribeToken("message-2", token)).toBe(false);
    expect(verifyUnsubscribeToken("message-1", `${token.slice(0, -1)}x`)).toBe(false);
    expect(verifyUnsubscribeToken("message-1", null)).toBe(false);
  });

  it("changes when the secret rotates and is unavailable without one", () => {
    vi.stubEnv("AUTH_SECRET", "a".repeat(40));
    const first = signUnsubscribeToken("message-1");
    vi.stubEnv("AUTH_SECRET", "b".repeat(40));
    expect(signUnsubscribeToken("message-1")).not.toBe(first);
    vi.stubEnv("AUTH_SECRET", "");
    expect(signUnsubscribeToken("message-1")).toBeNull();
  });
});
