import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import {
  getSendingSafetySettings,
  sendingSafetyInputSchema,
  updateSendingSafetySettings,
} from "../../../../../lib/server/sending-settings";

export async function GET() {
  try {
    const actor = await getApiActor();
    return NextResponse.json(await getSendingSafetySettings(actor.organizationId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const input = sendingSafetyInputSchema.parse(await request.json());
    return NextResponse.json(await updateSendingSafetySettings(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
