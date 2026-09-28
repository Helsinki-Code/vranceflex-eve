import { NextResponse } from "next/server";
import Twilio from "twilio";
import { getOrgTwilioCredentials } from "../../../../../lib/server/channel-credentials";
import { processTwilioWebhook } from "../../../../../lib/server/twilio-webhook";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ organizationId: string }> };

const emptyTwiml = () => new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { headers: { "Content-Type": "text/xml" } });

// Twilio signs the exact public URL it called. Behind a proxy request.url can
// differ in scheme or host, so the configured public base URL is tried too.
function candidateUrls(request: Request, organizationId: string) {
  const urls = new Set<string>([request.url]);
  const base = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (base) urls.add(`${base}/api/webhooks/twilio/${organizationId}`);
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) urls.add(`https://${forwardedHost}/api/webhooks/twilio/${organizationId}`);
  return [...urls];
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  const credentials = await getOrgTwilioCredentials(organizationId);
  if (!credentials) {
    return NextResponse.json({ error: "This workspace has not connected a Twilio account." }, { status: 503 });
  }

  const signature = request.headers.get("x-twilio-signature");
  if (!signature) return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });

  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") params[key] = value;

  const valid = candidateUrls(request, organizationId).some((url) => Twilio.validateRequest(credentials.authToken, signature, url, params));
  if (!valid || params.AccountSid !== credentials.accountSid) {
    return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 403 });
  }

  try {
    await processTwilioWebhook(organizationId, params);
    return emptyTwiml();
  } catch (error) {
    console.error("[twilio-webhook] processing failed", { organizationId, error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: "The webhook could not be processed." }, { status: 500 });
  }
}
