import { and, desc, eq, isNull } from "drizzle-orm";
import type { CreateInviteInput } from "../domain/team";
import { normalizeEmail } from "../domain/auth";
import type { ApiActor } from "./api-actor";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
} from "./auth-crypto";
import { AuthRequestError } from "./auth-errors";
import { sendTeamInviteEmail } from "./team-invite-email";
import { getDatabase } from "./database";
import {
  authSessions,
  auditEvents,
  organizationInvites,
  organizationMemberships,
  organizations,
  users,
} from "./database/schema";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

function requireAdmin(actor: ApiActor) {
  if (actor.organizationRole !== "admin") {
    throw new AuthRequestError(
      "Admin permission is required to manage the team.",
      403,
    );
  }
}

export async function listMembers(actor: ApiActor) {
  const database = getDatabase();
  return database
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: organizationMemberships.role,
      verifiedAt: users.emailVerifiedAt,
    })
    .from(organizationMemberships)
    .innerJoin(
      users,
      and(
        eq(users.id, organizationMemberships.userId),
        eq(organizationMemberships.organizationId, actor.organizationId),
      ),
    )
    .where(eq(organizationMemberships.organizationId, actor.organizationId));
}

export async function listPendingInvites(actor: ApiActor) {
  const database = getDatabase();
  return database
    .select({
      id: organizationInvites.id,
      email: organizationInvites.email,
      role: organizationInvites.role,
      status: organizationInvites.status,
      expiresAt: organizationInvites.expiresAt,
      createdAt: organizationInvites.createdAt,
    })
    .from(organizationInvites)
    .where(
      and(
        eq(organizationInvites.organizationId, actor.organizationId),
        eq(organizationInvites.status, "pending"),
      ),
    )
    .orderBy(desc(organizationInvites.createdAt));
}

export async function createInvite(actor: ApiActor, input: CreateInviteInput) {
  requireAdmin(actor);
  const database = getDatabase();
  const normalizedEmail = normalizeEmail(input.email);
  const now = new Date();
  const token = createSessionToken();

  const [organization] = await database
    .select()
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId))
    .limit(1);
  if (!organization) throw new AuthRequestError("Workspace was not found.", 400);

  const invite = await database.transaction(async (transaction) => {
    await transaction
      .update(organizationInvites)
      .set({ status: "revoked", revokedAt: now })
      .where(
        and(
          eq(organizationInvites.organizationId, actor.organizationId),
          eq(organizationInvites.normalizedEmail, normalizedEmail),
          eq(organizationInvites.status, "pending"),
        ),
      );

    const [inserted] = await transaction
      .insert(organizationInvites)
      .values({
        id: crypto.randomUUID(),
        organizationId: actor.organizationId,
        invitedByUserId: actor.userId,
        email: input.email.trim(),
        normalizedEmail,
        role: input.role,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      })
      .returning();

    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId: null,
      action: "team.invite_sent",
      entityType: "organization_invite",
      entityId: inserted!.id,
      metadata: { email: normalizedEmail, role: input.role },
    });

    return inserted!;
  });

  await sendTeamInviteEmail({
    to: invite.email,
    token,
    organizationName: organization.name,
  });

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function revokeInvite(actor: ApiActor, inviteId: string) {
  requireAdmin(actor);
  const database = getDatabase();
  const now = new Date();
  const [updated] = await database
    .update(organizationInvites)
    .set({ status: "revoked", revokedAt: now })
    .where(
      and(
        eq(organizationInvites.id, inviteId),
        eq(organizationInvites.organizationId, actor.organizationId),
        eq(organizationInvites.status, "pending"),
      ),
    )
    .returning({ id: organizationInvites.id });
  if (!updated) throw new AuthRequestError("Invite was not found.", 400);

  await database.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    actorId: actor.userId,
    campaignId: null,
    action: "team.invite_revoked",
    entityType: "organization_invite",
    entityId: inviteId,
    metadata: {},
  });

  return { id: inviteId, status: "revoked" as const };
}

async function countAdmins(organizationId: string) {
  const database = getDatabase();
  const rows = await database
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.role, "admin"),
      ),
    );
  return rows.length;
}

export async function updateMemberRole(
  actor: ApiActor,
  userId: string,
  role: ApiActor["organizationRole"],
) {
  requireAdmin(actor);
  const database = getDatabase();

  const [existing] = await database
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, actor.organizationId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!existing) throw new AuthRequestError("Member was not found.", 400);

  if (existing.role === "admin" && role !== "admin") {
    const adminCount = await countAdmins(actor.organizationId);
    if (adminCount <= 1) {
      throw new AuthRequestError(
        "This workspace must keep at least one admin.",
        409,
      );
    }
  }

  await database
    .update(organizationMemberships)
    .set({ role, updatedAt: new Date() })
    .where(
      and(
        eq(organizationMemberships.organizationId, actor.organizationId),
        eq(organizationMemberships.userId, userId),
      ),
    );

  await database.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    actorId: actor.userId,
    campaignId: null,
    action: "team.member_role_changed",
    entityType: "user",
    entityId: userId,
    metadata: { role },
  });

  return { userId, role };
}

