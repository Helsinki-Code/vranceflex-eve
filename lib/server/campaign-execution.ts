import { Client } from "eve/client";
import { and, eq } from "drizzle-orm";
import type { Campaign } from "../domain/campaign";
import type { ApiActor } from "./api-actor";
import { getDatabase } from "./database";
import { campaignExecutions } from "./database/schema";
import { getCampaignExecution, recordCampaignProgress } from "./pipeline-store";

function executionPrompt(campaign: Campaign) {
  return [
    "VRANCEFLEX_CAMPAIGN_EXECUTION",
    "",
    `campaignId: ${campaign.id}`,
    "",
    "Run the complete campaign preparation workflow now.",
    "Use the declared specialist subagents and the campaign_progress and",
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
      return { shouldStart: false, id: existing.id };
    }

    if (existing?.status === "completed") {
      return { shouldStart: false, id: existing.id };
    }

    if (existing) {
      await transaction
        .update(campaignExecutions)
        .set({
          status: "queued",
          stage: "queued",
          attempt: existing.attempt + 1,
          eveSessionId: null,
          continuationToken: null,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          updatedAt: now,
        })
        .where(eq(campaignExecutions.id, existing.id));
      return { shouldStart: true, id: existing.id };
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
    return { shouldStart: true, id };
  });
}

export async function startCampaignExecution({
  campaign,
  actor,
  origin,
  sessionToken,
  force = false,
}: {
  campaign: Campaign;
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
    message: "Campaign accepted. Preparing the research run…",
  });
  try {
    const client = new Client({
      host: origin,
      auth: { bearer: sessionToken },
      redirect: "manual",
    });
    const response = await client.session().send({
      message: executionPrompt(campaign),
      clientContext: {
        campaignId: campaign.id,
        source: "vranceflex_campaign_create",
      },
    });
    const now = new Date();

    await database
      .update(campaignExecutions)
      .set({
        status: "running",
        stage: "researching",
        eveSessionId: response.sessionId,
        continuationToken: response.continuationToken,
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(campaignExecutions.id, prepared.id));

    await recordCampaignProgress(database, {
      organizationId: actor.organizationId,
      campaignId: campaign.id,
      stage: "researching",
      message:
        "Eve's Lead Researcher is analyzing your product and market to map ideal customer profiles.",
    });
  } catch (error) {
    const now = new Date();
    await database
      .update(campaignExecutions)
      .set({
        status: "failed",
        stage: "start_failed",
        errorCode: "eve_start_failed",
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
      stage: "start_failed",
      message: "The research run could not start. Use Retry research to run it again.",
    });
    throw error;
  }

  return getCampaignExecution(campaign.id, actor.organizationId);
}
