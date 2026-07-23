import { NextResponse } from "next/server";
import { outreachMessageUpdateSchema } from "../../../../../../lib/domain/pipeline";
import { getApiActor } from "../../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../../lib/server/api-response";
import { updateOutreachMessage } from "../../../../../../lib/server/outreach-store";
import { assertSameOrigin } from "../../../../../../lib/server/request-security";

type RouteContext = {
  params: Promise<{ campaignId: string; messageId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { campaignId, messageId } = await context.params;
    const input = outreachMessageUpdateSchema.parse(await request.json());
    return NextResponse.json({
      message: await updateOutreachMessage(actor, campaignId, messageId, input),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
