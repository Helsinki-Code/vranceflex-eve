import type { Metadata } from "next";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";

export const metadata: Metadata = {
  title: "B2B research and outreach glossary | VranceFlex",
  description: "Definitions for ICP research, lead verification, prospect credits, human approval, BYOK delivery, recurrence and idempotency.",
  alternates: { canonical: "/resources/glossary" },
  openGraph: { url: "/resources/glossary", title: "VranceFlex glossary", description: "Clear definitions for controlled B2B research and outreach." },
};

const terms = [
  ["At-least-once dispatch", "A scheduling guarantee in which a due event may be delivered more than once. Systems must make the external action idempotent rather than assuming one dispatch."],
  ["Bring your own key (BYOK)", "A model in which the workspace connects and pays for its own provider account. In VranceFlex, Resend and Twilio delivery use workspace-owned credentials."],
  ["Campaign checkpoint", "Persisted output from a completed workflow stage that lets later work resume without repeating earlier research or enrichment."],
  ["Daily cap", "The maximum number of eligible delivery actions an organization may make in a day. It is checked by the delivery worker, including for recurring schedules."],
  ["Delivery job", "A durable record representing one intended provider side effect for one recipient, channel, and approved sequence step."],
  ["Human approval gate", "The explicit decision between prepared outreach and external delivery. Generation alone cannot satisfy the gate."],
  ["Ideal customer profile (ICP)", "A set of observable company, buying-context, role, and exclusion criteria used to decide which prospects plausibly fit an offer."],
  ["Idempotency", "The property that retrying an operation produces no additional charge or external send after the first successful effect."],
  ["Lead candidate", "A person returned by discovery who appears to match the campaign objective but has not yet completed the required contact verification."],
  ["One-shot schedule", "A campaign or sequence configured to become due once at a specific time rather than repeating on an interval."],
  ["Recurring schedule", "A campaign or sequence configured to become due repeatedly using a minute- or day-based cadence, with visible pause and resume controls."],
  ["Suppression", "A durable instruction that prevents outreach to a recipient or channel, commonly following an opt-out or internal block decision."],
  ["Verified prospect", "A selected candidate whose required usable contact information was successfully returned and recorded for review."],
  ["Verified-prospect credit", "The VranceFlex usage unit consumed once for a successful usable verification. A failed verification does not consume a customer credit."],
] as const;

export default function GlossaryPage() {
  return (
    <PublicSiteShell>
      <div className="public-page-shell">
        <PublicBreadcrumbs items={[{ label: "Resources", href: "/resources" }, { label: "Glossary" }]} />
        <section className="public-index-hero">
          <span className="eyebrow">Resources · Glossary</span>
          <h1>The language of controlled outreach.</h1>
          <p>Precise definitions for the research, data, approval, scheduling, and delivery concepts used throughout VranceFlex.</p>
        </section>
        <div className="public-section-stack">
          {terms.map(([term, definition], index) => (
            <section className="public-content-section" id={term.toLowerCase().replace(/[^a-z0-9]+/g, "-")} key={term}>
              <div className="public-section-index">{String(index + 1).padStart(2, "0")}</div>
              <div><h2>{term}</h2><p>{definition}</p></div>
            </section>
          ))}
        </div>
      </div>
    </PublicSiteShell>
  );
}
