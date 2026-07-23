import { NextResponse } from "next/server";
import { getApiActor } from "../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../lib/server/api-response";
import { listInboundReplies } from "../../../lib/server/reply-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getApiActor();
    return NextResponse.json(
      { replies: await listInboundReplies(actor) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
