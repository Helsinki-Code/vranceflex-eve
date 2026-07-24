import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Campaign } from "../../domain/campaign";
import { campaignStatuses } from "../../domain/campaign";
import type { IcpProfile, Lead } from "../../domain/lead";
import { evidenceKinds, leadStatuses } from "../../domain/lead";
import {
  campaignExecutionStatuses,
  deliveryJobStatuses,
  outreachChannels,
  outreachMessageStatuses,
  outreachSequenceStatuses,
  replyIntents,
  replyStatuses,
} from "../../domain/pipeline";

export const campaignStatusEnum = pgEnum("campaign_status", campaignStatuses);
export const campaignSourceKindEnum = pgEnum("campaign_source_kind", ["website", "product_idea"]);
export const membershipRoleEnum = pgEnum("membership_role", [
  "admin",
  "member",
  "reviewer",
  "billing",
]);
export const approvalScopeEnum = pgEnum("approval_scope", ["first_launch", "batch"]);
export const leadStatusEnum = pgEnum("lead_status", leadStatuses);
export const evidenceKindEnum = pgEnum("evidence_kind", evidenceKinds);
export const authChallengeKindEnum = pgEnum("auth_challenge_kind", [
  "signup_verification",
  "password_reset",
]);
export const organizationInviteStatusEnum = pgEnum("organization_invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
]);
export const channelProviderEnum = pgEnum("channel_provider", ["resend", "twilio"]);
export const channelCredentialStatusEnum = pgEnum("channel_credential_status", [
  "connected",
  "invalid",
]);
export const campaignExecutionStatusEnum = pgEnum(
  "campaign_execution_status",
  campaignExecutionStatuses,
);
export const outreachChannelEnum = pgEnum("outreach_channel", outreachChannels);
export const outreachSequenceStatusEnum = pgEnum(
  "outreach_sequence_status",
  outreachSequenceStatuses,
);
export const outreachMessageStatusEnum = pgEnum(
  "outreach_message_status",
  outreachMessageStatuses,
);
export const deliveryJobStatusEnum = pgEnum(
  "delivery_job_status",
  deliveryJobStatuses,
);
export const replyIntentEnum = pgEnum("reply_intent", replyIntents);
export const replyStatusEnum = pgEnum("reply_status", replyStatuses);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  normalizedEmail: text("normalized_email"),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("users_normalized_email_unique").on(table.normalizedEmail),
]);

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").default("member").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_org_idx").on(table.organizationId),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: authChallengeKindEnum("kind").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<{ organizationName?: string }>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("auth_challenges_user_kind_idx").on(
      table.userId,
      table.kind,
      table.createdAt,
    ),
    index("auth_challenges_expiry_idx").on(table.expiresAt),
  ],
);

