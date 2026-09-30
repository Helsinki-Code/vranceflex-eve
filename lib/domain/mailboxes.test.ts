import { describe, expect, it } from "vitest";
import { effectiveDailyCap, googleMailboxSchema, isConsumerAddress, mailboxSecretFromInput, rampCompletesOn, sendingDomainSchema } from "./mailboxes";

const day = 86_400_000;

describe("mailbox ramp-up", () => {
  const start = new Date("2026-09-01T09:00:00Z");
  it("starts at 10 a day and climbs by 5 until the limit", () => {
    const mailbox = { dailyLimit: 40, rampUp: true, rampStartedAt: start };
    expect(effectiveDailyCap(mailbox, start)).toBe(10);
    expect(effectiveDailyCap(mailbox, new Date(start.getTime() + 3 * day))).toBe(25);
    expect(effectiveDailyCap(mailbox, new Date(start.getTime() + 30 * day))).toBe(40);
  });
  it("uses the full limit when ramp-up is off", () => {
    expect(effectiveDailyCap({ dailyLimit: 40, rampUp: false, rampStartedAt: start }, start)).toBe(40);
  });
  it("reports when the ramp completes, and null afterwards", () => {
    const mailbox = { dailyLimit: 30, rampUp: true, rampStartedAt: start };
    expect(rampCompletesOn(mailbox, start)?.toISOString()).toBe(new Date(start.getTime() + 4 * day).toISOString());
    expect(rampCompletesOn(mailbox, new Date(start.getTime() + 5 * day))).toBeNull();
  });
});

describe("mailbox inputs", () => {
  it("accepts a Google App Password with spaces and lowercases the address", () => {
    const parsed = googleMailboxSchema.parse({ provider: "google", email: "Priya@GetAcme.com", appPassword: "abcd efgh ijkl mnop" });
    expect(parsed.email).toBe("priya@getacme.com");
    expect(parsed.appPassword).toBe("abcdefghijklmnop");
    expect(parsed.dailyLimit).toBe(30);
    const secret = mailboxSecretFromInput(parsed);
    expect(secret.smtp).toEqual({ host: "smtp.gmail.com", port: 465, secure: true });
    expect(secret.imap.host).toBe("imap.gmail.com");
  });
  it("rejects something that isn't an App Password", () => {
    expect(() => googleMailboxSchema.parse({ provider: "google", email: "a@b.co", appPassword: "hunter2" })).toThrow(/16 letters/);
  });
  it("normalises a pasted domain", () => {
    expect(sendingDomainSchema.parse({ domain: "https://www.GetAcme.com/about" }).domain).toBe("getacme.com");
  });
  it("flags personal addresses", () => {
    expect(isConsumerAddress("someone@gmail.com")).toBe(true);
    expect(isConsumerAddress("someone@getacme.com")).toBe(false);
  });
});
