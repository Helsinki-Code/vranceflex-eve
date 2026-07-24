import { ArrowLeft, Check, CreditCard, ShieldCheck } from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { BillingActions } from "../../../components/billing-actions";
import { isAuthConfigured } from "../../../lib/auth/config";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";
import { getApiActor } from "../../../lib/server/api-actor";
import { getBillingSummary } from "../../../lib/server/billing-store";
import { isStripeConfigured } from "../../../lib/server/stripe-client";

export const metadata = { title: "Billing · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  await requireWorkspacePage();
  const stripeConfigured = isStripeConfigured();
  const priceId = process.env.STRIPE_PRICE_ID_PRO?.trim() || null;
  const billing = stripeConfigured ? await getBillingSummary(await getApiActor()) : null;
  const hasActiveSubscription = Boolean(
    billing && ["active", "trialing", "past_due"].includes(billing.status),
  );

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="WORKSPACE CONTROL"
      title="Billing"
    >
      <a className="settings-back" href="/settings"><ArrowLeft size={15} /> All settings</a>
      <div className="billing-layout">
        <section className="plan-card">
          <span className="section-label">CURRENT PLAN</span>
          <h2>{stripeConfigured ? (hasActiveSubscription ? "Pro plan" : "Workspace plan") : "Setup mode"}</h2>
          <p>{stripeConfigured ? "Billing is connected for this deployment." : "Stripe is not connected. No customer can be charged."}</p>
          <ul>
            <li><Check size={15} /> Organization-scoped usage ledger</li>
            <li><Check size={15} /> Idempotent billing event keys</li>
            <li><Check size={15} /> Lead and channel limits ready</li>
          </ul>
          {stripeConfigured && (
            <BillingActions hasActiveSubscription={hasActiveSubscription} priceId={priceId} />
          )}
        </section>
        <section className="billing-safety">
          <span><CreditCard size={22} /></span>
          {stripeConfigured ? (
            <>
              <h2>Checkout and the billing portal are live.</h2>
              <p>Subscription changes flow through Stripe webhooks and update this workspace automatically.</p>
            </>
          ) : (
            <>
              <h2>Billing actions remain disabled.</h2>
              <p>Checkout, subscription changes and invoices will activate only after Stripe webhooks and production plan IDs are configured.</p>
            </>
          )}
          <div><ShieldCheck size={16} /> Repeated provider events cannot create repeated usage entries.</div>
        </section>
      </div>
    </AppShell>
  );
}
