CREATE TYPE "public"."reply_intent" AS ENUM('HOT', 'WARM', 'NEUTRAL', 'OBJECTION', 'NOT_FIT', 'OUT_OF_OFFICE', 'UNSUBSCRIBE');--> statement-breakpoint
CREATE TYPE "public"."reply_status" AS ENUM('unclassified', 'classified', 'reviewed', 'archived');--> statement-breakpoint
ALTER TYPE "public"."outreach_sequence_status" ADD VALUE 'paused' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "inbound_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"outreach_message_id" uuid,
	"provider" text NOT NULL,
	"provider_reply_id" text NOT NULL,
	"message_header_id" text,
	"channel" "outreach_channel" NOT NULL,
	"from_address" text NOT NULL,
	"to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text,
	"text" text NOT NULL,
	"html" text,
	"intent" "reply_intent",
	"sentiment_score" integer,
	"confidence" text,
	"reasoning" text,
	"next_action" text,
	"action_detail" text,
	"suggested_response" text,
	"flag_for_human" boolean DEFAULT true NOT NULL,
	"flag_reason" text,
	"status" "reply_status" DEFAULT 'unclassified' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_events" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_events" ADD COLUMN "processing_error" text;--> statement-breakpoint
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_sequence_id_outreach_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."outreach_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_outreach_message_id_outreach_messages_id_fk" FOREIGN KEY ("outreach_message_id") REFERENCES "public"."outreach_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_replies_provider_reply_unique" ON "inbound_replies" USING btree ("provider","provider_reply_id");--> statement-breakpoint
CREATE INDEX "inbound_replies_org_received_idx" ON "inbound_replies" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "inbound_replies_campaign_idx" ON "inbound_replies" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "inbound_replies_lead_idx" ON "inbound_replies" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "inbound_replies_review_idx" ON "inbound_replies" USING btree ("organization_id","status","flag_for_human");