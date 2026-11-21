import { NextResponse } from "next/server";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { callFilters, listCalls, type CallFilter } from "../../../../lib/server/voice-calls";

export async function GET(request: Request) {
  try {
    const actor = await getApiActor();
    const raw = new URL(request.url).searchParams.get("filter") ?? "needs_review";
    const filter = (callFilters as readonly string[]).includes(raw) ? (raw as CallFilter) : "needs_review";
    return NextResponse.json(await listCalls(actor.organizationId, { filter }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
