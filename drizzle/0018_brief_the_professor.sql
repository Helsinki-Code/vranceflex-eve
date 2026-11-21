ALTER TABLE "leads" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "send_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "window_start" text DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "window_end" text DEFAULT '17:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "use_recipient_timezone" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "stop_company_on_reply" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "sending_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "paused_reason" text;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "link_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "leads_org_company_domain_idx" ON "leads" USING btree ("organization_id","company_domain");