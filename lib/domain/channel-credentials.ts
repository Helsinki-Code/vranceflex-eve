import { z } from "zod";

export const resendConnectionSchema = z.object({
  apiKey: z.string().trim().min(10, "Enter a valid Resend API key."),
  fromEmail: z
    .string()
    .trim()
    .min(3)
    .max(254)
    .refine((value) => /<[^>]+@[^>]+>|^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: 'Enter a valid sender, e.g. "Acme <outreach@yourdomain.com>".',
    }),
  replyDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/,
      "Enter a valid domain, e.g. reply.yourdomain.com",
    ),
  webhookSecret: z.string().trim().min(10, "Enter the webhook signing secret from Resend."),
});

export type ResendConnectionInput = z.infer<typeof resendConnectionSchema>;

export const twilioConnectionSchema = z.object({
  accountSid: z
    .string()
    .trim()
    .regex(/^AC[a-zA-Z0-9]{32}$/, "Enter a valid Twilio Account SID (starts with AC)."),
  authToken: z.string().trim().min(10, "Enter a valid Twilio Auth Token."),
  messagingServiceSid: z
    .string()
    .trim()
    .regex(/^MG[a-zA-Z0-9]{32}$/, "Enter a valid Messaging Service SID (starts with MG)."),
});

export type TwilioConnectionInput = z.infer<typeof twilioConnectionSchema>;
