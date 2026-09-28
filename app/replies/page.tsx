import { AppShell } from "../../components/app-shell";
import { ReplyInbox } from "../../components/reply-inbox";
import { isAuthConfigured } from "../../lib/auth/config";
import { requireWorkspacePage } from "../../lib/auth/page-actor";

export const metadata = { title: "Replies · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function RepliesPage() {
  await requireWorkspacePage();
  return (
    <AppShell
      activeHref="/replies"
      authConfigured={isAuthConfigured()}
      eyebrow="Review queue"
      title="Replies"
      description="Inbound replies, sorted by what they ask for. Work through them with j and k; nothing is answered automatically."
    >
      <ReplyInbox />
    </AppShell>
  );
}
