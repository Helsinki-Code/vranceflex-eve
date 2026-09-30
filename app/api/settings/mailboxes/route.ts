import { NextResponse } from "next/server";
import { mailboxConnectionSchema } from "../../../../lib/domain/mailboxes";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../lib/server/request-security";
import { connectMailbox, getSendingOverview } from "../../../../lib/server/mailbox-store";

export const runtime = "nodejs";
// Connecting runs a live SMTP and IMAP login.
export const maxDuration = 60;

export async function GET() {
  try {
    const actor = await getApiActor();
    return NextResponse.json(await getSendingOverview(actor.organizationId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const input = mailboxConnectionSchema.parse(await request.json());
    return NextResponse.json(await connectMailbox(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
