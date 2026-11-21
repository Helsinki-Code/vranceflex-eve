import { bannedPhrases, maxSubjectLength, maxWordsForStep } from "../domain/writing-rules";
import { findUnresolvedPlaceholders } from "./message-placeholders";

/**
 * The last check on outreach copy, run when a human approves it and again just
 * before it sends. Pure functions only: no database, no network.
 *
 * Two severities:
 *  - "block" problems stop approval and sending, because sending would be
 *    embarrassing or unsafe (leftover template slots, links to domains nobody
 *    vetted, text that quotes the agent's own instructions, a greeting for
 *    the wrong person).
 *  - "warn" problems are style advice shown to the reviewer; they never stop a
 *    send.
 */
export type GateSeverity = "block" | "warn";

export type GateIssue = {
  code:
    | "placeholder"
    | "foreign_link"
    | "instruction_echo"
    | "wrong_recipient"
    | "banned_phrase"
    | "too_long"
    | "subject_too_long"
    | "subject_shouting";
  severity: GateSeverity;
  message: string;
};

export type GateInput = {
  stepNumber: number;
  subject: string | null | undefined;
  subjectVariant?: string | null;
  content: string;
  /** Domains a link may point to, besides the recipient's own site. */
  allowedLinkDomains: string[];
  recipient?: { personName?: string | null; companyDomain?: string | null };
};

// Text that only appears when a model has echoed its own instructions or a
// planted prompt-injection string back into a draft.
const INSTRUCTION_ECHO = [
  /ignore (?:all |any |the )?(?:previous|prior|above|earlier) (?:instructions|messages|prompts)/i,
  /disregard (?:all |any |the )?(?:previous|prior|above|earlier) (?:instructions|messages|prompts)/i,
  /\bsystem prompt\b/i,
  /\bas an ai (?:language )?model\b/i,
  /\bi (?:am|'m) (?:just )?an ai\b/i,
  /\byou are (?:now )?(?:an? )?(?:ai|assistant|language model|llm)\b/i,
  /VRANCEFLEX_CAMPAIGN_EXECUTION|APPROVED_LEADS/,
  /<\/?(?:system|assistant|instructions?|untrusted[\w-]*)>/i,
  /\boutputSchema\b|\bsubagent\b/i,
];

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
// A bare domain such as "acme.io/demo" is also a link to a reader's eyes.
const BARE_DOMAIN_PATTERN = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ai|app|dev|so|me|us|uk|ca|de|fr|nl|in|au)(?:\/[^\s<>"')\]]*)?(?=[\s.,;:!?)]|$)/gi;
// File-like names that are not links.
const NOT_A_DOMAIN = /\.(?:js|ts|json|md|css|html|png|jpg|pdf|csv|docx?)$/i;

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sir", "madam"]);
const GENERIC_GREETINGS = new Set(["there", "team", "all", "everyone", "folks", "friend", "sir", "madam"]);

export function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/)[0];
}

function hostOf(link: string) {
  return normalizeDomain(link.replace(/[.,;:!?]+$/, ""));
}

function domainAllowed(host: string, allowed: Set<string>) {
  if (!host) return true;
  for (const domain of allowed) {
    if (host === domain || host.endsWith(`.${domain}`)) return true;
  }
  return false;
}

/** Every host that appears as a link in the text. */
export function extractLinkHosts(text: string) {
  const hosts = new Set<string>();
  for (const match of text.matchAll(URL_PATTERN)) hosts.add(hostOf(match[0]));
  const withoutUrls = text.replace(URL_PATTERN, " ");
  for (const match of withoutUrls.matchAll(BARE_DOMAIN_PATTERN)) {
    if (NOT_A_DOMAIN.test(match[0].split("/")[0])) continue;
    hosts.add(hostOf(match[0]));
  }
  hosts.delete("");
  return [...hosts];
}

function firstNameOf(personName: string) {
  const parts = personName
    .replace(/[,.]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !TITLES.has(part.toLowerCase()));
  return parts[0]?.toLowerCase() ?? "";
}

