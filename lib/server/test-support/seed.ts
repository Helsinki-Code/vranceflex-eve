import { getDatabase } from "../database";
import {
  campaigns,
  deliveryJobs,
  leads,
  organizations,
  outreachMessages,
  outreachSequences,
  users,
} from "../database/schema";

export async function seedOrganization(name = "Test Org") {
  const database = getDatabase();
  const organizationId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await database.insert(organizations).values({ id: organizationId, name });
  await database.insert(users).values({
    id: userId,
    email: `owner-${userId}@example.com`,
    normalizedEmail: `owner-${userId}@example.com`,
    name: "Owner",
    emailVerifiedAt: new Date(),
  });
  return { organizationId, userId };
}

export async function seedCampaign(organizationId: string, createdBy: string) {
  const database = getDatabase();
  const campaignId = crypto.randomUUID();
  await database.insert(campaigns).values({
    id: campaignId,
    organizationId,
    createdBy,
    idempotencyKey: `campaign/${campaignId}`,
    businessName: "Acme Inc",
    productName: "Acme Widget",
    productSummary: "A widget that solves a real problem for real customers.",
    sourceKind: "website",
    source: { kind: "website", url: "https://example.com" },
    audience: "B2B operations teams at mid-market companies",
    geography: "United States",
    goal: "book_meetings",
    leadCount: 10,
    monthlyBudgetUsd: 500,
    channels: ["email", "sms"],
    status: "scheduled",
  });
  return campaignId;
}

export async function seedLead(
  organizationId: string,
  campaignId: string,
  overrides: Partial<{
    email: string;
    emailVerified: boolean;
    phone: string;
    phoneVerified: boolean;
    doNotContact: boolean;
    status: "new" | "suppressed";
    personName: string;
    companyDomain: string | null;
    timezone: string | null;
    country: string | null;
  }> = {},
) {
  const database = getDatabase();
  const leadId = crypto.randomUUID();
  await database.insert(leads).values({
    id: leadId,
    organizationId,
    campaignId,
    sourceProvider: "test",
    sourceLeadId: leadId,
    companyName: "Prospect Co",
    companyDomain: overrides.companyDomain ?? null,
    timezone: overrides.timezone ?? null,
    country: overrides.country ?? null,
    personName: overrides.personName ?? "Jamie Prospect",
    jobTitle: "Head of Operations",
    email: overrides.email ?? `lead-${leadId}@example.com`,
    emailVerified: overrides.emailVerified ?? true,
    phone: overrides.phone ?? "+15555550100",
    phoneVerified: overrides.phoneVerified ?? true,
    doNotContact: overrides.doNotContact ?? false,
    status: overrides.status ?? "new",
    confidence: 80,
  });
  return leadId;
}

export async function seedDeliveryJob(input: {
  organizationId: string;
  campaignId: string;
  leadId: string;
  channel: "email" | "sms";
  scheduledFor?: Date;
  availableAt?: Date;
  maxAttempts?: number;
  /** Defaults to a short, harmless test message. */
  content?: string;
  subject?: string;
  stepNumber?: number;
  sequenceStatus?: "active" | "scheduled" | "approved" | "paused" | "awaiting_approval";
  messageStatus?: "scheduled" | "approved" | "draft";
  /** Skips creating the delivery job, for tests that only need drafted copy. */
  skipJob?: boolean;
  /** Adds another step to an existing sequence instead of creating a new one. */
  sequenceId?: string;
}) {
  const database = getDatabase();
  const sequenceId = input.sequenceId ?? crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const now = input.scheduledFor ?? new Date(Date.now() - 60_000);

  if (!input.sequenceId) await database.insert(outreachSequences).values({
    id: sequenceId,
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    leadId: input.leadId,
    channel: input.channel,
    name: "Sequence",
    status: input.sequenceStatus ?? "active",
  });
  await database.insert(outreachMessages).values({
    id: messageId,
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sequenceId,
    leadId: input.leadId,
    channel: input.channel,
    stepNumber: input.stepNumber ?? 1,
    dayOffset: 0,
    subject: input.channel === "email" ? (input.subject ?? "Quick question") : null,
    content: input.content ?? "Hello, this is a test outreach message.",
    status: input.messageStatus ?? "scheduled",
    idempotencyKey: `message/${messageId}`,
    scheduledFor: now,
  });
  if (!input.skipJob) await database.insert(deliveryJobs).values({
    id: jobId,
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sequenceId,
    messageId,
    leadId: input.leadId,
    channel: input.channel,
    status: "queued",
    scheduledFor: now,
    availableAt: input.availableAt ?? now,
    idempotencyKey: `outreach/${messageId}`,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  });

  return { sequenceId, messageId, jobId };
}
