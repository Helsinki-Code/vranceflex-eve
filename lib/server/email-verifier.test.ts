import { describe, expect, it, vi } from "vitest";
import {
  configuredVerifier,
  emailHash,
  EmailVerifierError,
  mapReoonResponse,
  mapZeroBounceResponse,
  verifyWithReoon,
  verifyWithZeroBounce,
} from "./email-verifier";

describe("mapReoonResponse", () => {
  it.each([
    [{ status: "safe" }, "verified"],
    [{ status: "valid" }, "verified"],
    [{ status: "SAFE " }, "verified"],
    [{ status: "safe", is_catch_all: true }, "risky"],
    [{ status: "catch_all" }, "risky"],
    [{ status: "role_account" }, "risky"],
    [{ status: "inbox_full" }, "risky"],
    [{ status: "invalid" }, "invalid"],
    [{ status: "disabled" }, "invalid"],
    [{ status: "disposable" }, "invalid"],
    [{ status: "spamtrap" }, "invalid"],
    [{ status: "unknown" }, "unknown"],
  ])("maps %j to %s", (body, expected) => {
    expect(mapReoonResponse(body).status).toBe(expected);
  });

  it.each([{}, null, undefined, { status: 3 }, { status: "brand_new_status" }, "safe", []])(
    "never trusts an unrecognised answer: %j",
    (body) => {
      expect(mapReoonResponse(body).status).toBe("unknown");
    },
  );
});

describe("mapZeroBounceResponse", () => {
  it.each([
    [{ status: "valid" }, "verified"],
    [{ status: "valid", sub_status: "role_based" }, "risky"],
    [{ status: "catch-all" }, "risky"],
    [{ status: "catch_all" }, "risky"],
    [{ status: "invalid", sub_status: "mailbox_not_found" }, "invalid"],
    [{ status: "spamtrap" }, "invalid"],
    [{ status: "abuse" }, "invalid"],
    [{ status: "do_not_mail", sub_status: "disposable" }, "invalid"],
    [{ status: "do_not_mail", sub_status: "toxic" }, "invalid"],
    [{ status: "do_not_mail", sub_status: "role_based" }, "risky"],
    [{ status: "unknown", sub_status: "greylisted" }, "unknown"],
  ])("maps %j to %s", (body, expected) => {
    expect(mapZeroBounceResponse(body).status).toBe(expected);
  });

  it.each([{}, null, { status: "something_new" }])("never trusts an unrecognised answer: %j", (body) => {
    expect(mapZeroBounceResponse(body).status).toBe("unknown");
  });

  it("keeps the sub-status in the detail for support", () => {
    expect(mapZeroBounceResponse({ status: "invalid", sub_status: "mailbox_not_found" }).detail).toBe("zerobounce:invalid/mailbox_not_found");
  });
});

function fakeFetch(response: { ok?: boolean; status?: number; body?: unknown; json?: () => Promise<unknown> } | Error) {
  return vi.fn(async (_url: string, _init?: { signal?: AbortSignal }) => {
    if (response instanceof Error) throw response;
    return {
      ok: response.ok ?? (response.status ?? 200) < 400,
      status: response.status ?? 200,
      json: response.json ?? (async () => response.body),
    };
  });
}

describe("verifyWithReoon", () => {
  it("calls the power-mode endpoint with the address and key, and maps the answer", async () => {
    const fetchImpl = fakeFetch({ body: { status: "safe" } });
    const result = await verifyWithReoon("sam@example.com", "secret-key", fetchImpl);
    expect(result).toEqual({ status: "verified", verifier: "reoon", detail: "reoon:safe" });
    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://emailverifier.reoon.com/api/v1/verify");
    expect(url.searchParams.get("email")).toBe("sam@example.com");
    expect(url.searchParams.get("key")).toBe("secret-key");
    expect(url.searchParams.get("mode")).toBe("power");
  });

  it("treats a network failure as retryable and never leaks the key", async () => {
    const error = await verifyWithReoon("sam@example.com", "secret-key", fakeFetch(new Error("connect ECONNREFUSED ...secret-key..."))).catch((e) => e);
    expect(error).toBeInstanceOf(EmailVerifierError);
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain("secret-key");
  });

  it.each([
    [401, false, /rejected the API key/],
    [403, false, /rejected the API key/],
    [402, true, /out of credit/],
    [429, true, /rate limited/],
    [500, true, /HTTP 500/],
  ])("handles HTTP %i", async (status, retryable, message) => {
    const error = await verifyWithReoon("sam@example.com", "k", fakeFetch({ status })).catch((e) => e);
    expect(error).toBeInstanceOf(EmailVerifierError);
    expect(error.retryable).toBe(retryable);
    expect(error.message).toMatch(message);
  });

  it("reports an unreadable body as a verifier error", async () => {
    const error = await verifyWithReoon("sam@example.com", "k", fakeFetch({ json: async () => { throw new Error("bad json"); } })).catch((e) => e);
    expect(error).toBeInstanceOf(EmailVerifierError);
  });
});

describe("verifyWithZeroBounce", () => {
  it("calls the v2 validate endpoint and maps the answer", async () => {
    const fetchImpl = fakeFetch({ body: { status: "catch-all" } });
    const result = await verifyWithZeroBounce("sam@example.com", "zb-key", fetchImpl);
    expect(result.status).toBe("risky");
    expect(result.verifier).toBe("zerobounce");
    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://api.zerobounce.net/v2/validate");
    expect(url.searchParams.get("api_key")).toBe("zb-key");
    expect(url.searchParams.get("email")).toBe("sam@example.com");
  });
});

describe("configuredVerifier", () => {
  it("prefers Reoon, falls back to ZeroBounce, and is null when neither is set", () => {
    expect(configuredVerifier({ REOON_API_KEY: "r", ZEROBOUNCE_API_KEY: "z" })).toEqual({ name: "reoon", apiKey: "r" });
    expect(configuredVerifier({ ZEROBOUNCE_API_KEY: " z " })).toEqual({ name: "zerobounce", apiKey: "z" });
    expect(configuredVerifier({ REOON_API_KEY: "  " })).toBeNull();
    expect(configuredVerifier({})).toBeNull();
  });
});

describe("emailHash", () => {
  it("is case- and space-insensitive and never contains the address", () => {
    expect(emailHash(" Sam@Example.com ")).toBe(emailHash("sam@example.com"));
    expect(emailHash("sam@example.com")).toMatch(/^[0-9a-f]{64}$/);
    expect(emailHash("sam@example.com")).not.toContain("sam");
  });
});
