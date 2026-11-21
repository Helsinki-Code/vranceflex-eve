import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { EmailStatus } from "../domain/email-status";
import { getDatabase } from "./database";
import { emailVerifications } from "./database/schema";

/**
 * Independent check that an address can receive mail. VranceFlex holds the
 * verifier key (the cost is covered by prospect credits), so customers never
 * need their own.
 *
 * The mapping is deliberately conservative: only an explicit "this mailbox is
 * good" answer becomes `verified`, and any status we don't recognise becomes
 * `unknown`, which is never sent to.
 */

export type VerifierName = "reoon" | "zerobounce";

export type VerificationResult = {
  status: EmailStatus;
  verifier: VerifierName;
  /** The verifier's own words, for support. Never contains the API key. */
  detail: string | null;
};

/** The verifier could not be reached or refused the request; retrying later may work. */
export class EmailVerifierError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
  }
}

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const REQUEST_TIMEOUT_MS = 20_000;
/** Verified and invalid answers stay good for a month; an "unknown" is retried after a day. */
const CACHE_TTL_MS = 30 * 86_400_000;
const UNKNOWN_CACHE_TTL_MS = 86_400_000;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Addresses are cached by hash so the cache never holds anyone's email in the clear. */
export function emailHash(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

const text = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

// ---- Provider mappings --------------------------------------------------------

export function mapReoonResponse(body: unknown): { status: EmailStatus; detail: string } {
  const data = (body ?? {}) as Record<string, unknown>;
  const raw = text(data.status);
  const detail = `reoon:${raw || "none"}`;
  switch (raw) {
    case "safe":
    case "valid":
      // A "safe" mailbox on a domain that accepts everything proves nothing.
      return { status: data.is_catch_all === true ? "risky" : "verified", detail };
    case "catch_all":
    case "role_account":
    case "inbox_full":
      return { status: "risky", detail };
    case "invalid":
    case "disabled":
    case "disposable":
    case "spamtrap":
      return { status: "invalid", detail };
    default:
      return { status: "unknown", detail };
  }
}

export function mapZeroBounceResponse(body: unknown): { status: EmailStatus; detail: string } {
  const data = (body ?? {}) as Record<string, unknown>;
  const raw = text(data.status).replace(/-/g, "_");
  const sub = text(data.sub_status);
  const detail = `zerobounce:${raw || "none"}${sub ? `/${sub}` : ""}`;
  switch (raw) {
    case "valid":
      return { status: sub === "role_based" ? "risky" : "verified", detail };
    case "catch_all":
      return { status: "risky", detail };
    case "invalid":
    case "spamtrap":
    case "abuse":
      return { status: "invalid", detail };
    case "do_not_mail":
      // ZeroBounce files role addresses under do_not_mail; those are deliverable.
      return { status: sub === "role_based" ? "risky" : "invalid", detail };
    default:
      return { status: "unknown", detail };
  }
}

// ---- Providers ----------------------------------------------------------------

async function getJson(url: string, fetchImpl: FetchLike) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    // Never include the URL: it carries the API key.
    throw new EmailVerifierError("The email verifier could not be reached.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new EmailVerifierError("The email verifier rejected the API key.", false);
  }
  if (response.status === 402 || response.status === 429) {
    throw new EmailVerifierError("The email verifier is out of credit or rate limited.");
  }
  if (!response.ok) throw new EmailVerifierError(`The email verifier returned HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new EmailVerifierError("The email verifier returned an unreadable response.");
  }
}

export async function verifyWithReoon(email: string, apiKey: string, fetchImpl: FetchLike): Promise<VerificationResult> {
  const url = `https://emailverifier.reoon.com/api/v1/verify?${new URLSearchParams({ email, key: apiKey, mode: "power" })}`;
  const body = await getJson(url, fetchImpl);
  const { status, detail } = mapReoonResponse(body);
  return { status, verifier: "reoon", detail };
}

export async function verifyWithZeroBounce(email: string, apiKey: string, fetchImpl: FetchLike): Promise<VerificationResult> {
  const url = `https://api.zerobounce.net/v2/validate?${new URLSearchParams({ api_key: apiKey, email, ip_address: "" })}`;
  const body = await getJson(url, fetchImpl);
  const { status, detail } = mapZeroBounceResponse(body);
  return { status, verifier: "zerobounce", detail };
}

/** Which verifier is configured, if any. Reoon is preferred, ZeroBounce is the alternative. */
export function configuredVerifier(env: Record<string, string | undefined> = process.env) {
  const reoon = env.REOON_API_KEY?.trim();
  if (reoon) return { name: "reoon" as const, apiKey: reoon };
  const zerobounce = env.ZEROBOUNCE_API_KEY?.trim();
  if (zerobounce) return { name: "zerobounce" as const, apiKey: zerobounce };
  return null;
}

export function isEmailVerifierConfigured() {
  return configuredVerifier() !== null;
}

// ---- Cached verification ------------------------------------------------------

export type EmailCheck = {
  status: EmailStatus;
  verifier: VerifierName | null;
  /** True when answered from the cache, so no verifier credit was used. */
  cached: boolean;
  checkedAt: Date;
};

/**
 * Verifies one address, using a cached answer when a recent one exists.
 * Resolves to `unknown` (never throws) when no verifier is configured.
 * Throws EmailVerifierError when a configured verifier is unreachable, so the
 * caller can retry later instead of recording a wrong answer.
 */
export async function verifyEmailAddress(
  email: string,
  deps: { fetchImpl?: FetchLike; now?: Date; env?: Record<string, string | undefined> } = {},
): Promise<EmailCheck> {
  const now = deps.now ?? new Date();
  const verifier = configuredVerifier(deps.env);
  if (!verifier) return { status: "unknown", verifier: null, cached: false, checkedAt: now };

  const normalized = normalizeEmail(email);
  const hash = emailHash(normalized);
  const database = getDatabase();

  const [cachedRow] = await database.select().from(emailVerifications).where(eq(emailVerifications.emailHash, hash)).limit(1);
  if (cachedRow) {
    const ttl = cachedRow.status === "unknown" ? UNKNOWN_CACHE_TTL_MS : CACHE_TTL_MS;
    if (now.getTime() - cachedRow.checkedAt.getTime() < ttl) {
      return { status: cachedRow.status, verifier: cachedRow.verifier as VerifierName, cached: true, checkedAt: cachedRow.checkedAt };
    }
  }

  const fetchImpl = deps.fetchImpl ?? (fetch as unknown as FetchLike);
  const result =
    verifier.name === "reoon"
      ? await verifyWithReoon(normalized, verifier.apiKey, fetchImpl)
      : await verifyWithZeroBounce(normalized, verifier.apiKey, fetchImpl);

  await database
    .insert(emailVerifications)
    .values({ emailHash: hash, status: result.status, verifier: result.verifier, detail: result.detail, checkedAt: now })
    .onConflictDoUpdate({
      target: emailVerifications.emailHash,
      set: { status: result.status, verifier: result.verifier, detail: result.detail, checkedAt: now },
    });
  return { status: result.status, verifier: result.verifier, cached: false, checkedAt: now };
}
