import {
  and,
  asc,
  count,
  eq,
  inArray,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  OutreachEmailPolicyError,
  sendApprovedOutreachEmail,
} from "./outreach-email";
import { ResendDeliveryError } from "./resend-email";
import { getDatabase } from "./database";
import {
  campaigns,
  deliveryJobs,
  leads,
  organizationSendingSettings,
  outreachMessages,
  outreachSequences,
  suppressionEntries,
  usageLedger,
} from "./database/schema";
import { localDayBounds } from "./timezone";

const batchSize = 20;
const processingTimeoutMs = 10 * 60 * 1_000;

function retryAt(attempt: number) {
  const delayMinutes = Math.min(360, 5 * 2 ** Math.max(0, attempt - 1));
  return new Date(Date.now() + delayMinutes * 60_000);
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 1_000)
    : "The provider request failed.";
}

async function reserveDailyEmailCapacity(input: {
  organizationId: string;
  campaignId: string;
  messageId: string;
  timezone: string;
  dailyLimit: number;
}) {
  const database = getDatabase();
  const now = new Date();
  const bounds = localDayBounds(now, input.timezone);
  const reservationKey = `outreach-email-capacity/${input.messageId}`;

  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`email-quota/${input.organizationId}`}))`,
    );
    const [existing] = await transaction
      .select({ total: count() })
      .from(usageLedger)
      .where(
        and(
          eq(usageLedger.organizationId, input.organizationId),
          eq(usageLedger.idempotencyKey, reservationKey),
        ),
      );
    if ((existing?.total ?? 0) > 0) {
      return { reserved: true as const, retryAt: null, reservationKey };
    }

    const [usage] = await transaction
      .select({
        total: sql<number>`coalesce(sum(${usageLedger.quantity}), 0)::int`,
      })
      .from(usageLedger)
      .where(
        and(
          eq(usageLedger.organizationId, input.organizationId),
          inArray(usageLedger.kind, [
            "outreach_email_reserved",
            "outreach_email_accepted",
          ]),
          sql`${usageLedger.occurredAt} >= ${bounds.start}`,
          lt(usageLedger.occurredAt, bounds.end),
        ),
      );
    if ((usage?.total ?? 0) >= input.dailyLimit) {
      return {
        reserved: false as const,
        retryAt: new Date(bounds.end.getTime() + 5 * 60_000),
        reservationKey,
      };
    }

    await transaction.insert(usageLedger).values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      kind: "outreach_email_reserved",
      quantity: 1,
      idempotencyKey: reservationKey,
      occurredAt: now,
    });
    return { reserved: true as const, retryAt: null, reservationKey };
  });
}

async function releaseDailyEmailCapacity(reservationKey: string) {
  await getDatabase()
    .delete(usageLedger)
    .where(
      and(
        eq(usageLedger.idempotencyKey, reservationKey),
        eq(usageLedger.kind, "outreach_email_reserved"),
      ),
    );
}

async function cancelUnsafeJob(
  jobId: string,
  messageId: string,
  reason: string,
) {
  const database = getDatabase();
  const now = new Date();
  await database.transaction(async (transaction) => {
    await transaction
      .update(deliveryJobs)
      .set({
        status: "cancelled",
        lastError: reason,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(deliveryJobs.id, jobId));
    await transaction
      .update(outreachMessages)
      .set({ status: "cancelled", lastError: reason, updatedAt: now })
      .where(eq(outreachMessages.id, messageId));
  });
}

async function processClaimedJob(jobId: string) {
  const database = getDatabase();
  const [row] = await database
    .select({
      job: deliveryJobs,
      message: outreachMessages,
      sequence: outreachSequences,
      lead: leads,
      campaign: campaigns,
    })
    .from(deliveryJobs)
    .innerJoin(outreachMessages, eq(deliveryJobs.messageId, outreachMessages.id))
    .innerJoin(outreachSequences, eq(deliveryJobs.sequenceId, outreachSequences.id))
    .innerJoin(leads, eq(deliveryJobs.leadId, leads.id))
    .innerJoin(campaigns, eq(deliveryJobs.campaignId, campaigns.id))
    .where(eq(deliveryJobs.id, jobId))
    .limit(1);
  if (!row) return "cancelled" as const;

  const { job, message, sequence, lead, campaign } = row;
  if (
    job.channel !== "email" ||
    message.status !== "scheduled" ||
    !["scheduled", "active"].includes(sequence.status) ||
    !["scheduled", "sent", "delivered"].includes(campaign.status) ||
    lead.doNotContact ||
    lead.status === "suppressed" ||
    !lead.email ||
    !lead.emailVerified
  ) {
    await cancelUnsafeJob(
      job.id,
      message.id,
      "Delivery stopped because the campaign or recipient is no longer eligible.",
    );
    return "cancelled" as const;
  }

  const normalizedEmail = lead.email.trim().toLowerCase();
  const [suppression] = await database
    .select({ id: suppressionEntries.id })
    .from(suppressionEntries)
    .where(
      and(
        eq(suppressionEntries.organizationId, job.organizationId),
        eq(suppressionEntries.channel, "email"),
        eq(suppressionEntries.destination, normalizedEmail),
      ),
    )
    .limit(1);
  if (suppression) {
    await cancelUnsafeJob(
      job.id,
      message.id,
      "Delivery stopped because the recipient is permanently suppressed.",
    );
    return "cancelled" as const;
  }

  const [settings] = await database
    .select()
    .from(organizationSendingSettings)
    .where(eq(organizationSendingSettings.organizationId, job.organizationId))
    .limit(1);
  const timezone = settings?.timezone ?? sequence.timezone ?? "UTC";
  const dailyLimit = settings?.dailyEmailLimit ?? 100;
  const capacity = await reserveDailyEmailCapacity({
    organizationId: job.organizationId,
    campaignId: job.campaignId,
    messageId: message.id,
    timezone,
    dailyLimit,
  });
  if (!capacity.reserved) {
    await database
      .update(deliveryJobs)
      .set({
        status: "retry",
        availableAt: capacity.retryAt,
        lockedAt: null,
        lastError: "Daily email limit reached; queued for the next local day.",
        updatedAt: new Date(),
      })
      .where(eq(deliveryJobs.id, job.id));
    return "limited" as const;
  }

  try {
    const result = await sendApprovedOutreachEmail({
      to: normalizedEmail,
      subject: message.subject ?? "",
      text: message.content,
      campaignId: campaign.id,
      leadId: lead.id,
      messageId: message.id,
      idempotencyKey: job.idempotencyKey,
      approved: true,
      doNotContact: false,
      emailVerified: true,
    });
    const now = new Date();
    await database.transaction(async (transaction) => {
      await transaction
        .update(deliveryJobs)
        .set({
          status: "completed",
          completedAt: now,
          lockedAt: null,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(deliveryJobs.id, job.id));
      await transaction
        .update(outreachMessages)
        .set({
          status: "sending",
          providerMessageId: result.providerMessageId,
          attemptCount: job.attemptCount,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(outreachMessages.id, message.id));
      await transaction
        .update(usageLedger)
        .set({ kind: "outreach_email_accepted", occurredAt: now })
        .where(eq(usageLedger.idempotencyKey, capacity.reservationKey));
    });
    return "accepted" as const;
  } catch (error) {
    await releaseDailyEmailCapacity(capacity.reservationKey);
    const terminal =
      error instanceof OutreachEmailPolicyError ||
      (error instanceof ResendDeliveryError && !error.retryable) ||
      job.attemptCount >= job.maxAttempts;
    const now = new Date();
    await database.transaction(async (transaction) => {
      await transaction
        .update(deliveryJobs)
        .set({
          status: terminal ? "failed" : "retry",
          availableAt: terminal ? job.availableAt : retryAt(job.attemptCount),
          lockedAt: null,
          lastError: errorMessage(error),
          completedAt: terminal ? now : null,
          updatedAt: now,
        })
        .where(eq(deliveryJobs.id, job.id));
      await transaction
        .update(outreachMessages)
        .set({
          status: terminal ? "failed" : "scheduled",
          attemptCount: job.attemptCount,
          lastError: errorMessage(error),
          updatedAt: now,
        })
        .where(eq(outreachMessages.id, message.id));
    });
    return terminal ? ("failed" as const) : ("retry" as const);
  }
}

export async function processDueDeliveryJobs() {
  const database = getDatabase();
  const now = new Date();
  await database
    .update(deliveryJobs)
    .set({
      status: "retry",
      lockedAt: null,
      availableAt: now,
      lastError: "A stale processing lease was recovered.",
      updatedAt: now,
    })
    .where(
      and(
        eq(deliveryJobs.status, "processing"),
        lt(deliveryJobs.lockedAt, new Date(now.getTime() - processingTimeoutMs)),
      ),
    );

  const candidates = await database
    .select({ id: deliveryJobs.id })
    .from(deliveryJobs)
    .where(
      and(
        inArray(deliveryJobs.status, ["queued", "retry"]),
        lte(deliveryJobs.scheduledFor, now),
        lte(deliveryJobs.availableAt, now),
        or(eq(deliveryJobs.channel, "email"), eq(deliveryJobs.channel, "sms")),
      ),
    )
    .orderBy(asc(deliveryJobs.availableAt))
    .limit(batchSize);

  const results: string[] = [];
  for (const candidate of candidates) {
    const [claimed] = await database
      .update(deliveryJobs)
      .set({
        status: "processing",
        lockedAt: new Date(),
        attemptCount: sql`${deliveryJobs.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deliveryJobs.id, candidate.id),
          inArray(deliveryJobs.status, ["queued", "retry"]),
        ),
      )
      .returning({ id: deliveryJobs.id });
    if (claimed) results.push(await processClaimedJob(claimed.id));
  }

  return {
    examined: candidates.length,
    claimed: results.length,
    accepted: results.filter((result) => result === "accepted").length,
    retried: results.filter((result) => result === "retry").length,
    limited: results.filter((result) => result === "limited").length,
    failed: results.filter((result) => result === "failed").length,
    cancelled: results.filter((result) => result === "cancelled").length,
  };
}
