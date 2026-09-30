import { describe, expect, it } from "vitest";
import { nextGap, pickMailbox, type SendingMailbox } from "./mailbox-rotation";

const now = new Date("2026-09-30T10:00:00Z");
const dayEnd = new Date("2026-10-01T00:00:00Z");

function mailbox(id: string, overrides: Partial<SendingMailbox> = {}): SendingMailbox {
  return {
    id, organizationId: "org", email: `${id}@getacme.com`, fromName: null, provider: "google", encryptedPayload: "x",
    status: "active", statusReason: null, dailyLimit: 30, rampUp: false, rampStartedAt: new Date("2026-01-01"),
    nextSendAt: new Date(now.getTime() - 1_000), imapUidValidity: 1, imapLastUid: 0, lastPolledAt: null, lastError: null,
    createdAt: now, updatedAt: now, ...overrides,
  };
}

describe("mailbox rotation", () => {
  it("picks the ready mailbox with the most capacity left", () => {
    const claim = pickMailbox({ mailboxes: [mailbox("a"), mailbox("b")], sentToday: new Map([["a", 20], ["b", 5]]), stickyMailboxId: null, now, dayEnd });
    expect(claim.mailbox?.id).toBe("b");
  });

  it("keeps a lead on its sticky mailbox, waiting for its spacing slot", () => {
    const later = new Date(now.getTime() + 120_000);
    const claim = pickMailbox({ mailboxes: [mailbox("a", { nextSendAt: later }), mailbox("b")], sentToday: new Map(), stickyMailboxId: "a", now, dayEnd });
    expect(claim.mailbox).toBeNull();
    if (!claim.mailbox) expect(claim.waitUntil).toEqual(later);
  });

  it("moves a lead to another mailbox when its sticky one is paused", () => {
    const claim = pickMailbox({ mailboxes: [mailbox("a", { status: "paused" }), mailbox("b")], sentToday: new Map(), stickyMailboxId: "a", now, dayEnd });
    expect(claim.mailbox?.id).toBe("b");
  });

  it("waits until tomorrow when every mailbox is at its cap (ramp included)", () => {
    const claim = pickMailbox({
      mailboxes: [mailbox("a", { rampUp: true, rampStartedAt: now }), mailbox("b", { dailyLimit: 5 })],
      sentToday: new Map([["a", 10], ["b", 5]]),
      stickyMailboxId: null, now, dayEnd,
    });
    expect(claim.mailbox).toBeNull();
    if (!claim.mailbox) {
      expect(claim.waitUntil.getTime()).toBeGreaterThan(dayEnd.getTime());
      expect(claim.reason).toMatch(/limit/);
    }
  });

  it("waits for the soonest spacing slot when all mailboxes just sent", () => {
    const soon = new Date(now.getTime() + 60_000);
    const claim = pickMailbox({ mailboxes: [mailbox("a", { nextSendAt: new Date(now.getTime() + 300_000) }), mailbox("b", { nextSendAt: soon })], sentToday: new Map(), stickyMailboxId: null, now, dayEnd });
    expect(claim.mailbox).toBeNull();
    if (!claim.mailbox) expect(claim.waitUntil).toEqual(soon);
  });

  it("explains when nothing can send", () => {
    const claim = pickMailbox({ mailboxes: [mailbox("a", { status: "error" })], sentToday: new Map(), stickyMailboxId: null, now, dayEnd });
    expect(claim.mailbox).toBeNull();
    if (!claim.mailbox) expect(claim.reason).toMatch(/paused or needs attention/);
  });

  it("spaces sends 2–6 minutes apart", () => {
    expect(nextGap(() => 0)).toBe(120_000);
    expect(nextGap(() => 0.999)).toBeLessThan(360_000);
  });
});
