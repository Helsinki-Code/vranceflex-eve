import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { CallsInbox } from "../../components/calls-inbox";
import { Button } from "../../components/ui/button";
import { isAuthConfigured } from "../../lib/auth/config";
import { requireWorkspacePage } from "../../lib/auth/page-actor";

export const metadata = { title: "Calls · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function CallsPage() {
  await requireWorkspacePage();
  return (
    <AppShell
      activeHref="/calls"
      authConfigured={isAuthConfigured()}
      eyebrow="Review queue"
      title="Calls"
      description="Every AI call, with what was said, what was agreed and what needs you. Outcomes that call for a person wait here until you've looked."
      actions={<Button asChild variant="outline" size="sm"><Link href="/calls/campaigns">Voice campaigns</Link></Button>}
    >
      <CallsInbox />
    </AppShell>
  );
}
