import { and, asc, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  defaultDkimSelector,
  effectiveDailyCap,
  emailDomain,
  isConsumerAddress,
  mailboxSecretFromInput,
  rampCompletesOn,
  type MailboxConnectionInput,
  type MailboxSecret,
  type MailboxUpdateInput,
  type SendingDomainInput,
} from "../domain/mailboxes";
import type { ApiActor } from "./api-actor";
import { AuthRequestError } from "./auth-errors";
import { decryptCredentialPayload, encryptCredentialPayload } from "./credential-crypto";
import { getDatabase } from "./database";
import {
  auditEvents,
  organizationChannelCredentials,
  organizationSendingSettings,
  outreachMessages,
  sendingDomains,
  sendingMailboxes,
  type DnsRecordCheck,
  type DomainMailProvider,
  type MailReceiver,
} from "./database/schema";
import { checkDomainHealth, expectedRecords, type ExpectedRecord } from "./dns-health";
import { verifyImap } from "./mailbox-imap";
import { MailboxDeliveryError, sendViaMailbox, verifySmtp } from "./mailbox-smtp";
import { localDayBounds } from "./timezone";

function requireAdmin(actor: ApiActor) {
  if (actor.organizationRole !== "admin") {
    throw new AuthRequestError("Admin permission is required to manage sending mailboxes.", 403);
  }
}

async function audit(actor: ApiActor, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  await getDatabase().insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    actorId: actor.userId,
    campaignId: null,
    action,
    entityType,
    entityId,
    metadata,
  });
}

export function decryptMailboxSecret(row: { encryptedPayload: string }) {
  return decryptCredentialPayload<MailboxSecret>(row.encryptedPayload);
}

export async function organizationTimezone(organizationId: string) {
  const [settings] = await getDatabase()
    .select({ timezone: organizationSendingSettings.timezone })
    .from(organizationSendingSettings)
    .where(eq(organizationSendingSettings.organizationId, organizationId))
    .limit(1);
  return settings?.timezone ?? "UTC";
}

/** Sent-today counts per mailbox, in the workspace's local day. */
export async function mailboxSentCounts(organizationId: string, mailboxIds: string[], timezone: string, now = new Date()) {
  if (!mailboxIds.length) return new Map<string, number>();
  const bounds = localDayBounds(now, timezone);
  const rows = await getDatabase()
    .select({ mailboxId: outreachMessages.senderMailboxId, total: count() })
    .from(outreachMessages)
    .where(
      and(
        eq(outreachMessages.organizationId, organizationId),
        inArray(outreachMessages.senderMailboxId, mailboxIds),
        gte(outreachMessages.sentAt, bounds.start),
        lt(outreachMessages.sentAt, bounds.end),
      ),
    )
    .groupBy(outreachMessages.senderMailboxId);
  return new Map(rows.map((row) => [row.mailboxId!, Number(row.total)]));
}

async function ensureDomainForMailbox(organizationId: string, email: string, provider: "google" | "smtp") {
  if (isConsumerAddress(email)) return;
  const domain = emailDomain(email);
  const domainProvider: DomainMailProvider = provider === "google" ? "google" : "other";
  const [row] = await getDatabase()
    .insert(sendingDomains)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      domain,
      provider: domainProvider,
      dkimSelector: defaultDkimSelector(domainProvider),
    })
    .onConflictDoNothing()
    .returning();
  if (row) await refreshDomainHealth(row.id).catch(() => undefined);
}

export async function connectMailbox(actor: ApiActor, input: MailboxConnectionInput) {
  requireAdmin(actor);
  const secret = mailboxSecretFromInput(input);
  let inbox: { uidValidity: number; lastUid: number };
  try {
    await verifySmtp(secret);
    inbox = await verifyImap(secret);
  } catch (error) {
    if (error instanceof MailboxDeliveryError) throw new AuthRequestError(error.message, 400);
    throw error;
  }
  const now = new Date();
  const values = {
    fromName: input.fromName ?? null,
    provider: input.provider,
    encryptedPayload: encryptCredentialPayload(secret),
    status: "active" as const,
    statusReason: null,
    dailyLimit: input.dailyLimit,
    rampUp: input.rampUp,
    imapUidValidity: inbox.uidValidity,
    imapLastUid: inbox.lastUid,
    lastPolledAt: now,
    lastError: null,
    updatedAt: now,
  };
  const [row] = await getDatabase()
    .insert(sendingMailboxes)
    .values({ id: crypto.randomUUID(), organizationId: actor.organizationId, email: input.email, rampStartedAt: now, nextSendAt: now, ...values })
    .onConflictDoUpdate({ target: [sendingMailboxes.organizationId, sendingMailboxes.email], set: values })
    .returning({ id: sendingMailboxes.id });
  await audit(actor, "integration.mailbox_connected", "sending_mailbox", row!.id, { email: input.email, provider: input.provider });
  await ensureDomainForMailbox(actor.organizationId, input.email, input.provider);
  return { id: row!.id, email: input.email };
}

