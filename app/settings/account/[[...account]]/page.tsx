import { ArrowLeft } from "lucide-react";
import { AccountSettingsForm } from "../../../../components/account-settings-form";
import { AppShell } from "../../../../components/app-shell";
import { isAuthConfigured } from "../../../../lib/auth/config";
import { requireWorkspacePage } from "../../../../lib/auth/page-actor";
import Link from "next/link";

export const metadata = { title: "Account settings · VranceFlex" };
export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const actor = await requireWorkspacePage();

  return (
    <AppShell
      activeHref="/settings"
      authConfigured={isAuthConfigured()}
      eyebrow="WORKSPACE CONTROL"
      title="Account"
    >
      <Link className="settings-back" href="/settings">
        <ArrowLeft size={15} /> All settings
      </Link>
      <AccountSettingsForm
        email={actor.email}
        name={actor.name ?? actor.email.split("@")[0]}
      />
    </AppShell>
  );
}
