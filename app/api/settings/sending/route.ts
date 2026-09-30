import { NextResponse } from "next/server";
import { emailTransportSchema } from "../../../../lib/domain/mailboxes";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../lib/server/request-security";
import { setEmailTransport } from "../../../../lib/server/mailbox-store";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { emailTransport } = emailTransportSchema.parse(await request.json());
    return NextResponse.json(await setEmailTransport(actor, emailTransport));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
