import { CampaignWizard } from "../../../components/campaign-wizard";
import { AceternityLink, GlowCard } from "../../../components/aceternity";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";
import { getBillingOverview } from "../../../lib/server/billing-entitlements";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const metadata = { title: "New campaign · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireWorkspacePage();
  const params = await searchParams;
  const mode = params.mode === "idea" ? "idea" : "website";
  const rawValue = mode === "idea" ? params.idea : params.url;
  const initialValue = typeof rawValue === "string" ? rawValue : "";
  const billing = await getBillingOverview(actor.organizationId);

  return (
    <main className="wizard-page">
      <nav className="wizard-nav">
        <a className="brand" href="/"><span className="brand-mark">VF</span><span>VranceFlex</span></a>
        <span>New campaign</span>
        <a href="/dashboard">Exit to dashboard</a>
      </nav>
      {billing.active ? (
        <CampaignWizard
          creditBalance={billing.credits.available}
          initialMode={mode}
          initialValue={initialValue}
          planName={billing.plan?.name ?? "Paid"}
        />
      ) : (
        <GlowCard as="section" className="campaign-billing-gate">
          <span className="section-label">LIVE RESEARCH REQUIRES A PLAN</span>
          <h1>See the workflow first. Activate it when you are ready.</h1>
          <p>
            VranceFlex does not run billable Parallel research on an unpaid workspace.
            Explore the guided sample campaign or activate a plan to create a live campaign.
          </p>
          <div>
            <AceternityLink className="button-primary" href="/settings/billing">Choose a plan</AceternityLink>
            <AceternityLink className="button-secondary" href="/demo">View sample campaign</AceternityLink>
          </div>
        </GlowCard>
      )}
      <p className="wizard-footnote">Drafts are private to your workspace. No external action occurs during setup.</p>
    </main>
  );
}
