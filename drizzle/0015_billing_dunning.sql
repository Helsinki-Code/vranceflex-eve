ALTER TABLE "organization_billing" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_billing" ADD COLUMN "past_due_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization_billing" ADD COLUMN "last_payment_error" text;