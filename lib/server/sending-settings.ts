import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { isResendConfigured } from "../auth/config";
import { AuthRequestError } from "./auth-errors";
import type { ApiActor } from "./api-actor";
import { getDatabase } from "./database";
import {
  auditEvents,
  leads,
  organizationMemberships,
  organizationSendingSettings,
  organizations,
  outreachMessages,
  users,
} from "./database/schema";
import { platformResendCredentials, sendResendEmail } from "./resend-email";
import { normalizeDomain } from "./send-gate";
import { DEFAULT_SEND_WINDOW, sendWindowProblem, type SendWindow } from "./send-window";
import { assertValidTimezone } from "./timezone";

type Database = ReturnType<typeof getDatabase>;
type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The workspace's sending-safety settings, with defaults for a workspace that has never saved any. */
export type SendingSafetySettings = {
  timezone: string;
  window: SendWindow;
  useRecipientTimezone: boolean;
  stopCompanyOnReply: boolean;
  /** Send to "risky" addresses (catch-all domains, role accounts). Off by default. */
  allowRiskyEmail: boolean;
  sendingPaused: boolean;
  pausedReason: string | null;
  pausedAt: string | null;
  linkDomains: string[];
};

export const DEFAULT_SENDING_SAFETY: SendingSafetySettings = {
  timezone: "UTC",
  window: DEFAULT_SEND_WINDOW,
  useRecipientTimezone: true,
  stopCompanyOnReply: true,
  allowRiskyEmail: false,
  sendingPaused: false,
  pausedReason: null,
  pausedAt: null,
  linkDomains: [],
};

type SettingsRow = typeof organizationSendingSettings.$inferSelect;

export function safetyFromRow(row: SettingsRow | undefined | null): SendingSafetySettings {
  if (!row) return DEFAULT_SENDING_SAFETY;
  return {
    timezone: row.timezone,
    window: { days: row.sendDays, start: row.windowStart, end: row.windowEnd },
    useRecipientTimezone: row.useRecipientTimezone,
    stopCompanyOnReply: row.stopCompanyOnReply,
    allowRiskyEmail: row.allowRiskyEmail,
    sendingPaused: row.sendingPaused,
    pausedReason: row.pausedReason,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    linkDomains: row.linkDomains,
  };
}

export async function getSendingSafetySettings(organizationId: string, database: Executor = getDatabase()) {
  const [row] = await database
    .select()
    .from(organizationSendingSettings)
    .where(eq(organizationSendingSettings.organizationId, organizationId))
    .limit(1);
  return safetyFromRow(row);
}

const domainSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .transform(normalizeDomain)
  .refine((value) => /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(value), "Enter domains like example.com.");

export const sendingSafetyInputSchema = z
  .object({
    timezone: z.string().trim().min(1).max(64),
    sendDays: z.array(z.number().int()).max(7),
    windowStart: z.string(),
    windowEnd: z.string(),
    useRecipientTimezone: z.boolean(),
    stopCompanyOnReply: z.boolean(),
    allowRiskyEmail: z.boolean(),
    linkDomains: z.array(domainSchema).max(25),
  })
  .partial()
  .strict();

export type SendingSafetyInput = z.infer<typeof sendingSafetyInputSchema>;

function requireAdmin(actor: ApiActor) {
  if (actor.organizationRole !== "admin") {
    throw new AuthRequestError("Admin permission is required to change sending safety settings.", 403);
  }
}

async function audit(actor: ApiActor | null, organizationId: string, action: string, metadata: Record<string, unknown>) {
  await getDatabase().insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId,
    actorId: actor?.userId ?? null,
    campaignId: null,
    action,
    entityType: "organization_sending_settings",
    entityId: organizationId,
    metadata,
  });
}

export async function updateSendingSafetySettings(actor: ApiActor, input: SendingSafetyInput) {
  requireAdmin(actor);
  const current = await getSendingSafetySettings(actor.organizationId);

  if (input.timezone !== undefined) {
    try {
      assertValidTimezone(input.timezone);
    } catch {
      throw new AuthRequestError("Choose a valid time zone.", 400);
    }
  }
  const window: SendWindow = {
    days: input.sendDays ? [...new Set(input.sendDays)].sort((a, b) => a - b) : current.window.days,
    start: input.windowStart ?? current.window.start,
    end: input.windowEnd ?? current.window.end,
  };
  const problem = sendWindowProblem(window);
  if (problem) throw new AuthRequestError(problem, 400);

  const linkDomains = input.linkDomains ? [...new Set(input.linkDomains)] : current.linkDomains;
  const values = {
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    sendDays: window.days,
    windowStart: window.start,
    windowEnd: window.end,
    ...(input.useRecipientTimezone !== undefined ? { useRecipientTimezone: input.useRecipientTimezone } : {}),
    ...(input.stopCompanyOnReply !== undefined ? { stopCompanyOnReply: input.stopCompanyOnReply } : {}),
    ...(input.allowRiskyEmail !== undefined ? { allowRiskyEmail: input.allowRiskyEmail } : {}),
    linkDomains,
  };
  const now = new Date();
  await getDatabase()
    .insert(organizationSendingSettings)
    .values({ organizationId: actor.organizationId, ...values })
    .onConflictDoUpdate({ target: organizationSendingSettings.organizationId, set: { ...values, updatedAt: now } });
  if (input.allowRiskyEmail !== undefined && input.allowRiskyEmail !== current.allowRiskyEmail) {
    // The send gate reads leads.emailVerified, so existing risky leads follow the setting.
    await getDatabase()
      .update(leads)
      .set({ emailVerified: input.allowRiskyEmail, updatedAt: now })
      .where(and(eq(leads.organizationId, actor.organizationId), eq(leads.emailStatus, "risky")));
  }
  await audit(actor, actor.organizationId, "sending.safety_settings_updated", { changed: Object.keys(input) });
  return getSendingSafetySettings(actor.organizationId);
}

