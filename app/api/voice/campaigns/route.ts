import { NextResponse } from "next/server";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../lib/server/request-security";
import { createVoiceCampaign, listVoiceCampaigns, voiceCampaignInputSchema } from "../../../../lib/server/voice-campaigns";

export async function GET() {
  try {
    const actor = await getApiActor();
    return NextResponse.json({ campaigns: await listVoiceCampaigns(actor.organizationId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const id = await createVoiceCampaign(actor, voiceCampaignInputSchema.parse(await request.json()));
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
