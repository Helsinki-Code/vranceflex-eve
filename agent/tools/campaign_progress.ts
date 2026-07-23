import { defineTool } from "eve/tools";
import { z } from "zod";
import { markCampaignPipelineStage } from "../../lib/server/pipeline-store";
import { requireVranceFlexCaller } from "../tenant";

export default defineTool({
  description:
    "Persist a truthful campaign pipeline stage after the corresponding specialist work has actually completed. Only enriching and copy_generated are accepted; sending states are never set here.",
  inputSchema: z.object({
    campaignId: z.string().uuid(),
    stage: z.enum(["enriching", "copy_generated"]),
    note: z.string().trim().min(10).max(500),
  }),
  async execute(input, ctx) {
    return markCampaignPipelineStage(
      requireVranceFlexCaller(ctx),
      input.campaignId,
      input.stage,
      input.note,
    );
  },
});
