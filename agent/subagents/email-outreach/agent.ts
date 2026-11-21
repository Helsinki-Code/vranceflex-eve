import { defineAgent } from "eve";
import { z } from "zod";

const emailStep = z.object({
  step: z.number().int().min(1).max(3),
  day: z.number().int().nonnegative(),
  channel: z.literal("email"),
  type: z.enum(["observation", "new_angle", "breakup"]),
  subject: z.string().min(1).max(49),
  subject_b: z.string().min(1).max(49),
  content: z.string().min(1),
});

export default defineAgent({
  description:
    "Write a short, deeply personalized three-email outreach sequence (observation plus offer, new angle, breakup) with two short subject-line variants per step. Generates copy only; approved delivery is handled exclusively by the Resend server integration.",
  model: "anthropic/claude-haiku-4.5",
  modelContextWindowTokens: 200_000,
  outputSchema: z.array(
    z.object({
      lead_name: z.string().min(1),
      title: z.string(),
      company: z.string().min(1),
      email: z.string().email(),
      personalisation_note: z.string().min(1),
      sequence: z.array(emailStep).length(3),
    }),
  ),
});
