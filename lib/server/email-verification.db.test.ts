import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailVerifierError, emailHash, verifyEmailAddress } from "./email-verifier";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";

const env = { REOON_API_KEY: "test-reoon-key" };
const answer = (body: unknown, status = 200) =>
  vi.fn(async (_url: string, _init?: { signal?: AbortSignal }) => ({ ok: status < 400, status, json: async () => body }));

describe.skipIf(!hasTestDatabase)("verifyEmailAddress", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it("returns unknown without calling anything when no verifier is configured", async () => {
    const fetchImpl = answer({ status: "safe" });
    const result = await verifyEmailAddress("sam@example.com", { fetchImpl, env: {} });
    expect(result).toMatchObject({ status: "unknown", verifier: null, cached: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("verifies once, then answers repeats from the cache", async () => {
    const fetchImpl = answer({ status: "safe" });
    const first = await verifyEmailAddress("Sam@Example.com", { fetchImpl, env });
    expect(first).toMatchObject({ status: "verified", verifier: "reoon", cached: false });

    const second = await verifyEmailAddress(" sam@example.com ", { fetchImpl, env });
    expect(second).toMatchObject({ status: "verified", verifier: "reoon", cached: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("stores only a hash of the address", async () => {
    await verifyEmailAddress("sam@example.com", { fetchImpl: answer({ status: "invalid" }), env });
    const { getDatabase } = await import("./database");
    const { emailVerifications } = await import("./database/schema");
    const rows = await getDatabase().select().from(emailVerifications);
    expect(rows).toHaveLength(1);
    expect(rows[0].emailHash).toBe(emailHash("sam@example.com"));
    expect(JSON.stringify(rows[0])).not.toContain("sam@example.com");
    expect(rows[0]).toMatchObject({ status: "invalid", verifier: "reoon", detail: "reoon:invalid" });
  });

  it("re-checks a settled answer after 30 days and an unknown one after a day", async () => {
    const start = new Date("2030-01-01T00:00:00Z");
    const fetchImpl = answer({ status: "safe" });
    await verifyEmailAddress("a@example.com", { fetchImpl, env, now: start });
    await verifyEmailAddress("a@example.com", { fetchImpl, env, now: new Date(start.getTime() + 29 * 86_400_000) });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await verifyEmailAddress("a@example.com", { fetchImpl, env, now: new Date(start.getTime() + 31 * 86_400_000) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const unknownFetch = answer({ status: "unknown" });
    await verifyEmailAddress("b@example.com", { fetchImpl: unknownFetch, env, now: start });
    await verifyEmailAddress("b@example.com", { fetchImpl: unknownFetch, env, now: new Date(start.getTime() + 3_600_000) });
    expect(unknownFetch).toHaveBeenCalledTimes(1);
    await verifyEmailAddress("b@example.com", { fetchImpl: unknownFetch, env, now: new Date(start.getTime() + 25 * 3_600_000) });
    expect(unknownFetch).toHaveBeenCalledTimes(2);
  });

  it("lets a verifier outage through as an error and caches nothing", async () => {
    await expect(verifyEmailAddress("sam@example.com", { fetchImpl: answer({}, 500), env })).rejects.toBeInstanceOf(EmailVerifierError);
    const { getDatabase } = await import("./database");
    const { emailVerifications } = await import("./database/schema");
    expect(await getDatabase().select().from(emailVerifications).where(eq(emailVerifications.emailHash, emailHash("sam@example.com")))).toHaveLength(0);
  });
});
