import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  planCatalog,
  planEntitlements,
  topUpCatalog,
  type PaidPlanKey,
  type TopUpPackageKey,
} from "../domain/billing";
import { AuthRequestError } from "./auth-errors";
import { subscriptionPriceDetails } from "./billing-prices";
import { getDatabase } from "./database";
import {
  campaigns,
  organizationBilling,
  organizationInvites,
  organizationMemberships,
  prospectCreditGrants,
  prospectCreditReservations,
  usageLedger,
} from "./database/schema";

const ACTIVE_CAMPAIGN_STATUSES = [
  "draft",
  "researching",
  "enriching",
  "copy_generated",
  "awaiting_approval",
  "scheduled",
  "sent",
] as const;

export type CreditWindow = { start: Date; end: Date };

function addMonthsClamped(anchor: Date, months: number) {
  const targetMonth = anchor.getUTCMonth() + months;
  const first = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      targetMonth,
      1,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return first;
}

export function monthlyCreditWindow(anchor: Date, now: Date, subscriptionEnd: Date) {
  const roughMonths =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    anchor.getUTCMonth();
  let offset = Math.max(0, roughMonths);
  let start = addMonthsClamped(anchor, offset);
  if (start > now && offset > 0) {
    offset -= 1;
    start = addMonthsClamped(anchor, offset);
  }
  const naturalEnd = addMonthsClamped(anchor, offset + 1);
  return {
    start,
    end: naturalEnd < subscriptionEnd ? naturalEnd : subscriptionEnd,
  };
}

async function activeBilling(organizationId: string) {
  const database = getDatabase();
  const [billing] = await database
    .select()
    .from(organizationBilling)
    .where(eq(organizationBilling.organizationId, organizationId))
    .limit(1);
  const legacyPrice = billing?.planId
    ? subscriptionPriceDetails(billing.planId)
    : null;
  const resolvedPlanKey = billing?.planKey ?? legacyPrice?.plan ?? null;
  const entitlements = planEntitlements(resolvedPlanKey);
  const subscriptionStartedAt =
    billing?.subscriptionStartedAt ?? billing?.createdAt ?? null;
  if (
    !billing ||
    billing.status !== "active" ||
    !entitlements ||
    !billing.stripeSubscriptionId ||
    !subscriptionStartedAt ||
    !billing.currentPeriodEnd ||
    billing.currentPeriodEnd <= new Date()
  ) {
    return null;
  }
  if (!billing.planKey && legacyPrice) {
    await database
      .update(organizationBilling)
      .set({
        planKey: legacyPrice.plan,
        billingInterval: legacyPrice.interval,
        subscriptionStartedAt,
        updatedAt: new Date(),
      })
      .where(eq(organizationBilling.organizationId, organizationId));
  }
  return {
    billing: {
      ...billing,
      planKey: resolvedPlanKey,
      billingInterval: billing.billingInterval ?? legacyPrice?.interval ?? null,
      subscriptionStartedAt,
    },
    entitlements,
  };
}

export async function requireActivePlan(organizationId: string) {
  const active = await activeBilling(organizationId);
  if (!active) {
    throw new AuthRequestError(
      "An active VranceFlex plan is required before live research or AI generation can start.",
      402,
    );
  }
  await ensureCurrentSubscriptionGrant(organizationId, active);
  return active;
}

async function ensureCurrentSubscriptionGrant(
  organizationId: string,
  active?: NonNullable<Awaited<ReturnType<typeof activeBilling>>>,
) {
  const resolved = active ?? (await activeBilling(organizationId));
  if (!resolved) return null;
  const { billing, entitlements } = resolved;
  const now = new Date();
  const window = monthlyCreditWindow(
    billing.subscriptionStartedAt!,
    now,
    billing.currentPeriodEnd!,
  );
  if (window.end <= now) return null;
  const sourceKey = `subscription:${billing.stripeSubscriptionId}:${window.start.toISOString()}`;
  const database = getDatabase();
  const quantity = entitlements.verifiedProspects;
  await database
    .insert(prospectCreditGrants)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      source: "subscription",
      sourceKey,
      quantity,
      remaining: quantity,
      validFrom: window.start,
      expiresAt: window.end,
    })
    .onConflictDoUpdate({
      target: [prospectCreditGrants.organizationId, prospectCreditGrants.sourceKey],
      set: {
        quantity,
        remaining: sql`greatest(0, ${quantity} - (${prospectCreditGrants.quantity} - ${prospectCreditGrants.remaining}))`,
        expiresAt: window.end,
        updatedAt: now,
      },
    });
  return window;
}

