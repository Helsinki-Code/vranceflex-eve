import { NextResponse } from "next/server";
import { mailboxUpdateSchema } from "../../../../../lib/domain/mailboxes";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { removeMailbox, updateMailbox } from "../../../../../lib/server/mailbox-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ mailboxId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { mailboxId } = await params;
    const input = mailboxUpdateSchema.parse(await request.json());
    return NextResponse.json(await updateMailbox(actor, mailboxId, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { mailboxId } = await params;
    return NextResponse.json(await removeMailbox(actor, mailboxId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
