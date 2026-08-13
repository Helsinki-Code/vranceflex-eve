import { NextResponse } from "next/server";
import {
  scheduleSequencesSchema,
  updateScheduleSchema,
} from "../../../../../lib/domain/pipeline";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import {
  deleteCampaignSchedule,
  listCampaignSchedules,
  scheduleCampaignSequences,
  updateCampaignSchedule,
} from "../../../../../lib/server/scheduling-store";

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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    const [schedule] = await listCampaignSchedules(actor, { campaignId });
    return NextResponse.json({ schedule: schedule ?? null });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    const input = updateScheduleSchema.parse({
      ...(await request.json()),
      campaignId,
    });
    return NextResponse.json({
      schedule: await updateCampaignSchedule(actor, input),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { campaignId } = await context.params;
    return NextResponse.json({
      schedule: await deleteCampaignSchedule(actor, { campaignId }),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
