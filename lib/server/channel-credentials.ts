import { and, eq } from "drizzle-orm";
import type { ResendConnectionInput, TwilioConnectionInput } from "../domain/channel-credentials";
import type { ApiActor } from "./api-actor";
import { AuthRequestError } from "./auth-errors";
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
} from "./credential-crypto";
import { getDatabase } from "./database";
import {
  auditEvents,
  organizationChannelCredentials,
} from "./database/schema";

function requireAdmin(actor: ApiActor) {
  if (actor.organizationRole !== "admin") {
    throw new AuthRequestError(
      "Admin permission is required to manage connected channels.",
      403,
    );
  }
}

function mask(value: string, visible = 4) {
  if (value.length <= visible) return "*".repeat(value.length);
  return `${"*".repeat(value.length - visible)}${value.slice(-visible)}`;
}

async function validateResendConnection(input: ResendConnectionInput) {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    });
  } catch {
    throw new AuthRequestError(
      "Could not reach Resend to verify this API key. Try again.",
      502,
    );
  }
  if (!response.ok) {
    throw new AuthRequestError(
      response.status === 401 || response.status === 403
        ? "Resend rejected this API key. Double-check it and try again."
        : "Resend could not verify this API key right now.",
      400,
    );
  }
}

async function validateTwilioConnection(input: TwilioConnectionInput) {
  const basicAuth = Buffer.from(`${input.accountSid}:${input.authToken}`).toString("base64");
  const headers = { Authorization: `Basic ${basicAuth}` };

  let accountResponse: Response;
  try {
    accountResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${input.accountSid}.json`,
      { headers },
    );
  } catch {
    throw new AuthRequestError(
      "Could not reach Twilio to verify these credentials. Try again.",
      502,
    );
  }
  if (!accountResponse.ok) {
    throw new AuthRequestError(
      "Twilio rejected this Account SID / Auth Token. Double-check them and try again.",
      400,
    );
  }

  let serviceResponse: Response;
  try {
    serviceResponse = await fetch(
      `https://messaging.twilio.com/v1/Services/${input.messagingServiceSid}`,
      { headers },
    );
  } catch {
    throw new AuthRequestError(
      "Could not reach Twilio to verify the Messaging Service. Try again.",
      502,
    );
  }
  if (!serviceResponse.ok) {
    throw new AuthRequestError(
      "This Messaging Service SID was not found on that Twilio account.",
      400,
    );
  }
}

async function upsertCredential(
  organizationId: string,
  provider: "resend" | "twilio",
  payload: Record<string, unknown>,
) {
  const database = getDatabase();
  const now = new Date();
  const encryptedPayload = encryptCredentialPayload(payload);
  await database
    .insert(organizationChannelCredentials)
    .values({
      organizationId,
      provider,
      encryptedPayload,
      status: "connected",
      lastVerifiedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        organizationChannelCredentials.organizationId,
        organizationChannelCredentials.provider,
      ],
      set: { encryptedPayload, status: "connected", lastVerifiedAt: now, updatedAt: now },
    });
}

export async function connectResend(actor: ApiActor, input: ResendConnectionInput) {
  requireAdmin(actor);
  await validateResendConnection(input);
  await upsertCredential(actor.organizationId, "resend", input);
  await getDatabase().insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    actorId: actor.userId,
    campaignId: null,
    action: "integration.resend_connected",
    entityType: "organization",
    entityId: actor.organizationId,
    metadata: { fromEmail: input.fromEmail, replyDomain: input.replyDomain },
  });
  return { connected: true as const, fromEmail: input.fromEmail, replyDomain: input.replyDomain };
}

export async function connectTwilio(actor: ApiActor, input: TwilioConnectionInput) {
  requireAdmin(actor);
  await validateTwilioConnection(input);
  await upsertCredential(actor.organizationId, "twilio", input);
  await getDatabase().insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    actorId: actor.userId,
    campaignId: null,
    action: "integration.twilio_connected",
    entityType: "organization",
    entityId: actor.organizationId,
    metadata: { messagingServiceSid: input.messagingServiceSid },
  });
  return { connected: true as const, messagingServiceSid: input.messagingServiceSid };
}

export async function disconnectChannel(actor: ApiActor, provider: "resend" | "twilio") {
  requireAdmin(actor);
  const database = getDatabase();
  await database
    .delete(organizationChannelCredentials)
    .where(
      and(
        eq(organizationChannelCredentials.organizationId, actor.organizationId),
        eq(organizationChannelCredentials.provider, provider),
      ),
    );
  await database.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    actorId: actor.userId,
    campaignId: null,
    action: "integration.disconnected",
    entityType: "organization",
    entityId: actor.organizationId,
    metadata: { provider },
  });
  return { disconnected: true as const };
}

async function loadCredential<T>(organizationId: string, provider: "resend" | "twilio") {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(organizationChannelCredentials)
    .where(
      and(
        eq(organizationChannelCredentials.organizationId, organizationId),
        eq(organizationChannelCredentials.provider, provider),
      ),
    )
    .limit(1);
  if (!row || row.status !== "connected") return null;
  return decryptCredentialPayload<T>(row.encryptedPayload);
}

export async function getOrgResendCredentials(organizationId: string) {
  return loadCredential<ResendConnectionInput>(organizationId, "resend");
}

export async function getOrgTwilioCredentials(organizationId: string) {
  return loadCredential<TwilioConnectionInput>(organizationId, "twilio");
}

export async function getChannelConnectionSummary(organizationId: string) {
  const [resend, twilio] = await Promise.all([
    getOrgResendCredentials(organizationId),
    getOrgTwilioCredentials(organizationId),
  ]);
  return {
    resend: resend
      ? { connected: true as const, fromEmail: resend.fromEmail, replyDomain: resend.replyDomain }
      : { connected: false as const },
    twilio: twilio
      ? {
          connected: true as const,
          messagingServiceSid: mask(twilio.messagingServiceSid),
        }
      : { connected: false as const },
  };
}