function greetingName(content: string) {
  const firstLine = content.trim().split(/\r?\n/, 1)[0] ?? "";
  // The greeting word is case-insensitive, but the name must start with a capital
  // so "hi so what…" is never read as a greeting for "So".
  const match = firstLine.match(/^(?:[Hh]i|[Hh]ello|[Hh]ey|[Dd]ear|[Mm]orning|[Gg]ood (?:[Mm]orning|[Aa]fternoon|[Ee]vening))[,\s]+(\p{Lu}[\p{L}'’-]*)/u);
  return match?.[1]?.toLowerCase() ?? null;
}

function namesAgree(greeted: string, actual: string) {
  if (!actual) return true;
  if (greeted === actual) return true;
  // "Alex" for "Alexander", "Kate" for "Katherine".
  const shorter = greeted.length <= actual.length ? greeted : actual;
  const longer = greeted.length <= actual.length ? actual : greeted;
  return shorter.length >= 3 && longer.startsWith(shorter);
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function checkOutreachContent(input: GateInput): GateIssue[] {
  const issues: GateIssue[] = [];
  const subjects = [input.subject, input.subjectVariant].filter((value): value is string => Boolean(value));
  const all = [...subjects, input.content].join("\n");
  const lower = all.toLowerCase();

  const placeholders = findUnresolvedPlaceholders(...subjects, input.content);
  if (placeholders.length) {
    issues.push({
      code: "placeholder",
      severity: "block",
      message: `Unfilled placeholders: ${placeholders.join(", ")}.`,
    });
  }

  const allowed = new Set(input.allowedLinkDomains.map(normalizeDomain).filter(Boolean));
  if (input.recipient?.companyDomain) allowed.add(normalizeDomain(input.recipient.companyDomain));
  const foreign = extractLinkHosts(all).filter((host) => !domainAllowed(host, allowed));
  if (foreign.length) {
    issues.push({
      code: "foreign_link",
      severity: "block",
      message: `Links to domains that haven't been approved: ${foreign.slice(0, 3).join(", ")}${foreign.length > 3 ? ", …" : ""}. Add trusted domains in Settings → Sending, or remove the link.`,
    });
  }

  if (INSTRUCTION_ECHO.some((pattern) => pattern.test(all))) {
    issues.push({
      code: "instruction_echo",
      severity: "block",
      message: "The copy quotes instructions or system text. Rewrite it before it can send.",
    });
  }

  const personName = input.recipient?.personName;
  if (personName) {
    const greeted = greetingName(input.content);
    const actual = firstNameOf(personName);
    if (greeted && !GENERIC_GREETINGS.has(greeted) && !namesAgree(greeted, actual)) {
      issues.push({
        code: "wrong_recipient",
        severity: "block",
        message: `The greeting says "${greeted[0].toUpperCase()}${greeted.slice(1)}" but this lead is ${personName}.`,
      });
    }
  }

  const phrases = bannedPhrases.filter((phrase) => lower.includes(phrase));
  if (phrases.length) {
    issues.push({
      code: "banned_phrase",
      severity: "warn",
      message: `Reads as templated: "${phrases.slice(0, 3).join('", "')}".`,
    });
  }

  const words = wordCount(input.content);
  const limit = maxWordsForStep(input.stepNumber);
  if (words > limit) {
    issues.push({
      code: "too_long",
      severity: "warn",
      message: `${words} words is long for step ${input.stepNumber}; aim for under ${limit}.`,
    });
  }

  if (subjects.some((subject) => subject.length > maxSubjectLength)) {
    issues.push({
      code: "subject_too_long",
      severity: "warn",
      message: `Subject lines over ${maxSubjectLength} characters get cut off.`,
    });
  }
  if (subjects.some((subject) => /[A-Z]{4,}/.test(subject) && subject === subject.toUpperCase())) {
    issues.push({
      code: "subject_shouting",
      severity: "warn",
      message: "An all-caps subject line looks like spam.",
    });
  }

  return issues;
}

export function blockingIssues(issues: GateIssue[]) {
  return issues.filter((issue) => issue.severity === "block");
}

/**
 * The domains a workspace's outreach may link to: the ones it lists in
 * settings plus the website the campaign was built from.
 */
export function allowedLinkDomains(input: { linkDomains: string[]; campaignSource: unknown }) {
  const domains = new Set(input.linkDomains.map(normalizeDomain).filter(Boolean));
  const url = (input.campaignSource as { url?: unknown } | null)?.url;
  if (typeof url === "string" && url.trim()) domains.add(normalizeDomain(url));
  return [...domains];
}
