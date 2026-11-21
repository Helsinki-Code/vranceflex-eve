import { NextResponse } from "next/server";
import { getApiActor } from "../../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../../lib/server/api-response";
import { addVoiceAddon } from "../../../../../lib/server/billing-store";
import { assertSameOrigin } from "../../../../../lib/server/request-security";
import { isStripeConfigured } from "../../../../../lib/server/stripe-client";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!isStripeConfigured()) return NextResponse.json({ error: "Stripe is not connected yet." }, { status: 503 });
    const actor = await getApiActor();
    return NextResponse.json(await addVoiceAddon(actor));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
