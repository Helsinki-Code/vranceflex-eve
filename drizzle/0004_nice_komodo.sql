CREATE TYPE "public"."delivery_job_status" AS ENUM('queued', 'processing', 'retry', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "delivery_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"channel" "outreach_channel" NOT NULL,
	"status" "delivery_job_status" DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"idempotency_key" text NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_sending_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"daily_email_limit" integer DEFAULT 100 NOT NULL,
	"daily_sms_limit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_message_id" text,
	"organization_id" text,
	"campaign_id" uuid,
	"message_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" uuid,
	"channel" "outreach_channel" NOT NULL,
	"destination" text NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_sequence_id_outreach_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."outreach_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_message_id_outreach_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."outreach_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD CONSTRAINT "organization_sending_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_message_id_outreach_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."outreach_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD CONSTRAINT "suppression_entries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_jobs_message_unique" ON "delivery_jobs" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_jobs_idempotency_unique" ON "delivery_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "delivery_jobs_due_idx" ON "delivery_jobs" USING btree ("status","available_at","scheduled_for");--> statement-breakpoint
CREATE INDEX "delivery_jobs_org_campaign_idx" ON "delivery_jobs" USING btree ("organization_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_events_provider_event_unique" ON "provider_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "provider_events_message_idx" ON "provider_events" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "provider_events_org_occurred_idx" ON "provider_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_entries_org_channel_destination_unique" ON "suppression_entries" USING btree ("organization_id","channel","destination");--> statement-breakpoint
CREATE INDEX "suppression_entries_lead_idx" ON "suppression_entries" USING btree ("lead_id");