import { NextResponse } from "next/server";
import { getVoiceConnector } from "../../../../../lib/server/voice-dialer";
import { handleTwilioAnswer } from "../../../../../lib/server/voice-twilio-calls";
import { HANGUP_TWIML, verifyCallToken } from "../../../../../lib/server/voice-twilio";

/**
 * Twilio asks what to do when someone picks up a call we placed. There is no user session and we
 * don't hold the customer's Auth Token, so the call's own URL carries a token only this app can
 * make. A voicemail gets a hang-up; a person gets bridged into the voice agent on LiveKit.
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
  try {
    const twiml = await handleTwilioAnswer({
      callId: callId!,
      callSid: field("CallSid"),
      answeredBy: field("AnsweredBy"),
      connector: getVoiceConnector(),
    });
    return new Response(twiml, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
  } catch (error) {
    console.error("[voice] answer webhook failed", { callId, error: error instanceof Error ? error.message : error });
    // Hanging up is the safe answer: the call ends, and the status callback closes it out.
    return new Response(HANGUP_TWIML, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }
}
