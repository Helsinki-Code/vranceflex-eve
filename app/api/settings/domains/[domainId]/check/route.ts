import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../../lib/server/request-security";
import { recheckSendingDomain } from "../../../../../../lib/server/mailbox-store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ domainId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { domainId } = await params;
    return NextResponse.json(await recheckSendingDomain(actor, domainId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
