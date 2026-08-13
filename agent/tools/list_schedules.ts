import { defineTool } from "eve/tools";
import { listSchedulesSchema } from "../../lib/domain/pipeline";
import { listCampaignSchedules } from "../../lib/server/scheduling-store";
import { requireVranceFlexCaller } from "../tenant";

export default defineTool({
  description:
    "List outreach schedules in the current workspace, including cadence, pause state, sequences, and the next due run.",
  inputSchema: listSchedulesSchema,
  async execute(input, ctx) {
    return listCampaignSchedules(requireVranceFlexCaller(ctx), input);
  },
});
