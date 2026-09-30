import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import type { MailboxSecret } from "../domain/mailboxes";
import { authFailureMessage, MailboxDeliveryError, outreachIdFromRfcMessageId } from "./mailbox-smtp";

type ImapError = Error & { authenticationFailed?: boolean; responseText?: string; code?: string };

export function imapClient(secret: Pick<MailboxSecret, "imap" | "username" | "password">) {
  return new ImapFlow({
    host: secret.imap.host,
    port: secret.imap.port,
    secure: secret.imap.secure,
    auth: { user: secret.username, pass: secret.password },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    disableAutoIdle: true,
  });
}

function imapFailure(error: unknown, secret: Pick<MailboxSecret, "imap">) {
  const failure = error as ImapError;
  if (failure?.authenticationFailed) {
    return new MailboxDeliveryError(authFailureMessage({ ...secret.imap, host: secret.imap.host.replace(/^imap\./, "smtp.") }), { retryable: true, authFailed: true });
  }
  const detail = (failure?.responseText ?? failure?.message ?? "connection failed").slice(0, 200);
  return new MailboxDeliveryError(`Couldn't read the inbox at ${secret.imap.host}: ${detail}`, { retryable: true });
}

async function withClient<T>(secret: Pick<MailboxSecret, "imap" | "username" | "password">, run: (client: ImapFlow) => Promise<T>, budgetMs = 25_000) {
  const client = imapClient(secret);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await client.connect();
        return run(client);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${budgetMs / 1000}s`)), budgetMs);
      }),
    ]);
  } catch (error) {
    throw error instanceof MailboxDeliveryError ? error : imapFailure(error, secret);
  } finally {
    clearTimeout(timer);
    await client.logout().catch(() => client.close());
  }
}

/** Logs in and records where the inbox currently ends, so old mail is never imported. */
export async function verifyImap(secret: Pick<MailboxSecret, "imap" | "username" | "password">) {
  return withClient(secret, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("INBOX could not be opened");
      return { uidValidity: Number(mailbox.uidValidity), lastUid: Math.max(0, mailbox.uidNext - 1) };
    } finally {
      lock.release();
    }
  });
}

/** Generic SMTP servers don't keep a copy; put one in Sent so the mailbox shows what went out. */
export async function appendToSent(secret: MailboxSecret, raw: Buffer) {
  await withClient(secret, async (client) => {
    const folders = await client.list();
    const sent = folders.find((folder) => folder.specialUse === "\\Sent");
    if (sent) await client.append(sent.path, raw, ["\\Seen"]);
  }, 15_000);
}

// ---- Matching ---------------------------------------------------------------

export function headerValues(raw: Buffer | undefined, name: string) {
  if (!raw) return [] as string[];
  const unfolded = raw.toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  const pattern = new RegExp(`^${name}:\\s*(.*)$`, "gim");
  return [...unfolded.matchAll(pattern)].map((match) => match[1]!.trim());
}

/** Finds our outreach message id in In-Reply-To / References / the envelope. */
export function replyTargetFromHeaders(input: { inReplyTo?: string | null; references?: string[] }) {
  for (const value of [input.inReplyTo ?? "", ...(input.references ?? [])]) {
    for (const id of value.split(/\s+/)) {
      const match = outreachIdFromRfcMessageId(id);
      if (match) return match;
    }
  }
  return null;
}

const bounceSenders = /^(mailer-daemon|postmaster|mail-daemon|mail delivery (sub)?system)\b/i;

export function looksLikeBounce(from: string | undefined, subject: string | undefined, contentType?: string) {
  return (
    /multipart\/report/i.test(contentType ?? "") ||
    bounceSenders.test((from ?? "").split("@")[0] ?? "") ||
    /^(undeliverable|undelivered mail|delivery status notification \(failure\)|mail delivery failed|returned mail)/i.test(subject ?? "")
  );
}

/** Pulls the outreach id and the SMTP status out of a delivery status notification. */
export function parseBounce(raw: string) {
  const outreachId = outreachIdFromRfcMessageId(raw);
  if (!outreachId) return null;
  const status = raw.match(/^Status:\s*([245])\.(\d{1,3})\.(\d{1,3})/im) ?? raw.match(/\b([45])\.(\d)\.(\d{1,3})\b/);
  const diagnostic = raw.match(/^Diagnostic-Code:\s*(?:smtp;\s*)?(.+)$/im)?.[1]?.trim();
  // Delayed-delivery notices (4.x.x) are not bounces.
  if (status?.[1] === "4" || status?.[1] === "2") return null;
  return {
    outreachId,
    hard: status ? status[1] === "5" : /does not exist|no such user|user unknown|address rejected|mailbox unavailable/i.test(raw),
    diagnostic: diagnostic?.slice(0, 300) ?? null,
  };
}

// ---- Polling ----------------------------------------------------------------

export type InboxItem =
  | { kind: "reply"; uid: number; outreachId: string; parsed: ParsedMail; headerMessageId: string | null }
  | { kind: "bounce"; uid: number; outreachId: string; hard: boolean; diagnostic: string | null };

export type InboxScan = { uidValidity: number; lastUid: number; items: InboxItem[]; reset: boolean };

const maxPerPoll = 200;
const maxSourceBytes = 1_500_000;

/**
 * Reads new INBOX messages since `lastUid`. Only messages that thread onto one
 * of our sends (or bounce one) are downloaded in full; everything else in the
 * customer's inbox is skipped after reading its headers.
 */
export async function scanInbox(secret: MailboxSecret, state: { uidValidity: number | null; lastUid: number | null }): Promise<InboxScan> {
  return withClient(secret, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("INBOX could not be opened");
      const uidValidity = Number(mailbox.uidValidity);
      const newest = Math.max(0, mailbox.uidNext - 1);
      if (state.uidValidity !== uidValidity || state.lastUid === null) {
        return { uidValidity, lastUid: newest, items: [], reset: true };
      }
      if (newest <= state.lastUid) return { uidValidity, lastUid: state.lastUid, items: [], reset: false };

      const headers: FetchMessageObject[] = [];
      for await (const message of client.fetch(`${state.lastUid + 1}:*`, { uid: true, envelope: true, headers: ["references", "in-reply-to", "content-type"] }, { uid: true })) {
        if (message.uid > state.lastUid) headers.push(message);
        if (headers.length >= maxPerPoll) break;
      }
      headers.sort((a, b) => a.uid - b.uid);

      const items: InboxItem[] = [];
      for (const message of headers) {
        const references = headerValues(message.headers, "references");
        const inReplyTo = message.envelope?.inReplyTo ?? headerValues(message.headers, "in-reply-to")[0] ?? null;
        const from = message.envelope?.from?.[0]?.address;
        const subject = message.envelope?.subject;
        const target = replyTargetFromHeaders({ inReplyTo, references });
        const bounce = looksLikeBounce(from, subject, headerValues(message.headers, "content-type")[0]);
        if (!target && !bounce) continue;
        const full = await client.fetchOne(String(message.uid), { source: { maxLength: maxSourceBytes } }, { uid: true });
        const source = full ? full.source : undefined;
        if (!source) continue;
        if (bounce) {
          const parsedBounce = parseBounce(source.toString("utf8"));
          if (parsedBounce) items.push({ kind: "bounce", uid: message.uid, ...parsedBounce });
          continue;
        }
        items.push({ kind: "reply", uid: message.uid, outreachId: target!, parsed: await simpleParser(source), headerMessageId: message.envelope?.messageId ?? null });
      }
      const lastUid = headers.length ? headers[headers.length - 1]!.uid : newest;
      return { uidValidity, lastUid: headers.length >= maxPerPoll ? lastUid : Math.max(lastUid, newest), items, reset: false };
    } finally {
      lock.release();
    }
  });
}

/** Strips the quoted original from a reply so classification sees only what they wrote. */
export function replyBody(parsed: ParsedMail) {
  const text = parsed.text ?? "";
  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex((line) => /^On .+wrote:\s*$/i.test(line.trim()) || /^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim()) || /^From:\s.+/i.test(line.trim()));
  const body = (cut > 0 ? lines.slice(0, cut) : lines).filter((line) => !line.startsWith(">")).join("\n").trim();
  return body || text.trim();
}
