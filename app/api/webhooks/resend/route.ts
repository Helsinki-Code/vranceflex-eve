import { NextResponse } from "next/server";
import { Webhook } from "svix";
import {
  processResendWebhook,
  type ResendWebhookEvent,
} from "../../../../lib/server/resend-webhook";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Resend webhook verification is not configured." },
      { status: 503 },
    );
  }

  const providerEventId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!providerEventId || !timestamp || !signature) {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  const body = await request.text();
  let event: ResendWebhookEvent;
  try {
    event = new Webhook(secret).verify(body, {
      "svix-id": providerEventId,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    }) as ResendWebhookEvent;
  } catch {
    return NextResponse.json(
      { error: "Webhook signature verification failed." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await processResendWebhook(providerEventId, event),
    );
  } catch {
    return NextResponse.json(
      { error: "The webhook could not be processed." },
      { status: 500 },
    );
  }
}
