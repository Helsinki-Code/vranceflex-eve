import Link from "next/link";
import { X } from "lucide-react";
import { CampaignWizard } from "../../../components/campaign-wizard";
import { BrandLockup } from "../../../components/brand/vranceflex-logo";
import { Button } from "../../../components/ui/button";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";
import { emptyBillingOverview, getBillingOverview } from "../../../lib/server/billing-entitlements";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const metadata = { title: "New campaign · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireWorkspacePage();
  const params = await searchParams;
  const mode = params.mode === "idea" ? "idea" : "website";
  const rawValue = mode === "idea" ? params.idea : params.url;
  const initialValue = typeof rawValue === "string" ? rawValue : "";
  const billing = await getBillingOverview(actor.organizationId).catch(() => emptyBillingOverview());

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <nav className="flex h-14 items-center justify-between border-b border-rule px-4 sm:px-6">
        <Link className="[&_svg]:h-6 [&_svg]:w-auto" href="/dashboard" aria-label="Back to dashboard"><BrandLockup /></Link>
        <span className="font-mono text-xs text-muted-foreground">new campaign</span>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground"><Link href="/dashboard"><X />Close</Link></Button>
      </nav>
      <div className="px-4 py-10 sm:px-6">
        {billing.active || actor.demo ? (
          <CampaignWizard creditBalance={actor.demo ? 500 : billing.credits.available} initialMode={mode} initialValue={initialValue} planName={actor.demo ? "the demo" : billing.plan?.name ?? "your"} />
        ) : (
          <section className="mx-auto max-w-xl rounded-[var(--radius)] border border-border bg-card p-8">
            <p className="font-mono text-xs text-muted-foreground">no active plan</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Live research needs a plan</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Research runs paid searches and verification, so it only starts on a workspace with an active plan. You can walk through a sample campaign first.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild><Link href="/settings/billing">See plans</Link></Button>
              <Button asChild variant="outline"><Link href="/demo">Open the sample campaign</Link></Button>
            </div>
          </section>
        )}
        <p className="mx-auto mt-6 max-w-4xl text-center text-xs text-muted-foreground">Drafts stay in this browser until you start research.</p>
      </div>
    </main>
  );
}
