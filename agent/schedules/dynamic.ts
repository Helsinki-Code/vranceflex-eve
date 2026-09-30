import { defineSchedule } from "eve/schedules";
import { processDueDeliveryJobs } from "../../lib/server/delivery-worker";
import { pollMailboxReplies } from "../../lib/server/mailbox-poller";
import { refreshStaleDomains } from "../../lib/server/mailbox-store";

function logFailure(task: string) {
  return (error: unknown) => {
    console.error(`[schedule] ${task} failed`, error instanceof Error ? error.message : error);
  };
}

/**
 * The sole production dispatcher. Application rows hold the tenant-specific
 * cadence; eve only supplies the reliable once-per-minute wake-up. Each task
 * throttles itself (inboxes every 5 minutes, domain DNS once a day).
 */
export default defineSchedule({
  cron: "* * * * *",
  run({ waitUntil }) {
    waitUntil(
      Promise.all([
        processDueDeliveryJobs().catch(logFailure("delivery")),
        pollMailboxReplies().catch(logFailure("mailbox replies")),
        refreshStaleDomains().catch(logFailure("domain health")),
      ]).then(() => undefined),
    );
  },
});
