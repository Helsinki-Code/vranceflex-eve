import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "../../../../lib/server/test-support/db";

vi.mock("../../../../lib/server/auth-email", () => ({
  assertAuthEmailConfigured: vi.fn(),
  sendAuthOtp: vi.fn(),
}));

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasTestDatabase)("POST /api/auth/signup", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAllTables();
  });

  it("accepts a valid signup request", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest({
        name: "Ada Lovelace",
        organizationName: "Analytical Engines",
        email: "ada@example.com",
        password: "correct-horse-1",
      }),
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.email).toBe("ada@example.com");
  });

  it("rejects an invalid payload with a 400 and issue details", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      jsonRequest({ name: "A", organizationName: "", email: "not-an-email", password: "x" }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.issues).toBeTruthy();
  });

  it("rejects a duplicate signup for an already-verified email with 409", async () => {
    const { POST } = await import("./route");
    const { verifySignup } = await import("../../../../lib/server/auth-store");
    const { sendAuthOtp } = await import("../../../../lib/server/auth-email");

    await POST(
      jsonRequest({
        name: "Ada Lovelace",
        organizationName: "Analytical Engines",
        email: "dupe@example.com",
        password: "correct-horse-1",
      }),
    );
    const call = vi.mocked(sendAuthOtp).mock.calls.at(-1);
    if (!call) throw new Error("sendAuthOtp was not called");
    await verifySignup({ email: "dupe@example.com", code: call[0].code });

    const response = await POST(
      jsonRequest({
        name: "Ada Lovelace",
        organizationName: "Analytical Engines",
        email: "dupe@example.com",
        password: "another-password-1",
      }),
    );
    expect(response.status).toBe(409);
  });
});
