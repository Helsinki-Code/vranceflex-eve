CREATE TYPE "public"."channel_credential_status" AS ENUM('connected', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."channel_provider" AS ENUM('resend', 'twilio');--> statement-breakpoint
CREATE TABLE "organization_channel_credentials" (
	"organization_id" text NOT NULL,
	"provider" "channel_provider" NOT NULL,
	"encrypted_payload" text NOT NULL,
	"status" "channel_credential_status" DEFAULT 'connected' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_channel_credentials_organization_id_provider_pk" PRIMARY KEY("organization_id","provider")
);
--> statement-breakpoint
ALTER TABLE "organization_channel_credentials" ADD CONSTRAINT "organization_channel_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;