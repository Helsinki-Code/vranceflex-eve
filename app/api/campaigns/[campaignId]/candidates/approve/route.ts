import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiActor } from "../../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../../lib/server/api-response";
import { currentSessionToken } from "../../../../../../lib/server/auth-store";
import { approveCandidates } from "../../../../../../lib/server/candidate-store";
import { startCampaignExecution } from "../../../../../../lib/server/campaign-execution";
import { assertSameOrigin } from "../../../../../../lib/server/request-security";

const bodySchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(1_000),
});

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    const input = bodySchema.parse(await request.json());
    const origin = new URL(request.url).origin;
    const sessionToken = await currentSessionToken();

    const result = await approveCandidates(
      actor,
      campaignId,
      input.candidateIds,
      async (campaign, approvedLeads) => {
        await startCampaignExecution({
          campaign,
          approvedLeads,
          actor,
          origin,
          sessionToken,
        });
      },
    );
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
