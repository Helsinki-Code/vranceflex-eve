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

export type UnsubscribeSource = "resend_inbound" | "one_click_unsubscribe";

export async function suppressLeadForUnsubscribe(
  db: Database | Transaction,
  input: {
    organizationId: string;
    leadId: string;
    email: string;
    source: UnsubscribeSource;
    campaignId?: string | null;
    writeAuditEvent?: boolean;
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
      lastError: "All future outreach stopped after an unsubscribe request.",
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
  await db
    .insert(suppressionEntries)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      leadId: input.leadId,
      channel: "email",
      destination: normalizeEmailAddress(input.email),
      reason: "unsubscribe",
      source: input.source,
    })
    .onConflictDoNothing();
  if (input.writeAuditEvent ?? true) {
    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      actorId: null,
      campaignId: input.campaignId ?? null,
      action: "reply.unsubscribe_received",
      entityType: "lead",
      entityId: input.leadId,
      metadata: { source: input.source },
    });
  }
}
