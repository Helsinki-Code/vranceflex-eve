/**
 * Whether a mailbox is ready to send cold email, in plain terms.
 *
 *  - ready:     authenticated, established, and bouncing little.
 *  - warming:   fine to use but still earning trust (new domain, ramping up,
 *               partly authenticated, or bouncing a little more than it should).
 *  - not_ready: likely to land in spam or get the domain blocked (a personal
 *               mailbox, missing email authentication, or a high bounce rate).
 *
 * Advisory: it never stops a send by itself. It tells a person where the risk is.
 */
export type ReadinessLevel = "ready" | "warming" | "not_ready";

export type MailboxReadiness = { level: ReadinessLevel; reasons: string[] };

export type ReadinessInput = {
  /** A personal address such as gmail.com. */
  consumer: boolean;
  /** SPF, DKIM and DMARC status for the mailbox's domain, null when not checked. */
  domainStatus: "verified" | "partial" | "unverified" | null;
  /** Days since the domain was registered, null when unknown. */
  domainAgeDays: number | null;
  /** Date the daily cap finishes ramping up, null once fully ramped. */
  rampCompletesOn: Date | null;
  sentWeek: number;
  bouncedWeek: number;
  now?: Date;
};

export const YOUNG_DOMAIN_DAYS = 30;
const MIN_SENDS_FOR_BOUNCE_RATE = 20;
const BOUNCE_WARNING_RATE = 0.03;
const BOUNCE_BLOCKING_RATE = 0.05;

const order: Record<ReadinessLevel, number> = { ready: 0, warming: 1, not_ready: 2 };

export function assessMailboxReadiness(input: ReadinessInput): MailboxReadiness {
  const now = input.now ?? new Date();
  const notReady: string[] = [];
  const warming: string[] = [];

  if (input.consumer) {
    notReady.push("A personal mailbox (such as Gmail) isn't suitable for cold outreach. Use a mailbox on a separate sending domain.");
  }

  if (input.domainStatus === "unverified") {
    notReady.push("SPF, DKIM or DMARC records are missing or failing, so receivers may treat the mail as spoofed.");
  } else if (input.domainStatus === "partial") {
    warming.push("Some email authentication records still need fixing.");
  }

  if (input.sentWeek >= MIN_SENDS_FOR_BOUNCE_RATE) {
    const rate = input.bouncedWeek / input.sentWeek;
    const percent = Math.round(rate * 100);
    if (rate >= BOUNCE_BLOCKING_RATE) {
      notReady.push(`${percent}% of the last week's emails bounced. Clean the lead list before sending more.`);
    } else if (rate >= BOUNCE_WARNING_RATE) {
      warming.push(`${percent}% of the last week's emails bounced, which is above the 2% to aim for.`);
    }
  }

  if (input.domainAgeDays !== null && input.domainAgeDays < YOUNG_DOMAIN_DAYS) {
    warming.push(`The domain was registered ${input.domainAgeDays} day${input.domainAgeDays === 1 ? "" : "s"} ago. Mailbox providers distrust young domains; warm it up for at least ${YOUNG_DOMAIN_DAYS} days.`);
  }

  if (input.rampCompletesOn && input.rampCompletesOn.getTime() > now.getTime()) {
    warming.push(`Still ramping up daily volume until ${input.rampCompletesOn.toISOString().slice(0, 10)}.`);
  }

  const level: ReadinessLevel = notReady.length ? "not_ready" : warming.length ? "warming" : "ready";
  return { level, reasons: [...notReady, ...warming] };
}

export const readinessLabels: Record<ReadinessLevel, string> = {
  ready: "Ready",
  warming: "Warming up",
  not_ready: "Not ready",
};

/** The worst level among several mailboxes. */
export function worstReadiness(levels: ReadinessLevel[]): ReadinessLevel {
  return levels.reduce<ReadinessLevel>((worst, level) => (order[level] > order[worst] ? level : worst), "ready");
}
