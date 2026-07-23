import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import {
  currentSessionToken,
} from "../../../../../lib/server/auth-store";
import { getCampaign } from "../../../../../lib/server/campaign-store";
import { startCampaignExecution } from "../../../../../lib/server/campaign-execution";
import { getCampaignExecution } from "../../../../../lib/server/pipeline-store";
import { assertSameOrigin } from "../../../../../lib/server/request-security";

type RouteContext = {
  params: Promise<{ campaignId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    return NextResponse.json({
      execution: await getCampaignExecution(campaignId, actor.organizationId),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    const campaign = await getCampaign(campaignId, actor);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign was not found." }, { status: 404 });
    }
    if (!["researching", "enriching", "copy_generated"].includes(campaign.status)) {
      return NextResponse.json(
        { error: "This campaign cannot restart research in its current state." },
        { status: 409 },
      );
    }

    const execution = await startCampaignExecution({
      campaign,
      actor,
      origin: new URL(request.url).origin,
      sessionToken: await currentSessionToken(),
      force: true,
    });
    return NextResponse.json({ execution }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
