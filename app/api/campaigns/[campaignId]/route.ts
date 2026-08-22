import { NextResponse } from "next/server";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { currentSessionToken } from "../../../../lib/server/auth-store";
import { reconcileCampaignExecution } from "../../../../lib/server/campaign-execution";
import { getCampaign } from "../../../../lib/server/campaign-store";
import { listCandidates } from "../../../../lib/server/candidate-store";
import {
  getCampaignExecution,
  listCampaignProgress,
} from "../../../../lib/server/pipeline-store";
import { listCampaignSequences } from "../../../../lib/server/outreach-store";
import { getBillingOverview } from "../../../../lib/server/billing-entitlements";

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  try {
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    const campaign = await getCampaign(campaignId, actor);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign was not found." }, { status: 404 });
    }

    await reconcileCampaignExecution({
      campaignId,
      organizationId: actor.organizationId,
      origin: new URL(request.url).origin,
      sessionToken: await currentSessionToken(),
    });

    const [execution, sequences, progress, candidates, billing] = await Promise.all([
      getCampaignExecution(campaignId, actor.organizationId),
      listCampaignSequences(actor, campaignId),
      listCampaignProgress(campaignId, actor.organizationId),
      listCandidates(actor, campaignId),
      getBillingOverview(actor.organizationId),
    ]);

    return NextResponse.json(
      { campaign, execution, sequences, progress, candidates, billing },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
