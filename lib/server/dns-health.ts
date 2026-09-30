import { Resolver } from "node:dns/promises";
import type { DnsRecordCheck, DomainMailProvider, MailReceiver } from "./database/schema";

/** Minimal resolver surface so tests can inject one. */
export type DnsLookup = {
  resolveMx(hostname: string): Promise<{ exchange: string; priority: number }[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
  resolveCname(hostname: string): Promise<string[]>;
};

function publicResolver(): DnsLookup {
  // Ask public resolvers directly so a fix shows up as soon as it propagates,
  // not when a local cache expires.
  const resolver = new Resolver({ timeout: 4_000, tries: 2 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  return resolver;
}

const providerRules = {
  google: { spfInclude: "_spf.google.com", mxPattern: /(^|\.)google(mail)?\.com\.?$/i, mxLabel: "Google (smtp.google.com)" },
  microsoft: { spfInclude: "spf.protection.outlook.com", mxPattern: /\.mail\.protection\.outlook\.com\.?$/i, mxLabel: "Microsoft 365 (*.mail.protection.outlook.com)" },
  other: { spfInclude: null, mxPattern: null, mxLabel: null },
} as const;

const receivers: Array<{ pattern: RegExp; receiver: MailReceiver }> = [
  { pattern: /(^|\.)google(mail)?\.com\.?$/i, receiver: { key: "google", label: "Google Workspace", canSend: true } },
  { pattern: /\.mail\.protection\.outlook\.com\.?$/i, receiver: { key: "microsoft", label: "Microsoft 365", canSend: true } },
  { pattern: /(^|\.)zoho\.(com|eu|in|com\.au|jp)\.?$/i, receiver: { key: "zoho", label: "Zoho Mail", canSend: true } },
  { pattern: /(^|\.)messagingengine\.com\.?$/i, receiver: { key: "fastmail", label: "Fastmail", canSend: true } },
  { pattern: /(^|\.)protonmail\.ch\.?$/i, receiver: { key: "proton", label: "Proton Mail", canSend: true } },
  { pattern: /\.mx\.cloudflare\.net\.?$/i, receiver: { key: "cloudflare_routing", label: "Cloudflare Email Routing (forward-only)", canSend: false } },
];

/** Who receives this domain's mail, judged from its MX hosts. */
export function detectMailProvider(mxHosts: string[]): MailReceiver {
  if (!mxHosts.length) return { key: "none", label: "No mail server", canSend: false };
  for (const { pattern, receiver } of receivers) {
    if (mxHosts.some((host) => pattern.test(host))) return receiver;
  }
  return { key: "other", label: mxHosts[0]!.replace(/\.$/, ""), canSend: true };
}

/** Selectors mail providers commonly publish DKIM keys under. */
export const commonDkimSelectors = [
  "google",
  "selector1",
  "selector2",
  "cf2024-1",
  "zmail",
  "fm1",
  "fm2",
  "fm3",
  "resend",
  "default",
  "dkim",
  "mail",
  "k1",
  "k2",
  "s1",
  "s2",
  "protonmail",
  "protonmail2",
];

export type ExpectedRecord = { kind: DnsRecordCheck["kind"]; type: "MX" | "TXT" | "CNAME"; host: string; value: string; note?: string };

/** The records a customer pastes into their DNS provider. `@` is the domain root. */
export function expectedRecords(domain: string, provider: DomainMailProvider, selector: string, receiver?: MailReceiver): ExpectedRecord[] {
  const records: ExpectedRecord[] = [];
  if (provider === "google") {
    records.push({ kind: "mx", type: "MX", host: "@", value: "1 smtp.google.com", note: "Google's single MX record for Workspace. Remove other MX records." });
    records.push({ kind: "spf", type: "TXT", host: "@", value: "v=spf1 include:_spf.google.com ~all", note: "Only one SPF record per domain; replace the existing one rather than adding a second." });
    records.push({ kind: "dkim", type: "TXT", host: "google._domainkey", value: "v=DKIM1; k=rsa; p=… (copy from Google Admin → Apps → Google Workspace → Gmail → Authenticate email)", note: "Generate the key in Google Admin, add it here, then click Start authentication there." });
  } else if (provider === "microsoft") {
    const tenant = domain.replace(/\./g, "-");
    records.push({ kind: "mx", type: "MX", host: "@", value: `0 ${tenant}.mail.protection.outlook.com` });
    records.push({ kind: "spf", type: "TXT", host: "@", value: "v=spf1 include:spf.protection.outlook.com -all", note: "Only one SPF record per domain; replace the existing one rather than adding a second." });
    records.push({ kind: "dkim", type: "CNAME", host: "selector1._domainkey", value: "Copy from Microsoft Defender → Email authentication → DKIM", note: "Add both selector1 and selector2, then enable DKIM signing in Defender." });
  } else if (receiver?.key === "cloudflare_routing" || receiver?.key === "none") {
    // Nothing on this domain can send yet; records only make sense once a mailbox provider is chosen.
    records.push({
      kind: "mx",
      type: "MX",
      host: "@",
      value: "Your mailbox provider's MX (e.g. 1 smtp.google.com for Google Workspace)",
      note: receiver.key === "cloudflare_routing"
        ? "Cloudflare Email Routing only forwards mail. To send from this domain, sign up for Google Workspace or Zoho Mail, then replace the Cloudflare MX and SPF records with theirs."
        : "Sign up for a mailbox provider (Google Workspace, Zoho Mail) and add the MX records it gives you.",
    });
    records.push({ kind: "spf", type: "TXT", host: "@", value: "v=spf1 include:<your mailbox provider> ~all", note: "Google Workspace: include:_spf.google.com · Zoho: include:zoho.com" });
    records.push({ kind: "dkim", type: "TXT", host: "<selector>._domainkey", value: "v=DKIM1; k=rsa; p=… (your mailbox provider generates this)" });
  } else {
    const where = receiver?.key === "zoho"
      ? "Zoho Mail Admin → Domains → Email Configuration → DKIM"
      : receiver?.key === "fastmail"
        ? "Fastmail → Settings → Domains (three fm CNAME records)"
        : "your mail provider's DKIM or domain authentication page";
    records.push({ kind: "mx", type: "MX", host: "@", value: "Your mail provider's MX host" });
    records.push({ kind: "spf", type: "TXT", host: "@", value: receiver?.key === "zoho" ? "v=spf1 include:zoho.com ~all" : "v=spf1 include:<your provider> ~all" });
    records.push({ kind: "dkim", type: "TXT", host: `${selector}._domainkey`, value: `v=DKIM1; k=rsa; p=… (copy from ${where})` });
  }
  records.push({ kind: "dmarc", type: "TXT", host: "_dmarc", value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`, note: "Start at p=none; move to quarantine once reports look clean." });
  return records;
}

function isNotFound(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "ENOTIMP" || code === "NXDOMAIN";
}

async function safe<T>(lookup: () => Promise<T>, empty: T): Promise<{ value: T; error: string | null }> {
  try {
    return { value: await lookup(), error: null };
  } catch (error) {
    if (isNotFound(error)) return { value: empty, error: null };
    return { value: empty, error: (error as { code?: string }).code ?? "lookup failed" };
  }
}

const joinTxt = (records: string[][]) => records.map((chunks) => chunks.join(""));

export function checkMx(found: { exchange: string; priority: number }[], provider: DomainMailProvider): DnsRecordCheck {
  const hosts = [...found].sort((a, b) => a.priority - b.priority).map((record) => record.exchange.toLowerCase());
  const receiver = detectMailProvider(hosts);
  if (!hosts.length) return { kind: "mx", status: "fail", summary: "No MX record, so this domain can't receive replies.", found: [], receiver };
  if (receiver.key === "cloudflare_routing") {
    return { kind: "mx", status: "warn", summary: "Mail goes to Cloudflare Email Routing, which only forwards incoming mail. It can't send outreach, so there's no mailbox on this domain to connect yet.", found: hosts, receiver };
  }
  const rule = providerRules[provider];
  if (rule.mxPattern && !hosts.some((host) => rule.mxPattern!.test(host))) {
    return { kind: "mx", status: "warn", summary: `MX points at ${receiver.label}, not ${rule.mxLabel}. Replies may land somewhere else.`, found: hosts, receiver };
  }
  return { kind: "mx", status: "pass", summary: `Mail for this domain is handled by ${receiver.label}.`, found: hosts, receiver };
}

export function checkSpf(txt: string[], provider: DomainMailProvider, receiver?: MailReceiver): DnsRecordCheck {
  const spf = txt.filter((value) => /^v=spf1(\s|$)/i.test(value.trim()));
  if (!spf.length) return { kind: "spf", status: "fail", summary: "No SPF record. Receivers can't tell which servers may send for this domain.", found: [] };
  if (spf.length > 1) return { kind: "spf", status: "fail", summary: "More than one SPF record. Merge them into one; multiple records make SPF fail everywhere.", found: spf };
  const record = spf[0]!.toLowerCase();
  const include = providerRules[provider].spfInclude;
  if (include && !record.includes(`include:${include}`)) {
    return { kind: "spf", status: "fail", summary: `SPF doesn't include ${include}, so mail from your mailbox fails SPF.`, found: spf };
  }
  if (/\+all\b/.test(record)) return { kind: "spf", status: "fail", summary: "SPF ends in +all, which lets anyone send as you. Use ~all or -all.", found: spf };
  if (!/[~-]all\b/.test(record)) return { kind: "spf", status: "warn", summary: "SPF should end in ~all or -all.", found: spf };
  if (receiver?.key === "cloudflare_routing" && /_spf\.mx\.cloudflare\.net/.test(record)) {
    return { kind: "spf", status: "warn", summary: "SPF only authorises Cloudflare's forwarding service. Once you pick a mailbox provider, replace it with theirs.", found: spf };
  }
  return { kind: "spf", status: "pass", summary: include ? "SPF authorises your mailbox provider." : "SPF record is valid.", found: spf };
}

export function checkDkim(txt: string[], cname: string[], selector: string): DnsRecordCheck {
  if (cname.length) return { kind: "dkim", status: "pass", summary: `DKIM key found at ${selector}._domainkey (delegated to your provider).`, found: cname, selector };
  const keys = txt.filter((value) => /(^|;)\s*p=[A-Za-z0-9+/=]{20,}/.test(value) || /v=DKIM1/i.test(value));
  if (!keys.length) return { kind: "dkim", status: "fail", summary: "No DKIM key found under any common selector. Without it Gmail and Yahoo treat bulk mail as unauthenticated.", found: [], selector };
  if (keys.some((value) => /(^|;)\s*p=\s*(;|$)/.test(value))) return { kind: "dkim", status: "fail", summary: `The DKIM key at ${selector}._domainkey is empty (revoked).`, found: keys, selector };
  return { kind: "dkim", status: "pass", summary: `DKIM key found at ${selector}._domainkey.`, found: keys.map((value) => (value.length > 80 ? `${value.slice(0, 77)}…` : value)), selector };
}

export function checkDmarc(txt: string[]): DnsRecordCheck {
  const dmarc = txt.filter((value) => /^v=DMARC1/i.test(value.trim()));
  if (!dmarc.length) return { kind: "dmarc", status: "fail", summary: "No DMARC record. Gmail and Yahoo require one from bulk senders.", found: [] };
  if (dmarc.length > 1) return { kind: "dmarc", status: "fail", summary: "More than one DMARC record; receivers ignore both.", found: dmarc };
  const policy = dmarc[0]!.match(/\bp=(\w+)/i)?.[1]?.toLowerCase();
  if (!policy) return { kind: "dmarc", status: "warn", summary: "DMARC is missing a p= policy.", found: dmarc };
  return { kind: "dmarc", status: "pass", summary: policy === "none" ? "DMARC published (monitoring only, p=none)." : `DMARC published (p=${policy}).`, found: dmarc };
}

export type DomainHealth = {
  checks: DnsRecordCheck[];
  status: "verified" | "partial" | "unverified";
  receiver: MailReceiver;
  /** Where the DKIM key actually lives; saved so later checks look there first. */
  dkimSelector: string;
  /** The provider rules used: an "other" domain whose MX is Google is checked as Google. */
  provider: DomainMailProvider;
};

export function summarizeHealth(checks: DnsRecordCheck[]): DomainHealth["status"] {
  if (checks.every((check) => check.status === "pass")) return "verified";
  return checks.some((check) => check.status === "pass") ? "partial" : "unverified";
}

async function discoverDkim(domain: string, preferred: string, dns: DnsLookup) {
  const selectors = [...new Set([preferred, ...commonDkimSelectors])];
  const lookups = await Promise.all(
    selectors.map(async (selector) => {
      const host = `${selector}._domainkey.${domain}`;
      const [txt, cname] = await Promise.all([safe(() => dns.resolveTxt(host), [] as string[][]), safe(() => dns.resolveCname(host), [] as string[])]);
      return { selector, txt: joinTxt(txt.value), cname: cname.value, error: txt.error && cname.error };
    }),
  );
  const found = lookups.find((lookup) => lookup.cname.length || lookup.txt.some((value) => /v=DKIM1|(^|;)\s*p=/i.test(value)));
  const primary = lookups[0]!;
  return found ?? { ...primary, error: lookups.every((lookup) => lookup.error) ? primary.error : null };
}

export async function checkDomainHealth(
  domain: string,
  provider: DomainMailProvider,
  selector: string,
  dns: DnsLookup = publicResolver(),
): Promise<DomainHealth> {
  const [mx, rootTxt, dkim, dmarcTxt] = await Promise.all([
    safe(() => dns.resolveMx(domain), []),
    safe(() => dns.resolveTxt(domain), [] as string[][]),
    discoverDkim(domain, selector, dns),
    safe(() => dns.resolveTxt(`_dmarc.${domain}`), [] as string[][]),
  ]);
  const receiver = detectMailProvider(mx.value.map((record) => record.exchange.toLowerCase()));
  const effective: DomainMailProvider = provider === "other" && (receiver.key === "google" || receiver.key === "microsoft") ? receiver.key : provider;
  const lookupFailed = (error: string | null, kind: DnsRecordCheck["kind"]): DnsRecordCheck | null =>
    error ? { kind, status: "warn", summary: `DNS lookup failed (${error}). Try again in a minute.`, found: [] } : null;
  const checks = [
    lookupFailed(mx.error, "mx") ?? checkMx(mx.value, effective),
    lookupFailed(rootTxt.error, "spf") ?? checkSpf(joinTxt(rootTxt.value), effective, receiver),
    lookupFailed(dkim.error, "dkim") ?? checkDkim(dkim.txt, dkim.cname, dkim.selector),
    lookupFailed(dmarcTxt.error, "dmarc") ?? checkDmarc(joinTxt(dmarcTxt.value)),
  ];
  const foundSelector = checks[2]!.status === "pass" ? dkim.selector : selector;
  return { checks, status: summarizeHealth(checks), receiver, dkimSelector: foundSelector, provider: effective };
}
