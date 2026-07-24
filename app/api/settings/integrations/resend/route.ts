import { NextResponse } from "next/server";
import { resendConnectionSchema } from "../../../../../lib/domain/channel-credentials";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { connectResend, disconnectChannel } from "../../../../../lib/server/channel-credentials";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const input = resendConnectionSchema.parse(await request.json());
    const result = await connectResend(actor, input);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const result = await disconnectChannel(actor, "resend");
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
