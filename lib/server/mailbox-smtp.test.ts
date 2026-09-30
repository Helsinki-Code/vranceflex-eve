import { describe, expect, it } from "vitest";
import { classifySmtpError, composeMailboxMessage, outreachIdFromRfcMessageId, rfcMessageId } from "./mailbox-smtp";

const gmail = { host: "smtp.gmail.com", port: 465, secure: true };
const smtpError = (fields: Record<string, unknown>) => Object.assign(new Error(String(fields.message ?? "error")), fields);

describe("mailbox SMTP", () => {
  it("round-trips our Message-ID", () => {
    const id = "3f2b8c1e-6d4a-4b7e-9c10-2a5f7e8d9b01";
    const header = rfcMessageId(id, "Priya@GetAcme.com");
    expect(header).toBe(`vf-${id}@getacme.com`);
    expect(outreachIdFromRfcMessageId(`<${header}>`)).toBe(id);
    expect(outreachIdFromRfcMessageId("<vf-test-abc@getacme.com>")).toBeNull();
  });

  it("builds a threaded message with unsubscribe headers", async () => {
    const raw = (await composeMailboxMessage({
      fromEmail: "priya@getacme.com",
      fromName: "Priya",
      to: "lead@example.com",
      subject: "Following up",
      text: "Hi",
      messageId: "vf-2@getacme.com",
      inReplyTo: "vf-1@getacme.com",
      headers: { "List-Unsubscribe": "<https://app.example/u/1>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    })).toString();
    expect(raw).toMatch(/^Message-ID: <vf-2@getacme\.com>/m);
    expect(raw).toMatch(/^In-Reply-To: <vf-1@getacme\.com>/m);
    expect(raw).toMatch(/^References: <vf-1@getacme\.com>/m);
    expect(raw).toMatch(/^List-Unsubscribe: <https:\/\/app\.example\/u\/1>/m);
    expect(raw).toMatch(/^From: Priya <priya@getacme\.com>/m);
  });

  it("classifies failures by phase", () => {
    const auth = classifySmtpError(smtpError({ code: "EAUTH", responseCode: 535 }), "login", gmail);
    expect(auth.authFailed).toBe(true);
    expect(auth.message).toMatch(/App Password/);

    const deferred = classifySmtpError(smtpError({ code: "EENVELOPE", responseCode: 451, response: "451 try later" }), "send", gmail);
    expect(deferred.retryable).toBe(true);
    expect(deferred.ambiguous).toBe(false);

    const rejected = classifySmtpError(smtpError({ code: "EENVELOPE", responseCode: 550, response: "550 no such user" }), "send", gmail);
    expect(rejected.retryable).toBe(false);

    const dropped = classifySmtpError(smtpError({ code: "ETIMEDOUT", message: "Timeout" }), "send", gmail);
    expect(dropped.ambiguous).toBe(true);
    expect(dropped.retryable).toBe(false);

    const unreachable = classifySmtpError(smtpError({ code: "ECONNECTION", message: "refused" }), "connect", gmail);
    expect(unreachable.retryable).toBe(true);
    expect(unreachable.ambiguous).toBe(false);
  });
});
