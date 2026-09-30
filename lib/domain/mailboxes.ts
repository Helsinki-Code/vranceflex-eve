import { z } from "zod";

export const MAILBOX_MAX_DAILY_LIMIT = 500;
export const RAMP_START_PER_DAY = 10;
export const RAMP_STEP_PER_DAY = 5;

// Personal mailboxes have hard provider caps and get suspended quickly for
// cold outreach; the UI warns and the domain checker skips them.
export const consumerMailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "gmx.com",
]);

export function emailDomain(email: string) {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

export function isConsumerAddress(email: string) {
  return consumerMailDomains.has(emailDomain(email));
}

export type MailServer = { host: string; port: number; secure: boolean };

export const mailboxPresets = {
  google: { label: "Google Workspace / Gmail", smtp: { host: "smtp.gmail.com", port: 465, secure: true }, imap: { host: "imap.gmail.com", port: 993, secure: true } },
  zoho: { label: "Zoho Mail", smtp: { host: "smtp.zoho.com", port: 465, secure: true }, imap: { host: "imap.zoho.com", port: 993, secure: true } },
  fastmail: { label: "Fastmail", smtp: { host: "smtp.fastmail.com", port: 465, secure: true }, imap: { host: "imap.fastmail.com", port: 993, secure: true } },
  custom: { label: "Other provider", smtp: { host: "", port: 465, secure: true }, imap: { host: "", port: 993, secure: true } },
} as const satisfies Record<string, { label: string; smtp: MailServer; imap: MailServer }>;

export type MailboxPresetKey = keyof typeof mailboxPresets;

const emailField = z.string().trim().toLowerCase().email("Enter the mailbox's email address.").max(254);
const fromNameField = z.string().trim().max(80).optional().transform((value) => value || undefined);
const dailyLimitField = z.coerce.number().int().min(1).max(MAILBOX_MAX_DAILY_LIMIT).default(30);
const hostField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, "Enter a valid server hostname.");
const portField = z.coerce.number().int().min(1).max(65_535);

export const googleMailboxSchema = z.object({
  provider: z.literal("google"),
  email: emailField,
  // Google shows the App Password in four groups of four letters.
  appPassword: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^[a-zA-Z]{16}$/, "An App Password is 16 letters, e.g. abcd efgh ijkl mnop.")),
  fromName: fromNameField,
  dailyLimit: dailyLimitField,
  rampUp: z.boolean().default(true),
});

export const smtpMailboxSchema = z.object({
  provider: z.literal("smtp"),
  email: emailField,
  username: z.string().trim().max(254).optional().transform((value) => value || undefined),
  password: z.string().min(1, "Enter the mailbox password or app password.").max(512),
  smtpHost: hostField,
  smtpPort: portField,
  smtpSecure: z.boolean(),
  imapHost: hostField,
  imapPort: portField,
  imapSecure: z.boolean(),
  fromName: fromNameField,
  dailyLimit: dailyLimitField,
  rampUp: z.boolean().default(true),
});

export const mailboxConnectionSchema = z.discriminatedUnion("provider", [googleMailboxSchema, smtpMailboxSchema]);
export type MailboxConnectionInput = z.infer<typeof mailboxConnectionSchema>;

export const mailboxUpdateSchema = z
  .object({
    fromName: z.string().trim().max(80).nullable().optional(),
    dailyLimit: z.coerce.number().int().min(1).max(MAILBOX_MAX_DAILY_LIMIT).optional(),
    rampUp: z.boolean().optional(),
    status: z.enum(["active", "paused"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update.");
export type MailboxUpdateInput = z.infer<typeof mailboxUpdateSchema>;

/** What gets encrypted at rest. */
export type MailboxSecret = {
  username: string;
  password: string;
  smtp: MailServer;
  imap: MailServer;
};

export function mailboxSecretFromInput(input: MailboxConnectionInput): MailboxSecret {
  if (input.provider === "google") {
    return { username: input.email, password: input.appPassword, smtp: mailboxPresets.google.smtp, imap: mailboxPresets.google.imap };
  }
  return {
    username: input.username ?? input.email,
    password: input.password,
    smtp: { host: input.smtpHost, port: input.smtpPort, secure: input.smtpSecure },
    imap: { host: input.imapHost, port: input.imapPort, secure: input.imapSecure },
  };
}

const dayMs = 86_400_000;

/**
 * New mailboxes start slow and climb daily until they reach their limit, which
 * is how a fresh inbox builds reputation without tripping spam filters.
 */
export function effectiveDailyCap(mailbox: { dailyLimit: number; rampUp: boolean; rampStartedAt: Date }, now = new Date()) {
  if (!mailbox.rampUp) return mailbox.dailyLimit;
  const days = Math.max(0, Math.floor((now.getTime() - mailbox.rampStartedAt.getTime()) / dayMs));
  return Math.min(mailbox.dailyLimit, RAMP_START_PER_DAY + RAMP_STEP_PER_DAY * days);
}

/** The date the ramp reaches the mailbox's full limit, or null once it has. */
export function rampCompletesOn(mailbox: { dailyLimit: number; rampUp: boolean; rampStartedAt: Date }, now = new Date()) {
  if (!mailbox.rampUp || effectiveDailyCap(mailbox, now) >= mailbox.dailyLimit) return null;
  const daysNeeded = Math.ceil((mailbox.dailyLimit - RAMP_START_PER_DAY) / RAMP_STEP_PER_DAY);
  return new Date(mailbox.rampStartedAt.getTime() + daysNeeded * dayMs);
}

export const sendingDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
    .pipe(z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, "Enter a domain like yourcompany.com.")),
  provider: z.enum(["google", "microsoft", "other"]).default("google"),
  dkimSelector: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{0,62}$/, "Enter the DKIM selector your provider gave you.")
    .optional(),
});
export type SendingDomainInput = z.infer<typeof sendingDomainSchema>;

export function defaultDkimSelector(provider: "google" | "microsoft" | "other") {
  return provider === "microsoft" ? "selector1" : provider === "google" ? "google" : "default";
}

export const emailTransportSchema = z.object({ emailTransport: z.enum(["auto", "mailboxes", "resend"]) });
