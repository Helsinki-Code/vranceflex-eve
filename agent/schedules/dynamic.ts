import { defineSchedule } from "eve/schedules";
import { processDueDeliveryJobs } from "../../lib/server/delivery-worker";
import { pollMailboxReplies } from "../../lib/server/mailbox-poller";
import { refreshStaleDomains } from "../../lib/server/mailbox-store";
import { getVoiceDialer, liveKitConfigFromEnv } from "../../lib/server/voice-dialer";
import { processVoiceQueue } from "../../lib/server/voice-orchestrator";

function logFailure(task: string) {
  return (error: unknown) => {
    console.error(`[schedule] ${task} failed`, error instanceof Error ? error.message : error);
  };
}

/** Places due voice calls. Does nothing on a deployment without LiveKit or a public URL. */
async function runVoiceQueue() {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base || !liveKitConfigFromEnv()) return;
  await processVoiceQueue({ dialer: getVoiceDialer(), reportUrl: `${base}/api/voice/worker/report` });
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
        runVoiceQueue().catch(logFailure("voice calls")),
      ]).then(() => undefined),
    );
  },
});
