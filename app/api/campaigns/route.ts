import { NextResponse } from "next/server";
import { campaignCreateSchema } from "../../../lib/domain/campaign";
import { getApiActor } from "../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../lib/server/api-response";
import { createCampaign, listCampaigns } from "../../../lib/server/campaign-store";
import { discoverCandidates } from "../../../lib/server/candidate-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getApiActor();
    return NextResponse.json(
      { campaigns: await listCampaigns(actor) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getApiActor();
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();

    if (!idempotencyKey) {
      return NextResponse.json({ error: "An Idempotency-Key header is required." }, { status: 400 });
    }

    const input = campaignCreateSchema.parse(await request.json());
    const campaign = await createCampaign(input, actor, idempotencyKey);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign could not be created." }, { status: 500 });
    }

    try {
      const discovery = await discoverCandidates(actor, campaign);
      return NextResponse.json({ campaign, discovery }, { status: 202 });
    } catch {
      return NextResponse.json(
        {
          campaign,
          discovery: null,
          warning:
            "Campaign saved, but lead discovery could not start. Retry it from the campaign workspace.",
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
