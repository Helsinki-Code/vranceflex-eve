import { and, eq, sql } from "drizzle-orm";
import { effectiveDailyCap } from "../domain/mailboxes";
import { getDatabase } from "./database";
import { organizationChannelCredentials, organizationSendingSettings, sendingMailboxes } from "./database/schema";
import { mailboxSentCounts } from "./mailbox-store";
import { localDayBounds } from "./timezone";

export type SendingMailbox = typeof sendingMailboxes.$inferSelect;

// Human-looking gaps between sends from one mailbox.
const minGapMs = 2 * 60_000;
const maxGapMs = 6 * 60_000;

export function nextGap(random = Math.random) {
  return minGapMs + Math.floor(random() * (maxGapMs - minGapMs));
}

/** Which transport outreach email uses for this workspace right now. */
export async function resolveEmailTransport(organizationId: string): Promise<"mailboxes" | "resend" | null> {
  const database = getDatabase();
  const [[settings], [mailbox], [resend]] = await Promise.all([
    database.select({ emailTransport: organizationSendingSettings.emailTransport }).from(organizationSendingSettings).where(eq(organizationSendingSettings.organizationId, organizationId)).limit(1),
    database.select({ id: sendingMailboxes.id }).from(sendingMailboxes).where(eq(sendingMailboxes.organizationId, organizationId)).limit(1),
    database
      .select({ provider: organizationChannelCredentials.provider })
      .from(organizationChannelCredentials)
      .where(and(eq(organizationChannelCredentials.organizationId, organizationId), eq(organizationChannelCredentials.provider, "resend"), eq(organizationChannelCredentials.status, "connected")))
      .limit(1),
  ]);
  const preference = settings?.emailTransport ?? "auto";
  if (preference === "resend") return resend ? "resend" : mailbox ? "mailboxes" : null;
  if (preference === "mailboxes") return mailbox ? "mailboxes" : resend ? "resend" : null;
  // Auto: any connected mailbox (even one paused for now) means the workspace
  // sends from mailboxes; a paused pool waits rather than silently switching.
  return mailbox ? "mailboxes" : resend ? "resend" : null;
}

export type MailboxClaim =
  | { mailbox: SendingMailbox }
  | { mailbox: null; waitUntil: Date; reason: string };

type Candidate = SendingMailbox & { remaining: number };

/**
 * Pure selection step, separated for testing. A lead stays on the mailbox that
 * first wrote to them while it's usable, so the thread stays in one inbox.
 */
export function pickMailbox(input: {
  mailboxes: SendingMailbox[];
  sentToday: Map<string, number>;
  stickyMailboxId: string | null;
  now: Date;
  dayEnd: Date;
}): MailboxClaim {
  const active = input.mailboxes.filter((mailbox) => mailbox.status === "active");
  if (!active.length) {
    return {
      mailbox: null,
      waitUntil: new Date(input.now.getTime() + 30 * 60_000),
      reason: input.mailboxes.length
        ? "Every sending mailbox is paused or needs attention in Settings → Sending."
        : "No sending mailbox is connected.",
    };
  }
  const candidates: Candidate[] = active.map((mailbox) => ({
    ...mailbox,
    remaining: effectiveDailyCap(mailbox, input.now) - (input.sentToday.get(mailbox.id) ?? 0),
  }));
  const tomorrow = new Date(input.dayEnd.getTime() + 5 * 60_000);

  const sticky = candidates.find((mailbox) => mailbox.id === input.stickyMailboxId);
  if (sticky) {
    if (sticky.remaining <= 0) return { mailbox: null, waitUntil: tomorrow, reason: `${sticky.email} reached today's limit; this lead's thread continues from it tomorrow.` };
    if (sticky.nextSendAt > input.now) return { mailbox: null, waitUntil: sticky.nextSendAt, reason: `Spacing sends from ${sticky.email}.` };
    return { mailbox: sticky };
  }

  const withCapacity = candidates.filter((mailbox) => mailbox.remaining > 0);
  if (!withCapacity.length) return { mailbox: null, waitUntil: tomorrow, reason: "Every mailbox has reached today's sending limit." };
  const ready = withCapacity.filter((mailbox) => mailbox.nextSendAt <= input.now);
  if (!ready.length) {
    const soonest = withCapacity.reduce((earliest, mailbox) => (mailbox.nextSendAt < earliest ? mailbox.nextSendAt : earliest), withCapacity[0]!.nextSendAt);
    return { mailbox: null, waitUntil: soonest, reason: "Spacing sends across mailboxes." };
  }
  ready.sort((a, b) => b.remaining - a.remaining || a.nextSendAt.getTime() - b.nextSendAt.getTime());
  return { mailbox: ready[0]! };
}

/** Picks a mailbox and books its next send slot, serialised per workspace. */
export async function claimMailboxSlot(input: { organizationId: string; stickyMailboxId: string | null; timezone: string; now?: Date }): Promise<MailboxClaim> {
  const now = input.now ?? new Date();
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`mailbox-pool/${input.organizationId}`}))`);
    const mailboxes = await transaction.select().from(sendingMailboxes).where(eq(sendingMailboxes.organizationId, input.organizationId));
    const sentToday = await mailboxSentCounts(input.organizationId, mailboxes.map((mailbox) => mailbox.id), input.timezone, now);
    const claim = pickMailbox({ mailboxes, sentToday, stickyMailboxId: input.stickyMailboxId, now, dayEnd: localDayBounds(now, input.timezone).end });
    if (claim.mailbox) {
      await transaction
        .update(sendingMailboxes)
        .set({ nextSendAt: new Date(now.getTime() + nextGap()), updatedAt: now })
        .where(eq(sendingMailboxes.id, claim.mailbox.id));
    }
    return claim;
  });
}
