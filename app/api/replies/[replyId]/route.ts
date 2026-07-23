import { NextResponse } from "next/server";
import { replyReviewSchema } from "../../../../lib/domain/pipeline";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { updateReplyReview } from "../../../../lib/server/reply-store";
import { assertSameOrigin } from "../../../../lib/server/request-security";

type RouteContext = {
  params: Promise<{ replyId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await getApiActor();
    const { replyId } = await context.params;
    const input = replyReviewSchema.parse(await request.json());
    const reply = await updateReplyReview(actor, replyId, input.status);
    if (!reply) {
      return NextResponse.json({ error: "Reply was not found." }, { status: 404 });
    }
    return NextResponse.json({ reply });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
