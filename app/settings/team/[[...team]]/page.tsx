import { eq } from "drizzle-orm";
import { ArrowLeft, ShieldCheck, UsersRound } from "lucide-react";
import { AppShell } from "../../../../components/app-shell";
import { TeamManagementPanel } from "../../../../components/team-management-panel";
import { isAuthConfigured } from "../../../../lib/auth/config";
import { requireWorkspacePage } from "../../../../lib/auth/page-actor";
import { getDatabase } from "../../../../lib/server/database";
import { organizations } from "../../../../lib/server/database/schema";
import { listMembers, listPendingInvites } from "../../../../lib/server/team-store";

export const metadata = { title: "Team settings · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const actor = await requireWorkspacePage();
  const database = getDatabase();
  const [workspace] = await database
    .select()
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId))
    .limit(1);
  const isAdmin = actor.organizationRole === "admin";
  const members = await listMembers(actor);
  const invites = isAdmin ? await listPendingInvites(actor) : [];

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="WORKSPACE CONTROL"
      title="Team"
    >
      <a className="settings-back" href="/settings">
        <ArrowLeft size={15} /> All settings
      </a>
      <section className="team-settings-card">
        <div className="team-settings-head">
          <span><UsersRound size={20} /></span>
          <div>
            <p className="section-label">ORGANIZATION</p>
            <h2>{workspace?.name ?? "Workspace"}</h2>
            <p>Every campaign, lead and approval is isolated to this organization.</p>
          </div>
        </div>
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
      </section>
      <div className="truth-banner">
        <ShieldCheck size={18} />
        <p><strong>Permissions enforced server-side.</strong> Membership roles are read from Neon for every authenticated request.</p>
      </div>
    </AppShell>
  );
}
