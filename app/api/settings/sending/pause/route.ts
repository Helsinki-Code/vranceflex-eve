import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { pauseSending, resumeSending } from "../../../../../lib/server/sending-settings";

const pauseSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();

/** Stops all outreach for the workspace until it is resumed. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { reason } = pauseSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await pauseSending(actor, reason));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    return NextResponse.json(await resumeSending(actor));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
