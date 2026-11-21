/**
 * Rules for outreach copy, shared by the send-safety gate and (in a later
 * phase) the agent prompts, so what the writers are told and what is enforced
 * before sending cannot drift apart.
 */

/**
 * Phrases that make cold email read as automated or templated. Matching is
 * case-insensitive and whole-phrase. Advisory only: a human can still approve
 * copy that uses one.
 */
export const bannedPhrases = [
  "i hope this email finds you well",
  "i hope this finds you well",
  "i hope you're doing well",
  "i hope you are doing well",
  "touch base",
  "circle back",
  "synergy",
  "game-changer",
  "game changer",
  "revolutionary",
  "cutting-edge",
  "cutting edge",
  "state-of-the-art",
  "best-in-class",
  "world-class",
  "in today's fast-paced",
  "in today's digital landscape",
  "unlock the power",
  "unlock your potential",
  "take your business to the next level",
  "delve into",
  "i came across your company",
  "i wanted to reach out",
  "just checking in",
  "just following up",
  "quick question",
  "pick your brain",
  "let me know if you're interested",
  "to whom it may concern",
] as const;

/**
 * Soft length ceilings (words) per step. A sequence is three short emails: an
 * observation plus the offer, a new angle, and a breakup. Advisory only.
 */
export const maxWordsForStep = (stepNumber: number) => (stepNumber <= 2 ? 75 : stepNumber === 3 ? 40 : 60);

export const maxSubjectLength = 70;
