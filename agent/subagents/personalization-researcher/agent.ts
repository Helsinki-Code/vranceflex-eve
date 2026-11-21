import { defineAgent } from "eve";
import { z } from "zod";
import { echoesInstructions } from "../../../lib/server/send-gate";

// Research text is distilled from pages strangers wrote. Reject any that quotes
// instructions or system text, and any source that is not a plain web page.
const noEchoedInstructions = (value: string) => !echoesInstructions(value);
const webPage = (value: string) => /^https?:\/\//i.test(value);

export default defineAgent({
  description:
    "Research each already-verified lead's company website and any publicly indexed information to surface real, citable personalization hooks for outreach — never contact discovery or invented details.",
  model: "anthropic/claude-sonnet-4.6",
  modelContextWindowTokens: 1_000_000,
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
              .refine(noEchoedInstructions, "A hook must state a fact, never repeat instructions.")
              .describe("One concrete, citable fact useful for personalization"),
            sourceUrl: z.string().url().refine(webPage, "sourceUrl must be an http(s) page."),
          }),
        )
        .max(6),
      companySummary: z
        .string()
        .max(600)
        .refine(noEchoedInstructions, "A summary must describe the company, never repeat instructions.")
        .nullable()
        .describe("What the lead's company actually does, from their own site"),
    }),
  ),
});
