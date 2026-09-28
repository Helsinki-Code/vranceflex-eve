import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  OutreachWorkspaceSequence,
} from "../domain/pipeline";
import type { ApiActor } from "./api-actor";
import { findUnresolvedPlaceholders } from "./message-placeholders";
import { AuthRequestError } from "./auth-errors";
import { getDatabase } from "./database";
import {
  approvalRecords,
  auditEvents,
  campaigns,
  leads,
  outreachMessages,
  outreachSequences,
} from "./database/schema";

export async function listCampaignSequences(
  actor: ApiActor,
  campaignId: string,
): Promise<OutreachWorkspaceSequence[]> {
  const database = getDatabase();
  const rows = await database
    .select({
      sequence: outreachSequences,
      leadName: leads.personName,
      companyName: leads.companyName,
    })
    .from(outreachSequences)
    .innerJoin(leads, eq(outreachSequences.leadId, leads.id))
    .where(
      and(
        eq(outreachSequences.organizationId, actor.organizationId),
        eq(outreachSequences.campaignId, campaignId),
      ),
    )
    .orderBy(asc(leads.companyName), asc(leads.personName));

  if (!rows.length) return [];
  const messages = await database
    .select()
    .from(outreachMessages)
    .where(
      and(
        eq(outreachMessages.organizationId, actor.organizationId),
        eq(outreachMessages.campaignId, campaignId),
        inArray(
          outreachMessages.sequenceId,
          rows.map(({ sequence }) => sequence.id),
        ),
      ),
    )
    .orderBy(asc(outreachMessages.stepNumber));

  const bySequence = new Map<string, typeof messages>();
  for (const message of messages) {
    const list = bySequence.get(message.sequenceId) ?? [];
    list.push(message);
    bySequence.set(message.sequenceId, list);
  }

  return rows.map(({ sequence, leadName, companyName }) => ({
    id: sequence.id,
    leadId: sequence.leadId,
    leadName,
    companyName,
    channel: sequence.channel,
    name: sequence.name,
    timezone: sequence.timezone,
    status: sequence.status,
    messages: (bySequence.get(sequence.id) ?? []).map((message) => ({
      id: message.id,
      stepNumber: message.stepNumber,
      dayOffset: message.dayOffset,
      subject: message.subject,
      subjectVariant: message.subjectVariant,
      content: message.content,
      status: message.status,
      scheduledFor: message.scheduledFor?.toISOString() ?? null,
      providerMessageId: message.providerMessageId,
      attemptCount: message.attemptCount,
      lastError: message.lastError,
    })),
  }));
}

export async function updateOutreachMessage(
  actor: ApiActor,
  campaignId: string,
  messageId: string,
  input: {
    subject: string | null;
    subjectVariant: string | null;
    content: string;
  },
) {
  const database = getDatabase();
  const [message] = await database
    .select()
    .from(outreachMessages)
    .where(
      and(
        eq(outreachMessages.id, messageId),
        eq(outreachMessages.campaignId, campaignId),
        eq(outreachMessages.organizationId, actor.organizationId),
      ),
    )
    .limit(1);

  if (!message) throw new AuthRequestError("Message was not found.", 400);
  if (message.status !== "draft") {
    throw new AuthRequestError(
      "Only draft messages can be edited. Create a new version after approval.",
      409,
    );
  }

  const now = new Date();
  await database.transaction(async (transaction) => {
    await transaction
      .update(outreachMessages)
      .set({ ...input, updatedAt: now })
      .where(eq(outreachMessages.id, messageId));
    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId,
      action: "outreach.message_edited",
      entityType: "outreach_message",
      entityId: messageId,
      metadata: { sequenceId: message.sequenceId, stepNumber: message.stepNumber },
    });
  });

  return { id: messageId, updatedAt: now.toISOString() };
}

export async function approveCampaignSequences(
  actor: ApiActor,
  campaignId: string,
  sequenceIds: string[],
  scope: "first_launch" | "batch",
) {
  if (!["admin", "reviewer"].includes(actor.organizationRole)) {
    throw new AuthRequestError(
      "Admin or reviewer permission is required to approve outreach.",
      403,
    );
  }

  const uniqueIds = [...new Set(sequenceIds)];
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
        "Campaign copy must be awaiting approval.",
        409,
      );
    }

    const selected = await transaction
      .select()
      .from(outreachSequences)
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
    if (selected.some((sequence) => sequence.status !== "awaiting_approval")) {
      throw new AuthRequestError(
        "One or more sequences have already left the approval queue.",
        409,
      );
    }

    const selectedMessages = await transaction
      .select({ stepNumber: outreachMessages.stepNumber, subject: outreachMessages.subject, subjectVariant: outreachMessages.subjectVariant, content: outreachMessages.content, sequenceId: outreachMessages.sequenceId })
      .from(outreachMessages)
      .where(and(eq(outreachMessages.organizationId, actor.organizationId), inArray(outreachMessages.sequenceId, uniqueIds)));
    const unfilled = selectedMessages
      .map((message) => ({ message, placeholders: findUnresolvedPlaceholders(message.subject, message.subjectVariant, message.content) }))
      .filter((item) => item.placeholders.length);
    if (unfilled.length) {
      const names = new Map(selected.map((sequence) => [sequence.id, sequence.name]));
      const detail = unfilled.slice(0, 3).map(({ message, placeholders }) => `${names.get(message.sequenceId) ?? "sequence"} step ${message.stepNumber}: ${placeholders.join(", ")}`).join("; ");
      throw new AuthRequestError(
        `Fill in the placeholders before approving (${detail}${unfilled.length > 3 ? "; …" : ""}).`,
        409,
      );
    }

    await transaction
      .update(outreachSequences)
      .set({ status: "approved", updatedAt: now })
      .where(inArray(outreachSequences.id, uniqueIds));
    await transaction
      .update(outreachMessages)
      .set({ status: "approved", updatedAt: now })
      .where(
        and(
          eq(outreachMessages.organizationId, actor.organizationId),
          eq(outreachMessages.campaignId, campaignId),
          inArray(outreachMessages.sequenceId, uniqueIds),
          eq(outreachMessages.status, "draft"),
        ),
      );

    const approvalId = crypto.randomUUID();
    await transaction.insert(approvalRecords).values({
      id: approvalId,
      campaignId,
      organizationId: actor.organizationId,
      approvedBy: actor.userId,
      scope,
      approvedAt: now,
    });
    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId,
      action: "outreach.sequences_approved",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { approvalId, scope, sequenceIds: uniqueIds },
    });

    return {
      approvalId,
      approvedSequenceIds: uniqueIds,
      approvedAt: now.toISOString(),
      campaignStatus: "awaiting_approval" as const,
    };
  });
}
