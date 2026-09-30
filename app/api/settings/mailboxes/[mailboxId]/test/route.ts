import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../../lib/server/api-response";
import { AuthRequestError } from "../../../../../../lib/server/auth-errors";
import { assertSameOrigin } from "../../../../../../lib/server/request-security";
import { sendMailboxTest } from "../../../../../../lib/server/mailbox-store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ mailboxId: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    if (!actor.email) throw new AuthRequestError("Your account has no email address to send the test to.", 400);
    const { mailboxId } = await params;
    return NextResponse.json(await sendMailboxTest(actor, mailboxId, actor.email));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