export async function grantTopUpCredits(input: {
  organizationId: string;
  packageKey: TopUpPackageKey;
  checkoutSessionId: string;
  purchasedAt?: Date;
}) {
  const item = topUpCatalog[input.packageKey];
  const purchasedAt = input.purchasedAt ?? new Date();
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    const [grant] = await transaction
      .insert(prospectCreditGrants)
      .values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        source: "topup",
        sourceKey: `topup:${input.checkoutSessionId}`,
        quantity: item.credits,
        remaining: item.credits,
        validFrom: purchasedAt,
        expiresAt: addMonthsClamped(purchasedAt, 12),
      })
      .onConflictDoNothing({
        target: [prospectCreditGrants.organizationId, prospectCreditGrants.sourceKey],
      })
      .returning({ id: prospectCreditGrants.id });
    if (grant) {
      await transaction
        .insert(usageLedger)
        .values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          campaignId: null,
          kind: "topup_credits",
          quantity: item.credits,
          idempotencyKey: `topup/${input.checkoutSessionId}`,
          metadata: {
            packageKey: input.packageKey,
            grantId: grant.id,
            revenueUsd: item.priceUsd,
          },
          occurredAt: purchasedAt,
        })
        .onConflictDoNothing();
    }
    return { granted: Boolean(grant), credits: item.credits };
  });
}

export async function getBillingOverview(organizationId: string) {
  const database = getDatabase();
  const [billing] = await database
    .select()
    .from(organizationBilling)
    .where(eq(organizationBilling.organizationId, organizationId))
    .limit(1);
  const active = await activeBilling(organizationId);
  const window = active
    ? await ensureCurrentSubscriptionGrant(organizationId, active)
    : null;
  const now = new Date();
  const [creditTotals] = await database
    .select({
      included: sql<number>`coalesce(sum(${prospectCreditGrants.remaining}) filter (where ${prospectCreditGrants.source} = 'subscription'), 0)::int`,
      topUp: sql<number>`coalesce(sum(${prospectCreditGrants.remaining}) filter (where ${prospectCreditGrants.source} = 'topup'), 0)::int`,
    })
    .from(prospectCreditGrants)
    .where(
      and(
        eq(prospectCreditGrants.organizationId, organizationId),
        lteNow(prospectCreditGrants.validFrom, now),
        gt(prospectCreditGrants.expiresAt, now),
        gt(prospectCreditGrants.remaining, 0),
      ),
    );
  const [campaignTotals, memberTotals] = await Promise.all([
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.organizationId, organizationId),
          or(
            inArray(campaigns.status, [...ACTIVE_CAMPAIGN_STATUSES]),
            and(
              eq(campaigns.status, "delivered"),
              isNotNull(campaigns.recurrence),
            ),
          ),
        ),
      ),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, organizationId)),
  ]);
  const [discoveryTotals] = window
    ? await database
        .select({ total: sql<number>`coalesce(sum(${usageLedger.quantity}), 0)::int` })
        .from(usageLedger)
        .where(
          and(
            eq(usageLedger.organizationId, organizationId),
            inArray(usageLedger.kind, ["discovery_reserved", "discovery_run"]),
            gte(usageLedger.occurredAt, window.start),
            lt(usageLedger.occurredAt, window.end),
          ),
        )
    : [{ total: 0 }];
  const entitlements = active?.entitlements ?? null;
  const included = creditTotals?.included ?? 0;
  const topUp = creditTotals?.topUp ?? 0;
  return {
    active: Boolean(active),
    status: billing?.status ?? ("none" as const),
    planKey: (active?.billing.planKey as PaidPlanKey | null) ?? null,
    plan: entitlements,
    billingInterval: active?.billing.billingInterval ?? null,
    currentPeriodEnd: active?.billing.currentPeriodEnd?.toISOString() ?? null,
    creditWindowStart: window?.start.toISOString() ?? null,
    creditWindowEnd: window?.end.toISOString() ?? null,
    credits: { included, topUp, available: included + topUp },
    usage: {
      activeCampaigns: campaignTotals[0]?.total ?? 0,
      seats: memberTotals[0]?.total ?? 0,
      discoveryRuns: discoveryTotals?.total ?? 0,
      discoveryRunLimit: entitlements?.discoveryRuns ?? 0,
    },
  };
}

