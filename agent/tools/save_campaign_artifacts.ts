import { defineTool } from "eve/tools";
import { campaignArtifactsSchema } from "../../lib/domain/pipeline";
import { persistCampaignArtifacts } from "../../lib/server/pipeline-store";
import { requireVranceFlexCaller } from "../tenant";

export default defineTool({
  description:
    "Atomically save the completed ICPs and generated email/SMS sequences for the current tenant, linked to already-approved leads by leadId. This idempotent tool moves the campaign only to awaiting_approval and never sends outreach. It never creates or modifies lead records.",
  inputSchema: campaignArtifactsSchema,
  async execute(input, ctx) {
    return persistCampaignArtifacts(requireVranceFlexCaller(ctx), input);
  },
});
