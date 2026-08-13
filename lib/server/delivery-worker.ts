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
import {
  OutreachSmsPolicyError,
  sendApprovedOutreachSms,
} from "./outreach-sms";
import { TwilioDeliveryError } from "./twilio-sms";
import { getOrgResendCredentials, getOrgTwilioCredentials } from "./channel-credentials";
import { getDatabase } from "./database";
import {
  campaigns,
  deliveryDispatches,
  deliveryJobs,
  leads,
  organizationSendingSettings,
  outreachMessages,
  outreachSequences,
  suppressionEntries,
  usageLedger,
} from "./database/schema";
import {
  addLocalDays,
  localDateTimeAt,
  localDayBounds,
  zonedDateTimeToUtc,
} from "./timezone";
import { getReplyToAddress } from "./reply-address";
import type { ScheduleRecurrence } from "../domain/pipeline";

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

function nextOccurrence(
  scheduledFor: Date,
  recurrence: ScheduleRecurrence,
  timezone: string,
) {
  if (recurrence.everyMinutes !== undefined) {
    return new Date(
      scheduledFor.getTime() + recurrence.everyMinutes * 60_000,
    );
  }
  const local = localDateTimeAt(scheduledFor, timezone);
  return zonedDateTimeToUtc(
    addLocalDays(local.date, recurrence.intervalDays!),
    local.time,
    timezone,
  );
}

type DeliveryChannel = "email" | "sms";

function channelReservedKind(channel: DeliveryChannel) {
  return `outreach_${channel}_reserved`;
}

function channelAcceptedKind(channel: DeliveryChannel) {
  return `outreach_${channel}_accepted`;
}

async function reserveDailySendCapacity(input: {
  channel: DeliveryChannel;
  organizationId: string;
  campaignId: string;
  messageId: string;
  timezone: string;
  dailyLimit: number;
  occurrenceKey: string;
}) {
  const database = getDatabase();
  const now = new Date();
  const bounds = localDayBounds(now, input.timezone);
  const reservationKey = `outreach-${input.channel}-capacity/${input.occurrenceKey}`;
  const reservedKind = channelReservedKind(input.channel);
  const acceptedKind = channelAcceptedKind(input.channel);

  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${input.channel}-quota/${input.organizationId}`}))`,
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
          inArray(usageLedger.kind, [reservedKind, acceptedKind]),
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
      kind: reservedKind,
      quantity: 1,
      idempotencyKey: reservationKey,
      occurredAt: now,
    });
    return { reserved: true as const, retryAt: null, reservationKey };
  });
}

