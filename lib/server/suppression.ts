import { and, eq, inArray } from "drizzle-orm";
import { normalizeEmailAddress } from "./reply-address";
import { getDatabase } from "./database";
import {
  auditEvents,
  deliveryJobs,
  leads,
  outreachMessages,
  outreachSequences,
  suppressionEntries,
} from "./database/schema";

type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type UnsubscribeSource = "resend_inbound" | "one_click_unsubscribe" | "twilio_inbound" | "mailbox_inbound" | "mailbox_bounce";

export async function suppressLeadForUnsubscribe(
  db: Database | Transaction,
  input: {
    organizationId: string;
    leadId: string;
    /** Email destination to suppress. Ignored when `sms` is given. */
    email?: string;
    /** Phone destination (as stored on the lead) for SMS opt-outs. */
    sms?: string;
    source: UnsubscribeSource;
    campaignId?: string | null;
    writeAuditEvent?: boolean;
    /** Why the destination is suppressed; defaults to an unsubscribe. */
    reason?: "unsubscribe" | "hard_bounce";
  },
) {
  const now = new Date();

  await db
    .update(leads)
    .set({ doNotContact: true, status: "suppressed", updatedAt: now })
    .where(eq(leads.id, input.leadId));
  await db
    .update(outreachSequences)
    .set({ status: "stopped", updatedAt: now })
    .where(
      and(
        eq(outreachSequences.leadId, input.leadId),
        inArray(outreachSequences.status, [
          "draft",
          "awaiting_approval",
          "approved",
          "scheduled",
          "active",
          "paused",
        ]),
      ),
    );
  await db
    .update(outreachMessages)
    .set({
      status: "cancelled",
      lastError: input.reason === "hard_bounce" ? "All future outreach stopped after the address bounced." : "All future outreach stopped after an unsubscribe request.",
      updatedAt: now,
    })
    .where(
      and(
        eq(outreachMessages.leadId, input.leadId),
        inArray(outreachMessages.status, ["draft", "approved", "scheduled"]),
      ),
    );
  await db
    .update(deliveryJobs)
    .set({
      status: "cancelled",
      lastError: "All future outreach stopped after an unsubscribe request.",
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(deliveryJobs.leadId, input.leadId),
        inArray(deliveryJobs.status, ["queued", "retry"]),
      ),
    );
  if (input.sms || input.email) {
    await db
      .insert(suppressionEntries)
      .values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        leadId: input.leadId,
        channel: input.sms ? "sms" : "email",
        destination: input.sms ? input.sms.trim() : normalizeEmailAddress(input.email ?? ""),
        reason: input.reason ?? "unsubscribe",
        source: input.source,
      })
      .onConflictDoNothing();
  }
  if (input.writeAuditEvent ?? true) {
    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      actorId: null,
      campaignId: input.campaignId ?? null,
      action: input.reason === "hard_bounce" ? "delivery.hard_bounce" : "reply.unsubscribe_received",
      entityType: "lead",
      entityId: input.leadId,
      metadata: { source: input.source },
    });
  }
}
