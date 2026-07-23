import { sendResendEmail } from "./resend-email";

export class OutreachEmailPolicyError extends Error {}

export type ApprovedOutreachEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  campaignId: string;
  leadId: string;
  messageId: string;
  idempotencyKey: string;
  approved: boolean;
  doNotContact: boolean;
  emailVerified: boolean;
};

function tagValue(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256);
}

export async function sendApprovedOutreachEmail(input: ApprovedOutreachEmail) {
  if (!input.approved) {
    throw new OutreachEmailPolicyError(
      "Human approval is required before outreach email delivery.",
    );
  }

  if (input.doNotContact) {
    throw new OutreachEmailPolicyError(
      "This lead is suppressed and cannot receive outreach.",
    );
  }

  if (!input.emailVerified) {
    throw new OutreachEmailPolicyError(
      "A verified recipient email is required for outreach.",
    );
  }

  if (!input.to.trim() || !input.subject.trim() || !input.text.trim()) {
    throw new OutreachEmailPolicyError(
      "Recipient, subject and text content are required.",
    );
  }

  return sendResendEmail({
    to: input.to.trim(),
    subject: input.subject.trim(),
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
    tags: [
      { name: "category", value: "outreach" },
      { name: "campaign_id", value: tagValue(input.campaignId) },
      { name: "lead_id", value: tagValue(input.leadId) },
      { name: "message_id", value: tagValue(input.messageId) },
    ],
    idempotencyKey: input.idempotencyKey,
  });
}