export const organizationInvites = pgTable(
  "organization_invites",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    role: membershipRoleEnum("role").default("member").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: organizationInviteStatusEnum("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_invites_token_hash_unique").on(table.tokenHash),
    index("organization_invites_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("organization_invites_email_idx").on(table.normalizedEmail),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    businessName: text("business_name").notNull(),
    productName: text("product_name").notNull(),
    productSummary: text("product_summary").notNull(),
    sourceKind: campaignSourceKindEnum("source_kind").notNull(),
    source: jsonb("source").$type<Campaign["source"]>().notNull(),
    audience: text("audience").notNull(),
    geography: text("geography").notNull(),
    goal: text("goal").notNull(),
    leadCount: integer("lead_count").notNull(),
    monthlyBudgetUsd: integer("monthly_budget_usd").notNull(),
    channels: jsonb("channels").$type<Campaign["channels"]>().notNull(),
    status: campaignStatusEnum("status").default("researching").notNull(),
    providerSendReference: text("provider_send_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("campaigns_org_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("campaigns_org_created_idx").on(table.organizationId, table.createdAt),
    index("campaigns_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const campaignExecutions = pgTable(
  "campaign_executions",
  {
    id: uuid("id").primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: campaignExecutionStatusEnum("status").default("queued").notNull(),
    stage: text("stage").default("queued").notNull(),
    attempt: integer("attempt").default(1).notNull(),
    eveSessionId: text("eve_session_id"),
    continuationToken: text("continuation_token"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    artifactsPersistedAt: timestamp("artifacts_persisted_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("campaign_executions_campaign_unique").on(table.campaignId),
    index("campaign_executions_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("campaign_executions_session_idx").on(table.eveSessionId),
  ],
);

export const candidateStatusEnum = pgEnum("candidate_status", [
  "discovered",
  "enriching",
  "verified",
  "approved",
  "failed",
]);

export const campaignCandidates = pgTable(
  "campaign_candidates",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url"),
    description: text("description"),
    status: candidateStatusEnum("status").default("discovered").notNull(),
    parallelRunId: text("parallel_run_id"),
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    xHandle: text("x_handle"),
    companyName: text("company_name"),
    jobTitle: text("job_title"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("campaign_candidates_campaign_status_idx").on(
      table.campaignId,
      table.status,
    ),
    index("campaign_candidates_org_campaign_idx").on(
      table.organizationId,
      table.campaignId,
    ),
    uniqueIndex("campaign_candidates_run_unique").on(table.parallelRunId),
  ],
);

export const enrichmentGroups = pgTable("enrichment_groups", {
  campaignId: uuid("campaign_id")
    .primaryKey()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  taskgroupId: text("taskgroup_id").notNull(),
  active: boolean("active").default(true).notNull(),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const campaignProgressEvents = pgTable(
  "campaign_progress_events",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("campaign_progress_campaign_created_idx").on(
      table.campaignId,
      table.createdAt,
    ),
  ],
);

export const icpProfiles = pgTable(
  "icp_profiles",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    confidence: integer("confidence").notNull(),
    companyProfile: jsonb("company_profile")
      .$type<IcpProfile["companyProfile"]>()
      .notNull(),
    buyerRoles: jsonb("buyer_roles").$type<IcpProfile["buyerRoles"]>().notNull(),
    painPoints: jsonb("pain_points").$type<string[]>().notNull(),
    buyingSignals: jsonb("buying_signals").$type<string[]>().notNull(),
    exclusions: jsonb("exclusions").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("icp_profiles_org_campaign_idx").on(table.organizationId, table.campaignId),
    index("icp_profiles_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    icpProfileId: uuid("icp_profile_id").references(() => icpProfiles.id, {
      onDelete: "set null",
    }),
    sourceProvider: text("source_provider").notNull(),
    sourceLeadId: text("source_lead_id").notNull(),
    companyName: text("company_name").notNull(),
    companyDomain: text("company_domain"),
    companySize: text("company_size"),
    industry: text("industry"),
    geography: text("geography"),
    personName: text("person_name").notNull(),
    jobTitle: text("job_title").notNull(),
    email: text("email"),
    emailVerified: boolean("email_verified").default(false).notNull(),
    phone: text("phone"),
    phoneVerified: boolean("phone_verified").default(false).notNull(),
    linkedinUrl: text("linkedin_url"),
    confidence: integer("confidence").notNull(),
    status: leadStatusEnum("status").default("new").notNull(),
    doNotContact: boolean("do_not_contact").default(false).notNull(),
    buyingSignals: jsonb("buying_signals").$type<Lead["buyingSignals"]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("leads_org_source_unique").on(
      table.organizationId,
      table.sourceProvider,
      table.sourceLeadId,
    ),
    index("leads_org_campaign_idx").on(table.organizationId, table.campaignId),
    index("leads_org_confidence_idx").on(table.organizationId, table.confidence),
    index("leads_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const outreachSequences = pgTable(
  "outreach_sequences",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    channel: outreachChannelEnum("channel").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    status: outreachSequenceStatusEnum("status")
      .default("awaiting_approval")
      .notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("outreach_sequences_campaign_lead_channel_version_unique").on(
      table.campaignId,
      table.leadId,
      table.channel,
      table.version,
    ),
    index("outreach_sequences_org_campaign_idx").on(
      table.organizationId,
      table.campaignId,
    ),
    index("outreach_sequences_status_idx").on(table.status),
  ],
);

export const outreachMessages = pgTable(
  "outreach_messages",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => outreachSequences.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    channel: outreachChannelEnum("channel").notNull(),
    stepNumber: integer("step_number").notNull(),
    dayOffset: integer("day_offset").notNull(),
    subject: text("subject"),
    subjectVariant: text("subject_variant"),
    content: text("content").notNull(),
    status: outreachMessageStatusEnum("status").default("draft").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("outreach_messages_org_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    uniqueIndex("outreach_messages_sequence_step_unique").on(
      table.sequenceId,
      table.stepNumber,
    ),
    index("outreach_messages_campaign_status_idx").on(
      table.campaignId,
      table.status,
    ),
    index("outreach_messages_schedule_idx").on(
      table.status,
      table.scheduledFor,
    ),
  ],
);

export const organizationChannelCredentials = pgTable(
  "organization_channel_credentials",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: channelProviderEnum("provider").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    status: channelCredentialStatusEnum("status").default("connected").notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.provider] })],
);

export const organizationBilling = pgTable("organization_billing", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planId: text("plan_id"),
  status: subscriptionStatusEnum("status").default("none").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationSendingSettings = pgTable(
  "organization_sending_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    timezone: text("timezone").default("UTC").notNull(),
    dailyEmailLimit: integer("daily_email_limit").default(100).notNull(),
    dailySmsLimit: integer("daily_sms_limit").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const deliveryJobs = pgTable(
  "delivery_jobs",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => outreachSequences.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => outreachMessages.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    channel: outreachChannelEnum("channel").notNull(),
    status: deliveryJobStatusEnum("status").default("queued").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("delivery_jobs_message_unique").on(table.messageId),
    uniqueIndex("delivery_jobs_idempotency_unique").on(table.idempotencyKey),
    index("delivery_jobs_due_idx").on(
      table.status,
      table.availableAt,
      table.scheduledFor,
    ),
    index("delivery_jobs_org_campaign_idx").on(
      table.organizationId,
      table.campaignId,
    ),
  ],
);

export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    providerMessageId: text("provider_message_id"),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => outreachMessages.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
  },
  (table) => [
    uniqueIndex("provider_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    index("provider_events_message_idx").on(table.providerMessageId),
    index("provider_events_org_occurred_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
  ],
);

export const suppressionEntries = pgTable(
  "suppression_entries",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    channel: outreachChannelEnum("channel").notNull(),
    destination: text("destination").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("suppression_entries_org_channel_destination_unique").on(
      table.organizationId,
      table.channel,
      table.destination,
    ),
    index("suppression_entries_lead_idx").on(table.leadId),
  ],
);

export const inboundReplies = pgTable(
  "inbound_replies",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => outreachSequences.id, { onDelete: "cascade" }),
    outreachMessageId: uuid("outreach_message_id").references(
      () => outreachMessages.id,
      { onDelete: "set null" },
    ),
    provider: text("provider").notNull(),
    providerReplyId: text("provider_reply_id").notNull(),
    messageHeaderId: text("message_header_id"),
    channel: outreachChannelEnum("channel").notNull(),
    fromAddress: text("from_address").notNull(),
    toAddresses: jsonb("to_addresses").$type<string[]>().default([]).notNull(),
    subject: text("subject"),
    text: text("text").notNull(),
    html: text("html"),
    intent: replyIntentEnum("intent"),
    sentimentScore: integer("sentiment_score"),
    confidence: text("confidence"),
    reasoning: text("reasoning"),
    nextAction: text("next_action"),
    actionDetail: text("action_detail"),
    suggestedResponse: text("suggested_response"),
    flagForHuman: boolean("flag_for_human").default(true).notNull(),
    flagReason: text("flag_reason"),
    status: replyStatusEnum("status").default("unclassified").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("inbound_replies_provider_reply_unique").on(
      table.provider,
      table.providerReplyId,
    ),
    index("inbound_replies_org_received_idx").on(
      table.organizationId,
      table.receivedAt,
    ),
    index("inbound_replies_campaign_idx").on(table.campaignId),
    index("inbound_replies_lead_idx").on(table.leadId),
    index("inbound_replies_review_idx").on(
      table.organizationId,
      table.status,
      table.flagForHuman,
    ),
  ],
);

export const enrichmentEvidence = pgTable(
  "enrichment_evidence",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    icpProfileId: uuid("icp_profile_id").references(() => icpProfiles.id, {
      onDelete: "cascade",
    }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    kind: evidenceKindEnum("kind").notNull(),
    provider: text("provider").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title").notNull(),
    excerpt: text("excerpt").notNull(),
    confidence: integer("confidence").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("evidence_org_campaign_idx").on(table.organizationId, table.campaignId),
    index("evidence_lead_idx").on(table.leadId),
    index("evidence_icp_idx").on(table.icpProfileId),
  ],
);

export const approvalRecords = pgTable(
  "approval_records",
  {
    id: uuid("id").primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    approvedBy: text("approved_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scope: approvalScopeEnum("scope").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("approvals_campaign_idx").on(table.campaignId),
    index("approvals_org_idx").on(table.organizationId),
  ],
);

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    quantity: integer("quantity").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("usage_org_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("usage_org_occurred_idx").on(table.organizationId, table.occurredAt),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_org_occurred_idx").on(table.organizationId, table.occurredAt),
    index("audit_entity_idx").on(table.entityType, table.entityId),
  ],
);
