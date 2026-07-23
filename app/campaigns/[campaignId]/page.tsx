import { AppShell } from "../../../components/app-shell";
import { CampaignWorkspace } from "../../../components/campaign-workspace";
import { isAuthConfigured } from "../../../lib/auth/config";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";

type PageContext = {
  params: Promise<{ campaignId: string }>;
};

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: PageContext) {
  await requireWorkspacePage();
  const { campaignId } = await params;

  return (
    <AppShell
      authConfigured={isAuthConfigured()}
      eyebrow="CAMPAIGN CONTROL"
      title="Review workspace"
    >
      <CampaignWorkspace campaignId={campaignId} />
    </AppShell>
  );
}
