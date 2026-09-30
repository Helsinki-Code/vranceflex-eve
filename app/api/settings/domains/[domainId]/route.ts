import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { removeSendingDomain } from "../../../../../lib/server/mailbox-store";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ domainId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { domainId } = await params;
    return NextResponse.json(await removeSendingDomain(actor, domainId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
