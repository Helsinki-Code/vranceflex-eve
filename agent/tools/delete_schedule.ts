import { defineTool } from "eve/tools";
import { deleteScheduleSchema } from "../../lib/domain/pipeline";
import { deleteCampaignSchedule } from "../../lib/server/scheduling-store";
import { requireVranceFlexCaller } from "../tenant";

export default defineTool({
  description:
    "Delete a workspace outreach schedule and cancel its unsent delivery jobs. Already accepted provider sends are preserved.",
  inputSchema: deleteScheduleSchema,
  async execute(input, ctx) {
    return deleteCampaignSchedule(requireVranceFlexCaller(ctx), input);
  },
});