async function releaseDailySendCapacity(channel: DeliveryChannel, reservationKey: string) {
  await getDatabase()
    .delete(usageLedger)
    .where(
      and(
        eq(usageLedger.idempotencyKey, reservationKey),
        eq(usageLedger.kind, channelReservedKind(channel)),
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
  const channel = job.channel as DeliveryChannel;
  const recipientEligible =
    channel === "sms"
      ? Boolean(lead.phone && lead.phoneVerified)
      : Boolean(lead.email && lead.emailVerified);
  const acceptedMessageStatuses = job.recurrence
    ? ["scheduled", "sending", "sent", "delivered"]
    : ["scheduled"];
  if (
    (channel !== "email" && channel !== "sms") ||
    !acceptedMessageStatuses.includes(message.status) ||
    !["scheduled", "active"].includes(sequence.status) ||
    !["scheduled", "sent", "delivered"].includes(campaign.status) ||
    campaign.schedulePaused ||
    lead.doNotContact ||
    lead.status === "suppressed" ||
    !recipientEligible
  ) {
    await cancelUnsafeJob(
      job.id,
      message.id,
      "Delivery stopped because the campaign or recipient is no longer eligible.",
    );
    return "cancelled" as const;
  }

  const normalizedDestination =
    channel === "sms" ? lead.phone!.trim() : lead.email!.trim().toLowerCase();
  const [suppression] = await database
    .select({ id: suppressionEntries.id })
    .from(suppressionEntries)
    .where(
      and(
        eq(suppressionEntries.organizationId, job.organizationId),
        eq(suppressionEntries.channel, channel),
        eq(suppressionEntries.destination, normalizedDestination),
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
  const dailyLimit =
    channel === "sms"
      ? (settings?.dailySmsLimit ?? 0)
      : (settings?.dailyEmailLimit ?? 100);
  const capacity = await reserveDailySendCapacity({
    channel,
    organizationId: job.organizationId,
    campaignId: job.campaignId,
    messageId: message.id,
    timezone,
    dailyLimit,
    occurrenceKey: `${job.idempotencyKey}/${job.scheduledFor.toISOString()}`,
  });
  if (!capacity.reserved) {
    await database
      .update(deliveryJobs)
      .set({
        status: "retry",
        availableAt: capacity.retryAt,
        lockedAt: null,
        lastError: `Daily ${channel} limit reached; queued for the next local day.`,
        updatedAt: new Date(),
      })
      .where(eq(deliveryJobs.id, job.id));
    return "limited" as const;
  }

  const [fresh] = await database
    .select({
      jobStatus: deliveryJobs.status,
      messageStatus: outreachMessages.status,
      sequenceStatus: outreachSequences.status,
      doNotContact: leads.doNotContact,
      leadStatus: leads.status,
    })
    .from(deliveryJobs)
    .innerJoin(outreachMessages, eq(deliveryJobs.messageId, outreachMessages.id))
    .innerJoin(outreachSequences, eq(deliveryJobs.sequenceId, outreachSequences.id))
    .innerJoin(leads, eq(deliveryJobs.leadId, leads.id))
    .where(eq(deliveryJobs.id, job.id))
    .limit(1);
  if (
    !fresh ||
    fresh.jobStatus !== "processing" ||
    !(job.recurrence
      ? ["scheduled", "sending", "sent", "delivered"].includes(
          fresh.messageStatus,
        )
      : fresh.messageStatus === "scheduled") ||
    !["scheduled", "active"].includes(fresh.sequenceStatus) ||
    fresh.doNotContact ||
    fresh.leadStatus === "suppressed"
  ) {
    await releaseDailySendCapacity(channel, capacity.reservationKey);
    await cancelUnsafeJob(
      job.id,
      message.id,
      "Delivery stopped after a final reply and suppression safety check.",
    );
    return "cancelled" as const;
  }

  const occurrenceKey = `${job.idempotencyKey}/${job.scheduledFor.toISOString()}`;
  const [dispatch] = await database
    .insert(deliveryDispatches)
    .values({
      id: crypto.randomUUID(),
      deliveryJobId: job.id,
      organizationId: job.organizationId,
      occurrenceKey,
      status: "processing",
    })
    .onConflictDoNothing({
      target: [
        deliveryDispatches.deliveryJobId,
        deliveryDispatches.occurrenceKey,
      ],
    })
    .returning({ id: deliveryDispatches.id });
  if (!dispatch) {
    const [existingDispatch] = await database
      .select({ status: deliveryDispatches.status })
      .from(deliveryDispatches)
      .where(
        and(
          eq(deliveryDispatches.deliveryJobId, job.id),
          eq(deliveryDispatches.occurrenceKey, occurrenceKey),
        ),
      )
      .limit(1);
    if (existingDispatch?.status === "failed") {
      await database
        .update(deliveryDispatches)
        .set({
          status: "processing",
          lastError: null,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(deliveryDispatches.deliveryJobId, job.id),
            eq(deliveryDispatches.occurrenceKey, occurrenceKey),
          ),
        );
    } else {
      const now = new Date();
      await database.transaction(async (transaction) => {
        await transaction
          .update(deliveryDispatches)
          .set({
            status:
              existingDispatch?.status === "accepted"
                ? "accepted"
                : "ambiguous",
            lastError:
              existingDispatch?.status === "accepted"
                ? null
                : "Provider outcome is ambiguous; replay was blocked.",
            completedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(deliveryDispatches.deliveryJobId, job.id),
              eq(deliveryDispatches.occurrenceKey, occurrenceKey),
            ),
          );
        await transaction
          .update(deliveryJobs)
          .set({
            status: "failed",
            lockedAt: null,
            completedAt: now,
            lastError:
              "An earlier provider dispatch has an ambiguous result; automatic replay was blocked to prevent a duplicate send.",
            updatedAt: now,
          })
          .where(eq(deliveryJobs.id, job.id));
      });
      return "deduplicated" as const;
    }
  }

  try {
    const result =
      channel === "sms"
        ? await sendApprovedOutreachSms(await getOrgTwilioCredentials(job.organizationId), {
            to: normalizedDestination,
            text: message.content,
            campaignId: campaign.id,
            leadId: lead.id,
            messageId: message.id,
            approved: true,
            doNotContact: false,
            phoneVerified: true,
          })
        : await (async () => {
            const resendCredentials = await getOrgResendCredentials(job.organizationId);
            return sendApprovedOutreachEmail(
              resendCredentials
                ? { apiKey: resendCredentials.apiKey, fromEmail: resendCredentials.fromEmail }
                : null,
              {
                to: normalizedDestination,
                subject: message.subject ?? "",
                text: message.content,
                campaignId: campaign.id,
                leadId: lead.id,
                messageId: message.id,
                idempotencyKey: occurrenceKey,
                replyTo: getReplyToAddress(message.id, resendCredentials?.replyDomain),
                approved: true,
                doNotContact: false,
                emailVerified: true,
              },
            );
          })();
    const now = new Date();
    const nextRunAt = job.recurrence
      ? nextOccurrence(job.scheduledFor, job.recurrence, timezone)
      : null;
    await database.transaction(async (transaction) => {
      await transaction
        .update(deliveryJobs)
        .set({
          status: nextRunAt ? "queued" : "completed",
          scheduledFor: nextRunAt ?? job.scheduledFor,
          availableAt: nextRunAt ?? job.availableAt,
          attemptCount: nextRunAt ? 0 : job.attemptCount,
          completedAt: nextRunAt ? null : now,
          lockedAt: null,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(deliveryJobs.id, job.id));
      await transaction
        .update(outreachMessages)
        .set({
          status: nextRunAt ? "scheduled" : "sending",
          scheduledFor: nextRunAt ?? message.scheduledFor,
          providerMessageId: result.providerMessageId,
          attemptCount: job.attemptCount,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(outreachMessages.id, message.id));
      await transaction
        .update(deliveryDispatches)
        .set({
          status: "accepted",
          providerMessageId: result.providerMessageId,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(deliveryDispatches.deliveryJobId, job.id),
            eq(deliveryDispatches.occurrenceKey, occurrenceKey),
          ),
        );
      await transaction
        .update(usageLedger)
        .set({ kind: channelAcceptedKind(channel), occurredAt: now })
        .where(eq(usageLedger.idempotencyKey, capacity.reservationKey));
    });
    return "accepted" as const;
  } catch (error) {
    await releaseDailySendCapacity(channel, capacity.reservationKey);
    const terminal =
      error instanceof OutreachEmailPolicyError ||
      error instanceof OutreachSmsPolicyError ||
      (error instanceof ResendDeliveryError && !error.retryable) ||
      (error instanceof TwilioDeliveryError && !error.retryable) ||
      job.attemptCount >= job.maxAttempts;
    const now = new Date();
    await database.transaction(async (transaction) => {
      await transaction
        .update(deliveryDispatches)
        .set({
          status: "failed",
          lastError: errorMessage(error),
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(deliveryDispatches.deliveryJobId, job.id),
            eq(deliveryDispatches.occurrenceKey, occurrenceKey),
          ),
        );
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
    .innerJoin(campaigns, eq(deliveryJobs.campaignId, campaigns.id))
    .where(
      and(
        inArray(deliveryJobs.status, ["queued", "retry"]),
        lte(deliveryJobs.scheduledFor, now),
        lte(deliveryJobs.availableAt, now),
        or(eq(deliveryJobs.channel, "email"), eq(deliveryJobs.channel, "sms")),
        eq(campaigns.schedulePaused, false),
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
    deduplicated: results.filter((result) => result === "deduplicated").length,
  };
}
