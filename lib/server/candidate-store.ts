import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { Campaign } from "../domain/campaign";
import type { ApiActor } from "./api-actor";
import { AuthRequestError } from "./auth-errors";
import { getCampaign as getDomainCampaign } from "./campaign-store";
import {
  createEnrichmentGroup,
  entitySearch,
  getEnrichmentGroupStatus,
  getEnrichmentRunResult,
  getEnrichmentRunStatus,
  type EnrichmentOutput,
} from "./parallel-client";
import { recordCampaignProgress } from "./pipeline-store";
import { getDatabase } from "./database";
import {
  campaignCandidates,
  campaigns,
  enrichmentGroups,
  leads,
} from "./database/schema";

const DEFAULT_LEAD_CONFIDENCE = 80;

const DISCOVERY_MULTIPLIER = 3;
const MAX_DISCOVERY = 1_000;
const REFRESH_THROTTLE_MS = 10_000;
const RUN_PROBES_PER_REFRESH = 20;

export type CandidateSummary = {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  status: "discovered" | "enriching" | "verified" | "approved" | "failed";
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  xHandle: string | null;
  companyName: string | null;
  jobTitle: string | null;
  errorMessage: string | null;
};

function mapCandidate(row: typeof campaignCandidates.$inferSelect): CandidateSummary {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    description: row.description,
    status: row.status,
    email: row.email,
    phone: row.phone,
    linkedinUrl: row.linkedinUrl,
    xHandle: row.xHandle,
    companyName: row.companyName,
    jobTitle: row.jobTitle,
    errorMessage: row.errorMessage,
  };
}

function discoveryObjective(campaign: Campaign) {
  // Entity Search wants a direct, punchy description of WHO to find —
  // e.g. "CEOs or Founders of AI startups in USA founded after 2022".
  // Folding in the seller's own product pitch (what we tried before) turns
  // this into an over-constrained compound filter that matches almost no
  // one, since Entity Search has no separate match_conditions array the way
  // the old FindAll runs did — it's a single freeform objective.
  const geography = campaign.geography.trim();
  const includeGeography =
    geography && !/^(global|worldwide|anywhere|no preference)$/i.test(geography);
  return [campaign.audience.trim(), includeGeography ? `in ${geography}` : null]
    .filter(Boolean)
    .join(", ");
}

async function requireCampaign(actor: ApiActor, campaignId: string) {
  const database = getDatabase();
  const [campaign] = await database
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
  return campaign;
}

/** Fast synchronous people discovery via Parallel Entity Search (~1-3s). */
export async function discoverCandidates(actor: ApiActor, campaign: Campaign) {
  const database = getDatabase();
  const matchLimit = Math.min(
    MAX_DISCOVERY,
    Math.max(25, campaign.leadCount * DISCOVERY_MULTIPLIER),
  );

  await recordCampaignProgress(database, {
    organizationId: actor.organizationId,
    campaignId: campaign.id,
    stage: "researching",
    message: `Searching the public web for people matching your audience (up to ${matchLimit} candidates)…`,
  });

  const result = await entitySearch({
    entityType: "people",
    objective: discoveryObjective(campaign),
    matchLimit,
  });

  const now = new Date();
  const rows = result.entities
    .filter((entity) => entity.name?.trim())
    .map((entity) => ({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      campaignId: campaign.id,
      name: entity.name.trim().slice(0, 300),
      url: entity.url?.trim().slice(0, 2_000) || null,
      description: entity.description?.trim().slice(0, 2_000) || null,
      status: "discovered" as const,
      createdAt: now,
      updatedAt: now,
    }));

  if (rows.length) {
    await database.insert(campaignCandidates).values(rows);
  }

  await recordCampaignProgress(database, {
    organizationId: actor.organizationId,
    campaignId: campaign.id,
    stage: "researching",
    message: rows.length
      ? `Found ${rows.length} potential ${rows.length === 1 ? "person" : "people"}. Choose who to verify.`
      : "No matching people were found. Adjust the audience or geography and retry discovery.",
  });

  return { discovered: rows.length };
}

export async function listCandidates(actor: ApiActor, campaignId: string) {
  await requireCampaign(actor, campaignId);
  const database = getDatabase();
  const rows = await database
    .select()
    .from(campaignCandidates)
    .where(
      and(
        eq(campaignCandidates.organizationId, actor.organizationId),
        eq(campaignCandidates.campaignId, campaignId),
      ),
    )
    .orderBy(campaignCandidates.createdAt);
  return rows.map(mapCandidate);
}

