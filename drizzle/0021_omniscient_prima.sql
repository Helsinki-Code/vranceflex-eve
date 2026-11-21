ALTER TYPE "public"."reply_intent" ADD VALUE 'OFFER_ACCEPTED' BEFORE 'HOT';--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "offer" text;