CREATE TABLE "sending_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"domain" text NOT NULL,
	"provider" text DEFAULT 'other' NOT NULL,
	"dkim_selector" text DEFAULT 'google' NOT NULL,
	"last_check" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_checked_at" timestamp with time zone,
	"status" text DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sending_mailboxes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"from_name" text,
	"provider" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"daily_limit" integer DEFAULT 30 NOT NULL,
	"ramp_up" boolean DEFAULT true NOT NULL,
	"ramp_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_send_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imap_uid_validity" bigint,
	"imap_last_uid" bigint,
	"last_polled_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_sending_settings" ADD COLUMN "email_transport" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD COLUMN "sender_mailbox_id" uuid;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD COLUMN "rfc_message_id" text;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD COLUMN "sender_mailbox_id" uuid;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD COLUMN "thread_message_id" text;--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_mailboxes" ADD CONSTRAINT "sending_mailboxes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sending_domains_org_domain_unique" ON "sending_domains" USING btree ("organization_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "sending_mailboxes_org_email_unique" ON "sending_mailboxes" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "sending_mailboxes_status_idx" ON "sending_mailboxes" USING btree ("status","last_polled_at");--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_sender_mailbox_id_sending_mailboxes_id_fk" FOREIGN KEY ("sender_mailbox_id") REFERENCES "public"."sending_mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_sender_mailbox_id_sending_mailboxes_id_fk" FOREIGN KEY ("sender_mailbox_id") REFERENCES "public"."sending_mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_messages_rfc_message_id_idx" ON "outreach_messages" USING btree ("rfc_message_id");--> statement-breakpoint
CREATE INDEX "outreach_messages_sender_sent_idx" ON "outreach_messages" USING btree ("sender_mailbox_id","sent_at");