/** Create a Parallel Task Group enriching the selected candidates. */
export async function startEnrichment(
  actor: ApiActor,
  campaignId: string,
  candidateIds: string[],
) {
  if (!["admin", "reviewer", "member"].includes(actor.organizationRole)) {
    throw new AuthRequestError(
      "You do not have permission to start lead verification.",
      403,
    );
  }
  const campaign = await requireCampaign(actor, campaignId);
  if (!["researching", "enriching"].includes(campaign.status)) {
    throw new AuthRequestError(
      "Lead verification is only available while a campaign is in research.",
      409,
    );
  }

  const database = getDatabase();
  const uniqueIds = [...new Set(candidateIds)];
  if (!uniqueIds.length) {
    throw new AuthRequestError("Select at least one person to verify.", 400);
  }

  const [existingGroup] = await database
    .select()
    .from(enrichmentGroups)
    .where(eq(enrichmentGroups.campaignId, campaignId))
    .limit(1);
  if (existingGroup?.active) {
    throw new AuthRequestError("Lead verification is already running.", 409);
  }

  const selected = await database
    .select()
    .from(campaignCandidates)
    .where(
      and(
        eq(campaignCandidates.organizationId, actor.organizationId),
        eq(campaignCandidates.campaignId, campaignId),
        inArray(campaignCandidates.id, uniqueIds),
        eq(campaignCandidates.status, "discovered"),
      ),
    );
  if (selected.length !== uniqueIds.length) {
    throw new AuthRequestError(
      "One or more selected people were not found or were already processed.",
      400,
    );
  }

  const group = await createEnrichmentGroup(
    selected.map((candidate) => ({
      fullName: candidate.name,
      context: [candidate.description, candidate.url]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 1_000),
    })),
  );

  const now = new Date();
  await database.transaction(async (transaction) => {
    for (const [index, candidate] of selected.entries()) {
      await transaction
        .update(campaignCandidates)
        .set({
          status: "enriching",
          parallelRunId: group.runIds[index],
          updatedAt: now,
        })
        .where(eq(campaignCandidates.id, candidate.id));
    }
    await transaction
      .insert(enrichmentGroups)
      .values({
        campaignId,
        organizationId: actor.organizationId,
        taskgroupId: group.taskgroupId,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: enrichmentGroups.campaignId,
        set: {
          taskgroupId: group.taskgroupId,
          active: true,
          lastPolledAt: null,
          updatedAt: now,
        },
      });
    await transaction
      .update(campaigns)
      .set({ status: "enriching", updatedAt: now })
      .where(eq(campaigns.id, campaignId));
  });

  await recordCampaignProgress(database, {
    organizationId: actor.organizationId,
    campaignId,
    stage: "enriching",
    message: `Verifying contact details for ${selected.length} selected ${selected.length === 1 ? "person" : "people"} — emails, phone numbers and LinkedIn profiles…`,
  });

  return { enriching: selected.length, taskgroupId: group.taskgroupId };
}

function extractOutput(content: EnrichmentOutput | string | undefined): EnrichmentOutput {
  if (!content) return {};
  if (typeof content === "string") {
    try {
      return JSON.parse(content) as EnrichmentOutput;
    } catch {
      return {};
    }
  }
  return content;
}

function cleanField(value: string | null | undefined, max = 500) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Throttled polling refresh, driven by the workspace page polling loop.
 * Probes a bounded number of in-flight enrichment runs per call, persists
 * completed results, and reports whether the whole batch has finished.
 */
