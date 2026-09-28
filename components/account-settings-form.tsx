"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FormField, Panel } from "./product/kit";

export function AccountSettingsForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name") }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Profile could not be updated.");
      toast.success("Profile saved.");
      router.refresh();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Profile could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid max-w-2xl gap-6">
    <Panel title="Profile" description="Your name appears on approvals and in the activity history.">
      <form className="grid gap-4" onSubmit={submit}>
        <FormField label="Display name"><Input defaultValue={name} name="name" required maxLength={120} /></FormField>
        <FormField label="Email" hint="Verified at sign-up. Contact support to change it."><Input disabled value={email} /></FormField>
        <Button className="justify-self-start" disabled={busy} type="submit">{busy ? <LoaderCircle className="animate-spin" /> : null}Save profile</Button>
      </form>
    </Panel>
    <Panel title="Password & sessions" description="Resetting your password signs you out everywhere else.">
      <Button asChild variant="outline" size="sm"><Link href="/forgot-password">Reset password</Link></Button>
    </Panel>
  </div>;
}
