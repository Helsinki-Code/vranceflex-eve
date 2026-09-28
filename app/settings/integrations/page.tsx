import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { ChannelConnectionsPanel } from "../../../components/channel-connections-panel";
import { isAuthConfigured } from "../../../lib/auth/config";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";
import { getChannelConnectionSummary } from "../../../lib/server/channel-credentials";

export const metadata = { title: "Delivery providers · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const actor = await requireWorkspacePage();
  const connections = await getChannelConnectionSummary(actor.organizationId).catch(() => ({ resend: { connected: false as const }, twilio: { connected: false as const } }));

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="Workspace settings"
      title="Delivery providers"
      description="Outreach goes out from your own Resend and Twilio accounts, so deliverability, sender reputation and provider costs stay yours. A channel can't be scheduled until it's connected here."
      actions={<Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href="/settings"><ArrowLeft className="size-3.5" />All settings</Link>}
    >
      <div className="space-y-6">
        <ChannelConnectionsPanel
          initialResend={connections.resend}
          initialTwilio={connections.twilio}
          isAdmin={actor.organizationRole === "admin"}
          organizationId={actor.organizationId}
        />
        <p className="text-xs leading-5 text-muted-foreground">Keys are validated with the provider when you save, then encrypted at rest. They're never shown again, sent to the browser, or passed to the AI agents.</p>
      </div>
    </AppShell>
  );
}
