import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../../lib/server/api-response";
import { refreshEnrichment } from "../../../../../../lib/server/candidate-store";
import { assertSameOrigin } from "../../../../../../lib/server/request-security";

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    const result = await refreshEnrichment(actor, campaignId);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
