import { and, eq, inArray } from "drizzle-orm";
import { isResendConfigured } from "../auth/config";
import { PAYMENT_GRACE_DAYS } from "../domain/billing";
import { getDatabase } from "./database";
import { organizationMemberships, organizations, users } from "./database/schema";
import { platformResendCredentials, sendResendEmail } from "./resend-email";

type BillingNotice = "payment_failed" | "payment_action_required";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

async function billingRecipients(organizationId: string) {
  const database = getDatabase();
  const rows = await database
    .select({ email: users.email, workspace: organizations.name })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(eq(organizationMemberships.organizationId, organizationId), inArray(organizationMemberships.role, ["admin", "billing"])));
  return rows.filter((row): row is { email: string; workspace: string } => Boolean(row.email));
}

// Best effort: a missing platform Resend account or a send failure must never
// fail the Stripe webhook, or Stripe would keep retrying the same event.
export async function sendBillingNotice(input: { organizationId: string; kind: BillingNotice; hostedInvoiceUrl?: string | null; amountDue?: number | null; currency?: string | null }) {
  if (!isResendConfigured()) return { sent: 0 };
  const recipients = await billingRecipients(input.organizationId);
  if (!recipients.length) return { sent: 0 };
  const workspace = recipients[0]!.workspace;
  const base = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const actionUrl = input.hostedInvoiceUrl ?? `${base}/settings/billing`;
  const amount = input.amountDue != null && input.currency
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: input.currency.toUpperCase() }).format(input.amountDue / 100)
    : null;
  const subject = input.kind === "payment_failed"
    ? `Payment failed for ${workspace} on VranceFlex`
    : `Confirm your VranceFlex payment for ${workspace}`;
  const body = input.kind === "payment_failed"
    ? `We couldn't charge the card on file${amount ? ` for ${amount}` : ""}. Stripe will retry automatically. Research and sending keep working for ${PAYMENT_GRACE_DAYS} days; after that the workspace pauses until the invoice is paid.`
    : `Your bank asked for an extra confirmation step${amount ? ` on the ${amount} payment` : ""}. Open the invoice to complete it and keep the subscription active.`;
  const cta = input.kind === "payment_failed" ? "Update payment method" : "Confirm payment";

  let sent = 0;
  for (const recipient of recipients) {
    try {
      await sendResendEmail(platformResendCredentials(), {
        to: recipient.email,
        subject,
        text: `${body}\n\n${cta}: ${actionUrl}`,
        html: `<div style="background:#f5f4ef;padding:40px 20px;font-family:Arial,sans-serif;color:#16181d"><div style="max-width:520px;margin:auto;background:#fbfaf7;border:1px solid #e0ddd4;border-radius:10px;padding:32px"><p style="font-size:12px;color:#5c6068;margin:0 0 16px">VranceFlex · ${escapeHtml(workspace)}</p><h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(subject)}</h1><p style="line-height:1.6;color:#3b3f46">${escapeHtml(body)}</p><p style="margin:24px 0 0"><a href="${escapeHtml(actionUrl)}" style="background:#1f4fd1;color:#fbfaf7;padding:11px 16px;border-radius:6px;text-decoration:none;font-weight:600">${cta}</a></p></div></div>`,
        tags: [{ name: "category", value: input.kind }],
      });
      sent += 1;
    } catch (error) {
      console.error("[billing] notice email failed", { organizationId: input.organizationId, kind: input.kind, error: error instanceof Error ? error.message : error });
    }
  }
  return { sent };
}
