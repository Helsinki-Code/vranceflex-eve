import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { AppChrome, type ShellAccount, type ShellPlan } from "./app-chrome";
import { getCurrentActor, listUserWorkspaces } from "../lib/server/auth-store";
import { getDatabase } from "../lib/server/database";
import { organizations } from "../lib/server/database/schema";
import { getBillingOverview } from "../lib/server/billing-entitlements";

async function loadShellContext(authConfigured: boolean): Promise<{ account: ShellAccount; plan: ShellPlan | null }> {
  const demo: ShellAccount = { workspace: "Demo workspace", workspaceId: "demo-organization", role: "setup mode", name: "Demo user", email: "demo@vranceflex.local", demo: true, workspaces: [] };
  if (!authConfigured) return { account: demo, plan: null };
  const actor = await getCurrentActor().catch(() => null);
  if (!actor) return { account: demo, plan: null };
  const [organization, billing, workspaces] = await Promise.all([
    getDatabase().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, actor.organizationId)).limit(1).then((rows) => rows[0]).catch(() => undefined),
    getBillingOverview(actor.organizationId).catch(() => null),
    listUserWorkspaces(actor.userId).catch(() => []),
  ]);
  return {
    account: { workspace: organization?.name ?? "Workspace", workspaceId: actor.organizationId, role: actor.organizationRole, name: actor.name ?? actor.email, email: actor.email, demo: false, workspaces },
    plan: billing ? {
      name: billing.plan?.name ?? null,
      active: billing.active,
      status: billing.status,
      available: billing.credits.available,
      included: billing.plan?.verifiedProspects ?? 0,
    } : null,
  };
}

export async function AppShell({ children, title, eyebrow, description, actions, authConfigured = false }: { children: ReactNode; title: string; eyebrow: string; description?: ReactNode; actions?: ReactNode; authConfigured?: boolean; activeHref?: string }) {
  const { account, plan } = await loadShellContext(authConfigured);
  return <AppChrome title={title} eyebrow={eyebrow} description={description} actions={actions} account={account} plan={plan}>{children}</AppChrome>;
}
