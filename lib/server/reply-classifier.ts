import type { ReplyIntent } from "../domain/pipeline";

type ReplyClassification = {
  intent: ReplyIntent;
  sentimentScore: number;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  nextAction: string;
  actionDetail: string;
  suggestedResponse: string;
  flagForHuman: boolean;
  flagReason: string | null;
};

export function classifyReply(text: string): ReplyClassification {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (
    /\b(unsubscribe|remove me|stop (emailing|contacting|messaging)|do not contact|don't contact|opt out)\b/i.test(
      normalized,
    )
  ) {
    return {
      intent: "UNSUBSCRIBE",
      sentimentScore: 2,
      confidence: "high",
      reasoning: "The reply contains an explicit request to stop contact.",
      nextAction: "stop_sequence",
      actionDetail: "Permanently suppress the recipient and send no further outreach.",
      suggestedResponse: "Understood. You have been removed from future outreach.",
      flagForHuman: false,
      flagReason: null,
    };
  }
  if (
    /\b(out of (the )?office|automatic reply|auto[- ]?reply|away from (my )?email|returning on|back on)\b/i.test(
      normalized,
    )
  ) {
    return {
      intent: "OUT_OF_OFFICE",
      sentimentScore: 5,
      confidence: "high",
      reasoning: "The message appears to be an automatic out-of-office response.",
      nextAction: "wait_for_ooo",
      actionDetail: "Keep outreach paused until a person reviews the return timing.",
      suggestedResponse: "",
      flagForHuman: false,
      flagReason: null,
    };
  }
  if (
    /\b(book|schedule|calendar|meeting|demo|call|available|let'?s talk|interested)\b/i.test(
      normalized,
    )
  ) {
    return {
      intent: "HOT",
      sentimentScore: 9,
      confidence: "high",
      reasoning: "The reply shows active interest or asks to continue the conversation.",
      nextAction: "book_meeting",
      actionDetail: "Assign a human owner and respond promptly with concrete availability.",
      suggestedResponse:
        "Thanks for getting back to me. I’d be glad to continue the conversation—what time works best for you?",
      flagForHuman: true,
      flagReason: "High-intent reply needs a prompt human response.",
    };
  }
  if (
    /\b(too expensive|price|budget|not now|timing|already use|concern|however|but we|not convinced)\b/i.test(
      normalized,
    )
  ) {
    return {
      intent: "OBJECTION",
      sentimentScore: 4,
      confidence: "medium",
      reasoning: "The reply includes a specific concern about fit, timing or value.",
      nextAction: "address_objection",
      actionDetail: "Review the objection and prepare a short, specific human response.",
      suggestedResponse:
        "Thanks for being direct. I understand the concern and would be happy to address it briefly if that would be useful.",
      flagForHuman: true,
      flagReason: "A human should review the objection before responding.",
    };
  }
  if (
    /\b(not (a )?fit|wrong person|not responsible|no need|not relevant|we'?re good)\b/i.test(
      normalized,
    )
  ) {
    return {
      intent: "NOT_FIT",
      sentimentScore: 4,
      confidence: "medium",
      reasoning: "The recipient indicates that the offer or contact is not a fit.",
      nextAction: "pause_sequence",
      actionDetail: "Leave this lead paused and let a human decide whether to archive it.",
      suggestedResponse: "Thanks for letting me know. I appreciate the clarity.",
      flagForHuman: true,
      flagReason: "Confirm whether the lead should be archived or reassigned.",
    };
  }
  if (/\b(sounds good|tell me more|curious|maybe|possibly|thanks for sharing)\b/i.test(normalized)) {
    return {
      intent: "WARM",
      sentimentScore: 7,
      confidence: "medium",
      reasoning: "The reply is positive but does not yet contain a firm next step.",
      nextAction: "escalate_to_human",
      actionDetail: "Ask a human owner to continue the conversation with relevant context.",
      suggestedResponse:
        "Thanks for the reply. I can share a little more context and keep it focused on what is most relevant to you.",
      flagForHuman: true,
      flagReason: "Positive reply should be handled personally.",
    };
  }
  return {
    intent: "NEUTRAL",
    sentimentScore: 5,
    confidence: "low",
    reasoning: "The reply does not contain a sufficiently clear intent signal.",
    nextAction: "escalate_to_human",
    actionDetail: "Keep the sequence paused until a human reviews the full context.",
    suggestedResponse: "",
    flagForHuman: true,
    flagReason: "Ambiguous reply requires human interpretation.",
  };
}
