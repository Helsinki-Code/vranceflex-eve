import Twilio from "twilio";

export class TwilioConfigurationError extends Error {}
export class TwilioDeliveryError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly retryable = true,
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
const clientCache = new Map<string, ReturnType<typeof Twilio>>();

function getTwilioClient(credentials: TwilioCredentials) {
  let client = clientCache.get(credentials.accountSid);
  if (!client) {
    client = Twilio(credentials.accountSid, credentials.authToken);
    clientCache.set(credentials.accountSid, client);
  }
  return client;
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

    if (message.errorCode) {
      throw new TwilioDeliveryError(
        message.errorMessage ?? "Twilio reported a delivery error.",
        message.errorCode,
        !nonRetryableTwilioCodes.has(message.errorCode),
      );
    }

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

    throw new TwilioDeliveryError(
      error instanceof Error ? error.message : "Twilio could not accept the message.",
      code,
      code ? !nonRetryableTwilioCodes.has(code) : status ? status >= 500 || status === 429 : true,
    );
  }
}
