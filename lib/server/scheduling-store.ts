import { and, asc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import {
  deleteScheduleSchema,
  listSchedulesSchema,
  scheduleSequencesSchema,
  updateScheduleSchema,
} from "../domain/pipeline";
import { getOrgResendCredentials, getOrgTwilioCredentials } from "./channel-credentials";
import type { ApiActor } from "./api-actor";
import { AuthRequestError } from "./auth-errors";
import { getDatabase } from "./database";
import {
  auditEvents,
  campaigns,
  deliveryJobs,
  leads,
  organizationSendingSettings,
  outreachMessages,
  outreachSequences,
  suppressionEntries,
} from "./database/schema";
import { addLocalDays, assertValidTimezone, zonedDateTimeToUtc } from "./timezone";

type ParsedScheduleInput = z.infer<typeof scheduleSequencesSchema>;
type ScheduleInput = Omit<ParsedScheduleInput, "recurrence"> & {
  recurrence?: ParsedScheduleInput["recurrence"];
};
type ListSchedulesInput = z.infer<typeof listSchedulesSchema>;
type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
type DeleteScheduleInput = z.infer<typeof deleteScheduleSchema>;

function assertCanManageSchedules(actor: ApiActor) {
  if (!["admin", "reviewer"].includes(actor.organizationRole)) {
    throw new AuthRequestError(
      "Admin or reviewer permission is required to manage outreach schedules.",
      403,
    );
  }
}

export async function scheduleCampaignSequences(
  actor: ApiActor,
  campaignId: string,
  input: ScheduleInput,
) {
  assertCanManageSchedules(actor);

  try {
    assertValidTimezone(input.timezone);
  } catch (error) {
    throw new AuthRequestError(
      error instanceof Error ? error.message : "Choose a valid time zone.",
      400,
    );
  }

  const uniqueIds = [...new Set(input.sequenceIds)];
  const recurrence = input.recurrence ?? null;
  const database = getDatabase();
  const now = new Date();

  return database.transaction(async (transaction) => {
    const [campaign] = await transaction
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    if (!campaign) throw new AuthRequestError("Campaign was not found.", 400);
    if (!["awaiting_approval", "scheduled"].includes(campaign.status)) {
      throw new AuthRequestError(
        "Campaign must be approved before it can be scheduled.",
        409,
      );
    }

    const selected = await transaction
      .select({
        sequence: outreachSequences,
        lead: leads,
      })
      .from(outreachSequences)
      .innerJoin(leads, eq(outreachSequences.leadId, leads.id))
      .where(
        and(
          eq(outreachSequences.organizationId, actor.organizationId),
          eq(outreachSequences.campaignId, campaignId),
          inArray(outreachSequences.id, uniqueIds),
        ),
      );
    if (selected.length !== uniqueIds.length) {
      throw new AuthRequestError(
        "One or more selected sequences were not found.",
        400,
      );
    }
    if (selected.some(({ sequence }) => sequence.status !== "approved")) {
      throw new AuthRequestError(
        "Only human-approved sequences can be scheduled.",
        409,
      );
    }
    const hasEmailSequences = selected.some(({ sequence }) => sequence.channel === "email");
    const hasSmsSequences = selected.some(({ sequence }) => sequence.channel === "sms");
    if (hasEmailSequences && !(await getOrgResendCredentials(actor.organizationId))) {
      throw new AuthRequestError(
        "Connect this workspace's Resend account in Settings → Integrations before scheduling email outreach.",
        409,
      );
    }
    if (hasSmsSequences && !(await getOrgTwilioCredentials(actor.organizationId))) {
      throw new AuthRequestError(
        "Connect this workspace's Twilio account in Settings → Integrations before scheduling SMS outreach.",
        409,
      );
    }
    if (
      selected.some(({ sequence, lead }) => {
        if (lead.doNotContact) return true;
        return sequence.channel === "sms"
          ? !lead.phone || !lead.phoneVerified
          : !lead.email || !lead.emailVerified;
      })
    ) {
      throw new AuthRequestError(
        "Every selected lead needs a verified contact address for its channel and must be eligible for contact.",
        409,
      );
    }

    const emailDestinations = selected
      .filter(({ sequence }) => sequence.channel === "email")
      .map(({ lead }) => lead.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email));
    const smsDestinations = selected
      .filter(({ sequence }) => sequence.channel === "sms")
      .map(({ lead }) => lead.phone?.trim())
      .filter((phone): phone is string => Boolean(phone));

    if (emailDestinations.length) {
      const suppressed = await transaction
        .select({ destination: suppressionEntries.destination })
        .from(suppressionEntries)
        .where(
          and(
            eq(suppressionEntries.organizationId, actor.organizationId),
            eq(suppressionEntries.channel, "email"),
            inArray(suppressionEntries.destination, emailDestinations),
          ),
        );
      if (suppressed.length) {
        throw new AuthRequestError(
          "A selected recipient is permanently suppressed.",
          409,
        );
      }
    }
    if (smsDestinations.length) {
      const suppressed = await transaction
        .select({ destination: suppressionEntries.destination })
        .from(suppressionEntries)
        .where(
          and(
            eq(suppressionEntries.organizationId, actor.organizationId),
            eq(suppressionEntries.channel, "sms"),
            inArray(suppressionEntries.destination, smsDestinations),
          ),
        );
      if (suppressed.length) {
        throw new AuthRequestError(
          "A selected recipient is permanently suppressed.",
          409,
        );
      }
    }

    const messages = await transaction
      .select()
      .from(outreachMessages)
      .where(
        and(
          eq(outreachMessages.organizationId, actor.organizationId),
          eq(outreachMessages.campaignId, campaignId),
          inArray(outreachMessages.sequenceId, uniqueIds),
        ),
      );
    if (!messages.length || messages.some((message) => message.status !== "approved")) {
      throw new AuthRequestError(
        "Every message in the selected sequences must be approved.",
        409,
      );
    }

    const scheduledMessages = messages.map((message) => {
      try {
        const scheduledFor = zonedDateTimeToUtc(
          addLocalDays(input.startDate, message.dayOffset),
          input.sendTime,
          input.timezone,
        );
        if (scheduledFor.getTime() <= now.getTime()) {
          throw new Error("The first delivery time must be in the future.");
        }
        return { message, scheduledFor };
      } catch (error) {
        throw new AuthRequestError(
          error instanceof Error ? error.message : "The schedule is invalid.",
          400,
        );
      }
    });

    await transaction
      .insert(organizationSendingSettings)
      .values({
        organizationId: actor.organizationId,
        timezone: input.timezone,
      })
      .onConflictDoUpdate({
        target: organizationSendingSettings.organizationId,
        set: { timezone: input.timezone, updatedAt: now },
      });

    for (const { message, scheduledFor } of scheduledMessages) {
      await transaction.insert(deliveryJobs).values({
        id: crypto.randomUUID(),
        organizationId: actor.organizationId,
        campaignId,
        sequenceId: message.sequenceId,
        messageId: message.id,
        leadId: message.leadId,
        channel: message.channel,
        status: "queued",
        scheduledFor,
        availableAt: scheduledFor,
        idempotencyKey: `outreach/${message.id}`,
        recurrence,
      });
      await transaction
        .update(outreachMessages)
        .set({
          status: "scheduled",
          scheduledFor,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(outreachMessages.id, message.id));
    }

    await transaction
      .update(outreachSequences)
      .set({ status: "scheduled", timezone: input.timezone, updatedAt: now })
      .where(inArray(outreachSequences.id, uniqueIds));
    await transaction
      .update(campaigns)
      .set({
        ...(campaign.status === "awaiting_approval" ? { status: "scheduled" as const } : {}),
        recurrence,
        schedulePaused: false,
        updatedAt: now,
      })
      .where(eq(campaigns.id, campaignId));
    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId,
      action: "outreach.sequences_scheduled",
      entityType: "campaign",
      entityId: campaignId,
      metadata: {
        sequenceIds: uniqueIds,
        messageCount: messages.length,
        startDate: input.startDate,
        sendTime: input.sendTime,
        timezone: input.timezone,
        recurrence,
      },
    });

    return {
      sequenceIds: uniqueIds,
      messageCount: messages.length,
      timezone: input.timezone,
      recurrence,
      paused: false,
      firstDeliveryAt: scheduledMessages
        .map(({ scheduledFor }) => scheduledFor)
        .sort((a, b) => a.getTime() - b.getTime())[0]!.toISOString(),
    };
  });
}

