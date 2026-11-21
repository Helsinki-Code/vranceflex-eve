import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ApiActor } from "./api-actor";
import { AuthRequestError } from "./auth-errors";
import { getDatabase } from "./database";
import { auditEvents, callConsents, leads, voiceDoNotCall } from "./database/schema";
import { consentSourceLabels } from "../domain/voice-consent-labels";
import { normalizePhone } from "./twilio-webhook";

/**
 * A person agreeing to be called by an AI voice, recorded per lead and number.
 * Nothing is dialed without a current record, so "we have consent" is something
 * the workspace states, with where and when, rather than a checkbox to skip.
 */

export const consentSources = ["web_form", "recorded_verbal", "existing_customer", "imported", "other"] as const;
export { consentSourceLabels };

export const consentInputSchema = z
  .object({
    leadId: z.string().uuid(),
    source: z.enum(consentSources),
    // What they agreed to and when, in the customer's own words. Not optional.
    evidence: z.string().trim().min(15, "Say where and when they agreed (at least a sentence).").max(1_000),
    grantedAt: z.string().datetime().optional(),
  })
  .strict();

const E164 = /^\+[1-9]\d{7,14}$/;

/** A phone number in international format, or null when it can't be made one. */
export function toE164(value: string | null | undefined) {
  const normalized = normalizePhone(value);
  return E164.test(normalized) ? normalized : null;
}

function requireReviewer(actor: ApiActor) {
  if (!["admin", "reviewer"].includes(actor.organizationRole)) {
    throw new AuthRequestError("Admin or reviewer permission is required to record call consent.", 403);
  }
}

export async function recordCallConsent(actor: ApiActor, input: z.infer<typeof consentInputSchema>) {
  requireReviewer(actor);
  const database = getDatabase();
  const [lead] = await database
    .select({ id: leads.id, phone: leads.phone, doNotContact: leads.doNotContact })
    .from(leads)
    .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, actor.organizationId)))
    .limit(1);
  if (!lead) throw new AuthRequestError("That lead wasn't found.", 404);
  if (lead.doNotContact) throw new AuthRequestError("This lead asked not to be contacted.", 409);
  const phone = toE164(lead.phone);
  if (!phone) throw new AuthRequestError("This lead has no phone number in international format (like +14155550100).", 409);
  const [blocked] = await database
    .select({ id: voiceDoNotCall.id })
    .from(voiceDoNotCall)
    .where(and(eq(voiceDoNotCall.organizationId, actor.organizationId), eq(voiceDoNotCall.phone, phone)))
    .limit(1);
  if (blocked) throw new AuthRequestError("This number asked not to be called, so consent can't be recorded for it.", 409);

  const now = new Date();
  const grantedAt = input.grantedAt ? new Date(input.grantedAt) : now;
  if (grantedAt.getTime() > now.getTime() + 60_000) throw new AuthRequestError("Consent can't be dated in the future.", 400);
  const values = {
    status: "granted" as const,
    source: input.source,
    evidence: input.evidence,
    grantedAt,
    recordedBy: actor.userId,
    revokedAt: null,
    revokedReason: null,
    updatedAt: now,
  };
  await database
    .insert(callConsents)
    .values({ id: crypto.randomUUID(), organizationId: actor.organizationId, leadId: lead.id, phone, ...values })
    .onConflictDoUpdate({ target: [callConsents.organizationId, callConsents.leadId, callConsents.phone], set: values });
  await database.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    actorId: actor.userId,
    campaignId: null,
    action: "voice.consent_recorded",
    entityType: "lead",
    entityId: lead.id,
    metadata: { source: input.source, grantedAt: grantedAt.toISOString() },
  });
  return { leadId: lead.id, phone };
}

export async function revokeCallConsent(actor: ApiActor, leadId: string, reason: string) {
  requireReviewer(actor);
  const now = new Date();
  const revoked = await getDatabase()
    .update(callConsents)
    .set({ status: "revoked", revokedAt: now, revokedReason: reason.slice(0, 300), updatedAt: now })
    .where(and(eq(callConsents.organizationId, actor.organizationId), eq(callConsents.leadId, leadId), eq(callConsents.status, "granted")))
    .returning({ id: callConsents.id });
  if (revoked.length) {
    await getDatabase().insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      campaignId: null,
      action: "voice.consent_revoked",
      entityType: "lead",
      entityId: leadId,
      metadata: { reason: reason.slice(0, 300) },
    });
  }
  return { revoked: revoked.length };
}

/** Whether there is a current consent for this exact lead and number. */
export async function hasCallConsent(organizationId: string, leadId: string, phone: string) {
  const [row] = await getDatabase()
    .select({ id: callConsents.id })
    .from(callConsents)
    .where(
      and(
        eq(callConsents.organizationId, organizationId),
        eq(callConsents.leadId, leadId),
        eq(callConsents.phone, phone),
        eq(callConsents.status, "granted"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function isNumberBlocked(organizationId: string, phone: string) {
  const [row] = await getDatabase()
    .select({ id: voiceDoNotCall.id })
    .from(voiceDoNotCall)
    .where(and(eq(voiceDoNotCall.organizationId, organizationId), eq(voiceDoNotCall.phone, phone)))
    .limit(1);
  return Boolean(row);
}
