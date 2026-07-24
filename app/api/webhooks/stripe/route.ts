import { NextResponse } from "next/server";
import { applyStripeWebhookEvent } from "../../../../lib/server/billing-store";
import { getStripeClient, isStripeConfigured } from "../../../../lib/server/stripe-client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!isStripeConfigured() || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook verification is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  const body = await request.text();
  let event;
  try {
    event = getStripeClient().webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json(
      { error: "Webhook signature verification failed." },
      { status: 400 },
    );
  }

  try {
    const result = await applyStripeWebhookEvent(event);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "The Stripe event could not be processed." },
      { status: 500 },
    );
  }
}
