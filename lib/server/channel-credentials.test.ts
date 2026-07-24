import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDatabase, truncateAllTables } from "./test-support/db";
import { seedOrganization } from "./test-support/seed";
import type { ApiActor } from "./api-actor";

process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= Buffer.alloc(32, 3).toString("base64url");

function adminActor(organizationId: string, userId: string): ApiActor {
  return { userId, organizationId, organizationRole: "admin", email: "owner@example.com" };
}

function memberActor(organizationId: string, userId: string): ApiActor {
  return { userId, organizationId, organizationRole: "member", email: "member@example.com" };
}

const resendInput = {
  apiKey: "re_test_key",
  fromEmail: "Acme <outreach@acme.example.com>",
  replyDomain: "reply.acme.example.com",
  webhookSecret: "whsec_test_secret",
};

const twilioInput = {
  accountSid: "AC00000000000000000000000000000000",
  authToken: "test-auth-token",
  messagingServiceSid: "MG00000000000000000000000000000000",
};

describe.skipIf(!hasTestDatabase)("channel-credentials", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables();
  });

  it("connects Resend after a successful validation call and stores it encrypted", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const { connectResend, getOrgResendCredentials, getChannelConnectionSummary } =
      await import("./channel-credentials");
    const { organizationId, userId } = await seedOrganization();

    const result = await connectResend(adminActor(organizationId, userId), resendInput);
    expect(result.connected).toBe(true);

    const stored = await getOrgResendCredentials(organizationId);
    expect(stored?.apiKey).toBe(resendInput.apiKey);
    expect(stored?.replyDomain).toBe(resendInput.replyDomain);

    const summary = await getChannelConnectionSummary(organizationId);
    expect(summary.resend).toEqual({
      connected: true,
      fromEmail: resendInput.fromEmail,
      replyDomain: resendInput.replyDomain,
    });
  });

  it("rejects connecting Resend when the API key fails validation", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const { connectResend, getOrgResendCredentials } = await import("./channel-credentials");
    const { organizationId, userId } = await seedOrganization();

    await expect(
      connectResend(adminActor(organizationId, userId), resendInput),
    ).rejects.toThrow(/rejected this API key/i);
    expect(await getOrgResendCredentials(organizationId)).toBeNull();
  });

  it("connects Twilio only after both account and messaging-service checks succeed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const { connectTwilio, getOrgTwilioCredentials } = await import("./channel-credentials");
    const { organizationId, userId } = await seedOrganization();

    await connectTwilio(adminActor(organizationId, userId), twilioInput);
    const stored = await getOrgTwilioCredentials(organizationId);
    expect(stored?.messagingServiceSid).toBe(twilioInput.messagingServiceSid);
  });

  it("rejects connecting Twilio when the messaging service check fails", async () => {
    let call = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      call += 1;
      return new Response("{}", { status: call === 1 ? 200 : 404 });
    });
    const { connectTwilio, getOrgTwilioCredentials } = await import("./channel-credentials");
    const { organizationId, userId } = await seedOrganization();

    await expect(
      connectTwilio(adminActor(organizationId, userId), twilioInput),
    ).rejects.toThrow(/Messaging Service SID was not found/i);
    expect(await getOrgTwilioCredentials(organizationId)).toBeNull();
  });

  it("rejects connecting a channel for a non-admin actor", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const { connectResend } = await import("./channel-credentials");
    const { organizationId, userId } = await seedOrganization();

    await expect(
      connectResend(memberActor(organizationId, userId), resendInput),
    ).rejects.toThrow(/admin permission/i);
  });

  it("masks the Twilio messaging service SID in the connection summary", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const { connectTwilio, getChannelConnectionSummary } = await import("./channel-credentials");
    const { organizationId, userId } = await seedOrganization();

    await connectTwilio(adminActor(organizationId, userId), twilioInput);
    const summary = await getChannelConnectionSummary(organizationId);
    expect(summary.twilio.connected).toBe(true);
    if (summary.twilio.connected) {
      expect(summary.twilio.messagingServiceSid).not.toBe(twilioInput.messagingServiceSid);
      expect(summary.twilio.messagingServiceSid.endsWith("0000")).toBe(true);
    }
  });

  it("disconnects a channel so credentials are no longer returned", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const { connectResend, disconnectChannel, getOrgResendCredentials } =
      await import("./channel-credentials");
    const { organizationId, userId } = await seedOrganization();

    await connectResend(adminActor(organizationId, userId), resendInput);
    expect(await getOrgResendCredentials(organizationId)).not.toBeNull();

    await disconnectChannel(adminActor(organizationId, userId), "resend");
    expect(await getOrgResendCredentials(organizationId)).toBeNull();
  });
});
