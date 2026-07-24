import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { getOrgResendCredentials } from "../../../../../lib/server/channel-credentials";
import {
  processResendWebhook,
  type ResendWebhookEvent,
} from "../../../../../lib/server/resend-webhook";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ organizationId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  const credentials = await getOrgResendCredentials(organizationId);
  if (!credentials) {
    return NextResponse.json(
      { error: "This workspace has not connected a Resend account." },
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
    event = new Webhook(credentials.webhookSecret).verify(body, {
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
      await processResendWebhook(providerEventId, event, organizationId, credentials.apiKey),
    );
  } catch {
    return NextResponse.json(
      { error: "The webhook could not be processed." },
      { status: 500 },
    );
  }
}
