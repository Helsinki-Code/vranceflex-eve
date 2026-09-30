import { NextResponse } from "next/server";
import { sendingDomainSchema } from "../../../../lib/domain/mailboxes";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../lib/server/request-security";
import { addSendingDomain } from "../../../../lib/server/mailbox-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const input = sendingDomainSchema.parse(await request.json());
    return NextResponse.json(await addSendingDomain(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