export async function removeMember(actor: ApiActor, userId: string) {
  requireAdmin(actor);
  const database = getDatabase();

  const [existing] = await database
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, actor.organizationId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!existing) throw new AuthRequestError("Member was not found.", 400);

  if (existing.role === "admin") {
    const adminCount = await countAdmins(actor.organizationId);
    if (adminCount <= 1) {
      throw new AuthRequestError(
        "This workspace must keep at least one admin.",
        409,
      );
    }
  }

  const now = new Date();
  await database.transaction(async (transaction) => {
    await transaction
      .delete(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, actor.organizationId),
          eq(organizationMemberships.userId, userId),
        ),
      );
    await transaction
      .update(authSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(authSessions.userId, userId),
          eq(authSessions.organizationId, actor.organizationId),
          isNull(authSessions.revokedAt),
        ),
      );
    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId: null,
      action: "team.member_removed",
      entityType: "user",
      entityId: userId,
      metadata: {},
    });
  });

  return { userId, removed: true };
}

async function loadPendingInviteByToken(token: string) {
  const database = getDatabase();
  const [invite] = await database
    .select()
    .from(organizationInvites)
    .where(eq(organizationInvites.tokenHash, hashSessionToken(token)))
    .limit(1);
  if (!invite || invite.status !== "pending" || invite.expiresAt <= new Date()) {
    return null;
  }
  return invite;
}

export async function getInvitePreview(token: string) {
  const invite = await loadPendingInviteByToken(token);
  if (!invite) return null;
  const database = getDatabase();
  const [organization] = await database
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, invite.organizationId))
    .limit(1);
  return {
    email: invite.email,
    role: invite.role,
    organizationName: organization?.name ?? "Workspace",
  };
}

export async function acceptInvite(
  token: string,
  currentUserId: string | null,
  accountDetails?: { name: string; password: string },
) {
  const invite = await loadPendingInviteByToken(token);
  if (!invite) {
    throw new AuthRequestError("This invite is invalid or has expired.", 400);
  }

  const database = getDatabase();
  const [existingUser] = await database
    .select()
    .from(users)
    .where(eq(users.normalizedEmail, invite.normalizedEmail))
    .limit(1);

  if (existingUser?.emailVerifiedAt) {
    if (!currentUserId) {
      return { status: "requires_sign_in" as const, email: invite.email };
    }
    if (currentUserId !== existingUser.id) {
      throw new AuthRequestError(
        "This invite was sent to a different email address than the signed-in account.",
        403,
      );
    }

    const now = new Date();
    await database.transaction(async (transaction) => {
      await transaction
        .insert(organizationMemberships)
        .values({
          organizationId: invite.organizationId,
          userId: existingUser.id,
          role: invite.role,
        })
        .onConflictDoNothing();
      await transaction
        .update(organizationInvites)
        .set({ status: "accepted", acceptedAt: now })
        .where(eq(organizationInvites.id, invite.id));
      await transaction.insert(auditEvents).values({
        id: crypto.randomUUID(),
        organizationId: invite.organizationId,
        actorId: existingUser.id,
        campaignId: null,
        action: "team.invite_accepted",
        entityType: "organization_invite",
        entityId: invite.id,
        metadata: {},
      });
    });

    return { status: "joined" as const, organizationId: invite.organizationId };
  }

  if (!accountDetails) {
    return { status: "requires_account_details" as const, email: invite.email };
  }

  const now = new Date();
  const passwordHash = await hashPassword(accountDetails.password);
  const userId = existingUser?.id ?? crypto.randomUUID();

  const token2 = createSessionToken();
  await database.transaction(async (transaction) => {
    if (existingUser) {
      await transaction
        .update(users)
        .set({
          email: invite.email,
          name: accountDetails.name,
          passwordHash,
          emailVerifiedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, userId));
    } else {
      await transaction.insert(users).values({
        id: userId,
        email: invite.email,
        normalizedEmail: invite.normalizedEmail,
        passwordHash,
        name: accountDetails.name,
        emailVerifiedAt: now,
      });
    }

    await transaction
      .insert(organizationMemberships)
      .values({
        organizationId: invite.organizationId,
        userId,
        role: invite.role,
      })
      .onConflictDoNothing();
    await transaction
      .update(organizationInvites)
      .set({ status: "accepted", acceptedAt: now })
      .where(eq(organizationInvites.id, invite.id));
    await transaction.insert(authSessions).values({
      id: crypto.randomUUID(),
      tokenHash: hashSessionToken(token2),
      userId,
      organizationId: invite.organizationId,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    });
    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: invite.organizationId,
      actorId: userId,
      campaignId: null,
      action: "team.invite_accepted",
      entityType: "organization_invite",
      entityId: invite.id,
      metadata: {},
    });
  });

  return {
    status: "joined_with_session" as const,
    organizationId: invite.organizationId,
    token: token2,
  };
}
