import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AccountSettingsForm } from "../../../../components/account-settings-form";
import { AppShell } from "../../../../components/app-shell";
import { isAuthConfigured } from "../../../../lib/auth/config";
import { requireWorkspacePage } from "../../../../lib/auth/page-actor";

export const metadata = { title: "Account settings · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const actor = await requireWorkspacePage();

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="Your settings"
      title="Account"
      actions={<Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href="/settings"><ArrowLeft className="size-3.5" />All settings</Link>}
    >
      <AccountSettingsForm email={actor.email} name={actor.name ?? actor.email.split("@")[0]} />
    </AppShell>
  );
}
