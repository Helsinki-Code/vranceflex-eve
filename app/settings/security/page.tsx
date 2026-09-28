import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { IntegrationStatusGrid } from "../../../components/integration-status-grid";
import { isAuthConfigured } from "../../../lib/auth/config";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";
import { getIntegrationStatuses } from "../../../lib/server/integration-status";

export const metadata = { title: "Platform status · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  await requireWorkspacePage();

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="Workspace settings"
      title="Platform status"
      description="Which services this deployment has configured. Only presence is checked; secret values never leave the server."
      actions={<Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href="/settings"><ArrowLeft className="size-3.5" />All settings</Link>}
    >
      <div className="space-y-6">
        <IntegrationStatusGrid integrations={getIntegrationStatuses()} />
        <section className="grid gap-4 border-t border-rule pt-6 text-sm md:grid-cols-3">
          <div className="space-y-1"><p className="font-medium">Workspace isolation</p><p className="leading-6 text-muted-foreground">Every read and write is scoped to the workspace on your verified session, never to an ID sent from the browser or a prompt.</p></div>
          <div className="space-y-1"><p className="font-medium">Agent access</p><p className="leading-6 text-muted-foreground">The AI agents run with your session's workspace stamped on every call and can't see provider keys.</p></div>
          <div className="space-y-1"><p className="font-medium">Fails closed</p><p className="leading-6 text-muted-foreground">A missing or rejected credential stops that stage with an error instead of reporting a result that didn't happen.</p></div>
        </section>
      </div>
    </AppShell>
  );
}