export async function refreshEnrichment(actor: ApiActor, campaignId: string) {
  const database = getDatabase();
  const [group] = await database
    .select()
    .from(enrichmentGroups)
    .where(
      and(
        eq(enrichmentGroups.campaignId, campaignId),
        eq(enrichmentGroups.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!group || !group.active) {
    return { active: false as const, justCompleted: false };
  }

  const now = new Date();
  // Throttle: claim the poll slot atomically so parallel tabs don't stack
  // Parallel API calls.
  const [claimed] = await database
    .update(enrichmentGroups)
    .set({ lastPolledAt: now, updatedAt: now })
    .where(
      and(
        eq(enrichmentGroups.campaignId, campaignId),
        or(
          sql`${enrichmentGroups.lastPolledAt} is null`,
          lt(enrichmentGroups.lastPolledAt, new Date(now.getTime() - REFRESH_THROTTLE_MS)),
        ),
      ),
    )
    .returning({ campaignId: enrichmentGroups.campaignId });
  if (!claimed) return { active: true as const, justCompleted: false };

  const pending = await database
    .select()
    .from(campaignCandidates)
    .where(
      and(
        eq(campaignCandidates.campaignId, campaignId),
        eq(campaignCandidates.status, "enriching"),
      ),
    )
    .limit(RUN_PROBES_PER_REFRESH);

  let newlyVerified = 0;
  let newlyFailed = 0;

  for (const candidate of pending) {
    if (!candidate.parallelRunId) continue;
    try {
      const status = await getEnrichmentRunStatus(candidate.parallelRunId);
      if (["queued", "running", "processing"].includes(status.status)) continue;

      if (status.status === "completed") {
        const result = await getEnrichmentRunResult(candidate.parallelRunId);
        const output = extractOutput(result.output?.content);
        const email = cleanField(output.email, 320);
        const linkedinUrl = cleanField(output.linkedin_url, 2_000);
        const phone = cleanField(output.contact_number, 50);
        const xHandle = cleanField(output.x_handle, 100);
        const verified = Boolean(email && linkedinUrl);
        await database
          .update(campaignCandidates)
          .set({
            status: verified ? "verified" : "failed",
            email,
            phone,
            linkedinUrl,
            xHandle,
            companyName: cleanField(output.company, 300),
            jobTitle: cleanField(output.job_title, 300),
            errorMessage: verified
              ? null
              : "No publicly verifiable email and LinkedIn profile were found.",
            updatedAt: new Date(),
          })
          .where(eq(campaignCandidates.id, candidate.id));
        if (verified) newlyVerified += 1;
        else newlyFailed += 1;
      } else {
        await database
          .update(campaignCandidates)
          .set({
            status: "failed",
            errorMessage: `Verification did not complete (${status.status}).`,
            updatedAt: new Date(),
          })
          .where(eq(campaignCandidates.id, candidate.id));
        newlyFailed += 1;
      }
    } catch {
      // Leave the candidate enriching; the next refresh retries it.
    }
  }

  const [counts] = await database
    .select({
      enriching: sql<number>`count(*) filter (where ${campaignCandidates.status} = 'enriching')::int`,
      verified: sql<number>`count(*) filter (where ${campaignCandidates.status} = 'verified')::int`,
      failed: sql<number>`count(*) filter (where ${campaignCandidates.status} = 'failed')::int`,
    })
    .from(campaignCandidates)
    .where(eq(campaignCandidates.campaignId, campaignId));

  if ((newlyVerified > 0 || newlyFailed > 0) && (counts?.enriching ?? 0) > 0) {
    await recordCampaignProgress(database, {
      organizationId: actor.organizationId,
      campaignId,
      stage: "enriching",
      message: `Contact verification in progress: ${counts?.verified ?? 0} verified, ${counts?.enriching ?? 0} still checking…`,
    });
  }

  let justCompleted = false;
  if ((counts?.enriching ?? 0) === 0) {
    // Double-check with Parallel that the group agrees before finalizing.
    try {
      const groupStatus = await getEnrichmentGroupStatus(group.taskgroupId);
      if (groupStatus.status.is_active) {
        return { active: true as const, justCompleted: false };
      }
    } catch {
      // If the status check fails, still finalize from our own counts.
    }
    await database
      .update(enrichmentGroups)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(enrichmentGroups.campaignId, campaignId));
    justCompleted = true;
    await recordCampaignProgress(database, {
      organizationId: actor.organizationId,
      campaignId,
      stage: "enriching",
      message: `Contact verification finished: ${counts?.verified ?? 0} verified ${counts?.verified === 1 ? "lead" : "leads"}${(counts?.failed ?? 0) > 0 ? ` (${counts?.failed} could not be verified)` : ""}. Preparing personalized outreach drafts…`,
    });
  }

  return { active: !justCompleted as boolean, justCompleted };
}

export async function listVerifiedCandidates(organizationId: string, campaignId: string) {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(campaignCandidates)
    .where(
      and(
        eq(campaignCandidates.organizationId, organizationId),
        eq(campaignCandidates.campaignId, campaignId),
        eq(campaignCandidates.status, "verified"),
      ),
    )
    .orderBy(campaignCandidates.createdAt);
  return rows.map(mapCandidate);
}

/** Rebuilds the approved-leads list from persisted `leads` rows — used to
 * retry a failed/stalled Eve session without re-approving candidates. */
export async function getApprovedLeadsForCampaign(
  organizationId: string,
  campaignId: string,
): Promise<ApprovedLead[]> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, organizationId),
        eq(leads.campaignId, campaignId),
        eq(leads.sourceProvider, "parallel"),
      ),
    );
  return rows
    .filter((row) => row.email && row.linkedinUrl)
    .map((row) => ({
      leadId: row.id,
      personName: row.personName,
      jobTitle: row.jobTitle,
      companyName: row.companyName,
      companyDomain: row.companyDomain,
      email: row.email!,
      emailVerified: true,
      phone: row.phone,
      phoneVerified: row.phoneVerified,
      linkedinUrl: row.linkedinUrl!,
    }));
}

