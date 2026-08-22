import Twilio from "twilio";

export class TwilioConfigurationError extends Error {}
export class TwilioDeliveryError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly retryable = true,
    readonly ambiguous = false,
  ) {
    super(message);
  }
}

export type TwilioCredentials = {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
};

export type TwilioSmsInput = {
  to: string;
  body: string;
};

// Twilio error codes that indicate the message can never be delivered as
// addressed, regardless of retry. Everything else (rate limits, transient
// carrier/network failures) is treated as retryable.
const nonRetryableTwilioCodes = new Set([
  21211, // invalid "To" number
  21214, // "To" number not reachable
  21610, // recipient has unsubscribed ("STOP")
  21614, // "To" number is not a valid mobile number
]);

// Each connected organization has its own Twilio account, so clients are
// cached per accountSid rather than a single global client.
const clientCache = new Map<
  string,
  { authToken: string; client: ReturnType<typeof Twilio> }
>();

function getTwilioClient(credentials: TwilioCredentials) {
  let cached = clientCache.get(credentials.accountSid);
  if (!cached || cached.authToken !== credentials.authToken) {
    cached = {
      authToken: credentials.authToken,
      client: Twilio(credentials.accountSid, credentials.authToken),
    };
    clientCache.set(credentials.accountSid, cached);
  }
  return cached.client;
}

export async function sendTwilioSms(
  credentials: TwilioCredentials,
  input: TwilioSmsInput,
) {
  if (!input.to.trim() || !input.body.trim()) {
    throw new TwilioDeliveryError("Recipient and message body are required.");
  }

  try {
    const message = await getTwilioClient(credentials).messages.create({
      to: input.to.trim(),
      body: input.body,
      messagingServiceSid: credentials.messagingServiceSid,
    });

    // A returned SID means Twilio created the message resource. Even if its
    // initial status already contains a delivery error, retrying here would
    // create a second SMS and violate the worker's exactly-once boundary.
    return {
      provider: "twilio" as const,
      providerMessageId: message.sid,
    };
  } catch (error) {
    if (error instanceof TwilioDeliveryError) throw error;

    const code =
      typeof (error as { code?: number })?.code === "number"
        ? (error as { code: number }).code
        : undefined;
    const status =
      typeof (error as { status?: number })?.status === "number"
        ? (error as { status: number }).status
        : undefined;

    const retryable = Boolean(status === 429 || (code && !nonRetryableTwilioCodes.has(code)));
    const ambiguous = !code && (status === undefined || status >= 500);
    throw new TwilioDeliveryError(
      error instanceof Error ? error.message : "Twilio could not accept the message.",
      code,
      retryable,
      ambiguous,
    );
  }
}
