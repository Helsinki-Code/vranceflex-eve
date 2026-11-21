import { NextResponse } from "next/server";
import { applyWorkerReport, verifyWorkerReport, workerReportSchema } from "../../../../../lib/server/voice-reports";

/**
 * The voice worker reports a call here. There is no user session: the worker
 * proves itself with a signature over the exact body, made with a secret only
 * the worker and this app know. Anything unsigned, stale or altered is refused
 * before the body is even parsed.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const trusted = verifyWorkerReport({
    secret: process.env.VOICE_WORKER_SECRET?.trim(),
    timestamp: request.headers.get("x-vranceflex-timestamp"),
    signature: request.headers.get("x-vranceflex-signature"),
    body,
  });
  if (!trusted) return NextResponse.json({ error: "Not authorised." }, { status: 401 });

  let report;
  try {
    report = workerReportSchema.parse(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }
  try {
    const result = await applyWorkerReport(report);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[voice] report failed", { callId: report.callId, error: error instanceof Error ? error.message : error });
    // A 500 makes the worker retry, which is safe: every report is idempotent.
    return NextResponse.json({ error: "Could not record the report." }, { status: 500 });
  }
}
