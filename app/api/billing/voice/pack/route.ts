import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { createVoicePackCheckout } from "../../../../../lib/server/billing-store";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { isStripeConfigured } from "../../../../../lib/server/stripe-client";
import { voicePackKeys } from "../../../../../lib/server/voice-billing";

const schema = z.object({ packKey: z.enum(voicePackKeys) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!isStripeConfigured()) return NextResponse.json({ error: "Stripe is not connected yet." }, { status: 503 });
    const actor = await getApiActor();
    return NextResponse.json(await createVoicePackCheckout(actor, schema.parse(await request.json())));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
