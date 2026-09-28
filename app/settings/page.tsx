import { ArrowUpRight, CreditCard, KeyRound, PlugZap, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { Notice } from "../../components/product/kit";
import { isAuthConfigured } from "../../lib/auth/config";
import { requireWorkspacePage } from "../../lib/auth/page-actor";

export const metadata = { title: "Settings · VranceFlex" };
export const dynamic = "force-dynamic";

const groups = [
  {
    title: "You",
    items: [["Account", "Name, email, password and signed-in sessions", "/settings/account", UserRound]],
  },
  {
    title: "Workspace",
    items: [
      ["Team & roles", "Invite people and choose who can approve, send and pay", "/settings/team", Users],
      ["Delivery providers", "Connect the Resend and Twilio accounts outreach is sent from", "/settings/integrations", PlugZap],
      ["Plans & usage", "Plan, credits, invoices and payment method", "/settings/billing", CreditCard],
      ["Platform status", "Which services this deployment has configured", "/settings/security", KeyRound],
    ],
  },
] as const;

export default async function SettingsPage() {
  await requireWorkspacePage();

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="Workspace"
      title="Settings"
    >
      <div className="space-y-8">
        {!isAuthConfigured() ? <Notice tone="warning" title="Setup mode">Sign-in is off until DATABASE_URL, AUTH_SECRET and the platform Resend key are set in the hosting environment. Don't invite real users yet.</Notice> : null}
        {groups.map((group) => <section key={group.title} className="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8">
          <h2 className="pt-3 text-sm font-semibold text-muted-foreground">{group.title}</h2>
          <ul className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
            {group.items.map(([title, description, href, Icon]) => <li key={href} className="border-b border-rule last:border-0">
              <Link href={href} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-muted-foreground"><Icon className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="block text-sm text-muted-foreground">{description}</span></span>
                <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            </li>)}
          </ul>
        </section>)}
      </div>
    </AppShell>
  );
}
