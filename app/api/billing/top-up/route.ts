import { NextResponse } from "next/server";
import { z } from "zod";
import { topUpPackageKeySchema } from "../../../../lib/domain/billing";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { createTopUpCheckout } from "../../../../lib/server/billing-store";
import { assertSameOrigin } from "../../../../lib/server/request-security";
import { isStripeConfigured } from "../../../../lib/server/stripe-client";

const topUpSchema = z.object({ packageKey: topUpPackageKeySchema });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe is not connected yet." }, { status: 503 });
    }
    const actor = await getApiActor();
    const input = topUpSchema.parse(await request.json());
    return NextResponse.json(await createTopUpCheckout(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
