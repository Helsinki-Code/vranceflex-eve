import { NextResponse } from "next/server";
import { approveSequencesSchema } from "../../../../../lib/domain/pipeline";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { approveCampaignSequences } from "../../../../../lib/server/outreach-store";
import { assertSameOrigin } from "../../../../../lib/server/request-security";

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    const input = approveSequencesSchema.parse(await request.json());
    return NextResponse.json({
      approval: await approveCampaignSequences(
        actor,
        campaignId,
        input.sequenceIds,
        input.scope,
      ),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
