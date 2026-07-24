import { sendTwilioSms, type TwilioCredentials } from "./twilio-sms";

export class OutreachSmsPolicyError extends Error {}

export type ApprovedOutreachSms = {
  to: string;
  text: string;
  campaignId: string;
  leadId: string;
  messageId: string;
  approved: boolean;
  doNotContact: boolean;
  phoneVerified: boolean;
};

export async function sendApprovedOutreachSms(
  credentials: TwilioCredentials | null,
  input: ApprovedOutreachSms,
) {
  if (!credentials) {
    throw new OutreachSmsPolicyError(
      "Connect a Twilio account for this workspace before sending outreach SMS.",
    );
  }

  if (!input.approved) {
    throw new OutreachSmsPolicyError(
      "Human approval is required before outreach SMS delivery.",
    );
  }

  if (input.doNotContact) {
    throw new OutreachSmsPolicyError(
      "This lead is suppressed and cannot receive outreach.",
    );
  }

  if (!input.phoneVerified) {
    throw new OutreachSmsPolicyError(
      "A verified recipient phone number is required for outreach.",
    );
  }

  if (!input.to.trim() || !input.text.trim()) {
    throw new OutreachSmsPolicyError(
      "Recipient and message content are required.",
    );
  }

  return sendTwilioSms(credentials, {
    to: input.to.trim(),
    body: input.text,
  });
}
