import { ResendDeliveryError } from "./resend-email";

export type ReceivedEmailContent = {
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
};

/** `apiKey` must be the org's own connected Resend API key — the received
 * email lives in that org's Resend account, never the platform account. */
export async function getReceivedEmailContent(emailId: string, apiKey: string) {
  const response = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
