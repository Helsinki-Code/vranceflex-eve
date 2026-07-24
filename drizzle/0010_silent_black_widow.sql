CREATE TYPE "public"."candidate_status" AS ENUM('discovered', 'enriching', 'verified', 'failed');--> statement-breakpoint
CREATE TABLE "campaign_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"description" text,
	"status" "candidate_status" DEFAULT 'discovered' NOT NULL,
	"parallel_run_id" text,
	"email" text,
	"phone" text,
	"linkedin_url" text,
	"company_name" text,
	"job_title" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment_groups" (
	"campaign_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"taskgroup_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_candidates" ADD CONSTRAINT "campaign_candidates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_candidates" ADD CONSTRAINT "campaign_candidates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_groups" ADD CONSTRAINT "enrichment_groups_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_groups" ADD CONSTRAINT "enrichment_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_candidates_campaign_status_idx" ON "campaign_candidates" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "campaign_candidates_org_campaign_idx" ON "campaign_candidates" USING btree ("organization_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_candidates_run_unique" ON "campaign_candidates" USING btree ("parallel_run_id");