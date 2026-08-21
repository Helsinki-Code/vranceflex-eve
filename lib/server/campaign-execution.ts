import { Client } from "eve/client";
import { and, eq } from "drizzle-orm";
import type { Campaign } from "../domain/campaign";
import type { ApiActor } from "./api-actor";
import type { ApprovedLead } from "./candidate-store";
import { getDatabase } from "./database";
import { campaignExecutions } from "./database/schema";
import { classifyEveTerminalEvent } from "./eve-terminal";
import { getCampaignExecution, recordCampaignProgress } from "./pipeline-store";

function executionPrompt(
  campaign: Campaign,
  approvedLeads: ApprovedLead[],
  recoveryStage?: string,
) {
  const prompt = [
    "VRANCEFLEX_CAMPAIGN_EXECUTION",
    "",
    `campaignId: ${campaign.id}`,
    "",
    "The user has already selected and approved the leads below — Parallel has",
    "already verified their contact details. Do not discover or verify any",
    "additional leads. Run ICP synthesis, personalization research, and",
    "sequence generation over exactly this list, using the declared specialist",
    "subagents and the campaign_progress, report_progress, and",
    "save_campaign_artifacts tools exactly as required by your instructions.",
    "Do not request confirmation for research or copy generation.",
    "Do not approve, schedule, or send any outreach.",
    "",
    "CONFIRMED_CAMPAIGN_INPUT",
    JSON.stringify(
      {
        businessName: campaign.businessName,
        productName: campaign.productName,
        productSummary: campaign.productSummary,
        source: campaign.source,
        audience: campaign.audience,
        geography: campaign.geography,
        goal: campaign.goal,
        leadCount: campaign.leadCount,
        monthlyBudgetUsd: campaign.monthlyBudgetUsd,
        channels: campaign.channels,
      },
      null,
      2,
    ),
    "",
    "APPROVED_LEADS",
    JSON.stringify(approvedLeads, null, 2),
  ];
  if (recoveryStage) {
    prompt.push(
      "",
      "RECOVERY_CHECKPOINT",
      `The prior Eve session ended at application stage: ${recoveryStage}.`,
      "Inspect the campaign's persisted progress and artifacts first. Reuse all completed",
      "work and perform only missing steps; do not restart the workflow from lead organization.",
    );
  }
  return prompt.join("\n");
}

function continuationPrompt(stage: string) {
  return [
    "VRANCEFLEX_CAMPAIGN_CONTINUATION",
    "",
    `Resume the existing campaign preparation from its durable checkpoint at stage: ${stage}.`,
    "Do not rediscover leads and do not repeat completed ICP, research, or drafting work.",
    "Continue only the unfinished steps, then persist the final reviewable artifacts with",
    "save_campaign_artifacts. Nothing may be approved, scheduled, or sent.",
  ].join("\n");
}

async function prepareExecution(
  campaign: Campaign,
  actor: ApiActor,
  force: boolean,
) {
  const database = getDatabase();
  const now = new Date();

  return database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select()
      .from(campaignExecutions)
      .where(
        and(
          eq(campaignExecutions.campaignId, campaign.id),
          eq(campaignExecutions.organizationId, actor.organizationId),
        ),
      )
      .limit(1);

    if (
      existing &&
      !force &&
      (existing.status === "running" || existing.status === "completed")
    ) {
      return {
        shouldStart: false,
        id: existing.id,
        resumeState: null,
        resumeStage: existing.stage,
      };
    }

    if (existing?.status === "completed") {
      return {
        shouldStart: false,
        id: existing.id,
        resumeState: null,
        resumeStage: existing.stage,
      };
    }

    if (existing) {
      if (["queued", "running"].includes(existing.status)) {
        throw new Error(
          "This Eve run is still active. Stop it before continuing from its checkpoint.",
        );
      }

      const canResume =
        existing.status === "failed" &&
        existing.errorCode === "user_cancelled" &&
        Boolean(existing.eveSessionId && existing.continuationToken);
      await transaction
        .update(campaignExecutions)
        .set({
          status: "queued",
          stage: canResume ? existing.stage : "queued",
          attempt: existing.attempt + 1,
          eveSessionId: canResume ? existing.eveSessionId : null,
          continuationToken: canResume ? existing.continuationToken : null,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          updatedAt: now,
        })
        .where(eq(campaignExecutions.id, existing.id));
      return {
        shouldStart: true,
        id: existing.id,
        resumeState: canResume
          ? {
              continuationToken: existing.continuationToken!,
              sessionId: existing.eveSessionId!,
              streamIndex: 0,
            }
          : null,
        resumeStage: existing.stage,
      };
    }

    const id = crypto.randomUUID();
    await transaction.insert(campaignExecutions).values({
      id,
      campaignId: campaign.id,
      organizationId: actor.organizationId,
      status: "queued",
      stage: "queued",
      attempt: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { shouldStart: true, id, resumeState: null, resumeStage: "queued" };
  });
}

