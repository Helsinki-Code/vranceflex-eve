CREATE TYPE "public"."email_status" AS ENUM('verified', 'risky', 'guess', 'invalid', 'unknown');--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"status" "email_status" NOT NULL,
	"verifier" text NOT NULL,
	"detail" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_candidates" ADD COLUMN "email_status" "email_status" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_candidates" ADD COLUMN "email_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_candidates" ADD COLUMN "email_verifier" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_status" "email_status" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_verifier" text;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "allow_risky_email" boolean DEFAULT false NOT NULL;