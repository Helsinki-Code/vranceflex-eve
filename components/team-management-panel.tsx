"use client";

import { LoaderCircle, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ConfirmAction } from "./product-ui";
import { Chip, FormField, Initials, Panel, SelectField } from "./product/kit";

type Role = "admin" | "member" | "reviewer" | "billing";

export type TeamMember = { id: string; name: string | null; email: string | null; role: Role; verifiedAt: string | null };
export type PendingInvite = { id: string; email: string; role: Role; expiresAt: string };

const roles: Array<{ value: Role; label: string; description: string }> = [
  { value: "admin", label: "Admin", description: "Everything, including team, providers and billing" },
  { value: "reviewer", label: "Reviewer", description: "Approves sequences and schedules sends" },
  { value: "member", label: "Member", description: "Runs research and verifies leads" },
  { value: "billing", label: "Billing", description: "Manages the plan, payment and invoices" },
];
const roleLabel = (role: Role) => roles.find((item) => item.value === role)?.label ?? role;

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

export function TeamManagementPanel({ initialMembers, initialInvites, currentUserId, isAdmin }: { initialMembers: TeamMember[]; initialInvites: PendingInvite[]; currentUserId: string; isAdmin: boolean }) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function withRow(id: string, action: () => Promise<void>, failure: string) {
    setRowBusy(id);
    try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : failure); } finally { setRowBusy(null); }
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const data = await requestJson<{ invite: PendingInvite }>("/api/settings/team/invites", { method: "POST", body: JSON.stringify({ email: form.get("email"), role: form.get("role") }) });
      setInvites((current) => [data.invite, ...current]);
      formElement.reset();
      toast.success(`Invite sent to ${data.invite.email}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The invite could not be sent.");
    } finally {
      setInviteBusy(false);
    }
  }

  return <div className="grid gap-6">
    {isAdmin ? <Panel title="Invite someone" description="Invites expire after 7 days. Each person counts toward your plan's seats once invited.">
      <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end" onSubmit={submitInvite}>
        <FormField label="Email"><Input name="email" placeholder="teammate@company.com" required type="email" /></FormField>
        <FormField label="Role"><SelectField name="role" defaultValue="member" wrapperClassName="sm:w-full" className="h-10 sm:w-full">{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</SelectField></FormField>
        <Button disabled={inviteBusy} type="submit">{inviteBusy ? <LoaderCircle className="animate-spin" /> : <UserPlus />}Send invite</Button>
      </form>
    </Panel> : null}

    <Panel title={`Members · ${members.length}`} bodyClassName="p-0">
      <ul>
        {members.map((member) => {
          const self = member.id === currentUserId;
          const editable = isAdmin && !self;
          return <li key={member.id} className="flex flex-col gap-3 border-b border-rule px-5 py-3.5 last:border-0 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Initials name={member.name ?? member.email ?? "?"} className="rounded-full" />
              <div className="min-w-0"><p className="truncate text-sm font-medium">{member.name ?? "Unnamed member"}{self ? <span className="font-normal text-muted-foreground"> · you</span> : null}</p><p className="truncate text-xs text-muted-foreground">{member.email}</p></div>
            </div>
            <div className="flex items-center gap-2">
              {member.verifiedAt ? null : <Chip tone="warning">Unverified</Chip>}
              {editable ? <SelectField aria-label={`Role for ${member.name ?? member.email}`} disabled={rowBusy === member.id} value={member.role}
                onChange={(event) => { const role = event.target.value as Role; void withRow(member.id, async () => { await requestJson(`/api/settings/team/members/${member.id}`, { method: "PATCH", body: JSON.stringify({ role }) }); setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role } : item)); toast.success(`Role changed to ${roleLabel(role)}.`); }, "The role could not be updated."); }}>
                {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </SelectField> : <Chip>{roleLabel(member.role)}</Chip>}
              {editable ? <ConfirmAction destructive title={`Remove ${member.name ?? member.email}?`} description="They lose access immediately. Campaigns and approvals they made stay in the history." confirmLabel="Remove"
                onConfirm={() => void withRow(member.id, async () => { await requestJson(`/api/settings/team/members/${member.id}`, { method: "DELETE" }); setMembers((current) => current.filter((item) => item.id !== member.id)); router.refresh(); }, "The member could not be removed.")}
                trigger={<Button variant="ghost" size="icon" className="size-8 min-h-8 text-muted-foreground" aria-label={`Remove ${member.name ?? member.email}`} disabled={rowBusy === member.id}>{rowBusy === member.id ? <LoaderCircle className="animate-spin" /> : <Trash2 />}</Button>} /> : null}
            </div>
          </li>;
        })}
      </ul>
    </Panel>

    {isAdmin && invites.length ? <Panel title={`Pending invites · ${invites.length}`} bodyClassName="p-0">
      <ul>{invites.map((invite) => <li key={invite.id} className="flex items-center gap-3 border-b border-rule px-5 py-3 last:border-0">
        <div className="min-w-0 flex-1"><p className="truncate text-sm">{invite.email}</p><p className="text-xs text-muted-foreground">{roleLabel(invite.role)} · expires {new Date(invite.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p></div>
        <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={rowBusy === invite.id} onClick={() => void withRow(invite.id, async () => { await requestJson(`/api/settings/team/invites/${invite.id}`, { method: "DELETE" }); setInvites((current) => current.filter((item) => item.id !== invite.id)); toast.success("Invite revoked."); }, "The invite could not be revoked.")}>{rowBusy === invite.id ? <LoaderCircle className="animate-spin" /> : <X />}Revoke</Button>
      </li>)}</ul>
    </Panel> : null}

    <section className="grid gap-3 border-t border-rule pt-6 sm:grid-cols-2 lg:grid-cols-4">
      {roles.map((role) => <div key={role.value} className="space-y-1 text-sm"><p className="font-medium">{role.label}</p><p className="leading-6 text-muted-foreground">{role.description}</p></div>)}
    </section>
  </div>;
}
