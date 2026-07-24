import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  CampaignArtifacts,
  CampaignExecution,
  CampaignProgressEvent,
} from "../domain/pipeline";
import { campaignArtifactsSchema } from "../domain/pipeline";
import { getDatabase } from "./database";
import {
  auditEvents,
  campaignExecutions,
  campaignProgressEvents,
  campaigns,
  enrichmentEvidence,
  icpProfiles,
  leads,
  outreachMessages,
  outreachSequences,
} from "./database/schema";

type PipelineActor = {
  organizationId: string;
  userId: string;
};

function chunked<Value>(values: Value[], size = 250) {
  const chunks: Value[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function mapExecution(
  row: typeof campaignExecutions.$inferSelect,
): CampaignExecution {
  return {
    id: row.id,
    campaignId: row.campaignId,
    organizationId: row.organizationId,
    status: row.status,
    stage: row.stage,
    attempt: row.attempt,
    eveSessionId: row.eveSessionId,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type ProgressWriter = Pick<ReturnType<typeof getDatabase>, "insert">;

// Progress events are advisory UI telemetry: written inside the same
// transaction when one is available, but a write failure must never abort
// the pipeline work it narrates.
export async function recordCampaignProgress(
  db: ProgressWriter,
  input: {
    organizationId: string;
    campaignId: string;
    stage: string;
    message: string;
  },
) {
  try {
    await db.insert(campaignProgressEvents).values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      stage: input.stage,
      message: input.message.slice(0, 500),
    });
  } catch {
    // Never let a progress write break the pipeline.
  }
}

export async function recordCampaignProgressForActor(
  actor: PipelineActor,
  campaignId: string,
  stage: string,
  message: string,
) {
  const database = getDatabase();
  const [campaign] = await database
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!campaign) throw new Error("Campaign was not found in this workspace.");

  await recordCampaignProgress(database, {
    organizationId: actor.organizationId,
    campaignId,
    stage,
    message,
  });
  return { recorded: true as const };
}

export async function listCampaignProgress(
  campaignId: string,
  organizationId: string,
  limit = 40,
): Promise<CampaignProgressEvent[]> {
  const rows = await getDatabase()
    .select({
      id: campaignProgressEvents.id,
      stage: campaignProgressEvents.stage,
      message: campaignProgressEvents.message,
      createdAt: campaignProgressEvents.createdAt,
    })
    .from(campaignProgressEvents)
    .where(
      and(
        eq(campaignProgressEvents.campaignId, campaignId),
        eq(campaignProgressEvents.organizationId, organizationId),
      ),
    )
    .orderBy(asc(campaignProgressEvents.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    stage: row.stage,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getCampaignExecution(
  campaignId: string,
  organizationId: string,
) {
  const [execution] = await getDatabase()
    .select()
    .from(campaignExecutions)
    .where(
      and(
        eq(campaignExecutions.campaignId, campaignId),
        eq(campaignExecutions.organizationId, organizationId),
      ),
    )
    .limit(1);

  return execution ? mapExecution(execution) : null;
}

export async function markCampaignPipelineStage(
  actor: PipelineActor,
  campaignId: string,
  stage: "enriching" | "copy_generated",
  note: string,
) {
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

    if (!campaign) throw new Error("Campaign was not found in this workspace.");
    if (campaign.status === "stopped") {
      throw new Error("A stopped campaign cannot continue processing.");
    }

    const progressOrder = [
      "researching",
      "enriching",
      "copy_generated",
      "awaiting_approval",
    ] as const;
    const currentIndex = progressOrder.indexOf(
      campaign.status as (typeof progressOrder)[number],
    );
    const nextIndex = progressOrder.indexOf(stage);

    if (currentIndex < 0 || currentIndex > nextIndex) {
      return { campaignId, status: campaign.status, unchanged: true };
    }

    if (currentIndex < nextIndex) {
      await transaction
        .update(campaigns)
        .set({ status: stage, updatedAt: now })
        .where(eq(campaigns.id, campaignId));
    }

    await transaction
      .update(campaignExecutions)
      .set({
        status: "running",
        stage,
        errorCode: null,
        errorMessage: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(campaignExecutions.campaignId, campaignId),
          eq(campaignExecutions.organizationId, actor.organizationId),
        ),
      );

    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId,
      action: `campaign.${stage}`,
      entityType: "campaign",
      entityId: campaignId,
      metadata: { stage, note: note.slice(0, 500) },
    });

    await recordCampaignProgress(transaction, {
      organizationId: actor.organizationId,
      campaignId,
      stage,
      message: note,
    });

    return { campaignId, status: stage, unchanged: false };
  });
}

