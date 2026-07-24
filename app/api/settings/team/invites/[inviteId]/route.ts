import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../../lib/server/request-security";
import { revokeInvite } from "../../../../../../lib/server/team-store";

type RouteContext = {
  params: Promise<{ inviteId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { inviteId } = await context.params;
    const result = await revokeInvite(actor, inviteId);
    return NextResponse.json({ invite: result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
