import { ArrowLeft, Target } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { IcpReport } from "../../components/icp-report";
import { EmptyState } from "../../components/product/kit";
import { Button } from "../../components/ui/button";
import { isAuthConfigured } from "../../lib/auth/config";
import { requireWorkspacePage } from "../../lib/auth/page-actor";
import { getApiActor } from "../../lib/server/api-actor";
import { getIcpProfile } from "../../lib/server/lead-store";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "ICP report · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function IcpPage({ searchParams }: { searchParams: SearchParams }) {
  await requireWorkspacePage();
  const params = await searchParams;
  const campaignId =
    typeof params.campaign === "string" ? params.campaign : undefined;
  const actor = await getApiActor();
  const profile = await getIcpProfile(actor, campaignId);

  return (
    <AppShell
      activeHref="/leads"
      authConfigured={isAuthConfigured()}
      eyebrow="Research"
      title="ICP report"
      actions={<Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href="/leads"><ArrowLeft className="size-3.5" />Back to leads</Link>}
    >
      {profile ? (
        <IcpReport profile={profile} />
      ) : (
        <EmptyState icon={<Target />} title="No ICP report yet" description="The profile is written once a campaign's research has enough evidence behind it, usually right after leads are approved." action={<Button asChild variant="outline" size="sm"><Link href="/leads">Back to leads</Link></Button>} />
      )}
    </AppShell>
  );
}
