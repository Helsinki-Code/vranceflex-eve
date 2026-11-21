import { NextResponse } from "next/server";
import { handleTwilioStatus } from "../../../../../lib/server/voice-twilio-calls";
import { verifyCallToken } from "../../../../../lib/server/voice-twilio";

/**
 * Twilio reports a call's progress here (answered, then completed with its final duration). Like
 * the answer webhook it is authenticated by the per-call token in its URL.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call");
  if (!verifyCallToken(callId, url.searchParams.get("token"))) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" && value ? value : null;
  };
  const duration = Number(field("CallDuration"));
  try {
    const result = await handleTwilioStatus({
      callId: callId!,
      callSid: field("CallSid"),
      callStatus: field("CallStatus") ?? "",
      callDuration: field("CallDuration") !== null && Number.isFinite(duration) ? duration : null,
      answeredBy: field("AnsweredBy"),
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[voice] status callback failed", { callId, error: error instanceof Error ? error.message : error });
    // A 500 makes Twilio retry, which is safe: every step is idempotent.
    return NextResponse.json({ error: "Could not record the status." }, { status: 500 });
  }
}
