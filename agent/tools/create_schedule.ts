import { defineTool } from "eve/tools";
import { createScheduleSchema } from "../../lib/domain/pipeline";
import { scheduleCampaignSequences } from "../../lib/server/scheduling-store";
import { requireVranceFlexCaller } from "../tenant";

export default defineTool({
  description:
    "Create a one-shot or recurring outreach schedule for human-approved campaign sequences in the current workspace. Use intervalDays: 7 for weekly delivery. Existing BYOK, suppression, and daily-cap policy checks are enforced.",
  inputSchema: createScheduleSchema,
  async execute({ campaignId, ...input }, ctx) {
    return scheduleCampaignSequences(
      requireVranceFlexCaller(ctx),
      campaignId,
      input,
    );
  },
});
