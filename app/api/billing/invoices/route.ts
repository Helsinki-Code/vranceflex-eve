import { NextResponse } from "next/server";
import { getApiActor } from "../../../../lib/server/api-actor";
import { apiErrorResponse } from "../../../../lib/server/api-response";
import { listInvoices } from "../../../../lib/server/billing-store";
import { isStripeConfigured } from "../../../../lib/server/stripe-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!isStripeConfigured()) return NextResponse.json({ invoices: [] });
    const actor = await getApiActor();
    return NextResponse.json({ invoices: await listInvoices(actor) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
