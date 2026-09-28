import { NextResponse } from "next/server";
import { z } from "zod";
import { billingIntervalSchema, selfServePlanKeySchema } from "../../../../lib/domain/billing";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { assertSameOrigin } from "../../../../lib/server/request-security";
import { changeSubscriptionPlan } from "../../../../lib/server/billing-store";
import { isStripeConfigured } from "../../../../lib/server/stripe-client";

const changeSchema = z.object({
  plan: selfServePlanKeySchema,
  interval: billingIntervalSchema,
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Stripe is not connected yet." }, { status: 503 });
    }
    const actor = await getApiActor();
    const input = changeSchema.parse(await request.json());
    return NextResponse.json(await changeSubscriptionPlan(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
