import { NextResponse } from "next/server";
import { reconcileSubscriptions } from "../../../../lib/server/billing-store";
import { isStripeConfigured } from "../../../../lib/server/stripe-client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without a secret the
// route stays closed rather than letting anyone trigger Stripe reads.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json({ skipped: "Stripe is not configured." });
  }
  const result = await reconcileSubscriptions();
  if (result.failures.length) console.error("[billing] reconcile failures", result.failures);
  return NextResponse.json(result);
}
