ALTER TABLE "voice_calls" ADD COLUMN "line_type" text DEFAULT 'sip' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD COLUMN "provider_call_sid" text;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD COLUMN "answered_by" text;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD COLUMN "provider_status" text;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD COLUMN "provider_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD COLUMN "job_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD COLUMN "held_report" jsonb;--> statement-breakpoint
ALTER TABLE "voice_settings" ADD COLUMN "line_type" text DEFAULT 'sip' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_settings" ADD COLUMN "twilio_account_sid" text;--> statement-breakpoint
ALTER TABLE "voice_settings" ADD COLUMN "encrypted_twilio_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "voice_calls_provider_call_sid_unique" ON "voice_calls" USING btree ("provider_call_sid");