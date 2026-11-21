import { REPORT_SIGNATURE_HEADER, REPORT_TIMESTAMP_HEADER, signWorkerReport } from "../../lib/domain/voice-signature";

type Post = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

/**
 * Sends a report to the app, signed. Retries with backoff on a server error or
 * a lost connection; the app records each report once however many times it
 * arrives, so retrying is safe. A refusal (401/400) is not retried.
 */
export async function sendReport(input: {
  url: string;
  secret: string;
  payload: Record<string, unknown>;
  post?: Post;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  attempts?: number;
}) {
  const post = input.post ?? ((url, init) => fetch(url, init));
  const sleep = input.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? Date.now;
  const attempts = input.attempts ?? 5;
  const body = JSON.stringify(input.payload);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // A fresh timestamp each try, so a slow retry is never rejected as stale.
    const timestamp = String(now());
    try {
      const response = await post(input.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [REPORT_TIMESTAMP_HEADER]: timestamp,
          [REPORT_SIGNATURE_HEADER]: signWorkerReport(input.secret, timestamp, body),
        },
        body,
      });
      if (response.ok) return { delivered: true as const, attempts: attempt };
      if (response.status === 400 || response.status === 401) return { delivered: false as const, attempts: attempt, refused: response.status };
    } catch {
      // Connection trouble: fall through to retry.
    }
    if (attempt < attempts) await sleep(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
  }
  return { delivered: false as const, attempts };
}
