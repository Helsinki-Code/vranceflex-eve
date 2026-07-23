import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import {
  scheduleSequencesSchema,
} from "../domain/pipeline";
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

type ScheduleInput = z.infer<typeof scheduleSequencesSchema>;

export async function scheduleCampaignSequences(
  actor: ApiActor,
  campaignId: string,
  input: ScheduleInput,
) {
  if (!["admin", "reviewer"].includes(actor.organizationRole)) {
    throw new AuthRequestError(
      "Admin or reviewer permission is required to schedule outreach.",
      403,
    );
  }

  try {
    assertValidTimezone(input.timezone);
  } catch (error) {
    throw new AuthRequestError(
      error instanceof Error ? error.message : "Choose a valid time zone.",
      400,
    );
  }

  const uniqueIds = [...new Set(input.sequenceIds)];
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
    if (selected.some(({ sequence }) => sequence.channel !== "email")) {
      throw new AuthRequestError(
        "SMS scheduling becomes available after the Twilio sender is connected.",
        409,
      );
    }
    if (
      selected.some(
        ({ lead }) => lead.doNotContact || !lead.email || !lead.emailVerified,
      )
    ) {
      throw new AuthRequestError(
        "Every selected lead needs a verified email and must be eligible for contact.",
        409,
      );
    }

    const destinations = selected
      .map(({ lead }) => lead.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email));
    if (destinations.length) {
      const suppressed = await transaction
        .select({ destination: suppressionEntries.destination })
        .from(suppressionEntries)
        .where(
          and(
            eq(suppressionEntries.organizationId, actor.organizationId),
            eq(suppressionEntries.channel, "email"),
            inArray(suppressionEntries.destination, destinations),
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
    if (campaign.status === "awaiting_approval") {
      await transaction
        .update(campaigns)
        .set({ status: "scheduled", updatedAt: now })
        .where(eq(campaigns.id, campaignId));
    }
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
      },
    });

    return {
      sequenceIds: uniqueIds,
      messageCount: messages.length,
      timezone: input.timezone,
      firstDeliveryAt: scheduledMessages
        .map(({ scheduledFor }) => scheduledFor)
        .sort((a, b) => a.getTime() - b.getTime())[0]!.toISOString(),
    };
  });
}
