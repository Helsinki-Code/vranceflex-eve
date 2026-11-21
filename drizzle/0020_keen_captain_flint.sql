ALTER TABLE "leads" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "acknowledged_countries" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sending_domains" ADD COLUMN "registered_at" timestamp with time zone;