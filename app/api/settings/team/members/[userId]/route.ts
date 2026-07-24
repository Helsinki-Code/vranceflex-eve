import { NextResponse } from "next/server";
import { updateMemberRoleSchema } from "../../../../../../lib/domain/team";
import { getApiActor } from "../../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../../lib/server/request-security";
import {
  removeMember,
  updateMemberRole,
} from "../../../../../../lib/server/team-store";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { userId } = await context.params;
    const input = updateMemberRoleSchema.parse(await request.json());
    const result = await updateMemberRole(actor, userId, input.role);
    return NextResponse.json({ member: result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { userId } = await context.params;
    const result = await removeMember(actor, userId);
    return NextResponse.json({ member: result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
