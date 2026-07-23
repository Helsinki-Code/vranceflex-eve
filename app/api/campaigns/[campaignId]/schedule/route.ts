import { NextResponse } from "next/server";
import { scheduleSequencesSchema } from "../../../../../lib/domain/pipeline";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { scheduleCampaignSequences } from "../../../../../lib/server/scheduling-store";

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    const input = scheduleSequencesSchema.parse(await request.json());
    return NextResponse.json({
      schedule: await scheduleCampaignSequences(actor, campaignId, input),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