function lteNow(column: typeof prospectCreditGrants.validFrom, now: Date) {
  return or(lt(column, now), eq(column, now))!;
}

export async function reserveProspectCredits(input: {
  organizationId: string;
  campaignId: string;
  candidateIds: string[];
}) {
  await requireActivePlan(input.organizationId);
  const candidateIds = [...new Set(input.candidateIds)];
  if (!candidateIds.length) {
    throw new AuthRequestError("Select at least one prospect to verify.", 400);
  }
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`prospect-credits/${input.organizationId}`}))`,
    );
    const existing = await transaction
      .select({ candidateId: prospectCreditReservations.candidateId })
      .from(prospectCreditReservations)
      .where(inArray(prospectCreditReservations.candidateId, candidateIds));
    if (existing.length) {
      throw new AuthRequestError("One or more selected prospects already has a credit reservation.", 409);
    }
    const now = new Date();
    const grants = await transaction
      .select()
      .from(prospectCreditGrants)
      .where(
        and(
          eq(prospectCreditGrants.organizationId, input.organizationId),
          lteNow(prospectCreditGrants.validFrom, now),
          gt(prospectCreditGrants.expiresAt, now),
          gt(prospectCreditGrants.remaining, 0),
        ),
      )
      .orderBy(
        sql`case when ${prospectCreditGrants.source} = 'subscription' then 0 else 1 end`,
        asc(prospectCreditGrants.expiresAt),
      );
    const available = grants.reduce((total, grant) => total + grant.remaining, 0);
    if (available < candidateIds.length) {
      throw new AuthRequestError(
        `This verification needs ${candidateIds.length} prospect credits, but only ${available} remain. Reduce the selection, purchase a top-up, or upgrade the plan.`,
        402,
      );
    }
    const allocations = new Map<string, number>();
    const reservationRows: Array<typeof prospectCreditReservations.$inferInsert> = [];
    let grantIndex = 0;
    let grantRemaining = grants[0]?.remaining ?? 0;
    for (const candidateId of candidateIds) {
      while (grantRemaining === 0) {
        grantIndex += 1;
        grantRemaining = grants[grantIndex]?.remaining ?? 0;
      }
      const grant = grants[grantIndex]!;
      allocations.set(grant.id, (allocations.get(grant.id) ?? 0) + 1);
      reservationRows.push({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        candidateId,
        grantId: grant.id,
        status: "reserved",
      });
      grantRemaining -= 1;
    }
    for (const [grantId, quantity] of allocations) {
      const [updated] = await transaction
        .update(prospectCreditGrants)
        .set({
          remaining: sql`${prospectCreditGrants.remaining} - ${quantity}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(prospectCreditGrants.id, grantId),
            gte(prospectCreditGrants.remaining, quantity),
          ),
        )
        .returning({ id: prospectCreditGrants.id });
      if (!updated) throw new AuthRequestError("Prospect credits changed. Try again.", 409);
    }
    await transaction.insert(prospectCreditReservations).values(reservationRows);
    return { reserved: reservationRows.length };
  });
}

