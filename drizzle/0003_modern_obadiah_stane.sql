CREATE TYPE "public"."campaign_execution_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."outreach_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."outreach_message_status" AS ENUM('draft', 'approved', 'scheduled', 'sending', 'sent', 'delivered', 'bounced', 'replied', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."outreach_sequence_status" AS ENUM('draft', 'awaiting_approval', 'approved', 'scheduled', 'active', 'completed', 'stopped');--> statement-breakpoint
CREATE TABLE "campaign_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"status" "campaign_execution_status" DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"eve_session_id" text,
	"continuation_token" text,
	"error_code" text,
	"error_message" text,
	"artifacts_persisted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"channel" "outreach_channel" NOT NULL,
	"step_number" integer NOT NULL,
	"day_offset" integer NOT NULL,
	"subject" text,
	"subject_variant" text,
	"content" text NOT NULL,
	"status" "outreach_message_status" DEFAULT 'draft' NOT NULL,
	"idempotency_key" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"provider_message_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_sequences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"channel" "outreach_channel" NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" "outreach_sequence_status" DEFAULT 'awaiting_approval' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_executions" ADD CONSTRAINT "campaign_executions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_executions" ADD CONSTRAINT "campaign_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_sequence_id_outreach_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."outreach_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_executions_campaign_unique" ON "campaign_executions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_executions_org_status_idx" ON "campaign_executions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "campaign_executions_session_idx" ON "campaign_executions" USING btree ("eve_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_messages_org_idempotency_unique" ON "outreach_messages" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_messages_sequence_step_unique" ON "outreach_messages" USING btree ("sequence_id","step_number");--> statement-breakpoint
CREATE INDEX "outreach_messages_campaign_status_idx" ON "outreach_messages" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "outreach_messages_schedule_idx" ON "outreach_messages" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_sequences_campaign_lead_channel_version_unique" ON "outreach_sequences" USING btree ("campaign_id","lead_id","channel","version");--> statement-breakpoint
CREATE INDEX "outreach_sequences_org_campaign_idx" ON "outreach_sequences" USING btree ("organization_id","campaign_id");--> statement-breakpoint
CREATE INDEX "outreach_sequences_status_idx" ON "outreach_sequences" USING btree ("status");