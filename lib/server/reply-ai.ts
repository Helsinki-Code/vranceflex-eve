import { and, eq } from "drizzle-orm";
import { generateText, Output } from "ai";
import { z } from "zod";
import { replyIntents } from "../domain/pipeline";
import { getDatabase } from "./database";
import { inboundReplies } from "./database/schema";
import { echoesInstructions, extractLinkHosts } from "./send-gate";
import { fence, UNTRUSTED_RULE } from "./untrusted";

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

export const REPLY_SYSTEM_PROMPT = `${UNTRUSTED_RULE}\n\nYou classify replies to B2B cold outreach (email or SMS) for a sales team.
Intents: OFFER_ACCEPTED (says yes to the free offer in the first email and expects it delivered; only when an offer is given below), HOT (asks for a meeting, pricing or next step), WARM (interested, wants info), NEUTRAL, OBJECTION (timing, budget, incumbent vendor), NOT_FIT, OUT_OF_OFFICE, UNSUBSCRIBE (any request to stop contact).
Write reasoning in one sentence that quotes or paraphrases the reply. The suggested response must be short, specific to what they said, written for a human to send from their own inbox, and contain no placeholders. For UNSUBSCRIBE, OUT_OF_OFFICE and NOT_FIT the suggested response may be empty.
Flag for a human whenever money, legal terms, a complaint, a meeting time, or an ambiguous opt-out is involved.`;

/** The model call's prompt. Everything that came from outside is fenced as untrusted. */
export function buildReplyPrompt(input: { channel: "email" | "sms"; text: string; subject: string | null; leadName: string; companyName: string; offer?: string | null }, randomHex?: () => string) {
  return [
    `Channel: ${input.channel}`,
    input.offer ? `The free offer in the first email (written by the seller): ${input.offer}` : null,
    fence(`${input.leadName} at ${input.companyName}`, "sender name and company", randomHex),
    input.subject ? fence(input.subject, "reply subject", randomHex) : null,
    fence(input.text.slice(0, 4_000), "reply body", randomHex),
  ]
    .filter((part): part is string => part !== null)
    .join("\n");
}

/**
 * A suggested response is written for a person to send from their own inbox.
 * If the model produced a link or quoted instructions, it was probably steered
 * by the reply it was reading, so the suggestion is dropped and a person is
 * asked to look.
 */
export function screenSuggestedResponse(suggestedResponse: string): { text: string; problem: string | null } {
  if (extractLinkHosts(suggestedResponse).length) {
    return { text: "", problem: "The drafted response contained a link, so it was removed. Check what the reply asked for." };
  }
  if (echoesInstructions(suggestedResponse)) {
    return { text: "", problem: "The drafted response quoted instructions, so it was removed. Read the reply yourself." };
  }
  return { text: suggestedResponse, problem: null };
}

export function isReplyModelConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim());
}

export async function refineReplyClassification(input: { replyId: string; channel: "email" | "sms"; text: string; subject: string | null; leadName: string; companyName: string; regexIntent: string; offer?: string | null }) {
  if (!isReplyModelConfigured() || !input.text.trim()) return { refined: false as const };
  const { output } = await generateText({
    model: MODEL,
    system: REPLY_SYSTEM_PROMPT,
    output: Output.object({ schema: classificationSchema }),
    prompt: buildReplyPrompt(input),
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(20_000),
  });

  // Opt-outs detected by the deterministic classifier are final. A model-only
  // opt-out is surfaced for a person to confirm rather than applied silently.
  const screened = screenSuggestedResponse(output.suggestedResponse);
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
      suggestedResponse: screened.text,
      flagForHuman: modelOnlyOptOut || output.flagForHuman || screened.problem !== null,
      flagReason: modelOnlyOptOut ? "Possible opt-out" : (screened.problem ?? output.flagReason),
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
  // Loaded lazily: this module also runs inside the eve dispatcher, where
  // next/server isn't resolvable and there is no request to defer past.
  void import("next/server")
    .then(({ after }) => after(task))
    .catch(() => void task());
}
