import MailComposer from "nodemailer/lib/mail-composer";
import SMTPConnection from "nodemailer/lib/smtp-connection";
import type { MailboxSecret, MailServer } from "../domain/mailboxes";

export class MailboxDeliveryError extends Error {
  constructor(
    message: string,
    readonly options: {
      /** Worth retrying later (4xx, network trouble before the message went out). */
      retryable: boolean;
      /** The provider may have accepted the message; never replay automatically. */
      ambiguous?: boolean;
      /** The mailbox's credentials were rejected; take it out of rotation. */
      authFailed?: boolean;
      responseCode?: number;
    },
  ) {
    super(message);
  }
  get retryable() { return this.options.retryable; }
  get ambiguous() { return Boolean(this.options.ambiguous); }
  get authFailed() { return Boolean(this.options.authFailed); }
}

type SmtpError = Error & { code?: string; command?: string; responseCode?: number; response?: string };

const timeouts = { connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 30_000 };

function connectionFor(server: MailServer) {
  return new SMTPConnection({
    host: server.host,
    port: server.port,
    secure: server.secure,
    // Port 587 upgrades with STARTTLS; never send credentials in the clear.
    requireTLS: !server.secure,
    name: "vranceflex.mail",
    ...timeouts,
  });
}

function describe(error: SmtpError) {
  const detail = (error.response ?? error.message ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return detail || "The mail server rejected the request.";
}

/** Plain-language explanation for a rejected login, specific to Google where we can be. */
export function authFailureMessage(server: MailServer, error?: SmtpError) {
  if (/gmail\.com$/i.test(server.host)) {
    return "Google rejected this App Password. Turn on 2-Step Verification for the account, create an App Password at myaccount.google.com/apppasswords, and paste the 16 letters.";
  }
  return `The mail server rejected this username or password${error ? ` (${describe(error)})` : ""}.`;
}

/**
 * Classifies a failure by the phase it happened in. Anything before the
 * envelope is accepted is safe to retry; a dropped connection while the
 * message body is in flight might still have been delivered.
 */
export function classifySmtpError(error: SmtpError, phase: "connect" | "login" | "send", server: MailServer): MailboxDeliveryError {
  const code = error.responseCode;
  if (phase === "login" || error.code === "EAUTH") {
    return new MailboxDeliveryError(authFailureMessage(server, error), { retryable: true, authFailed: true, responseCode: code });
  }
  if (typeof code === "number" && code >= 400) {
    return new MailboxDeliveryError(`${code >= 500 ? "Rejected" : "Deferred"} by the mail server: ${describe(error)}`, {
      retryable: code < 500,
      responseCode: code,
    });
  }
  if (phase === "send" && error.code !== "EENVELOPE" && error.code !== "EMESSAGE") {
    return new MailboxDeliveryError(`The connection dropped while sending; the email may have gone out. ${describe(error)}`, {
      retryable: false,
      ambiguous: true,
    });
  }
  if (error.code === "EENVELOPE" || error.code === "EMESSAGE") {
    return new MailboxDeliveryError(describe(error), { retryable: false });
  }
  return new MailboxDeliveryError(`Couldn't reach ${server.host}: ${describe(error)}`, { retryable: true });
}

function step<T = void>(run: (done: (error?: SmtpError | null, value?: T) => void) => void) {
  return new Promise<T>((resolve, reject) => run((error, value) => (error ? reject(error) : resolve(value as T))));
}

/** Connects and logs in, then hangs up. Used to validate a mailbox on connect. */
export async function verifySmtp(secret: Pick<MailboxSecret, "smtp" | "username" | "password">) {
  const connection = connectionFor(secret.smtp);
  let phase: "connect" | "login" = "connect";
  try {
    await step((done) => connection.connect((error) => done(error)));
    phase = "login";
    await step((done) => connection.login({ user: secret.username, pass: secret.password }, (error) => done(error)));
  } catch (error) {
    throw classifySmtpError(error as SmtpError, phase, secret.smtp);
  } finally {
    try { connection.quit(); } catch { connection.close(); }
  }
}

export type MailboxMessage = {
  fromEmail: string;
  fromName?: string | null;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Without angle brackets, e.g. vf-<uuid>@example.com */
  messageId: string;
  /** Message-ID of the first email in the thread, for follow-ups. */
  inReplyTo?: string | null;
  headers?: Record<string, string>;
};

export function rfcMessageId(outreachMessageId: string, fromEmail: string) {
  const domain = fromEmail.split("@")[1]?.toLowerCase() || "vranceflex.mail";
  return `vf-${outreachMessageId}@${domain}`;
}

/** Pulls the outreach message id back out of a Message-ID we generated. */
export function outreachIdFromRfcMessageId(value: string) {
  return value.match(/vf-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i)?.[1]?.toLowerCase() ?? null;
}

export async function composeMailboxMessage(message: MailboxMessage) {
  const bracket = (id: string) => `<${id.replace(/^<|>$/g, "")}>`;
  const composer = new MailComposer({
    from: message.fromName ? { name: message.fromName, address: message.fromEmail } : message.fromEmail,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    messageId: bracket(message.messageId),
    ...(message.inReplyTo ? { inReplyTo: bracket(message.inReplyTo), references: [bracket(message.inReplyTo)] } : {}),
    headers: message.headers,
  });
  return composer.compile().build();
}

export async function sendViaMailbox(secret: MailboxSecret, message: MailboxMessage) {
  const raw = await composeMailboxMessage(message);
  const connection = connectionFor(secret.smtp);
  let phase: "connect" | "login" | "send" = "connect";
  try {
    await step((done) => connection.connect((error) => done(error)));
    phase = "login";
    await step((done) => connection.login({ user: secret.username, pass: secret.password }, (error) => done(error)));
    phase = "send";
    const info = await step<{ accepted: string[]; rejected: string[]; response: string }>((done) =>
      connection.send({ from: message.fromEmail, to: [message.to] }, raw, (error, value) => done(error, value)),
    );
    if (!info.accepted.length) {
      throw new MailboxDeliveryError(`The mail server refused the recipient: ${info.response}`, { retryable: false });
    }
    return { providerMessageId: message.messageId, raw, response: info.response };
  } catch (error) {
    if (error instanceof MailboxDeliveryError) throw error;
    throw classifySmtpError(error as SmtpError, phase, secret.smtp);
  } finally {
    try { connection.quit(); } catch { connection.close(); }
  }
}