export async function consumeProspectCredit(input: {
  organizationId: string;
  campaignId: string;
  candidateId: string;
}) {
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`prospect-credits/${input.organizationId}`}))`,
    );
    const [reservation] = await transaction
      .select({
        id: prospectCreditReservations.id,
        status: prospectCreditReservations.status,
        grantId: prospectCreditReservations.grantId,
        source: prospectCreditGrants.source,
      })
      .from(prospectCreditReservations)
      .innerJoin(
        prospectCreditGrants,
        eq(prospectCreditGrants.id, prospectCreditReservations.grantId),
      )
      .where(
        and(
          eq(prospectCreditReservations.organizationId, input.organizationId),
          eq(prospectCreditReservations.candidateId, input.candidateId),
        ),
      )
      .limit(1);
    if (!reservation) {
      // Jobs that were already in flight when credit metering was deployed are
      // allowed to finish once, but are explicitly visible in the ledger.
      await transaction
        .insert(usageLedger)
        .values({
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          kind: "verified_prospect_legacy",
          quantity: 1,
          idempotencyKey: `verified-prospect-legacy/${input.candidateId}`,
          metadata: { candidateId: input.candidateId },
        })
        .onConflictDoNothing();
      return { consumed: false, legacy: true };
    }
    if (reservation.status === "consumed") return { consumed: false, legacy: false };
    if (reservation.status !== "reserved") {
      throw new AuthRequestError("The prospect credit reservation is no longer active.", 409);
    }
    const now = new Date();
    await transaction
      .update(prospectCreditReservations)
      .set({ status: "consumed", consumedAt: now })
      .where(eq(prospectCreditReservations.id, reservation.id));
    await transaction
      .insert(usageLedger)
      .values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        kind: "verified_prospect",
        quantity: 1,
        idempotencyKey: `verified-prospect/${input.candidateId}`,
        metadata: {
          candidateId: input.candidateId,
          grantId: reservation.grantId,
          source: reservation.source,
        },
      })
      .onConflictDoNothing();
    return { consumed: true, legacy: false };
  });
}

export async function releaseProspectCredits(
  organizationId: string,
  candidateIds: string[],
) {
  const uniqueIds = [...new Set(candidateIds)];
  if (!uniqueIds.length) return { released: 0 };
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`prospect-credits/${organizationId}`}))`,
    );
    const reservations = await transaction
      .select()
      .from(prospectCreditReservations)
      .where(
        and(
          eq(prospectCreditReservations.organizationId, organizationId),
          inArray(prospectCreditReservations.candidateId, uniqueIds),
          eq(prospectCreditReservations.status, "reserved"),
        ),
      );
    if (!reservations.length) return { released: 0 };
    const now = new Date();
    const perGrant = new Map<string, number>();
    for (const reservation of reservations) {
      perGrant.set(reservation.grantId, (perGrant.get(reservation.grantId) ?? 0) + 1);
    }
    await transaction
      .update(prospectCreditReservations)
      .set({ status: "released", releasedAt: now })
      .where(inArray(prospectCreditReservations.id, reservations.map((item) => item.id)));
    for (const [grantId, quantity] of perGrant) {
      await transaction
        .update(prospectCreditGrants)
        .set({
          remaining: sql`least(${prospectCreditGrants.quantity}, ${prospectCreditGrants.remaining} + ${quantity})`,
          updatedAt: now,
        })
        .where(eq(prospectCreditGrants.id, grantId));
    }
    return { released: reservations.length };
  });
}

