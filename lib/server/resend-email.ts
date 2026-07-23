import { isResendConfigured } from "../auth/config";

export class ResendConfigurationError extends Error {}
export class ResendDeliveryError extends Error {}

type ResendTag = {
  name: string;
  value: string;
};

export type ResendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  tags?: ResendTag[];
};

export function assertResendConfigured() {
  if (!isResendConfigured()) {
    throw new ResendConfigurationError(
      "Resend is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
  }
}

export async function sendResendEmail(input: ResendEmailInput) {
  assertResendConfigured();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL!.trim(),
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.tags?.length ? { tags: input.tags } : {}),
    }),
  });

  if (!response.ok) {
    throw new ResendDeliveryError("Resend could not accept the email.");
  }

  const payload = (await response.json()) as { id?: string };
  if (!payload.id) {
    throw new ResendDeliveryError("Resend did not return a delivery reference.");
  }

  return {
    provider: "resend" as const,
    providerMessageId: payload.id,
  };
}
