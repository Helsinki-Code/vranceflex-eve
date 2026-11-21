/**
 * The offer: the one free, useful thing a first email proposes as the fix for
 * the problem it names ("a written plan for getting you onto page one", "a
 * mockup of your homepage with online booking").
 *
 * It decides how many first emails get a reply, so it has to be something the
 * seller delivers on its own, quickly, and that is valuable even if the
 * prospect never buys. A discount, a demo or "a quick call" asks the prospect
 * to do work first, which is why they are refused here.
 */

export const OFFER_MIN_WORDS = 4;
export const OFFER_MAX_LENGTH = 300;

export const offerExamples = [
  "A written plan for getting your site onto page one for your main search terms",
  "A mockup of your homepage with online booking added",
  "A teardown of your last three ads with what we'd change",
  "A shortlist of five accounts that match your best customers, with who to contact",
] as const;

const REFUSED: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\b(discount|coupon|promo(?:tion|\s*code)?|voucher|cheaper|special (?:price|offer|deal)|\d{1,3}\s*%|percent off|% off|on sale|sale price|money[- ]back|free shipping)\b/i,
    message: "A discount asks them to buy first. Offer something you deliver for free instead, such as a plan, a mockup or a review.",
  },
  {
    pattern: /\b(demo|demonstration|walk[- ]?through|webinar|trial|free account|sign[- ]?up)\b/i,
    message: "A demo or trial asks them to spend time learning your product. Offer something finished that is useful on its own.",
  },
  {
    pattern: /\b(call|meeting|chat|catch[- ]?up|intro(?:ductory)?|sync|zoom|calendar|book a|schedule a|\d{1,2}[- ]?(?:min|minute)s?|coffee|conversation|consultation)\b/i,
    message: "A call or meeting asks for their time before they've seen any value. Offer a finished deliverable; the conversation can follow.",
  },
];

/** A plain-language reason the offer won't work, or null when it is fine. */
export function offerProblem(offer: string | null | undefined): string | null {
  const text = (offer ?? "").trim();
  if (!text) return null;
  if (text.length > OFFER_MAX_LENGTH) return `Keep the offer under ${OFFER_MAX_LENGTH} characters.`;
  if (text.split(/\s+/).filter(Boolean).length < OFFER_MIN_WORDS) {
    return "Say what they'll get, in a few words (for example: a written plan for getting you onto page one).";
  }
  for (const rule of REFUSED) {
    if (rule.pattern.test(text)) return rule.message;
  }
  return null;
}
