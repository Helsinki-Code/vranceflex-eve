import { describe, expect, it } from "vitest";
import { checkDkim, checkDmarc, checkDomainHealth, checkMx, checkSpf, expectedRecords, type DnsLookup } from "./dns-health";

function notFound() {
  return Object.assign(new Error("not found"), { code: "ENOTFOUND" });
}

function fakeDns(records: { mx?: { exchange: string; priority: number }[]; txt?: Record<string, string[]>; cname?: Record<string, string[]> }): DnsLookup {
  return {
    resolveMx: async () => { if (!records.mx) throw notFound(); return records.mx; },
    resolveTxt: async (host) => { const value = records.txt?.[host]; if (!value) throw notFound(); return value.map((entry) => [entry]); },
    resolveCname: async (host) => { const value = records.cname?.[host]; if (!value) throw notFound(); return value; },
  };
}

describe("dns health", () => {
  it("passes a fully set-up Google Workspace domain", async () => {
    const health = await checkDomainHealth("getacme.com", "google", "google", fakeDns({
      mx: [{ exchange: "smtp.google.com", priority: 1 }],
      txt: {
        "getacme.com": ["v=spf1 include:_spf.google.com ~all", "google-site-verification=abc"],
        "google._domainkey.getacme.com": ["v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA"],
        "_dmarc.getacme.com": ["v=DMARC1; p=none; rua=mailto:d@getacme.com"],
      },
    }));
    expect(health.status).toBe("verified");
    expect(health.checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "pass"]);
  });

  it("fails a bare domain with every record missing", async () => {
    const health = await checkDomainHealth("empty.dev", "google", "google", fakeDns({}));
    expect(health.status).toBe("unverified");
    expect(health.checks.every((check) => check.status === "fail")).toBe(true);
  });

  it("catches duplicate SPF records and a missing provider include", () => {
    expect(checkSpf(["v=spf1 include:_spf.google.com ~all", "v=spf1 include:mailgun.org ~all"], "google").summary).toMatch(/more than one/i);
    expect(checkSpf(["v=spf1 include:mailgun.org ~all"], "google").status).toBe("fail");
    expect(checkSpf(["v=spf1 include:_spf.google.com +all"], "google").status).toBe("fail");
  });

  it("warns when MX points somewhere other than the chosen provider", () => {
    expect(checkMx([{ exchange: "mx.zoho.com", priority: 10 }], "google").status).toBe("warn");
    expect(checkMx([{ exchange: "getacme-com.mail.protection.outlook.com", priority: 0 }], "microsoft").status).toBe("pass");
  });

  it("accepts Microsoft's CNAME-delegated DKIM and rejects a revoked key", () => {
    expect(checkDkim([], ["selector1-getacme-com._domainkey.acme.onmicrosoft.com"], "selector1").status).toBe("pass");
    expect(checkDkim(["v=DKIM1; p="], [], "google").status).toBe("fail");
  });

  it("reads the DMARC policy", () => {
    expect(checkDmarc(["v=DMARC1; p=quarantine"]).summary).toMatch(/quarantine/);
    expect(checkDmarc([]).status).toBe("fail");
  });

  it("marks a domain partial when SPF and DKIM pass but DMARC is missing", async () => {
    const health = await checkDomainHealth("getacme.com", "google", "google", fakeDns({
      mx: [{ exchange: "smtp.google.com", priority: 1 }],
      txt: { "getacme.com": ["v=spf1 include:_spf.google.com ~all"], "google._domainkey.getacme.com": ["v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA"] },
    }));
    expect(health.status).toBe("partial");
  });

  it("suggests records for the chosen provider", () => {
    const records = expectedRecords("getacme.com", "google", "google");
    expect(records.find((record) => record.kind === "spf")?.value).toBe("v=spf1 include:_spf.google.com ~all");
    expect(records.find((record) => record.kind === "dmarc")?.host).toBe("_dmarc");
  });
});
