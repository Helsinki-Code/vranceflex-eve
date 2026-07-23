import { assertResendConfigured, ResendDeliveryError } from "./resend-email";

export type ReceivedEmailContent = {
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
};

export async function getReceivedEmailContent(emailId: string) {
  assertResendConfigured();
  const response = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
      },
    },
  );
  if (!response.ok) {
    throw new ResendDeliveryError(
      "Resend could not return the received email content.",
      response.status,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }
  return (await response.json()) as ReceivedEmailContent;
}
