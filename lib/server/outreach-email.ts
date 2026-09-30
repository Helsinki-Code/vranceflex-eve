import { findUnresolvedPlaceholders } from "./message-placeholders";
import type { MailboxSecret } from "../domain/mailboxes";
import { appendToSent } from "./mailbox-imap";
import { rfcMessageId, sendViaMailbox } from "./mailbox-smtp";
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

/** Where an outreach email goes out from: the workspace's Resend account, or one of its mailboxes. */
export type OutreachEmailSender =
  | { kind: "resend"; credentials: ResendSendCredentials }
  | {
      kind: "mailbox";
      secret: MailboxSecret;
      mailbox: { id: string; email: string; fromName: string | null; provider: "google" | "smtp" };
      /** Message-ID of the first email to this lead, so follow-ups thread under it. */
      threadMessageId?: string | null;
    };

export async function sendApprovedOutreachEmail(
  sender: OutreachEmailSender | null,
  input: ApprovedOutreachEmail,
) {
  if (!sender) {
    throw new OutreachEmailPolicyError(
      "Connect a sending mailbox or a Resend account for this workspace before sending outreach email.",
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

  const text = unsubscribe ? withComplianceFooter(input.text, unsubscribe) : input.text;
  const html = input.html && unsubscribe ? withComplianceFooterHtml(input.html, unsubscribe) : input.html;
  const unsubscribeHeaders = unsubscribe
    ? { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : undefined;

  if (sender.kind === "mailbox") {
    const messageId = rfcMessageId(input.messageId, sender.mailbox.email);
    const sent = await sendViaMailbox(sender.secret, {
      fromEmail: sender.mailbox.email,
      fromName: sender.mailbox.fromName,
      to: input.to.trim(),
      subject: input.subject.trim(),
      text,
      html,
      // Replies come straight back to the mailbox; its inbox is polled.
      messageId,
      inReplyTo: sender.threadMessageId,
      headers: unsubscribeHeaders,
    });
    // Gmail files SMTP sends in Sent itself; other servers need a copy.
    if (sender.mailbox.provider !== "google") {
      await appendToSent(sender.secret, sent.raw).catch(() => undefined);
    }
    return { providerMessageId: messageId, rfcMessageId: messageId, unsubscribeSigned };
  }

  const result = await sendResendEmail(sender.credentials, {
    to: input.to.trim(),
    subject: input.subject.trim(),
    text,
    html,
    replyTo: input.replyTo,
    tags: [
      { name: "category", value: "outreach" },
      { name: "campaign_id", value: tagValue(input.campaignId) },
      { name: "lead_id", value: tagValue(input.leadId) },
      { name: "message_id", value: tagValue(input.messageId) },
    ],
    idempotencyKey: input.idempotencyKey,
    ...(unsubscribeHeaders ? { headers: unsubscribeHeaders } : {}),
  });
  return { ...result, rfcMessageId: null, unsubscribeSigned };
}
