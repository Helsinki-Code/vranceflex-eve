/**
 * How far an email address can be trusted to land in an inbox.
 *
 *  - verified: a verifier confirmed the mailbox accepts mail.
 *  - risky:    probably deliverable but not provable (a catch-all domain that
 *              accepts everything, a role address such as info@, a full inbox).
 *  - guess:    built from a pattern, never checked.
 *  - invalid:  the verifier says it will bounce, or it is disposable or a trap.
 *  - unknown:  not checked, or the verifier could not tell.
 *
 * Only "verified" is sent to by default. "risky" is sent to only when a
 * workspace explicitly allows it.
 */
export const emailStatuses = ["verified", "risky", "guess", "invalid", "unknown"] as const;

export type EmailStatus = (typeof emailStatuses)[number];

export const emailStatusLabels: Record<EmailStatus, { label: string; description: string }> = {
  verified: { label: "Verified", description: "A verifier confirmed this mailbox accepts mail." },
  risky: { label: "Risky", description: "Probably deliverable, but it can't be proven (catch-all domain, role address or full inbox)." },
  guess: { label: "Guessed", description: "Built from the company's email pattern and never checked." },
  invalid: { label: "Invalid", description: "It will bounce, or it is disposable or a spam trap." },
  unknown: { label: "Not checked", description: "This address hasn't been independently verified." },
};

/** Whether an address with this status may be emailed. */
export function emailStatusAllowsSending(status: EmailStatus, allowRisky: boolean) {
  return status === "verified" || (status === "risky" && allowRisky);
}
