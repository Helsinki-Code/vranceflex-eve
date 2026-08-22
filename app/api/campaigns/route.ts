import { NextResponse } from "next/server";
import { campaignCreateSchema } from "../../../lib/domain/campaign";
import { getApiActor } from "../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../lib/server/api-response";
import {
  createCampaign,
  getCampaignByIdempotencyKey,
  listCampaigns,
} from "../../../lib/server/campaign-store";
import { discoverCandidates } from "../../../lib/server/candidate-store";
import { assertCampaignCapacity } from "../../../lib/server/billing-entitlements";
import { assertSameOrigin } from "../../../lib/server/request-security";

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
    assertSameOrigin(request);
    const actor = await getApiActor();
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();

    if (!idempotencyKey) {
      return NextResponse.json({ error: "An Idempotency-Key header is required." }, { status: 400 });
    }

    const input = campaignCreateSchema.parse(await request.json());
    const existing = await getCampaignByIdempotencyKey(actor, idempotencyKey);
    if (existing) {
      return NextResponse.json({ campaign: existing, discovery: null }, { status: 200 });
    }
    await assertCampaignCapacity({
      organizationId: actor.organizationId,
      requestedProspects: input.leadCount,
    });
    const result = await createCampaign(input, actor, idempotencyKey);
    if (!result) {
      return NextResponse.json({ error: "Campaign could not be created." }, { status: 500 });
    }
    const { campaign, created } = result;

    // A retried request with the same key returns the original resource and
    // must not spend Parallel credits or insert duplicate candidates again.
    if (!created) {
      return NextResponse.json({ campaign, discovery: null }, { status: 200 });
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
