import { and, eq } from "drizzle-orm";
import { generateText, Output } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { replyIntents } from "../domain/pipeline";
import { getDatabase } from "./database";
import { inboundReplies } from "./database/schema";

// Model-based second opinion on an inbound reply. The regex classifier in
// reply-classifier.ts runs first and decides suppression synchronously; this
// only refines intent, next step and the suggested response, so a slow or
// failed model call never delays or blocks the webhook.

const MODEL = "anthropic/claude-haiku-4.5";

const classificationSchema = z.object({
  intent: z.enum(replyIntents),
  sentimentScore: z.number().int().min(1).max(10),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string().min(1).max(400),
  nextAction: z.enum(["book_meeting", "send_case_study", "send_pricing", "address_objection", "continue_sequence", "pause_30_days", "pause_sequence", "stop_sequence", "wait_for_ooo", "escalate_to_human"]),
  actionDetail: z.string().min(1).max(300),
  suggestedResponse: z.string().max(900),
  flagForHuman: z.boolean(),
  flagReason: z.string().max(200).nullable(),
});

const SYSTEM = `You classify replies to B2B cold outreach (email or SMS) for a sales team.
Intents: HOT (asks for a meeting, pricing or next step), WARM (interested, wants info), NEUTRAL, OBJECTION (timing, budget, incumbent vendor), NOT_FIT, OUT_OF_OFFICE, UNSUBSCRIBE (any request to stop contact).
Write reasoning in one sentence that quotes or paraphrases the reply. The suggested response must be short, specific to what they said, written for a human to send from their own inbox, and contain no placeholders. For UNSUBSCRIBE, OUT_OF_OFFICE and NOT_FIT the suggested response may be empty.
Flag for a human whenever money, legal terms, a complaint, a meeting time, or an ambiguous opt-out is involved.`;

export function isReplyModelConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim());
}

export async function refineReplyClassification(input: { replyId: string; channel: "email" | "sms"; text: string; subject: string | null; leadName: string; companyName: string; regexIntent: string }) {
  if (!isReplyModelConfigured() || !input.text.trim()) return { refined: false as const };
  const { output } = await generateText({
    model: MODEL,
    system: SYSTEM,
    output: Output.object({ schema: classificationSchema }),
    prompt: `Channel: ${input.channel}\nFrom: ${input.leadName} at ${input.companyName}\n${input.subject ? `Subject: ${input.subject}\n` : ""}Reply:\n"""\n${input.text.slice(0, 4_000)}\n"""`,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(20_000),
  });

  // Opt-outs detected by the deterministic classifier are final. A model-only
  // opt-out is surfaced for a person to confirm rather than applied silently.
  const alreadyUnsubscribed = input.regexIntent === "UNSUBSCRIBE";
  const modelOnlyOptOut = output.intent === "UNSUBSCRIBE" && !alreadyUnsubscribed;
  await getDatabase()
    .update(inboundReplies)
    .set({
      intent: alreadyUnsubscribed ? "UNSUBSCRIBE" : output.intent,
      sentimentScore: output.sentimentScore,
      confidence: output.confidence,
      reasoning: output.reasoning,
      nextAction: alreadyUnsubscribed ? "stop_sequence" : output.nextAction,
      actionDetail: modelOnlyOptOut ? "Looks like an opt-out. Confirm, then suppress this lead from the lead drawer." : output.actionDetail,
      suggestedResponse: output.suggestedResponse,
      flagForHuman: modelOnlyOptOut || output.flagForHuman,
      flagReason: modelOnlyOptOut ? "Possible opt-out" : output.flagReason,
      updatedAt: new Date(),
    })
    // Never overwrite a reply someone has already reviewed or archived.
    .where(and(eq(inboundReplies.id, input.replyId), eq(inboundReplies.status, "classified")));
  return { refined: true as const, intent: output.intent };
}

// Runs after the response is sent when called inside a request; falls back to
// a detached promise elsewhere (scripts, tests).
export function scheduleReplyRefinement(input: Parameters<typeof refineReplyClassification>[0]) {
  if (!isReplyModelConfigured()) return;
  const task = () => refineReplyClassification(input).catch((error) => {
    console.error("[reply-ai] refinement failed", { replyId: input.replyId, error: error instanceof Error ? error.message : error });
  });
  try {
    after(task);
  } catch {
    void task();
  }
}
