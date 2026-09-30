import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { SendingWorkspace } from "../../../components/sending-workspace";
import { Notice } from "../../../components/product/kit";
import { isAuthConfigured } from "../../../lib/auth/config";
import { requireWorkspacePage } from "../../../lib/auth/page-actor";
import { getSendingOverview, type SendingOverview } from "../../../lib/server/mailbox-store";

export const metadata = { title: "Sending · VranceFlex" };
export const dynamic = "force-dynamic";

const emptyOverview: SendingOverview = { mailboxes: [], domains: [], emailTransport: "auto", resendConnected: false, orgDailyEmailLimit: 100, timezone: "UTC" };

export default async function SendingPage() {
  const actor = await requireWorkspacePage();
  let loadFailed = false;
  // Setup mode has no database; show the empty state rather than an error.
  const overview = actor.demo ? emptyOverview : await getSendingOverview(actor.organizationId).catch((error) => {
    console.error("[sending] overview failed", error instanceof Error ? error.message : error);
    loadFailed = true;
    return emptyOverview;
  });

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="Workspace settings"
      title="Sending"
      description="Outreach email goes out from mailboxes you own, rotating across them within safe daily limits. Replies to every mailbox arrive in Replies."
      actions={<Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href="/settings"><ArrowLeft className="size-3.5" />All settings</Link>}
    >
      <div className="space-y-6">
        {loadFailed ? <Notice tone="danger" title="Sending settings couldn't be loaded">Refresh the page. If this keeps happening, the database may be missing the latest migration.</Notice> : null}
        <SendingWorkspace initial={overview} isAdmin={actor.organizationRole === "admin"} />
        <p className="text-xs leading-5 text-muted-foreground">Mailbox passwords are checked with the provider when you save, then encrypted at rest. They&apos;re never shown again, sent to the browser, or passed to the AI agents. VranceFlex reads only inbox messages that reply to or bounce your outreach.</p>
      </div>
    </AppShell>
  );
}
