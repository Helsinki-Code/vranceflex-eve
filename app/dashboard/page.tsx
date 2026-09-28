import { AppShell } from "../../components/app-shell";
import { CampaignDashboard } from "../../components/campaign-dashboard";
import { isAuthConfigured } from "../../lib/auth/config";
import { requireWorkspacePage } from "../../lib/auth/page-actor";

export const metadata = {
  title: "Campaigns · VranceFlex",
};
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireWorkspacePage();

  return (
    <AppShell
      authConfigured={isAuthConfigured()}
      eyebrow="Workspace"
      title="Campaigns"
      description="Each campaign turns a product into a researched list of people and an approved sequence. Open one to pick up where it stopped."
    >
      <CampaignDashboard />
    </AppShell>
  );
}