export async function reserveDiscoveryRun(input: {
  organizationId: string;
  campaignId: string;
  requestedProspects: number;
}) {
  const active = await requireActivePlan(input.organizationId);
  const window = monthlyCreditWindow(
    active.billing.subscriptionStartedAt!,
    new Date(),
    active.billing.currentPeriodEnd!,
  );
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`discovery-quota/${input.organizationId}`}))`,
    );
    const now = new Date();
    const [credits] = await transaction
      .select({
        available: sql<number>`coalesce(sum(${prospectCreditGrants.remaining}), 0)::int`,
      })
      .from(prospectCreditGrants)
      .where(
        and(
          eq(prospectCreditGrants.organizationId, input.organizationId),
          lteNow(prospectCreditGrants.validFrom, now),
          gt(prospectCreditGrants.expiresAt, now),
          gt(prospectCreditGrants.remaining, 0),
        ),
      );
    if ((credits?.available ?? 0) < input.requestedProspects) {
      throw new AuthRequestError(
        `This campaign targets ${input.requestedProspects} verified prospects, but only ${credits?.available ?? 0} credits remain. Reduce the target, purchase a top-up, or upgrade before running more discovery.`,
        402,
      );
    }
    const [used] = await transaction
      .select({ total: sql<number>`coalesce(sum(${usageLedger.quantity}), 0)::int` })
      .from(usageLedger)
      .where(
        and(
          eq(usageLedger.organizationId, input.organizationId),
          inArray(usageLedger.kind, ["discovery_reserved", "discovery_run"]),
          gte(usageLedger.occurredAt, window.start),
          lt(usageLedger.occurredAt, window.end),
        ),
      );
    if ((used?.total ?? 0) >= active.entitlements.discoveryRuns) {
      throw new AuthRequestError(
        `This workspace has used its ${active.entitlements.discoveryRuns} discovery runs for the current credit month.`,
        429,
      );
    }
    const id = crypto.randomUUID();
    await transaction.insert(usageLedger).values({
      id,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      kind: "discovery_reserved",
      quantity: 1,
      idempotencyKey: `discovery/${id}`,
      metadata: {},
    });
    return { id, limit: active.entitlements.discoveryRuns, used: (used?.total ?? 0) + 1 };
  });
}

export async function completeDiscoveryRun(id: string, matches: number) {
  await getDatabase()
    .update(usageLedger)
    .set({
      kind: "discovery_run",
      metadata: {
        matches,
        estimatedCostUsd: Number((0.25 + matches * 0.03).toFixed(2)),
      },
    })
    .where(and(eq(usageLedger.id, id), eq(usageLedger.kind, "discovery_reserved")));
}

export async function recordEnrichmentProviderUsage(input: {
  organizationId: string;
  campaignId: string;
  taskgroupId: string;
  runs: number;
}) {
  await getDatabase()
    .insert(usageLedger)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      kind: "parallel_enrichment_runs",
      quantity: input.runs,
      idempotencyKey: `parallel-enrichment/${input.taskgroupId}`,
      metadata: {
        processor: "core",
        estimatedCostUsd: Number((input.runs * 0.025).toFixed(4)),
      },
    })
    .onConflictDoNothing();
}

export async function releaseDiscoveryRun(id: string) {
  await getDatabase()
    .delete(usageLedger)
    .where(and(eq(usageLedger.id, id), eq(usageLedger.kind, "discovery_reserved")));
}

export async function recordAiGenerationUsage(input: {
  organizationId: string;
  campaignId: string;
  executionId: string;
  attempt: number;
  leadCount: number;
  resumed: boolean;
}) {
  await getDatabase()
    .insert(usageLedger)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      kind: "ai_generation",
      quantity: 1,
      idempotencyKey: `ai-generation/${input.executionId}/${input.attempt}`,
      metadata: {
        leadCount: input.leadCount,
        resumed: input.resumed,
        costSource: "ai_gateway_invoice",
      },
    })
    .onConflictDoNothing();
}

export async function assertSeatAvailable(organizationId: string) {
  const active = await requireActivePlan(organizationId);
  const database = getDatabase();
  const [members, invites] = await Promise.all([
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, organizationId)),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(organizationInvites)
      .where(
        and(
          eq(organizationInvites.organizationId, organizationId),
          eq(organizationInvites.status, "pending"),
          gt(organizationInvites.expiresAt, new Date()),
          isNull(organizationInvites.revokedAt),
        ),
      ),
  ]);
  const reservedSeats = (members[0]?.total ?? 0) + (invites[0]?.total ?? 0);
  if (reservedSeats >= active.entitlements.seats) {
    throw new AuthRequestError(
      `${active.entitlements.name} includes ${active.entitlements.seats} seats. Upgrade the workspace or revoke a pending invite before adding another member.`,
      402,
    );
  }
  return active.entitlements;
}

export async function assertCampaignCapacity(input: {
  organizationId: string;
  requestedProspects: number;
}) {
  const active = await requireActivePlan(input.organizationId);
  const overview = await getBillingOverview(input.organizationId);
  if (overview.usage.activeCampaigns >= active.entitlements.activeCampaigns) {
    throw new AuthRequestError(
      `${active.entitlements.name} allows ${active.entitlements.activeCampaigns} active campaigns. Stop an existing campaign or upgrade the plan.`,
      402,
    );
  }
  if (overview.credits.available < input.requestedProspects) {
    throw new AuthRequestError(
      `This campaign targets ${input.requestedProspects} verified prospects, but only ${overview.credits.available} credits remain. Choose a smaller campaign, purchase a top-up, or upgrade.`,
      402,
    );
  }
  return active.entitlements;
}

export function planForManualProvisioning(key: PaidPlanKey) {
  return planCatalog[key];
}
