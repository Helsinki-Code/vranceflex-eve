import { describe, expect, it } from "vitest";
import type { ParsedMail } from "mailparser";
import { headerValues, looksLikeBounce, parseBounce, replyBody, replyTargetFromHeaders } from "./mailbox-imap";

const id = "3f2b8c1e-6d4a-4b7e-9c10-2a5f7e8d9b01";

describe("mailbox inbox matching", () => {
  it("finds our message in In-Reply-To or References", () => {
    expect(replyTargetFromHeaders({ inReplyTo: `<vf-${id}@getacme.com>` })).toBe(id);
    expect(replyTargetFromHeaders({ inReplyTo: "<CAF123@mail.gmail.com>", references: [`<abc@x.com> <vf-${id}@getacme.com>`] })).toBe(id);
    expect(replyTargetFromHeaders({ inReplyTo: "<CAF123@mail.gmail.com>" })).toBeNull();
  });

  it("reads folded headers", () => {
    const raw = Buffer.from(`References: <a@x.com>\r\n <vf-${id}@getacme.com>\r\nContent-Type: text/plain\r\n\r\n`);
    expect(headerValues(raw, "references")[0]).toContain(`vf-${id}@`);
  });

  it("recognises bounces and reads their status", () => {
    expect(looksLikeBounce("mailer-daemon@googlemail.com", "Delivery Status Notification (Failure)")).toBe(true);
    expect(looksLikeBounce("lead@example.com", "Re: quick question")).toBe(false);
    const dsn = `Content-Type: multipart/report\r\n\r\nFinal-Recipient: rfc822; lead@example.com\r\nStatus: 5.1.1\r\nDiagnostic-Code: smtp; 550 5.1.1 The email account does not exist\r\n\r\nMessage-ID: <vf-${id}@getacme.com>\r\n`;
    expect(parseBounce(dsn)).toEqual({ outreachId: id, hard: true, diagnostic: "550 5.1.1 The email account does not exist" });
    expect(parseBounce(dsn.replace("Status: 5.1.1", "Status: 4.4.1"))).toBeNull();
    expect(parseBounce("Status: 5.1.1 but nothing of ours")).toBeNull();
  });

  it("strips the quoted original from a reply", () => {
    const parsed = { text: "Sounds good, call me Tuesday.\n\nOn Mon, Sep 28, 2026 at 9:00 AM Priya <priya@getacme.com> wrote:\n> Hi there" } as ParsedMail;
    expect(replyBody(parsed)).toBe("Sounds good, call me Tuesday.");
  });
});
