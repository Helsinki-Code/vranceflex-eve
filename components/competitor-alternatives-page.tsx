import Link from "next/link";
import { ArrowRight, Check, MoveRight } from "lucide-react";
import { CompetitorComparisonTable } from "@/components/competitor-comparison-table";
import { CompetitorSourceList } from "@/components/competitor-source-list";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";
import { SeoJsonLd } from "@/components/seo-json-ld";
import {
  allProductProfiles,
  alternativesSlugFor,
  competitorLastReviewed,
  competitorMethodology,
  type CompetitorProfile,
} from "@/lib/competitors/data";
import { absoluteSiteUrl } from "@/lib/seo/site";

export function CompetitorAlternativesPage({ competitor }: { competitor: CompetitorProfile }) {
  const alternatives = allProductProfiles.filter(({ slug }) => slug !== competitor.slug);
  const canonical = `/alternatives/${alternativesSlugFor(competitor)}`;
  const faq = [
    {
      question: `What are the best ${competitor.name} alternatives?`,
      answer: `The best option depends on the job. VranceFlex fits approval-led research and BYOK delivery; ${alternatives.filter(({ slug }) => slug !== "vranceflex").map(({ name }) => name).join(", ")} cover different combinations of data, enrichment, mailbox operations, and multichannel engagement.`,
    },
    {
      question: `Is VranceFlex a complete replacement for ${competitor.name}?`,
      answer: `No. VranceFlex is intentionally narrower. It connects research, successful verification, Eve-prepared drafts, mandatory approval, scheduling, and customer-owned Resend or Twilio delivery; it does not reproduce every ${competitor.name} capability.`,
    },
  ];

  return (
    <PublicSiteShell>
      <SeoJsonLd data={[
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${competitor.name} alternatives`,
          url: absoluteSiteUrl(canonical),
          dateModified: competitorLastReviewed,
          numberOfItems: alternatives.length,
          itemListElement: alternatives.map((profile, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item: { "@type": "SoftwareApplication", name: profile.name, url: profile.website },
          })),
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        },
      ]} />

      <div className="public-page-shell competitor-page">
        <PublicBreadcrumbs items={[{ label: "Alternatives", href: "/alternatives" }, { label: `${competitor.name} alternatives` }]} />

        <section className="competitor-hero">
          <div>
            <span className="eyebrow">Market guide · Reviewed {competitorLastReviewed}</span>
            <h1>{alternatives.length} {competitor.name} alternatives for different outbound workflows</h1>
          </div>
          <div className="competitor-hero-summary">
            <p>There is no universal winner. Compare a focused approval-led workflow, email infrastructure, sales intelligence, enrichment orchestration, and multichannel engagement by the job your team actually needs.</p>
            <div className="public-hero-actions">
              <Link className="button-primary" href={`/alternatives/${competitor.slug}`}>Evaluate a direct switch <ArrowRight size={16} /></Link>
              <Link className="button-secondary" href="/compare">Browse comparisons</Link>
            </div>
          </div>
        </section>

        <aside className="comparison-disclosure" aria-label="Editorial methodology">
          <strong>How this list is produced</strong>
          <p>VranceFlex publishes this guide and is listed first, so it is not an independent ranking. The remaining products are genuine alternatives, no review sentiment is invented, and no product wins every use case. {competitorMethodology}</p>
        </aside>

        <section className="comparison-tldr" aria-labelledby="alternatives-tldr-title">
          <span>TL;DR</span>
          <div>
            <h2 id="alternatives-tldr-title">Choose the operating model before the vendor.</h2>
            <p>Use VranceFlex when research continuity, successful-verification credits, mandatory approval, and BYOK delivery are central. Choose another option when mailbox scale, a large native sales database, a configurable enrichment canvas, or broader native channels matter more.</p>
          </div>
        </section>

        <section className="competitor-section" aria-labelledby="criteria-title">
          <div className="competitor-section-heading">
            <span className="section-label">Evaluation framework</span>
            <h2 id="criteria-title">What to look for in a {competitor.name} alternative</h2>
            <p>Score the workflow on durable outcomes and operating responsibility—not the raw number of features.</p>
          </div>
          <div className="alternative-reason-grid">
            {[
              ["01", "Data outcome", "Define whether you pay for searches, records, credits, or successfully usable contacts."],
              ["02", "Send boundary", "Decide whether delivery is automatic, team-configured, or requires explicit human approval."],
              ["03", "Provider ownership", "Confirm who owns sender accounts, delivery charges, suppression state, and reputation."],
              ["04", "Workflow breadth", "Choose between a prescriptive campaign path and a flexible system your team must design."],
            ].map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </section>

        <section className="competitor-section" aria-labelledby="alternatives-table-title">
          <div className="competitor-section-heading">
            <span className="section-label">At a glance</span>
            <h2 id="alternatives-table-title">Five credible options</h2>
            <p>The table describes how each product approaches the work; it does not convert nuanced capabilities into misleading yes/no scores.</p>
          </div>
          <CompetitorComparisonTable profiles={alternatives} />
        </section>

        <section className="competitor-section" aria-labelledby="alternatives-detail-title">
          <div className="competitor-section-heading">
            <span className="section-label">Detailed recommendations</span>
            <h2 id="alternatives-detail-title">The best alternative by use case</h2>
          </div>
          <div className="alternatives-breakdown-grid">
            {alternatives.map((profile, index) => (
              <article key={profile.slug}>
                <div className="alternatives-breakdown-heading"><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{profile.name}</h3><p>{profile.category}</p></div></div>
                <p>{profile.positioning}</p>
                <h4>Best when</h4>
                <ul>{profile.bestFor.map((item) => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul>
                <h4>Look elsewhere when</h4>
                <ul className="comparison-muted-list">{profile.notIdealFor.map((item) => <li key={item}>{item}</li>)}</ul>
                <div className="alternative-price-line"><span>{profile.pricing.model}</span><strong>{profile.pricing.entry}</strong></div>
                <Link className="public-link-action" href={profile.slug === "vranceflex" ? `/compare/vranceflex-vs-${competitor.slug}` : `/alternatives/${profile.slug}`}>Evaluate {profile.name} <MoveRight size={15} /></Link>
              </article>
            ))}
          </div>
        </section>

        <section className="competitor-section comparison-faq" aria-labelledby="alternatives-faq-title">
          <div className="competitor-section-heading"><span className="section-label">FAQ</span><h2 id="alternatives-faq-title">Short answers before you shortlist</h2></div>
          <div>{faq.map((item) => <article key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}</div>
        </section>

        <CompetitorSourceList profiles={[competitor, ...alternatives]} reviewed={competitorLastReviewed} />

        <section className="comparison-final-cta">
          <span className="section-label">Test the narrow option</span>
          <h2>Inspect VranceFlex with sample data.</h2>
          <p>The guided demo shows the research, verification, approval, and scheduling model without consuming credits or calling a delivery provider.</p>
          <div className="public-hero-actions"><Link className="button-primary" href="/demo">Open guided demo <ArrowRight size={16} /></Link><a className="button-secondary" href={competitor.website} target="_blank" rel="noreferrer">Recheck {competitor.name}</a></div>
        </section>
      </div>
    </PublicSiteShell>
  );
}
