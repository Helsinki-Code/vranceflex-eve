import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { getVoiceDialer } from "../../../../../lib/server/voice-dialer";
import { connectTelephony, disconnectTelephony, telephonyInputSchema } from "../../../../../lib/server/voice-settings";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const input = telephonyInputSchema.parse(await request.json());
    return NextResponse.json(await connectTelephony(actor, input, getVoiceDialer()));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    return NextResponse.json(await disconnectTelephony(actor));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
