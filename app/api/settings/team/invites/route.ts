import { NextResponse } from "next/server";
import { createInviteSchema } from "../../../../../lib/domain/team";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import {
  createInvite,
  listPendingInvites,
} from "../../../../../lib/server/team-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getApiActor();
    return NextResponse.json(
      { invites: await listPendingInvites(actor) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const input = createInviteSchema.parse(await request.json());
    const invite = await createInvite(actor, input);
    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
