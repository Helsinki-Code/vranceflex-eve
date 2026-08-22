import { ArrowLeft, CalendarDays, Check, CreditCard, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { BillingActions } from "../../../components/billing-actions";
import { GlowCard } from "../../../components/aceternity";
import { isAuthConfigured } from "../../../lib/auth/config";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";
import { getApiActor } from "../../../lib/server/api-actor";
import { getBillingOverview } from "../../../lib/server/billing-entitlements";
import { checkoutConfiguration } from "../../../lib/server/billing-prices";
import { isStripeConfigured } from "../../../lib/server/stripe-client";

export const metadata = { title: "Billing · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  await requireWorkspacePage();
  const actor = await getApiActor();
  const stripeConfigured = isStripeConfigured();
  const billing = await getBillingOverview(actor.organizationId);
  const configuration = checkoutConfiguration();

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="WORKSPACE CONTROL"
      title="Plans & usage"
    >
      <a className="settings-back" href="/settings"><ArrowLeft size={15} /> All settings</a>

      <div className="billing-summary-grid">
        <GlowCard as="section" className="billing-summary-card">
          <span><CreditCard size={19} /></span>
          <small>CURRENT PLAN</small>
          <strong>{billing.plan?.name ?? "No active plan"}</strong>
          <p>{billing.active ? `${billing.billingInterval === "year" ? "Annual" : "Monthly"} subscription active` : "Live research is locked until a plan is active."}</p>
        </GlowCard>
        <GlowCard as="section" className="billing-summary-card">
          <span><Check size={19} /></span>
          <small>PROSPECT CREDITS</small>
          <strong>{billing.credits.available.toLocaleString()}</strong>
          <p>
            {billing.credits.included.toLocaleString()} included · {billing.credits.topUp.toLocaleString()} top-up
            {billing.creditWindowEnd ? <><br />Included credits reset {new Date(billing.creditWindowEnd).toLocaleDateString()}</> : null}
          </p>
        </GlowCard>
        <GlowCard as="section" className="billing-summary-card">
          <span><CalendarDays size={19} /></span>
          <small>ACTIVE CAMPAIGNS</small>
          <strong>{billing.usage.activeCampaigns}{billing.plan ? ` / ${billing.plan.activeCampaigns}` : ""}</strong>
          <p>
            {billing.plan
              ? `${billing.usage.discoveryRuns} / ${billing.usage.discoveryRunLimit} research runs used`
              : "No active credit month"}
          </p>
        </GlowCard>
        <GlowCard as="section" className="billing-summary-card">
          <span><Users size={19} /></span>
          <small>SEATS</small>
          <strong>{billing.usage.seats}{billing.plan ? ` / ${billing.plan.seats}` : ""}</strong>
          <p>Seats are a secondary workspace limit.</p>
        </GlowCard>
      </div>

      {!stripeConfigured ? (
        <section className="billing-setup-warning">
          <ShieldCheck size={18} />
          <div>
            <strong>Stripe setup is incomplete.</strong>
            <p>Add the plan and top-up Price IDs from <code>.env.example</code>. Checkout remains disabled until then.</p>
          </div>
        </section>
      ) : null}

      <BillingActions
        activePlan={billing.planKey}
        configuration={configuration}
        hasActiveSubscription={billing.active}
      />

      <section className="billing-provider-note">
        <ShieldCheck size={18} />
        <div>
          <strong>Delivery remains bring-your-own-key.</strong>
          <p>Resend, Twilio, domains, mailboxes and carrier fees are paid directly by the workspace. They are never deducted from prospect credits.</p>
        </div>
      </section>
    </AppShell>
  );
}
