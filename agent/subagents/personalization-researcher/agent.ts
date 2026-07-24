import { defineAgent } from "eve";
import { z } from "zod";

export default defineAgent({
  description:
    "Research each already-verified lead's company website and any publicly indexed information to surface real, citable personalization hooks for outreach — never contact discovery or invented details.",
  model: "anthropic/claude-sonnet-4.6",
  reasoning: "medium",
  limits: {
    maxOutputTokensPerSession: 60_000,
  },
  outputSchema: z.array(
    z.object({
      leadId: z.string().uuid(),
      hooks: z
        .array(
          z.object({
            summary: z
              .string()
              .min(10)
              .max(300)
              .describe("One concrete, citable fact useful for personalization"),
            sourceUrl: z.string().url(),
          }),
        )
        .max(6),
      companySummary: z
        .string()
        .max(600)
        .nullable()
        .describe("What the lead's company actually does, from their own site"),
    }),
  ),
});