export async function startCampaignExecution({
  campaign,
  approvedLeads,
  actor,
  origin,
  sessionToken,
  force = false,
}: {
  campaign: Campaign;
  approvedLeads: ApprovedLead[];
  actor: ApiActor;
  origin: string;
  sessionToken: string;
  force?: boolean;
}) {
  if (!sessionToken) {
    throw new Error("The authenticated session token is unavailable.");
  }

  const prepared = await prepareExecution(campaign, actor, force);
  if (!prepared.shouldStart) {
    return getCampaignExecution(campaign.id, actor.organizationId);
  }

  const database = getDatabase();
  await recordCampaignProgress(database, {
    organizationId: actor.organizationId,
    campaignId: campaign.id,
    stage: "queued",
    message: "Preparing personalized outreach for your approved leads…",
  });
  try {
    const client = new Client({
      host: origin,
      auth: { bearer: sessionToken },
      redirect: "manual",
    });
    const session = prepared.resumeState
      ? client.session(prepared.resumeState)
      : client.session();
    const response = await session.send({
      message: prepared.resumeState
        ? continuationPrompt(prepared.resumeStage)
        : executionPrompt(
            campaign,
            approvedLeads,
            prepared.resumeStage === "queued" ? undefined : prepared.resumeStage,
          ),
      clientContext: {
        campaignId: campaign.id,
        source: prepared.resumeState
          ? "vranceflex_campaign_continue"
          : "vranceflex_campaign_create",
      },
    });
    const now = new Date();

    await database
      .update(campaignExecutions)
      .set({
        status: "running",
        stage: prepared.resumeState ? prepared.resumeStage : "researching",
        eveSessionId: response.sessionId,
        continuationToken: response.continuationToken,
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(campaignExecutions.id, prepared.id));

    await recordCampaignProgress(database, {
      organizationId: actor.organizationId,
      campaignId: campaign.id,
      stage: prepared.resumeState ? prepared.resumeStage : "researching",
      message: prepared.resumeState
        ? `Eve resumed from ${prepared.resumeStage.replaceAll("_", " ")} without restarting completed work…`
        : "Organizing your approved leads into ideal customer profiles…",
    });
  } catch (error) {
    const now = new Date();
    await database
      .update(campaignExecutions)
      .set({
        status: "failed",
        stage: prepared.resumeState ? prepared.resumeStage : "start_failed",
        errorCode: prepared.resumeState ? "user_cancelled" : "eve_start_failed",
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 2_000)
            : "Eve execution could not be started.",
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(campaignExecutions.id, prepared.id));
    await recordCampaignProgress(database, {
      organizationId: actor.organizationId,
      campaignId: campaign.id,
      stage: prepared.resumeState ? prepared.resumeStage : "start_failed",
      message: prepared.resumeState
        ? "Eve could not resume yet. The checkpoint is still saved; try Continue again."
        : "The research run could not start. Use Retry research to run it again.",
    });
    throw error;
  }

  return getCampaignExecution(campaign.id, actor.organizationId);
}

export async function cancelCampaignExecution({
  campaignId,
  organizationId,
  origin,
  sessionToken,
}: {
  campaignId: string;
  organizationId: string;
  origin: string;
  sessionToken: string;
}) {
  const database = getDatabase();
  const [execution] = await database
    .select()
    .from(campaignExecutions)
    .where(
      and(
        eq(campaignExecutions.campaignId, campaignId),
        eq(campaignExecutions.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!execution || !["queued", "running"].includes(execution.status)) {
    return getCampaignExecution(campaignId, organizationId);
  }
  if (!execution.eveSessionId || !sessionToken) {
    throw new Error("The active Eve session could not be cancelled.");
  }

  const client = new Client({
    host: origin,
    auth: { bearer: sessionToken },
    redirect: "manual",
  });
  const session = client.session({
    continuationToken: execution.continuationToken ?? undefined,
    sessionId: execution.eveSessionId,
    streamIndex: 0,
  });
  await session.cancel();

  const now = new Date();
  await database
    .update(campaignExecutions)
    .set({
      status: "failed",
      errorCode: "user_cancelled",
      errorMessage: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(campaignExecutions.id, execution.id),
        eq(campaignExecutions.organizationId, organizationId),
      ),
    );
  await recordCampaignProgress(database, {
    organizationId,
    campaignId,
    stage: execution.stage,
    message: "Campaign preparation stopped. Eve saved the durable session checkpoint.",
  });

  // Cancellation parks the session asynchronously. Capture the newest resume
  // token when it becomes available, but never hold the stop request open for
  // more than a short bounded probe.
  const streamController = new AbortController();
  const streamTimeout = setTimeout(() => streamController.abort(), 2_500);
  try {
    for await (const event of session.stream({
      startIndex: -1,
      signal: streamController.signal,
    })) {
      if (event.type === "session.waiting") {
        const continuationToken = event.data.continuationToken;
        if (continuationToken) {
          await database
            .update(campaignExecutions)
            .set({ continuationToken, updatedAt: new Date() })
            .where(eq(campaignExecutions.id, execution.id));
        }
        break;
      }
      if (["session.completed", "session.failed"].includes(event.type)) break;
    }
  } catch {
    // The token returned when the turn started remains a valid fallback. A
    // later continuation request will surface a genuinely stale token.
  } finally {
    clearTimeout(streamTimeout);
  }

  return getCampaignExecution(campaignId, organizationId);
}

/**
 * Reconciles the application execution row with Eve's durable stream tail.
 * Session creation is asynchronous: a POST can be accepted and the model turn
 * can fail moments later, so treating a successful `send()` as proof that the
 * run is still alive leaves campaigns permanently marked as running.
 */
export async function reconcileCampaignExecution({
  campaignId,
  organizationId,
  origin,
  sessionToken,
}: {
  campaignId: string;
  organizationId: string;
  origin: string;
  sessionToken: string;
}) {
  const execution = await getCampaignExecution(campaignId, organizationId);
  if (
    !execution ||
    !["queued", "running"].includes(execution.status) ||
    !execution.eveSessionId ||
    !sessionToken
  ) {
    return execution;
  }

  try {
    const client = new Client({
      host: origin,
      auth: { bearer: sessionToken },
      redirect: "manual",
    });
    const session = client.session({
      sessionId: execution.eveSessionId,
      streamIndex: 0,
    });

    const streamController = new AbortController();
    const streamTimeout = setTimeout(() => streamController.abort(), 1_000);

    try {
      for await (const event of session.stream({
        startIndex: -1,
        signal: streamController.signal,
      })) {
        const terminal = classifyEveTerminalEvent(event);
        if (!terminal) break;

        const now = new Date();
        const database = getDatabase();
        await database
          .update(campaignExecutions)
          .set({
            status: "failed",
            errorCode: terminal.errorCode,
            errorMessage: terminal.errorMessage.slice(0, 2_000),
            completedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(campaignExecutions.id, execution.id),
              eq(campaignExecutions.organizationId, organizationId),
              eq(campaignExecutions.status, execution.status),
            ),
          );
        await recordCampaignProgress(database, {
          organizationId,
          campaignId,
          stage: "eve_failed",
          message: terminal.errorMessage,
        });
        return getCampaignExecution(campaignId, organizationId);
      }
    } finally {
      clearTimeout(streamTimeout);
    }
  } catch {
    // Reconciliation is best-effort. A transient stream/auth failure must not
    // make the campaign workspace unavailable; the next poll retries it.
  }

  return execution;
}