export type ApprovedLead = {
  leadId: string;
  personName: string;
  jobTitle: string;
  companyName: string;
  companyDomain: string | null;
  email: string;
  emailVerified: true;
  phone: string | null;
  phoneVerified: boolean;
  linkedinUrl: string;
};

function domainFromUrl(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return null;
  }
}

/**
 * Converts user-approved, Parallel-verified candidates into real `leads`
 * rows, then starts the Eve session for ICP synthesis, personalization
 * research, and sequence generation over exactly this approved list.
 */
export async function approveCandidates(
  actor: ApiActor,
  campaignId: string,
  candidateIds: string[],
  start: (campaign: Campaign, approvedLeads: ApprovedLead[]) => Promise<unknown>,
) {
  if (!["admin", "reviewer", "member"].includes(actor.organizationRole)) {
    throw new AuthRequestError(
      "You do not have permission to approve leads for this campaign.",
      403,
    );
  }
  const campaign = await getDomainCampaign(campaignId, actor);
  if (!campaign) throw new AuthRequestError("Campaign was not found.", 400);
  if (!["researching", "enriching"].includes(campaign.status)) {
    throw new AuthRequestError(
      "Leads can only be approved while a campaign is in research.",
      409,
    );
  }

  const database = getDatabase();
  const uniqueIds = [...new Set(candidateIds)];
  if (!uniqueIds.length) {
    throw new AuthRequestError("Select at least one verified person to approve.", 400);
  }

  const selected = await database
    .select()
    .from(campaignCandidates)
    .where(
      and(
        eq(campaignCandidates.organizationId, actor.organizationId),
        eq(campaignCandidates.campaignId, campaignId),
        inArray(campaignCandidates.id, uniqueIds),
        eq(campaignCandidates.status, "verified"),
      ),
    );
  if (selected.length !== uniqueIds.length) {
    throw new AuthRequestError(
      "One or more selected people were not found or are not yet verified.",
      400,
    );
  }

  const now = new Date();
  const approvedLeads: ApprovedLead[] = [];

  await database.transaction(async (transaction) => {
    for (const candidate of selected) {
      // Every "verified" candidate already has email + linkedinUrl (the
      // enforced minimum in refreshEnrichment), so these are safe.
      const leadId = crypto.randomUUID();
      await transaction.insert(leads).values({
        id: leadId,
        organizationId: actor.organizationId,
        campaignId,
        sourceProvider: "parallel",
        sourceLeadId: candidate.id,
        companyName: candidate.companyName ?? candidate.name,
        companyDomain: domainFromUrl(candidate.url),
        jobTitle: candidate.jobTitle ?? "Unknown",
        personName: candidate.name,
        email: candidate.email!,
        emailVerified: true,
        phone: candidate.phone,
        phoneVerified: Boolean(candidate.phone),
        linkedinUrl: candidate.linkedinUrl,
        confidence: DEFAULT_LEAD_CONFIDENCE,
        status: "approved",
        doNotContact: false,
        buyingSignals: [],
        createdAt: now,
        updatedAt: now,
      });
      await transaction
        .update(campaignCandidates)
        .set({ status: "approved", updatedAt: now })
        .where(eq(campaignCandidates.id, candidate.id));

      approvedLeads.push({
        leadId,
        personName: candidate.name,
        jobTitle: candidate.jobTitle ?? "Unknown",
        companyName: candidate.companyName ?? candidate.name,
        companyDomain: domainFromUrl(candidate.url),
        email: candidate.email!,
        emailVerified: true,
        phone: candidate.phone,
        phoneVerified: Boolean(candidate.phone),
        linkedinUrl: candidate.linkedinUrl!,
      });
    }

    await transaction
      .update(campaigns)
      .set({ status: "enriching", updatedAt: now })
      .where(eq(campaigns.id, campaignId));
  });

  await recordCampaignProgress(database, {
    organizationId: actor.organizationId,
    campaignId,
    stage: "enriching",
    message: `${approvedLeads.length} ${approvedLeads.length === 1 ? "lead" : "leads"} approved. Preparing personalized outreach…`,
  });

  try {
    await start(campaign, approvedLeads);
  } catch {
    // startCampaignExecution already persists a "failed" execution status
    // and a progress event on failure — leads remain approved either way,
    // and the workspace UI's "Retry research" action can restart the run.
  }

  return { approved: approvedLeads.length };
}
