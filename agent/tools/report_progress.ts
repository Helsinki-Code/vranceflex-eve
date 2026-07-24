import { defineTool } from "eve/tools";
import { z } from "zod";
import { recordCampaignProgressForActor } from "../../lib/server/pipeline-store";
import { requireVranceFlexCaller } from "../tenant";

export default defineTool({
  description:
    "Report a short, truthful, user-facing progress update while preparing a campaign (e.g. 'Analyzing the website', 'Found 32 candidate companies', 'Verifying contact emails'). Call it when a meaningful unit of work starts or finishes. It never changes campaign state — use campaign_progress for stage transitions.",
  inputSchema: z.object({
    campaignId: z.string().uuid(),
    stage: z.enum(["researching", "enriching", "copy_generated"]),
    message: z
      .string()
      .trim()
      .min(10)
      .max(200)
      .describe(
        "Plain-language description of what is happening right now, written for the customer watching the campaign screen.",
      ),
  }),
  async execute(input, ctx) {
    return recordCampaignProgressForActor(
      requireVranceFlexCaller(ctx),
      input.campaignId,
      input.stage,
      input.message,
    );
  },
});
