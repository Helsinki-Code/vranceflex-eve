import { Resolver } from "node:dns/promises";
import type { DnsRecordCheck, DomainMailProvider } from "./database/schema";

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

export type ExpectedRecord = { kind: DnsRecordCheck["kind"]; type: "MX" | "TXT" | "CNAME"; host: string; value: string; note?: string };

/** The records a customer pastes into their DNS provider. `@` is the domain root. */
export function expectedRecords(domain: string, provider: DomainMailProvider, selector: string): ExpectedRecord[] {
  const records: ExpectedRecord[] = [];
  if (provider === "google") {
    records.push({ kind: "mx", type: "MX", host: "@", value: "1 smtp.google.com", note: "Google's single MX record for Workspace." });
    records.push({ kind: "spf", type: "TXT", host: "@", value: "v=spf1 include:_spf.google.com ~all", note: "Only one SPF record per domain; merge includes if you already have one." });
    records.push({ kind: "dkim", type: "TXT", host: `${selector}._domainkey`, value: "v=DKIM1; k=rsa; p=… (copy from Google Admin → Apps → Gmail → Authenticate email)", note: "Generate the key in Google Admin, add it here, then click Start authentication there." });
  } else if (provider === "microsoft") {
    const tenant = domain.replace(/\./g, "-");
    records.push({ kind: "mx", type: "MX", host: "@", value: `0 ${tenant}.mail.protection.outlook.com` });
    records.push({ kind: "spf", type: "TXT", host: "@", value: "v=spf1 include:spf.protection.outlook.com -all", note: "Only one SPF record per domain; merge includes if you already have one." });
    records.push({ kind: "dkim", type: "CNAME", host: "selector1._domainkey", value: "Copy from Microsoft Defender → Email authentication → DKIM", note: "Add both selector1 and selector2, then enable DKIM signing in Defender." });
  } else {
    records.push({ kind: "mx", type: "MX", host: "@", value: "Your mail provider's MX host" });
    records.push({ kind: "spf", type: "TXT", host: "@", value: "v=spf1 include:<your provider> ~all" });
    records.push({ kind: "dkim", type: "TXT", host: `${selector}._domainkey`, value: "v=DKIM1; k=rsa; p=… (from your provider)" });
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
  if (!hosts.length) return { kind: "mx", status: "fail", summary: "No MX record, so replies to this domain can't be delivered.", found: [] };
  const rule = providerRules[provider];
  if (rule.mxPattern && !hosts.some((host) => rule.mxPattern!.test(host))) {
    return { kind: "mx", status: "warn", summary: `MX doesn't point at ${rule.mxLabel}. Replies may land somewhere else.`, found: hosts };
  }
  return { kind: "mx", status: "pass", summary: "Mail for this domain is routed correctly.", found: hosts };
}

export function checkSpf(txt: string[], provider: DomainMailProvider): DnsRecordCheck {
  const spf = txt.filter((value) => /^v=spf1(\s|$)/i.test(value.trim()));
  if (!spf.length) return { kind: "spf", status: "fail", summary: "No SPF record. Receivers can't tell your mailbox provider may send for this domain.", found: [] };
  if (spf.length > 1) return { kind: "spf", status: "fail", summary: "More than one SPF record. Merge them into one; multiple records make SPF fail everywhere.", found: spf };
  const record = spf[0]!.toLowerCase();
  const include = providerRules[provider].spfInclude;
  if (include && !record.includes(`include:${include}`)) {
    return { kind: "spf", status: "fail", summary: `SPF doesn't include ${include}, so mail from your mailbox fails SPF.`, found: spf };
  }
  if (/\+all\b/.test(record)) return { kind: "spf", status: "fail", summary: "SPF ends in +all, which lets anyone send as you. Use ~all or -all.", found: spf };
  if (!/[~-]all\b/.test(record)) return { kind: "spf", status: "warn", summary: "SPF should end in ~all or -all.", found: spf };
  return { kind: "spf", status: "pass", summary: "SPF authorises your mailbox provider.", found: spf };
}

export function checkDkim(txt: string[], cname: string[], selector: string): DnsRecordCheck {
  if (cname.length) return { kind: "dkim", status: "pass", summary: `DKIM selector "${selector}" is delegated to your provider.`, found: cname };
  const keys = txt.filter((value) => /(^|;)\s*p=[A-Za-z0-9+/=]{20,}/.test(value) || /v=DKIM1/i.test(value));
  if (!keys.length) return { kind: "dkim", status: "fail", summary: `No DKIM key at ${selector}._domainkey. Without it Gmail and Yahoo treat bulk mail as unauthenticated.`, found: [] };
  if (keys.some((value) => /(^|;)\s*p=\s*(;|$)/.test(value))) return { kind: "dkim", status: "fail", summary: "The DKIM key is empty (revoked).", found: keys };
  return { kind: "dkim", status: "pass", summary: "DKIM signing key published.", found: keys.map((value) => (value.length > 80 ? `${value.slice(0, 77)}…` : value)) };
}

export function checkDmarc(txt: string[]): DnsRecordCheck {
  const dmarc = txt.filter((value) => /^v=DMARC1/i.test(value.trim()));
  if (!dmarc.length) return { kind: "dmarc", status: "fail", summary: "No DMARC record. Gmail and Yahoo require one from bulk senders.", found: [] };
  if (dmarc.length > 1) return { kind: "dmarc", status: "fail", summary: "More than one DMARC record; receivers ignore both.", found: dmarc };
  const policy = dmarc[0]!.match(/\bp=(\w+)/i)?.[1]?.toLowerCase();
  if (!policy) return { kind: "dmarc", status: "warn", summary: "DMARC is missing a p= policy.", found: dmarc };
  return { kind: "dmarc", status: "pass", summary: policy === "none" ? "DMARC published (monitoring only, p=none)." : `DMARC published (p=${policy}).`, found: dmarc };
}

export type DomainHealth = { checks: DnsRecordCheck[]; status: "verified" | "partial" | "unverified" };

export function summarizeHealth(checks: DnsRecordCheck[]): DomainHealth["status"] {
  if (checks.every((check) => check.status === "pass")) return "verified";
  // SPF + DKIM are what actually authenticates mail.
  const authenticated = checks.filter((check) => (check.kind === "spf" || check.kind === "dkim") && check.status === "pass").length === 2;
  return authenticated || checks.some((check) => check.status === "pass") ? "partial" : "unverified";
}

export async function checkDomainHealth(
  domain: string,
  provider: DomainMailProvider,
  selector: string,
  dns: DnsLookup = publicResolver(),
): Promise<DomainHealth> {
  const dkimHost = `${selector}._domainkey.${domain}`;
  const [mx, rootTxt, dkimTxt, dkimCname, dmarcTxt] = await Promise.all([
    safe(() => dns.resolveMx(domain), []),
    safe(() => dns.resolveTxt(domain), [] as string[][]),
    safe(() => dns.resolveTxt(dkimHost), [] as string[][]),
    safe(() => dns.resolveCname(dkimHost), [] as string[]),
    safe(() => dns.resolveTxt(`_dmarc.${domain}`), [] as string[][]),
  ]);
  const lookupFailed = (error: string | null, kind: DnsRecordCheck["kind"]): DnsRecordCheck | null =>
    error ? { kind, status: "warn", summary: `DNS lookup failed (${error}). Try again in a minute.`, found: [] } : null;
  const checks = [
    lookupFailed(mx.error, "mx") ?? checkMx(mx.value, provider),
    lookupFailed(rootTxt.error, "spf") ?? checkSpf(joinTxt(rootTxt.value), provider),
    lookupFailed(dkimTxt.error && dkimCname.error, "dkim") ?? checkDkim(joinTxt(dkimTxt.value), dkimCname.value, selector),
    lookupFailed(dmarcTxt.error, "dmarc") ?? checkDmarc(joinTxt(dmarcTxt.value)),
  ];
  return { checks, status: summarizeHealth(checks) };
}
