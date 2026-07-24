import { isResendConfigured } from "../auth/config";

export class ResendConfigurationError extends Error {}
export class ResendDeliveryError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly retryable = true,
  ) {
    super(message);
  }
}

type ResendTag = {
  name: string;
  value: string;
};

export type ResendSendCredentials = {
  apiKey: string;
  fromEmail: string;
};

export type ResendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  tags?: ResendTag[];
  idempotencyKey?: string;
  headers?: Record<string, string>;
};

/** Only for platform-account email (auth OTPs, team invites) — never outreach. */
export function assertResendConfigured() {
  if (!isResendConfigured()) {
    throw new ResendConfigurationError(
      "Resend is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
  }
}

/** Only for platform-account email (auth OTPs, team invites) — never outreach. */
export function platformResendCredentials(): ResendSendCredentials {
  assertResendConfigured();
  return {
    apiKey: process.env.RESEND_API_KEY!.trim(),
    fromEmail: process.env.RESEND_FROM_EMAIL!.trim(),
  };
}

export async function sendResendEmail(
  credentials: ResendSendCredentials,
  input: ResendEmailInput,
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : {}),
    },
    body: JSON.stringify({
      from: credentials.fromEmail,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.tags?.length ? { tags: input.tags } : {}),
      ...(input.headers && Object.keys(input.headers).length
        ? { headers: input.headers }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new ResendDeliveryError(
      "Resend could not accept the email.",
      response.status,
      response.status === 408 ||
        response.status === 409 ||
        response.status === 429 ||
        response.status >= 500,
    );
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
