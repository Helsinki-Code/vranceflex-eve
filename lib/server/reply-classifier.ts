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

// Opt-out and out-of-office wording in the languages people actually write
// back in. Matching runs on text with accents removed ("désabonner" ->
// "desabonner"), so these are written without accents.
const OPT_OUT_PHRASES = [
  // English
  "unsubscribe", "remove me", "stop (?:emailing|contacting|messaging)", "do not contact", "don't contact", "opt out",
  // French
  "desabonn\\w*", "desinscri\\w*", "ne (?:plus )?me contact\\w*", "ne me contactez plus", "ne m'ecrivez plus", "arretez de m'ecrire",
  "supprimez-moi", "retirez-moi", "retirer mon adresse",
  // Italian
  "cancellami", "cancellatemi", "rimuovimi", "rimuovetemi", "non contattarmi", "non contattatemi", "non scrivermi", "non scrivetemi",
  "annulla (?:l'iscrizione|la mia iscrizione)", "disiscri\\w*",
  // Spanish
  "darme de baja", "dar de baja", "no me contacten", "no me contactes", "no me escriban", "no me escribas", "elimineme", "eliminenme", "eliminame",
  "borrarme de la lista", "cancelar (?:mi )?suscripcion",
  // German
  "abmelden", "austragen", "keine weiteren e-?mails", "nicht mehr kontaktieren", "kontaktieren sie mich nicht mehr",
  "bitte entfernen sie mich", "loschen sie mich", "schreiben sie mir nicht mehr",
  // Dutch
  "uitschrijven", "afmelden", "verwijder mij", "neem geen contact", "stuur me geen", "niet meer mailen", "mail mij niet meer",
];
const OPT_OUT = new RegExp(`(?<![a-z])(?:${OPT_OUT_PHRASES.join("|")})(?![a-z])`, "i");

const OUT_OF_OFFICE_PHRASES = [
  // English
  "out of (?:the )?office", "automatic reply", "auto[- ]?reply", "away from (?:my )?email", "returning on", "back on",
  // French
  "absent(?:e)? du bureau", "je suis absent", "reponse automatique", "message d'absence", "en conges",
  // Italian
  "fuori sede", "fuori ufficio", "risposta automatica",
  // Spanish
  "fuera de la oficina", "respuesta automatica", "estare ausente", "de vacaciones",
  // German
  "abwesenheitsnotiz", "ich bin abwesend", "automatische antwort", "nicht im buro", "bin im urlaub",
  // Dutch
  "afwezigheidsmelding", "ik ben afwezig", "automatisch antwoord", "buiten kantoor",
];
const OUT_OF_OFFICE = new RegExp(`(?<![a-z])(?:${OUT_OF_OFFICE_PHRASES.join("|")})(?![a-z])`, "i");

// A clear "yes" to the free offer in the first email ("Yes please, send it
// over"). Only considered when the campaign has an offer, and never when the
// reply also asks for a meeting, questions the offer, or hedges.
const ACCEPTANCE_START =
  /^(?:yes|yeah|yep|yup|sure|absolutely|definitely|please do|please send|go ahead|that would be (?:great|helpful|amazing|awesome)|i(?:'d| would) (?:love|like) (?:that|to|it|this)|send it (?:over|through)|would love (?:that|to)|love that|do it)\b/;
const ACCEPTANCE_BLOCKERS =
  /\?|\b(?:but|however|unless|not now|later|next (?:month|quarter|year)|tell me more|more (?:info|information|details)|how much|price|cost|who are you|what is|what are|why|talk|call|meeting|schedule|calendar|book|demo)\b/;

function stripGreeting(text: string) {
  return text.replace(/^(?:hi|hello|hey|dear|good (?:morning|afternoon|evening))(?: [a-z'-]+)?[,!.]?\s*/, "");
}

export function looksLikeAcceptance(normalized: string) {
  const body = stripGreeting(normalized).slice(0, 240);
  return ACCEPTANCE_START.test(body) && !ACCEPTANCE_BLOCKERS.test(body);
}

/** Lowercase, straighten quotes, drop accents and collapse whitespace. */
export function normalizeForClassification(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A plain "no". These are checked before the HOT signals, because words such
// as "interested", "call" and "available" also appear inside refusals
// ("not interested", "please don't call", "no thanks, not available").
const EXPLICIT_DECLINE =
  /\b(not (really |currently |at all )?interested|no interest|no,? thanks|no thank you|not looking|(we|i)(?:'ll| will| am going to|'m going to) pass|(please )?(don'?t|do not) (call|ring|phone|text)|not (a )?(good )?fit)\b/i;

const HOT_SIGNAL =
  /\b(book|schedule|calendar|meeting|demo|call|available|let'?s talk|interested)\b/i;

// Drops negated forms ("not available", "can't do a call", "no meeting") so a
// refusal never reads as interest.
const NEGATED_PHRASE =
  /\b(?:not|never|no|isn'?t|aren'?t|can'?t|cannot|won'?t|wouldn'?t|don'?t|do not)\s+(?:\w+\s+){0,2}?(?:book|schedule|calendar|meeting|demo|call|available|interested|free)\b/gi;

function withoutNegatedPhrases(text: string) {
  return text.replace(NEGATED_PHRASE, " ");
}

function outOfOfficeClassification(reasoning: string): ReplyClassification {
  return {
    intent: "OUT_OF_OFFICE",
    sentimentScore: 5,
    confidence: "high",
    reasoning,
    nextAction: "wait_for_ooo",
    actionDetail: "Follow-ups are held until the person is back.",
    suggestedResponse: "",
    flagForHuman: false,
    flagReason: null,
  };
}

export function classifyReply(text: string, options: { autoReply?: boolean; hasOffer?: boolean } = {}): ReplyClassification {
  const normalized = normalizeForClassification(text);
  // The headers say a machine wrote this. Believe them over the wording: an
  // auto-responder's footer often says "to unsubscribe click here".
  if (options.autoReply) return outOfOfficeClassification("The message's headers mark it as an automatic reply.");
  if (OPT_OUT.test(normalized)) {
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
  if (OUT_OF_OFFICE.test(normalized)) {
    return outOfOfficeClassification("The message appears to be an automatic out-of-office response.");
  }
  if (EXPLICIT_DECLINE.test(normalized)) {
    return {
      intent: "NOT_FIT",
      sentimentScore: 3,
      confidence: "high",
      reasoning: "The recipient explicitly declined or said they are not interested.",
      nextAction: "pause_sequence",
      actionDetail: "Leave this lead paused and let a human decide whether to archive it.",
      suggestedResponse: "Thanks for letting me know. I appreciate the clarity.",
      flagForHuman: true,
      flagReason: "Confirm whether the lead should be archived or reassigned.",
    };
  }
  if (options.hasOffer && looksLikeAcceptance(normalized)) {
    return {
      intent: "OFFER_ACCEPTED",
      sentimentScore: 10,
      confidence: "medium",
      reasoning: "They said yes to the free offer in the first email.",
      nextAction: "escalate_to_human",
      actionDetail: "Deliver what you offered, then reply to them with it.",
      suggestedResponse: "Great, I'll put that together and send it over shortly.",
      flagForHuman: true,
      flagReason: "Said yes to your offer: deliver it.",
    };
  }
  if (HOT_SIGNAL.test(withoutNegatedPhrases(normalized))) {
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
