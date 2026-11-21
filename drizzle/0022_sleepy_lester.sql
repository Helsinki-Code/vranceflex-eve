CREATE TABLE "call_consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"status" text DEFAULT 'granted' NOT NULL,
	"source" text NOT NULL,
	"evidence" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"recorded_by" text,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_addons" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"monthly_seconds" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"stripe_subscription_item_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_call_targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"voice_campaign_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"last_outcome" text,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"voice_campaign_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"level" text NOT NULL,
	"status" text DEFAULT 'dialing' NOT NULL,
	"room" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"billed_seconds" integer DEFAULT 0 NOT NULL,
	"outcome" text,
	"summary" text,
	"follow_up" text,
	"callback_at" timestamp with time zone,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"playbook" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"paused_reason" text,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"retry_gap_hours" integer DEFAULT 24 NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_do_not_call" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"phone" text NOT NULL,
	"reason" text NOT NULL,
	"call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_minute_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"seconds_total" integer NOT NULL,
	"seconds_remaining" integer NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_minute_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"call_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"consent_attested_at" timestamp with time zone,
	"consent_attested_by" text,
	"call_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"call_start" text DEFAULT '09:00' NOT NULL,
	"call_end" text DEFAULT '17:00' NOT NULL,
	"max_concurrent_calls" integer DEFAULT 2 NOT NULL,
	"daily_call_limit" integer DEFAULT 100 NOT NULL,
	"voice_paused" boolean DEFAULT false NOT NULL,
	"paused_reason" text,
	"paused_at" timestamp with time zone,
	"sip_address" text,
	"caller_number" text,
	"encrypted_sip_credentials" text,
	"livekit_trunk_id" text,
	"telephony_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_consents" ADD CONSTRAINT "call_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_consents" ADD CONSTRAINT "call_consents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_consents" ADD CONSTRAINT "call_consents_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_addons" ADD CONSTRAINT "voice_addons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_call_targets" ADD CONSTRAINT "voice_call_targets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_call_targets" ADD CONSTRAINT "voice_call_targets_voice_campaign_id_voice_campaigns_id_fk" FOREIGN KEY ("voice_campaign_id") REFERENCES "public"."voice_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_call_targets" ADD CONSTRAINT "voice_call_targets_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_voice_campaign_id_voice_campaigns_id_fk" FOREIGN KEY ("voice_campaign_id") REFERENCES "public"."voice_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_target_id_voice_call_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."voice_call_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_campaigns" ADD CONSTRAINT "voice_campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_campaigns" ADD CONSTRAINT "voice_campaigns_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_campaigns" ADD CONSTRAINT "voice_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_campaigns" ADD CONSTRAINT "voice_campaigns_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_do_not_call" ADD CONSTRAINT "voice_do_not_call_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_minute_grants" ADD CONSTRAINT "voice_minute_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_minute_usage" ADD CONSTRAINT "voice_minute_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_minute_usage" ADD CONSTRAINT "voice_minute_usage_grant_id_voice_minute_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."voice_minute_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_settings" ADD CONSTRAINT "voice_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_settings" ADD CONSTRAINT "voice_settings_consent_attested_by_users_id_fk" FOREIGN KEY ("consent_attested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_consents_lead_phone_unique" ON "call_consents" USING btree ("organization_id","lead_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_call_targets_campaign_lead_unique" ON "voice_call_targets" USING btree ("voice_campaign_id","lead_id");--> statement-breakpoint
CREATE INDEX "voice_call_targets_due_idx" ON "voice_call_targets" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "voice_calls_org_created_idx" ON "voice_calls" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "voice_calls_org_review_idx" ON "voice_calls" USING btree ("organization_id","review_status");--> statement-breakpoint
CREATE INDEX "voice_calls_status_idx" ON "voice_calls" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "voice_campaigns_org_status_idx" ON "voice_campaigns" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_do_not_call_phone_unique" ON "voice_do_not_call" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_minute_grants_source_unique" ON "voice_minute_grants" USING btree ("organization_id","source_key");--> statement-breakpoint
CREATE INDEX "voice_minute_grants_available_idx" ON "voice_minute_grants" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_minute_usage_call_grant_unique" ON "voice_minute_usage" USING btree ("call_id","grant_id");