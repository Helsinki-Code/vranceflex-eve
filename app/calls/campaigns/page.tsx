import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { VoiceCampaignsWorkspace } from "../../../components/voice-campaigns-workspace";
import { isAuthConfigured } from "../../../lib/auth/config";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";

export const metadata = { title: "Voice campaigns · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function VoiceCampaignsPage() {
  const actor = await requireWorkspacePage();
  return (
    <AppShell
      activeHref="/calls"
      authConfigured={isAuthConfigured()}
      eyebrow="AI calling"
      title="Voice campaigns"
      actions={<Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href="/calls"><ArrowLeft className="size-3.5" />All calls</Link>}
    >
      <VoiceCampaignsWorkspace isAdmin={["admin", "reviewer"].includes(actor.organizationRole)} />
    </AppShell>
  );
}
