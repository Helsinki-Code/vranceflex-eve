import { defineTool } from "eve/tools";
import { updateScheduleSchema } from "../../lib/domain/pipeline";
import { updateCampaignSchedule } from "../../lib/server/scheduling-store";
import { requireVranceFlexCaller } from "../tenant";

export default defineTool({
  description:
    "Update a workspace outreach schedule's recurrence or pause/resume state. Set recurrence to null to make the next occurrence the final one.",
  inputSchema: updateScheduleSchema,
  async execute(input, ctx) {
    return updateCampaignSchedule(requireVranceFlexCaller(ctx), input);
  },
});
