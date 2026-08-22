CREATE TYPE "public"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."billing_plan" AS ENUM('launch', 'growth', 'agency', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."prospect_credit_reservation_status" AS ENUM('reserved', 'consumed', 'released');--> statement-breakpoint
CREATE TYPE "public"."prospect_credit_source" AS ENUM('subscription', 'topup');--> statement-breakpoint
CREATE TABLE "prospect_credit_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source" "prospect_credit_source" NOT NULL,
	"source_key" text NOT NULL,
	"quantity" integer NOT NULL,
	"remaining" integer NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_credit_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"status" "prospect_credit_reservation_status" DEFAULT 'reserved' NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organization_billing" ADD COLUMN "plan_key" "billing_plan";--> statement-breakpoint
ALTER TABLE "organization_billing" ADD COLUMN "billing_interval" "billing_interval";--> statement-breakpoint
ALTER TABLE "organization_billing" ADD COLUMN "subscription_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_credit_grants" ADD CONSTRAINT "prospect_credit_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_credit_reservations" ADD CONSTRAINT "prospect_credit_reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_credit_reservations" ADD CONSTRAINT "prospect_credit_reservations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_credit_reservations" ADD CONSTRAINT "prospect_credit_reservations_candidate_id_campaign_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."campaign_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_credit_reservations" ADD CONSTRAINT "prospect_credit_reservations_grant_id_prospect_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."prospect_credit_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prospect_credit_grants_source_unique" ON "prospect_credit_grants" USING btree ("organization_id","source_key");--> statement-breakpoint
CREATE INDEX "prospect_credit_grants_available_idx" ON "prospect_credit_grants" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prospect_credit_reservations_candidate_unique" ON "prospect_credit_reservations" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "prospect_credit_reservations_org_status_idx" ON "prospect_credit_reservations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "prospect_credit_reservations_grant_idx" ON "prospect_credit_reservations" USING btree ("grant_id");