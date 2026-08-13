import { defineSchedule } from "eve/schedules";
import { processDueDeliveryJobs } from "../../lib/server/delivery-worker";

/**
 * The sole production dispatcher. Application rows hold the tenant-specific
 * cadence; eve only supplies the reliable once-per-minute wake-up.
 */
export default defineSchedule({
  cron: "* * * * *",
  run({ waitUntil }) {
    waitUntil(
      processDueDeliveryJobs().then(() => undefined),
    );
  },
});
