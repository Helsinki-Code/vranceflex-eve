import { NextResponse } from "next/server";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../lib/server/request-security";
import { createPortalSession } from "../../../../lib/server/billing-store";
import { isStripeConfigured } from "../../../../lib/server/stripe-client";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not connected yet." },
        { status: 503 },
      );
    }
    const actor = await getApiActor();
    const result = await createPortalSession(actor);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
