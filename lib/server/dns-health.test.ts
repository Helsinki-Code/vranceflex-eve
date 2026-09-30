import { describe, expect, it } from "vitest";
import { checkDkim, checkDmarc, checkDomainHealth, checkMx, checkSpf, detectMailProvider, expectedRecords, type DnsLookup } from "./dns-health";

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

  it("finds DKIM under a different selector and flags Cloudflare Email Routing as forward-only", async () => {
    // vranceflex.online as it was set up: Cloudflare Email Routing, selector typed as "cloudflare".
    const health = await checkDomainHealth("vranceflex.online", "other", "cloudflare", fakeDns({
      mx: [{ exchange: "route2.mx.cloudflare.net", priority: 2 }, { exchange: "route1.mx.cloudflare.net", priority: 1 }],
      txt: {
        "vranceflex.online": ["v=spf1 include:_spf.mx.cloudflare.net ~all"],
        "cf2024-1._domainkey.vranceflex.online": ["v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiweykoi"],
        "_dmarc.vranceflex.online": ["v=DMARC1; p=none; pct=100; rua=mailto:dmarcreports@lovable.dev"],
      },
    }));
    const [mx, spf, dkim, dmarc] = health.checks;
    expect(health.receiver).toMatchObject({ key: "cloudflare_routing", canSend: false });
    expect(mx?.status).toBe("warn");
    expect(mx?.summary).toMatch(/only forwards/);
    expect(spf?.status).toBe("warn");
    expect(dkim).toMatchObject({ status: "pass", selector: "cf2024-1" });
    expect(dkim?.summary).toMatch(/cf2024-1\._domainkey/);
    expect(dmarc?.status).toBe("pass");
    expect(health.dkimSelector).toBe("cf2024-1");
    expect(health.status).toBe("partial");
    expect(expectedRecords("vranceflex.online", "other", "cf2024-1", health.receiver)[0]?.note).toMatch(/only forwards/);
  });

  it("checks an 'other' domain whose MX is Google by Google's rules", async () => {
    const health = await checkDomainHealth("getacme.com", "other", "default", fakeDns({
      mx: [{ exchange: "smtp.google.com", priority: 1 }],
      txt: { "getacme.com": ["v=spf1 include:mailgun.org ~all"] },
    }));
    expect(health.provider).toBe("google");
    expect(health.checks[1]?.summary).toMatch(/_spf\.google\.com/);
    expect(health.checks[2]?.summary).toMatch(/any common selector/);
    expect(health.dkimSelector).toBe("default");
  });

  it("names the provider behind common MX hosts", () => {
    expect(detectMailProvider(["mx.zoho.com"]).key).toBe("zoho");
    expect(detectMailProvider(["in1-smtp.messagingengine.com"]).key).toBe("fastmail");
    expect(detectMailProvider(["mail.example.net"])).toMatchObject({ key: "other", label: "mail.example.net" });
    expect(detectMailProvider([]).key).toBe("none");
  });
});