export async function persistCampaignArtifacts(
  actor: PipelineActor,
  rawInput: CampaignArtifacts,
) {
  const input = campaignArtifactsSchema.parse(rawInput);
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

    if (!campaign) throw new Error("Campaign was not found in this workspace.");
    if (campaign.status === "stopped") {
      throw new Error("A stopped campaign cannot accept generated outreach.");
    }

    const [execution] = await transaction
      .select()
      .from(campaignExecutions)
      .where(
        and(
          eq(campaignExecutions.campaignId, input.campaignId),
          eq(campaignExecutions.organizationId, actor.organizationId),
        ),
      )
      .limit(1);

    if (!execution) throw new Error("Campaign execution was not initialized.");
    if (execution.artifactsPersistedAt) {
      return {
        campaignId: input.campaignId,
        status: "awaiting_approval" as const,
        idempotent: true,
      };
    }

    const icpIds = new Map<string, string>();
    const icpRows: Array<typeof icpProfiles.$inferInsert> = [];
    const evidenceRows: Array<typeof enrichmentEvidence.$inferInsert> = [];

    for (const artifact of input.icps) {
      const id = crypto.randomUUID();
      if (icpIds.has(artifact.name)) {
        throw new Error(`Duplicate ICP name: ${artifact.name}`);
      }
      icpIds.set(artifact.name, id);
      icpRows.push({
        id,
        organizationId: actor.organizationId,
        campaignId: input.campaignId,
        name: artifact.name,
        summary: artifact.summary,
        confidence: artifact.confidence,
        companyProfile: artifact.companyProfile,
        buyerRoles: artifact.buyerRoles,
        painPoints: artifact.painPoints,
        buyingSignals: artifact.buyingSignals,
        exclusions: artifact.exclusions,
        createdAt: now,
        updatedAt: now,
      });
      for (const evidence of artifact.evidence) {
        evidenceRows.push({
          id: crypto.randomUUID(),
          organizationId: actor.organizationId,
          campaignId: input.campaignId,
          icpProfileId: id,
          leadId: null,
          ...evidence,
          observedAt: new Date(evidence.observedAt),
        });
      }
    }

    await transaction.insert(icpProfiles).values(icpRows);

    // Leads are already persisted (discovered via Parallel Entity Search,
    // verified via the Parallel Task API, and approved by the user) before
    // this tool ever runs — this save only links existing leads to ICPs and
    // sequences, it never creates or mutates lead records.
    const referencedLeadIds = [
      ...new Set(input.sequences.map((sequence) => sequence.leadId)),
    ];
    const existingLeads = referencedLeadIds.length
      ? await transaction
          .select()
          .from(leads)
          .where(
            and(
              eq(leads.organizationId, actor.organizationId),
              eq(leads.campaignId, input.campaignId),
              inArray(leads.id, referencedLeadIds),
            ),
          )
      : [];
    const leadById = new Map(existingLeads.map((lead) => [lead.id, lead]));

    for (const sequence of input.sequences) {
      if (sequence.icpName && !icpIds.has(sequence.icpName)) {
        throw new Error(`Unknown ICP name for sequence: ${sequence.icpName}`);
      }
      const icpProfileId = sequence.icpName ? icpIds.get(sequence.icpName)! : null;
      const lead = leadById.get(sequence.leadId);
      if (!lead) {
        throw new Error(`Sequence references an unknown or unapproved lead: ${sequence.leadId}`);
      }
      if (icpProfileId && !lead.icpProfileId) {
        await transaction
          .update(leads)
          .set({ icpProfileId, updatedAt: now })
          .where(eq(leads.id, lead.id));
      }
    }

    for (const evidenceChunk of chunked(evidenceRows)) {
      if (evidenceChunk.length) {
        await transaction.insert(enrichmentEvidence).values(evidenceChunk);
      }
    }

    const sequenceRows: Array<typeof outreachSequences.$inferInsert> = [];
    const messageRows: Array<typeof outreachMessages.$inferInsert> = [];

    for (const artifact of input.sequences) {
      const leadId = artifact.leadId;
      const lead = leadById.get(leadId)!;
      if (lead.doNotContact || lead.status === "suppressed") {
        throw new Error(`A suppressed lead received a sequence: ${leadId}`);
      }
      if (artifact.channel === "email" && (!lead.email || !lead.emailVerified)) {
        throw new Error(`Email sequence requires a verified email: ${leadId}`);
      }
      if (artifact.channel === "sms" && (!lead.phone || !lead.phoneVerified)) {
        throw new Error(`SMS sequence requires a verified phone: ${leadId}`);
      }

      const sequenceId = crypto.randomUUID();
      sequenceRows.push({
        id: sequenceId,
        organizationId: actor.organizationId,
        campaignId: input.campaignId,
        leadId,
        channel: artifact.channel,
        name: artifact.name,
        timezone: artifact.timezone,
        status: "awaiting_approval",
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      const seenSteps = new Set<number>();
      for (const step of artifact.steps) {
        if (seenSteps.has(step.step)) {
          throw new Error(`Duplicate sequence step ${step.step} for ${leadId}`);
        }
        seenSteps.add(step.step);
        messageRows.push({
          id: crypto.randomUUID(),
          organizationId: actor.organizationId,
          campaignId: input.campaignId,
          sequenceId,
          leadId,
          channel: artifact.channel,
          stepNumber: step.step,
          dayOffset: step.dayOffset,
          subject: step.subject,
          subjectVariant: step.subjectVariant,
          content: step.content,
          status: "draft",
          idempotencyKey: `${input.campaignId}:${sequenceId}:${step.step}`,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const sequenceChunk of chunked(sequenceRows)) {
      await transaction.insert(outreachSequences).values(sequenceChunk);
    }
    for (const messageChunk of chunked(messageRows)) {
      await transaction.insert(outreachMessages).values(messageChunk);
    }

    await transaction
      .update(campaigns)
      .set({ status: "awaiting_approval", updatedAt: now })
      .where(eq(campaigns.id, input.campaignId));

    await transaction
      .update(campaignExecutions)
      .set({
        status: "completed",
        stage: "awaiting_approval",
        artifactsPersistedAt: now,
        completedAt: now,
        errorCode: null,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(campaignExecutions.id, execution.id));

    await transaction.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId: input.campaignId,
      action: "campaign.artifacts_persisted",
      entityType: "campaign",
      entityId: input.campaignId,
      metadata: {
        summary: input.summary.slice(0, 1_000),
        icpCount: input.icps.length,
        leadCount: referencedLeadIds.length,
        sequenceCount: input.sequences.length,
        messageCount: messageRows.length,
        status: "awaiting_approval",
      },
    });

    await recordCampaignProgress(transaction, {
      organizationId: actor.organizationId,
      campaignId: input.campaignId,
      stage: "awaiting_approval",
      message: `Personalized outreach is ready: ${input.icps.length} ICP${input.icps.length === 1 ? "" : "s"}, ${referencedLeadIds.length} lead${referencedLeadIds.length === 1 ? "" : "s"} and ${input.sequences.length} drafted sequence${input.sequences.length === 1 ? "" : "s"} are ready for your review.`,
    });

    return {
      campaignId: input.campaignId,
      status: "awaiting_approval" as const,
      idempotent: false,
      icpCount: input.icps.length,
      leadCount: referencedLeadIds.length,
      sequenceCount: input.sequences.length,
      messageCount: messageRows.length,
    };
  });
}
