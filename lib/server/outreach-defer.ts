import { and, asc, eq, inArray } from "drizzle-orm";
import type { getDatabase } from "./database";
import { deliveryJobs, outreachMessages } from "./database/schema";

type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Pushes a sequence's waiting emails back so the next one goes out at
 * `resumeAt`, keeping the gaps between steps. Used when someone is out of the
 * office: nothing is cancelled and nobody has to reschedule.
 *
 * Every waiting step moves by the same amount, so a 3-day gap stays 3 days.
 * Steps already later than `resumeAt` are left alone. Returns how far the
 * sequence moved (zero when nothing needed to).
 */
export async function deferPendingOutreach(
  transaction: Transaction,
  input: { sequenceId: string; resumeAt: Date },
) {
  const jobs = await transaction
    .select({
      id: deliveryJobs.id,
      messageId: deliveryJobs.messageId,
      scheduledFor: deliveryJobs.scheduledFor,
      availableAt: deliveryJobs.availableAt,
    })
    .from(deliveryJobs)
    .where(and(eq(deliveryJobs.sequenceId, input.sequenceId), inArray(deliveryJobs.status, ["queued", "retry"])))
    .orderBy(asc(deliveryJobs.scheduledFor));
  if (!jobs.length) return { shiftedJobs: 0, shiftMs: 0 };

  const shiftMs = Math.max(0, input.resumeAt.getTime() - jobs[0]!.scheduledFor.getTime());
  if (!shiftMs) return { shiftedJobs: 0, shiftMs: 0 };

  const now = new Date();
  for (const job of jobs) {
    const scheduledFor = new Date(job.scheduledFor.getTime() + shiftMs);
    await transaction
      .update(deliveryJobs)
      .set({
        scheduledFor,
        availableAt: new Date(Math.max(job.availableAt.getTime() + shiftMs, scheduledFor.getTime())),
        updatedAt: now,
      })
      .where(eq(deliveryJobs.id, job.id));
    await transaction
      .update(outreachMessages)
      .set({ scheduledFor, updatedAt: now })
      .where(eq(outreachMessages.id, job.messageId));
  }
  return { shiftedJobs: jobs.length, shiftMs };
}
