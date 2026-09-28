import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { BillingActions } from "../../../components/billing-actions";
import { isAuthConfigured } from "../../../lib/auth/config";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";
import { emptyBillingOverview, getBillingOverview } from "../../../lib/server/billing-entitlements";
import { billingSetupGaps, checkoutConfiguration } from "../../../lib/server/billing-prices";
import { canManageBilling } from "../../../lib/server/billing-store";

export const metadata = { title: "Billing · VranceFlex" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireWorkspacePage();
  const params = await searchParams;
  const billing = await getBillingOverview(actor.organizationId).catch(() => emptyBillingOverview());
  const manage = canManageBilling(actor.organizationRole);
  const returnState =
    params.checkout === "success" ? "checkout_success"
      : params.checkout === "cancelled" ? "checkout_cancelled"
        : params.topup === "success" ? "topup_success"
          : params.topup === "cancelled" ? "topup_cancelled"
            : null;

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="Workspace settings"
      title="Plans & usage"
      description="Your plan sets how many verified prospects research can deliver each month. Delivery through Resend and Twilio stays on your own accounts and never uses credits."
      actions={<Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href="/settings"><ArrowLeft className="size-3.5" />All settings</Link>}
    >
      <BillingActions
        billing={billing}
        configuration={checkoutConfiguration()}
        canManage={manage}
        setupGaps={manage ? billingSetupGaps() : []}
        returnState={returnState}
      />
    </AppShell>
  );
}