export async function listCampaignSchedules(
  actor: ApiActor,
  input: ListSchedulesInput = {},
) {
  const database = getDatabase();
  const rows = await database
    .select({
      campaign: campaigns,
      job: deliveryJobs,
    })
    .from(campaigns)
    .innerJoin(deliveryJobs, eq(deliveryJobs.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.organizationId, actor.organizationId),
        inArray(deliveryJobs.status, ["queued", "retry", "processing"]),
        ...(input.campaignId ? [eq(campaigns.id, input.campaignId)] : []),
      ),
    )
    .orderBy(asc(deliveryJobs.scheduledFor));

  const grouped = new Map<
    string,
    {
      campaignId: string;
      campaignName: string;
      recurrence: typeof campaigns.$inferSelect.recurrence;
      paused: boolean;
      nextRunAt: string | null;
      sequenceIds: string[];
      activeJobCount: number;
    }
  >();
  for (const { campaign, job } of rows) {
    let schedule = grouped.get(campaign.id);
    if (!schedule) {
      schedule = {
        campaignId: campaign.id,
        campaignName: campaign.productName,
        recurrence: campaign.recurrence,
        paused: campaign.schedulePaused,
        nextRunAt: null,
        sequenceIds: [],
        activeJobCount: 0,
      };
      grouped.set(campaign.id, schedule);
    }
    if (!schedule.sequenceIds.includes(job.sequenceId)) {
      schedule.sequenceIds.push(job.sequenceId);
    }
    if (["queued", "retry", "processing"].includes(job.status)) {
      schedule.activeJobCount += 1;
      const scheduledFor = job.scheduledFor.toISOString();
      if (!schedule.nextRunAt || scheduledFor < schedule.nextRunAt) {
        schedule.nextRunAt = scheduledFor;
      }
    }
  }
  return Array.from(grouped.values());
}