async function findMailbox(organizationId: string, mailboxId: string) {
  const [row] = await getDatabase()
    .select()
    .from(sendingMailboxes)
    .where(and(eq(sendingMailboxes.id, mailboxId), eq(sendingMailboxes.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new AuthRequestError("That mailbox was not found in this workspace.", 404);
  return row;
}

export async function updateMailbox(actor: ApiActor, mailboxId: string, input: MailboxUpdateInput) {
  requireAdmin(actor);
  const mailbox = await findMailbox(actor.organizationId, mailboxId);
  const now = new Date();
  await getDatabase()
    .update(sendingMailboxes)
    .set({
      ...(input.fromName !== undefined ? { fromName: input.fromName || null } : {}),
      ...(input.dailyLimit !== undefined ? { dailyLimit: input.dailyLimit } : {}),
      ...(input.rampUp !== undefined ? { rampUp: input.rampUp, ...(input.rampUp && !mailbox.rampUp ? { rampStartedAt: now } : {}) } : {}),
      // Resuming clears an error too: the next send or poll re-tests the login.
      ...(input.status ? { status: input.status, statusReason: input.status === "paused" ? "Paused by an admin." : null, lastError: input.status === "active" ? null : mailbox.lastError } : {}),
      updatedAt: now,
    })
    .where(eq(sendingMailboxes.id, mailbox.id));
  await audit(actor, "integration.mailbox_updated", "sending_mailbox", mailbox.id, { ...input });
  return { updated: true as const };
}

export async function removeMailbox(actor: ApiActor, mailboxId: string) {
  requireAdmin(actor);
  const mailbox = await findMailbox(actor.organizationId, mailboxId);
  await getDatabase().delete(sendingMailboxes).where(eq(sendingMailboxes.id, mailbox.id));
  await audit(actor, "integration.mailbox_removed", "sending_mailbox", mailbox.id, { email: mailbox.email });
  return { removed: true as const };
}

export async function sendMailboxTest(actor: ApiActor, mailboxId: string, to: string) {
  requireAdmin(actor);
  const mailbox = await findMailbox(actor.organizationId, mailboxId);
  try {
    await sendViaMailbox(decryptMailboxSecret(mailbox), {
      fromEmail: mailbox.email,
      fromName: mailbox.fromName,
      to,
      subject: "VranceFlex test email",
      text: `This is a test from ${mailbox.email}.\n\nIf it landed in your inbox, the mailbox is connected and ready to send outreach. If it landed in spam, check the domain's SPF, DKIM and DMARC records in Settings → Sending.`,
      messageId: `vf-test-${crypto.randomUUID()}@${emailDomain(mailbox.email) || "vranceflex.mail"}`,
    });
  } catch (error) {
    if (error instanceof MailboxDeliveryError) {
      if (error.authFailed) await markMailboxError(mailbox.id, error.message);
      throw new AuthRequestError(error.message, 400);
    }
    throw error;
  }
  return { sent: true as const, to };
}

export async function markMailboxError(mailboxId: string, reason: string) {
  await getDatabase()
    .update(sendingMailboxes)
    .set({ status: "error", statusReason: reason.slice(0, 500), lastError: reason.slice(0, 1_000), updatedAt: new Date() })
    .where(eq(sendingMailboxes.id, mailboxId));
}

// ---- Domains ----------------------------------------------------------------

export async function refreshDomainHealth(domainId: string) {
  const database = getDatabase();
  const [row] = await database.select().from(sendingDomains).where(eq(sendingDomains.id, domainId)).limit(1);
  if (!row) return null;
  const health = await checkDomainHealth(row.domain, row.provider, row.dkimSelector);
  const now = new Date();
  await database
    .update(sendingDomains)
    .set({
      lastCheck: health.checks,
      status: health.status,
      // Remember where DKIM actually lives and which provider's rules apply.
      dkimSelector: health.dkimSelector,
      provider: health.provider,
      lastCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(sendingDomains.id, row.id));
  return { ...row, lastCheck: health.checks, status: health.status, dkimSelector: health.dkimSelector, provider: health.provider, lastCheckedAt: now };
}

export async function addSendingDomain(actor: ApiActor, input: SendingDomainInput) {
  requireAdmin(actor);
  const selector = input.dkimSelector ?? defaultDkimSelector(input.provider);
  const now = new Date();
  const [row] = await getDatabase()
    .insert(sendingDomains)
    .values({ id: crypto.randomUUID(), organizationId: actor.organizationId, domain: input.domain, provider: input.provider, dkimSelector: selector })
    .onConflictDoUpdate({ target: [sendingDomains.organizationId, sendingDomains.domain], set: { provider: input.provider, dkimSelector: selector, updatedAt: now } })
    .returning({ id: sendingDomains.id });
  await audit(actor, "integration.domain_added", "sending_domain", row!.id, { domain: input.domain, provider: input.provider });
  await refreshDomainHealth(row!.id);
  return { id: row!.id };
}

async function findDomain(organizationId: string, domainId: string) {
  const [row] = await getDatabase()
    .select()
    .from(sendingDomains)
    .where(and(eq(sendingDomains.id, domainId), eq(sendingDomains.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new AuthRequestError("That domain was not found in this workspace.", 404);
  return row;
}

export async function recheckSendingDomain(actor: ApiActor, domainId: string) {
  const row = await findDomain(actor.organizationId, domainId);
  await refreshDomainHealth(row.id);
  return { checked: true as const };
}

export async function removeSendingDomain(actor: ApiActor, domainId: string) {
  requireAdmin(actor);
  const row = await findDomain(actor.organizationId, domainId);
  await getDatabase().delete(sendingDomains).where(eq(sendingDomains.id, row.id));
  await audit(actor, "integration.domain_removed", "sending_domain", row.id, { domain: row.domain });
  return { removed: true as const };
}

/** Rechecks domains not checked in the last day. Called from the dispatcher tick. */
export async function refreshStaleDomains(limit = 5) {
  const stale = await getDatabase()
    .select({ id: sendingDomains.id })
    .from(sendingDomains)
    .where(sql`${sendingDomains.lastCheckedAt} is null or ${sendingDomains.lastCheckedAt} < now() - interval '1 day'`)
    .orderBy(asc(sendingDomains.lastCheckedAt))
    .limit(limit);
  for (const domain of stale) await refreshDomainHealth(domain.id).catch(() => undefined);
}

// ---- Transport setting ------------------------------------------------------

export async function setEmailTransport(actor: ApiActor, emailTransport: "auto" | "mailboxes" | "resend") {
  requireAdmin(actor);
  const now = new Date();
  await getDatabase()
    .insert(organizationSendingSettings)
    .values({ organizationId: actor.organizationId, emailTransport })
    .onConflictDoUpdate({ target: organizationSendingSettings.organizationId, set: { emailTransport, updatedAt: now } });
  await audit(actor, "integration.email_transport_changed", "organization", actor.organizationId, { emailTransport });
  return { emailTransport };
}

export async function hasActiveMailbox(organizationId: string) {
  const [row] = await getDatabase()
    .select({ id: sendingMailboxes.id })
    .from(sendingMailboxes)
    .where(and(eq(sendingMailboxes.organizationId, organizationId), eq(sendingMailboxes.status, "active")))
    .limit(1);
  return Boolean(row);
}

// ---- Overview for the settings page -------------------------------------------

export type MailboxSummary = {
  id: string;
  email: string;
  fromName: string | null;
  provider: "google" | "smtp";
  status: "active" | "paused" | "error";
  statusReason: string | null;
  dailyLimit: number;
  rampUp: boolean;
  capToday: number;
  sentToday: number;
  rampCompletesOn: string | null;
  consumer: boolean;
  domainStatus: "verified" | "partial" | "unverified" | null;
  lastPolledAt: string | null;
  sentWeek: number;
  bouncedWeek: number;
};

export type DomainSummary = {
  id: string;
  domain: string;
  provider: DomainMailProvider;
  dkimSelector: string;
  status: "verified" | "partial" | "unverified";
  checks: DnsRecordCheck[];
  lastCheckedAt: string | null;
  records: ExpectedRecord[];
  mailboxCount: number;
  /** Who receives this domain's mail, from the last MX check. */
  receivedBy: MailReceiver | null;
};

export type SendingOverview = {
  mailboxes: MailboxSummary[];
  domains: DomainSummary[];
  emailTransport: "auto" | "mailboxes" | "resend";
  resendConnected: boolean;
  orgDailyEmailLimit: number;
  timezone: string;
};

export async function getSendingOverview(organizationId: string): Promise<SendingOverview> {
  const database = getDatabase();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [mailboxRows, domainRows, [settings], [resend]] = await Promise.all([
    database.select().from(sendingMailboxes).where(eq(sendingMailboxes.organizationId, organizationId)).orderBy(asc(sendingMailboxes.createdAt)),
    database.select().from(sendingDomains).where(eq(sendingDomains.organizationId, organizationId)).orderBy(asc(sendingDomains.domain)),
    database.select().from(organizationSendingSettings).where(eq(organizationSendingSettings.organizationId, organizationId)).limit(1),
    database
      .select({ provider: organizationChannelCredentials.provider })
      .from(organizationChannelCredentials)
      .where(and(eq(organizationChannelCredentials.organizationId, organizationId), eq(organizationChannelCredentials.provider, "resend"), eq(organizationChannelCredentials.status, "connected")))
      .limit(1),
  ]);
  const timezone = settings?.timezone ?? "UTC";
  const ids = mailboxRows.map((row) => row.id);
  const [today, week] = await Promise.all([
    mailboxSentCounts(organizationId, ids, timezone, now),
    ids.length
      ? database
          .select({
            mailboxId: outreachMessages.senderMailboxId,
            sent: count(),
            bounced: sql<number>`count(*) filter (where ${outreachMessages.status} = 'bounced')`,
          })
          .from(outreachMessages)
          .where(and(inArray(outreachMessages.senderMailboxId, ids), gte(outreachMessages.sentAt, weekAgo)))
          .groupBy(outreachMessages.senderMailboxId)
      : Promise.resolve([]),
  ]);
  const weekly = new Map(week.map((row) => [row.mailboxId!, { sent: Number(row.sent), bounced: Number(row.bounced) }]));
  const domainStatus = new Map(domainRows.map((row) => [row.domain, row.status]));

  return {
    mailboxes: mailboxRows.map((row) => ({
      id: row.id,
      email: row.email,
      fromName: row.fromName,
      provider: row.provider,
      status: row.status,
      statusReason: row.statusReason,
      dailyLimit: row.dailyLimit,
      rampUp: row.rampUp,
      capToday: effectiveDailyCap(row, now),
      sentToday: today.get(row.id) ?? 0,
      rampCompletesOn: rampCompletesOn(row, now)?.toISOString() ?? null,
      consumer: isConsumerAddress(row.email),
      domainStatus: domainStatus.get(emailDomain(row.email)) ?? null,
      lastPolledAt: row.lastPolledAt?.toISOString() ?? null,
      sentWeek: weekly.get(row.id)?.sent ?? 0,
      bouncedWeek: weekly.get(row.id)?.bounced ?? 0,
    })),
    domains: domainRows.map((row) => ({
      id: row.id,
      domain: row.domain,
      provider: row.provider,
      dkimSelector: row.dkimSelector,
      status: row.status,
      checks: row.lastCheck,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      records: expectedRecords(row.domain, row.provider, row.dkimSelector, row.lastCheck.find((check) => check.kind === "mx")?.receiver),
      mailboxCount: mailboxRows.filter((mailbox) => emailDomain(mailbox.email) === row.domain).length,
      receivedBy: row.lastCheck.find((check) => check.kind === "mx")?.receiver ?? null,
    })),
    emailTransport: settings?.emailTransport ?? "auto",
    resendConnected: Boolean(resend),
    orgDailyEmailLimit: settings?.dailyEmailLimit ?? 100,
    timezone,
  };
}
