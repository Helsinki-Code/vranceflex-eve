import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../lib/server/request-security";
import { createCheckoutSession } from "../../../../lib/server/billing-store";
import { isStripeConfigured } from "../../../../lib/server/stripe-client";

const checkoutSchema = z.object({ priceId: z.string().trim().min(1) });

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
    const input = checkoutSchema.parse(await request.json());
    const result = await createCheckoutSession(actor, input);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
