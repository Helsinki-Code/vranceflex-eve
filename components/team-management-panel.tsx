"use client";

import { LoaderCircle, Mail, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "admin" | "member" | "reviewer" | "billing";

export type TeamMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  verifiedAt: string | null;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
};

const roles: Role[] = ["admin", "member", "reviewer", "billing"];

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

export function TeamManagementPanel({
  initialMembers,
  initialInvites,
  currentUserId,
  isAdmin,
}: {
  initialMembers: TeamMember[];
  initialInvites: PendingInvite[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [error, setError] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await requestJson<{ invite: PendingInvite }>(
        "/api/settings/team/invites",
        {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            role: form.get("role"),
          }),
        },
      );
      setInvites((current) => [data.invite, ...current]);
      (event.target as HTMLFormElement).reset();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The invite could not be sent.",
      );
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    setRowBusy(inviteId);
    setError("");
    try {
      await requestJson(`/api/settings/team/invites/${inviteId}`, { method: "DELETE" });
      setInvites((current) => current.filter((invite) => invite.id !== inviteId));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The invite could not be revoked.",
      );
    } finally {
      setRowBusy(null);
    }
  }

  async function changeRole(userId: string, role: Role) {
    setRowBusy(userId);
    setError("");
    try {
      await requestJson(`/api/settings/team/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setMembers((current) =>
        current.map((member) => (member.id === userId ? { ...member, role } : member)),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The role could not be updated.",
      );
    } finally {
      setRowBusy(null);
    }
  }

  async function removeMember(userId: string) {
    setRowBusy(userId);
    setError("");
    try {
      await requestJson(`/api/settings/team/members/${userId}`, { method: "DELETE" });
      setMembers((current) => current.filter((member) => member.id !== userId));
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The member could not be removed.",
      );
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <>
      {error ? <div className="auth-form-error" role="alert">{error}</div> : null}

      {isAdmin && (
        <form className="team-invite-form" onSubmit={submitInvite}>
          <label>
            <span>Invite by email</span>
            <input name="email" placeholder="teammate@company.com" required type="email" />
          </label>
          <label>
            <span>Role</span>
            <select defaultValue="member" name="role">
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <button className="button-primary compact" disabled={inviteBusy} type="submit">
            {inviteBusy ? <LoaderCircle className="spin" size={15} /> : <UserPlus size={15} />}
            Send invite
          </button>
        </form>
      )}

      <div className="team-member-list">
        {members.map((member) => (
          <article key={member.id}>
            <span>{(member.name ?? member.email ?? "U").slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{member.name ?? "Workspace member"}</strong>
              <small>{member.email}</small>
            </div>
            {isAdmin && member.id !== currentUserId ? (
              <select
                disabled={rowBusy === member.id}
                onChange={(event) => void changeRole(member.id, event.target.value as Role)}
                value={member.role}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            ) : (
              <em>{member.role}</em>
            )}
            <i><ShieldCheck size={14} /> {member.verifiedAt ? "Verified" : "Pending"}</i>
            {isAdmin && member.id !== currentUserId && (
              <button
                aria-label={`Remove ${member.name ?? member.email}`}
                className="icon-button"
                disabled={rowBusy === member.id}
                onClick={() => void removeMember(member.id)}
                type="button"
              >
                {rowBusy === member.id ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Trash2 size={15} />
                )}
              </button>
            )}
          </article>
        ))}
      </div>

      {isAdmin && invites.length > 0 && (
        <div className="team-invite-list">
          <p className="section-label">PENDING INVITES</p>
          {invites.map((invite) => (
            <article key={invite.id}>
              <span><Mail size={14} /></span>
              <div>
                <strong>{invite.email}</strong>
                <small>Invited as {invite.role}</small>
              </div>
              <button
                aria-label={`Revoke invite for ${invite.email}`}
                className="icon-button"
                disabled={rowBusy === invite.id}
                onClick={() => void revokeInvite(invite.id)}
                type="button"
              >
                {rowBusy === invite.id ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <X size={15} />
                )}
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
