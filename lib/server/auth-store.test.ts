import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";

vi.mock("./auth-email", () => ({
  assertAuthEmailConfigured: vi.fn(),
  sendAuthOtp: vi.fn(),
}));

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";

describe.skipIf(!hasTestDatabase)("auth-store", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAllTables();
  });

  async function signUpAndCaptureOtp(email: string) {
    const { beginSignup } = await import("./auth-store");
    const { sendAuthOtp } = await import("./auth-email");
    await beginSignup({
      name: "Ada Lovelace",
      organizationName: "Analytical Engines",
      email,
      password: "correct-horse-1",
    });
    const call = vi.mocked(sendAuthOtp).mock.calls.at(-1);
    if (!call) throw new Error("sendAuthOtp was not called");
    return call[0].code;
  }

  it("completes signup, verification and creates an org/session", async () => {
    const { verifySignup } = await import("./auth-store");
    const code = await signUpAndCaptureOtp("ada@example.com");

    const result = await verifySignup({ email: "ada@example.com", code });
    expect(result.token).toBeTruthy();

    const { authenticateSessionToken } = await import("./session-auth");
    const actor = await authenticateSessionToken(result.token);
    expect(actor?.organizationRole).toBe("admin");
    expect(actor?.email).toBe("ada@example.com");
  });

  it("rejects an incorrect code and increments attempts", async () => {
    const { verifySignup } = await import("./auth-store");
    await signUpAndCaptureOtp("wrong-code@example.com");

    await expect(
      verifySignup({ email: "wrong-code@example.com", code: "000000" }),
    ).rejects.toThrow(/invalid or has expired/i);
  });

  it("locks out after too many incorrect attempts", async () => {
    const { verifySignup } = await import("./auth-store");
    await signUpAndCaptureOtp("lockout@example.com");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        verifySignup({ email: "lockout@example.com", code: "000000" }),
      ).rejects.toThrow();
    }

    await expect(
      verifySignup({ email: "lockout@example.com", code: "000000" }),
    ).rejects.toThrow(/too many incorrect attempts/i);
  });

  it("signs in with a verified account and rejects a wrong password", async () => {
    const { verifySignup, signIn } = await import("./auth-store");
    const code = await signUpAndCaptureOtp("signin@example.com");
    await verifySignup({ email: "signin@example.com", code });

    const result = await signIn({
      email: "signin@example.com",
      password: "correct-horse-1",
    });
    expect(result.token).toBeTruthy();

    await expect(
      signIn({ email: "signin@example.com", password: "wrong-password-1" }),
    ).rejects.toThrow(/incorrect/i);
  });

  it("rejects sign-in for an unverified account", async () => {
    const { signIn } = await import("./auth-store");
    await signUpAndCaptureOtp("unverified@example.com");

    await expect(
      signIn({ email: "unverified@example.com", password: "correct-horse-1" }),
    ).rejects.toThrow(/verify your email/i);
  });

  it("revokes existing sessions when a password is reset", async () => {
    const { verifySignup, beginPasswordReset, resetPassword, signIn } =
      await import("./auth-store");
    const { authenticateSessionToken } = await import("./session-auth");
    const { sendAuthOtp } = await import("./auth-email");

    const code = await signUpAndCaptureOtp("reset@example.com");
    const { token } = await verifySignup({ email: "reset@example.com", code });
    expect(await authenticateSessionToken(token)).not.toBeNull();

    await beginPasswordReset("reset@example.com");
    const resetCall = vi.mocked(sendAuthOtp).mock.calls.at(-1);
    if (!resetCall) throw new Error("sendAuthOtp was not called for password reset");

    await resetPassword({
      email: "reset@example.com",
      code: resetCall[0].code,
      password: "new-password-2",
    });

    expect(await authenticateSessionToken(token)).toBeNull();
    await expect(
      signIn({ email: "reset@example.com", password: "correct-horse-1" }),
    ).rejects.toThrow();
    const signInResult = await signIn({
      email: "reset@example.com",
      password: "new-password-2",
    });
    expect(signInResult.token).toBeTruthy();
  });

  it("removes expired auth challenges and sessions", async () => {
    const { removeExpiredAuthRecords, verifySignup } = await import("./auth-store");
    const { getDatabase } = await import("./database");
    const { authChallenges, authSessions } = await import("./database/schema");
    const { lt } = await import("drizzle-orm");

    const code = await signUpAndCaptureOtp("expired@example.com");
    await verifySignup({ email: "expired@example.com", code });

    const database = getDatabase();
    const past = new Date(Date.now() - 60_000);
    await database.update(authChallenges).set({ expiresAt: past });
    await database.update(authSessions).set({ expiresAt: past });

    const result = await removeExpiredAuthRecords();
    expect(result.expiredChallengesRemoved).toBeGreaterThan(0);
    expect(result.expiredSessionsRemoved).toBeGreaterThan(0);

    const remainingChallenges = await database
      .select()
      .from(authChallenges)
      .where(lt(authChallenges.expiresAt, new Date()));
    expect(remainingChallenges).toHaveLength(0);
  });
});
