import { findUnresolvedPlaceholders } from "./message-placeholders";
import { sendResendEmail, type ResendSendCredentials } from "./resend-email";
import { signUnsubscribeToken } from "./unsubscribe-token";

export class OutreachEmailPolicyError extends Error {}

function unsubscribeUrl(messageId: string) {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return { url: undefined, signed: false };
  const token = signUnsubscribeToken(messageId);
  return {
    url: `${base}/api/unsubscribe/${messageId}${token ? `?t=${token}` : ""}`,
    signed: Boolean(token),
  };
}

function withComplianceFooter(body: string, unsubscribe: string) {
  const address = process.env.COMPANY_MAILING_ADDRESS?.trim();
  const lines = [
    "---",
    `Unsubscribe: ${unsubscribe}`,
    ...(address ? [address] : []),
  ];
  return `${body.trimEnd()}\n\n${lines.join("\n")}`;
}

function withComplianceFooterHtml(html: string, unsubscribe: string) {
  const address = process.env.COMPANY_MAILING_ADDRESS?.trim();
  return `${html}<hr /><p style="font-size:12px;color:#6b7280;">
    <a href="${unsubscribe}">Unsubscribe</a>${address ? ` &middot; ${address}` : ""}
  </p>`;
}

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

export async function sendApprovedOutreachEmail(
  credentials: ResendSendCredentials | null,
  input: ApprovedOutreachEmail,
) {
  if (!credentials) {
    throw new OutreachEmailPolicyError(
      "Connect a Resend account for this workspace before sending outreach email.",
    );
  }

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

  const placeholders = findUnresolvedPlaceholders(input.subject, input.text);
  if (placeholders.length) {
    throw new OutreachEmailPolicyError(
      `The email still contains unfilled placeholders (${placeholders.join(", ")}). Edit the step before it can send.`,
    );
  }

  const { url: unsubscribe, signed: unsubscribeSigned } = unsubscribeUrl(input.messageId);

  const result = await sendResendEmail(credentials, {
    to: input.to.trim(),
    subject: input.subject.trim(),
    text: unsubscribe ? withComplianceFooter(input.text, unsubscribe) : input.text,
    html: input.html && unsubscribe
      ? withComplianceFooterHtml(input.html, unsubscribe)
      : input.html,
    replyTo: input.replyTo,
    tags: [
      { name: "category", value: "outreach" },
      { name: "campaign_id", value: tagValue(input.campaignId) },
      { name: "lead_id", value: tagValue(input.leadId) },
      { name: "message_id", value: tagValue(input.messageId) },
    ],
    idempotencyKey: input.idempotencyKey,
    ...(unsubscribe
      ? {
          headers: {
            "List-Unsubscribe": `<${unsubscribe}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
  });
  return { ...result, unsubscribeSigned };
}
