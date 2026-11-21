import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { getCall, reviewCall, reviewInputSchema } from "../../../../../lib/server/voice-calls";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const actor = await getApiActor();
    const { id } = await params;
    return NextResponse.json(await getCall(actor.organizationId, id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { id } = await params;
    await reviewCall(actor, id, reviewInputSchema.parse(await request.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
