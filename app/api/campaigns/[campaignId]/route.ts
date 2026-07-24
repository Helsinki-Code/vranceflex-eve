import { NextResponse } from "next/server";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { getCampaign } from "../../../../lib/server/campaign-store";
import { listCandidates } from "../../../../lib/server/candidate-store";
import {
  getCampaignExecution,
  listCampaignProgress,
} from "../../../../lib/server/pipeline-store";
import { listCampaignSequences } from "../../../../lib/server/outreach-store";

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    const campaign = await getCampaign(campaignId, actor);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign was not found." }, { status: 404 });
    }

    const [execution, sequences, progress, candidates] = await Promise.all([
      getCampaignExecution(campaignId, actor.organizationId),
      listCampaignSequences(actor, campaignId),
      listCampaignProgress(campaignId, actor.organizationId),
      listCandidates(actor, campaignId),
    ]);

    return NextResponse.json(
      { campaign, execution, sequences, progress, candidates },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