/** Stops every queued send for the workspace until someone resumes it. */
export async function pauseSending(actor: ApiActor, reason?: string) {
  requireAdmin(actor);
  const text = reason?.trim().slice(0, 300) || "Paused by an admin.";
  const now = new Date();
  await getDatabase()
    .insert(organizationSendingSettings)
    .values({ organizationId: actor.organizationId, sendingPaused: true, pausedReason: text, pausedAt: now })
    .onConflictDoUpdate({
      target: organizationSendingSettings.organizationId,
      set: { sendingPaused: true, pausedReason: text, pausedAt: now, updatedAt: now },
    });
  await audit(actor, actor.organizationId, "sending.paused", { reason: text, automatic: false });
  return getSendingSafetySettings(actor.organizationId);
}

export async function resumeSending(actor: ApiActor) {
  requireAdmin(actor);
  const now = new Date();
  await getDatabase()
    .insert(organizationSendingSettings)
    .values({ organizationId: actor.organizationId })
    .onConflictDoUpdate({
      target: organizationSendingSettings.organizationId,
      set: { sendingPaused: false, pausedReason: null, pausedAt: null, updatedAt: now },
    });
  await audit(actor, actor.organizationId, "sending.resumed", {});
  return getSendingSafetySettings(actor.organizationId);
}

// ---- Automatic bounce breaker ------------------------------------------------

/** Look-back window, minimum volume and rate at which the whole workspace pauses. */
export const BOUNCE_BREAKER = { windowMs: 7 * 86_400_000, minimumSends: 40, rate: 0.05 } as const;

export function shouldTripBounceBreaker(stats: { sent: number; bounced: number }) {
  return stats.sent >= BOUNCE_BREAKER.minimumSends && stats.bounced / stats.sent >= BOUNCE_BREAKER.rate;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

async function notifyAdminsOfPause(organizationId: string, reason: string) {
  if (!isResendConfigured()) return;
  const rows = await getDatabase()
    .select({ email: users.email, workspace: organizations.name })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.role, "admin")));
  const base = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  for (const row of rows) {
    if (!row.email) continue;
    try {
      await sendResendEmail(platformResendCredentials(), {
        to: row.email,
        subject: `Sending paused for ${row.workspace} on VranceFlex`,
        text: `${reason}\n\nNothing will send until you review your lead list and resume sending: ${base}/settings/sending`,
        html: `<p>${escapeHtml(reason)}</p><p>Nothing will send until you review your lead list and resume sending.</p><p><a href="${escapeHtml(base)}/settings/sending">Open sending settings</a></p>`,
        tags: [{ name: "category", value: "sending_auto_paused" }],
      });
    } catch (error) {
      console.error("[sending] pause notice failed", { organizationId, error: error instanceof Error ? error.message : error });
    }
  }
}

/**
 * Pauses the whole workspace when too much of its recent mail has bounced.
 * One mailbox pausing is not enough: a bad lead list damages every mailbox
 * and the domain behind them. Returns true when the pause was applied now.
 */
export async function pauseWorkspaceOnHighBounceRate(organizationId: string, now = new Date()) {
  const database = getDatabase();
  const since = new Date(now.getTime() - BOUNCE_BREAKER.windowMs);
  const [stats] = await database
    .select({
      sent: sql<number>`count(*)::int`,
      bounced: sql<number>`(count(*) filter (where ${outreachMessages.status} = 'bounced'))::int`,
    })
    .from(outreachMessages)
    .where(
      and(
        eq(outreachMessages.organizationId, organizationId),
        eq(outreachMessages.channel, "email"),
        gte(outreachMessages.sentAt, since),
      ),
    );
  const sent = Number(stats?.sent ?? 0);
  const bounced = Number(stats?.bounced ?? 0);
  if (!shouldTripBounceBreaker({ sent, bounced })) return false;

  const reason = `Paused automatically: ${bounced} of the last ${sent} emails bounced (${Math.round((bounced / sent) * 100)}%). Clean the lead list before resuming.`;
  const [changed] = await database
    .insert(organizationSendingSettings)
    .values({ organizationId, sendingPaused: true, pausedReason: reason, pausedAt: now })
    .onConflictDoUpdate({
      target: organizationSendingSettings.organizationId,
      set: { sendingPaused: true, pausedReason: reason, pausedAt: now, updatedAt: now },
      // Only the first trip changes anything, so admins are told once.
      setWhere: eq(organizationSendingSettings.sendingPaused, false),
    })
    .returning({ organizationId: organizationSendingSettings.organizationId });
  if (!changed) return false;

  await audit(null, organizationId, "sending.paused", { reason, automatic: true, sent, bounced });
  await notifyAdminsOfPause(organizationId, reason);
  return true;
}