export async function updateCampaignSchedule(
  actor: ApiActor,
  input: UpdateScheduleInput,
) {
  assertCanManageSchedules(actor);
  const database = getDatabase();
  const now = new Date();
  return database.transaction(async (transaction) => {
    const [campaign] = await transaction
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, input.campaignId),
          eq(campaigns.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    if (!campaign) throw new AuthRequestError("Schedule was not found.", 400);

    const set = {
      ...(input.recurrence !== undefined ? { recurrence: input.recurrence } : {}),
      ...(input.paused !== undefined ? { schedulePaused: input.paused } : {}),
      updatedAt: now,
    };
    await transaction
      .update(campaigns)
      .set(set)
      .where(eq(campaigns.id, campaign.id));
    if (input.recurrence !== undefined) {
      await transaction
        .update(deliveryJobs)
        .set({ recurrence: input.recurrence, updatedAt: now })
        .where(
          and(
            eq(deliveryJobs.organizationId, actor.organizationId),
            eq(deliveryJobs.campaignId, campaign.id),
            inArray(deliveryJobs.status, ["queued", "retry", "processing"]),
          ),
        );
    }
    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId: campaign.id,
      action: "outreach.schedule_updated",
      entityType: "campaign",
      entityId: campaign.id,
      metadata: {
        ...(input.recurrence !== undefined ? { recurrence: input.recurrence } : {}),
        ...(input.paused !== undefined ? { paused: input.paused } : {}),
      },
    });
    return {
      campaignId: campaign.id,
      recurrence:
        input.recurrence !== undefined ? input.recurrence : campaign.recurrence,
      paused:
        input.paused !== undefined ? input.paused : campaign.schedulePaused,
    };
  });
}

export async function deleteCampaignSchedule(
  actor: ApiActor,
  input: DeleteScheduleInput,
) {
  assertCanManageSchedules(actor);
  const database = getDatabase();
  const now = new Date();
  return database.transaction(async (transaction) => {
    const [campaign] = await transaction
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, input.campaignId),
          eq(campaigns.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    if (!campaign) throw new AuthRequestError("Schedule was not found.", 400);
    const cancelled = await transaction
      .update(deliveryJobs)
      .set({
        status: "cancelled",
        completedAt: now,
        lockedAt: null,
        lastError: "Schedule deleted.",
        updatedAt: now,
      })
      .where(
        and(
          eq(deliveryJobs.organizationId, actor.organizationId),
          eq(deliveryJobs.campaignId, campaign.id),
          inArray(deliveryJobs.status, ["queued", "retry", "processing"]),
        ),
      )
      .returning({ id: deliveryJobs.id });
    await transaction
      .update(campaigns)
      .set({ recurrence: null, schedulePaused: false, updatedAt: now })
      .where(eq(campaigns.id, campaign.id));
    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId: campaign.id,
      action: "outreach.schedule_deleted",
      entityType: "campaign",
      entityId: campaign.id,
      metadata: { cancelledJobCount: cancelled.length },
    });
    return { campaignId: campaign.id, cancelledJobCount: cancelled.length };
  });
}
