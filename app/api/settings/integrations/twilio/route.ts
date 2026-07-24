import { NextResponse } from "next/server";
import { twilioConnectionSchema } from "../../../../../lib/domain/channel-credentials";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { connectTwilio, disconnectChannel } from "../../../../../lib/server/channel-credentials";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const input = twilioConnectionSchema.parse(await request.json());
    const result = await connectTwilio(actor, input);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const result = await disconnectChannel(actor, "twilio");
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
