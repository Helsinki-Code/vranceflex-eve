import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { listCandidates } from "../../../../../lib/server/candidate-store";

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    return NextResponse.json(
      { candidates: await listCandidates(actor, campaignId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
