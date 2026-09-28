import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "../../../../components/app-shell";
import { TeamManagementPanel } from "../../../../components/team-management-panel";
import { isAuthConfigured } from "../../../../lib/auth/config";
import { requireWorkspacePage } from "../../../../lib/auth/page-actor";
import { getDatabase, hasDatabaseConfiguration } from "../../../../lib/server/database";
import { organizations } from "../../../../lib/server/database/schema";
import { listMembers, listPendingInvites } from "../../../../lib/server/team-store";
import Link from "next/link";

export const metadata = { title: "Team settings · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const actor = await requireWorkspacePage();
  const isAdmin = actor.organizationRole === "admin";
  // Demo mode has no database; show the demo user so the page still renders.
  if (!hasDatabaseConfiguration()) {
    return renderPage({ actor, workspaceName: "Demo workspace", isAdmin, members: [{ id: actor.userId, name: actor.name, email: actor.email, role: actor.organizationRole, verifiedAt: new Date() }], invites: [] });
  }
  const database = getDatabase();
  const [workspace] = await database
    .select()
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId))
    .limit(1);
  const members = await listMembers(actor);
  const invites = isAdmin ? await listPendingInvites(actor) : [];
  return renderPage({ actor, workspaceName: workspace?.name ?? "this workspace", isAdmin, members, invites });
}

function renderPage({ actor, workspaceName, isAdmin, members, invites }: {
  actor: { userId: string };
  workspaceName: string;
  isAdmin: boolean;
  members: Array<{ id: string; name: string | null; email: string | null; role: "admin" | "member" | "reviewer" | "billing"; verifiedAt: Date | null }>;
  invites: Array<{ id: string; email: string; role: "admin" | "member" | "reviewer" | "billing"; expiresAt: Date }>;
}) {
  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="Workspace settings"
      title="Team & roles"
      description={`Everyone in ${workspaceName} and what they can do. Roles are checked on the server for every request.`}
      actions={<Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href="/settings"><ArrowLeft className="size-3.5" />All settings</Link>}
    >
      <TeamManagementPanel
        currentUserId={actor.userId}
        initialInvites={invites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt.toISOString(),
        }))}
        initialMembers={members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          verifiedAt: member.verifiedAt ? member.verifiedAt.toISOString() : null,
        }))}
        isAdmin={isAdmin}
      />
    </AppShell>
  );
}
