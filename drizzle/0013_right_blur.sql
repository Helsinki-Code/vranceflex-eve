CREATE TABLE "delivery_dispatches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"delivery_job_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"occurrence_key" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "recurrence" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "schedule_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD COLUMN "recurrence" jsonb;--> statement-breakpoint
ALTER TABLE "delivery_dispatches" ADD CONSTRAINT "delivery_dispatches_delivery_job_id_delivery_jobs_id_fk" FOREIGN KEY ("delivery_job_id") REFERENCES "public"."delivery_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_dispatches" ADD CONSTRAINT "delivery_dispatches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_dispatches_occurrence_unique" ON "delivery_dispatches" USING btree ("delivery_job_id","occurrence_key");--> statement-breakpoint
CREATE INDEX "delivery_dispatches_org_created_idx" ON "delivery_dispatches" USING btree ("organization_id","created_at");