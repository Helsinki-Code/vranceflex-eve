import { z } from "zod";

export const campaignExecutionStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;

export const campaignExecutionStatusSchema = z.enum(campaignExecutionStatuses);
export type CampaignExecutionStatus = z.infer<typeof campaignExecutionStatusSchema>;

export const outreachChannels = ["email", "sms"] as const;
export const outreachChannelSchema = z.enum(outreachChannels);

export const outreachSequenceStatuses = [
  "draft",
  "awaiting_approval",
  "approved",
  "scheduled",
  "active",
  "paused",
  "completed",
  "stopped",
] as const;

export const outreachMessageStatuses = [
  "draft",
  "approved",
  "scheduled",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "replied",
  "failed",
  "cancelled",
] as const;

export const deliveryJobStatuses = [
  "queued",
  "processing",
  "retry",
  "completed",
  "failed",
  "cancelled",
] as const;

export const deliveryJobStatusSchema = z.enum(deliveryJobStatuses);

export const replyIntents = [
  "HOT",
  "WARM",
  "NEUTRAL",
  "OBJECTION",
  "NOT_FIT",
  "OUT_OF_OFFICE",
  "UNSUBSCRIBE",
] as const;

export const replyStatuses = [
  "unclassified",
  "classified",
  "reviewed",
  "archived",
] as const;

export type ReplyIntent = (typeof replyIntents)[number];
export type ReplyStatus = (typeof replyStatuses)[number];

const evidenceSchema = z.object({
  kind: z.enum(["company", "person", "contact", "intent"]),
  provider: z.string().trim().min(1).max(80),
  sourceUrl: z.string().url(),
  sourceTitle: z.string().trim().min(1).max(300),
  excerpt: z.string().trim().min(1).max(2_000),
  confidence: z.number().int().min(0).max(100),
  observedAt: z.string().datetime(),
});

const icpArtifactSchema = z.object({
  name: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(20).max(4_000),
  confidence: z.number().int().min(0).max(100),
  companyProfile: z.object({
    industries: z.array(z.string().trim().min(1)).min(1),
    employeeRange: z.string().trim().min(1),
    revenueRange: z.string().trim().min(1),
    maturity: z.string().trim().min(1),
    geographies: z.array(z.string().trim().min(1)).min(1),
  }),
  buyerRoles: z.array(
    z.object({
      title: z.string().trim().min(1),
      priority: z.enum(["primary", "secondary", "influencer"]),
      motivation: z.string().trim().min(1),
    }),
  ).min(1),
  painPoints: z.array(z.string().trim().min(1)).min(1),
  buyingSignals: z.array(z.string().trim().min(1)),
  exclusions: z.array(z.string().trim().min(1)),
  evidence: z.array(evidenceSchema),
});

const leadArtifactSchema = z.object({
  sourceLeadId: z.string().trim().min(1).max(300),
  icpName: z.string().trim().min(1).max(160).nullable(),
  companyName: z.string().trim().min(1).max(200),
  companyDomain: z.string().trim().max(253).nullable(),
  companySize: z.string().trim().max(120).nullable(),
  industry: z.string().trim().max(160).nullable(),
  geography: z.string().trim().max(160).nullable(),
  personName: z.string().trim().min(1).max(160),
  jobTitle: z.string().trim().min(1).max(200),
  email: z.string().email().nullable(),
  emailVerified: z.boolean(),
  phone: z.string().trim().min(5).max(40).nullable(),
  phoneVerified: z.boolean(),
  linkedinUrl: z.string().url().nullable(),
  confidence: z.number().int().min(0).max(100),
  status: z.enum(["new", "qualified", "needs_review", "approved", "suppressed"]),
  doNotContact: z.boolean(),
  buyingSignals: z.array(z.string().trim().min(1)),
  evidence: z.array(evidenceSchema),
});

const sequenceStepArtifactSchema = z.object({
  step: z.number().int().positive(),
  dayOffset: z.number().int().nonnegative(),
  subject: z.string().trim().max(200).nullable(),
  subjectVariant: z.string().trim().max(200).nullable(),
  content: z.string().trim().min(1).max(20_000),
});

const sequenceArtifactSchema = z.object({
  leadSourceId: z.string().trim().min(1).max(300),
  channel: outreachChannelSchema,
  name: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  steps: z.array(sequenceStepArtifactSchema).min(1).max(20),
});

export const campaignArtifactsSchema = z.object({
  campaignId: z.string().uuid(),
  summary: z.string().trim().min(20).max(8_000),
  icps: z.array(icpArtifactSchema).min(1).max(20),
  leads: z.array(leadArtifactSchema).min(1).max(500),
  sequences: z.array(sequenceArtifactSchema).min(1).max(1_000),
});

export type CampaignArtifacts = z.infer<typeof campaignArtifactsSchema>;

export const campaignExecutionSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  organizationId: z.string(),
  status: campaignExecutionStatusSchema,
  stage: z.string(),
  attempt: z.number().int().positive(),
  eveSessionId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CampaignExecution = z.infer<typeof campaignExecutionSchema>;

export const outreachMessageUpdateSchema = z.object({
  subject: z.string().trim().max(200).nullable(),
  subjectVariant: z.string().trim().max(200).nullable(),
  content: z.string().trim().min(1).max(20_000),
});

export const approveSequencesSchema = z.object({
  sequenceIds: z.array(z.string().uuid()).min(1).max(500),
  scope: z.enum(["first_launch", "batch"]).default("first_launch"),
});

export const scheduleSequencesSchema = z.object({
  sequenceIds: z.array(z.string().uuid()).min(1).max(500),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(80),
});

export const replyReviewSchema = z.object({
  status: z.enum(["reviewed", "archived"]),
});

export type OutreachWorkspaceMessage = {
  id: string;
  stepNumber: number;
  dayOffset: number;
  subject: string | null;
  subjectVariant: string | null;
  content: string;
  status: (typeof outreachMessageStatuses)[number];
  scheduledFor: string | null;
  providerMessageId: string | null;
  attemptCount: number;
  lastError: string | null;
};

export type OutreachWorkspaceSequence = {
  id: string;
  leadId: string;
  leadName: string;
  companyName: string;
  channel: (typeof outreachChannels)[number];
  name: string;
  timezone: string;
  status: (typeof outreachSequenceStatuses)[number];
  messages: OutreachWorkspaceMessage[];
};
