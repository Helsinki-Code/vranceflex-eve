import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../../lib/server/api-response";
import { listCallableLeads } from "../../../../../../lib/server/voice-calls";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getApiActor();
    const { id } = await params;
    return NextResponse.json({ leads: await listCallableLeads(actor.organizationId, id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
