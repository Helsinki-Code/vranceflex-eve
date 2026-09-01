import Link from "next/link";
import { ArrowRight, Check, MoveRight } from "lucide-react";
import { CompetitorComparisonTable } from "@/components/competitor-comparison-table";
import { CompetitorSourceList } from "@/components/competitor-source-list";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";
import { SeoJsonLd } from "@/components/seo-json-ld";
import {
  comparisonFeatureRows,
  competitorLastReviewed,
  competitorMethodology,
  type CompetitorProfile,
  vranceFlexProfile,
} from "@/lib/competitors/data";
import { absoluteSiteUrl } from "@/lib/seo/site";

export function CompetitorVsPage({ competitor }: { competitor: CompetitorProfile }) {
  const canonical = `/compare/vranceflex-vs-${competitor.slug}`;
  const faq = [
    {
      question: `What is the main difference between VranceFlex and ${competitor.name}?`,
      answer: `VranceFlex is built around a guided research-to-verification workflow, mandatory human approval, and delivery through customer-owned Resend or Twilio accounts. ${competitor.name} is positioned as ${competitor.positioning.toLowerCase()}`,
    },
    {
      question: `Who should choose ${competitor.name}?`,
      answer: `${competitor.name} is a stronger fit for ${competitor.bestFor.join("; ").toLowerCase()}.`,
    },
    {
      question: "Does VranceFlex offer automatic migration?",
      answer: "No. VranceFlex uses a controlled migration: contacts, exclusions, and reusable copy can be prepared for import, while provider credentials, approval ownership, and cadence are deliberately reconfigured and revalidated.",
    },
  ];

  return (
    <PublicSiteShell>
      <SeoJsonLd data={[
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `VranceFlex vs ${competitor.name}`,
          description: `An evidence-based comparison of VranceFlex and ${competitor.name} for B2B prospect research and outreach.`,
          url: absoluteSiteUrl(canonical),
          dateModified: competitorLastReviewed,
          about: [
            { "@type": "SoftwareApplication", name: "VranceFlex", url: absoluteSiteUrl("/") },
            { "@type": "SoftwareApplication", name: competitor.name, url: competitor.website },
          ],
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
        <PublicBreadcrumbs items={[{ label: "Compare", href: "/compare" }, { label: `VranceFlex vs ${competitor.name}` }]} />

        <section className="competitor-hero">
          <div>
            <span className="eyebrow">Product comparison · Reviewed {competitorLastReviewed}</span>
            <h1>VranceFlex vs {competitor.name}</h1>
          </div>
          <div className="competitor-hero-summary">
            <p>Choose VranceFlex for a guided, approval-led path from market research to verified outreach. Choose {competitor.name} when {competitor.bestFor[0].toLowerCase()} is the more important requirement.</p>
            <div className="public-hero-actions">
              <Link className="button-primary" href="/demo">See VranceFlex in context <ArrowRight size={16} /></Link>
              <a className="button-secondary" href={competitor.website} target="_blank" rel="noreferrer">Visit {competitor.name}</a>
            </div>
          </div>
        </section>

        <aside className="comparison-disclosure" aria-label="Comparison methodology">
          <strong>Editorial disclosure</strong>
          <p>This page is published by VranceFlex. It uses vendor-controlled sources, acknowledges where the competitor is stronger, and contains no invented customer quotes. {competitorMethodology}</p>
        </aside>

        <section className="comparison-tldr" aria-labelledby="comparison-tldr-title">
          <span>TL;DR</span>
          <div>
            <h2 id="comparison-tldr-title">Two different operating models</h2>
            <p>{competitor.name} is strong at {competitor.strengths.join(", ").toLowerCase()}. VranceFlex is narrower: it connects an evidence-backed campaign brief to successful contact verification, Eve-prepared drafts, required human approval, and BYOK delivery. That focus reduces flexibility, but makes the decision and provider boundaries explicit.</p>
          </div>
        </section>

        <section className="competitor-section" aria-labelledby="at-a-glance-title">
          <div className="competitor-section-heading">
            <span className="section-label">At a glance</span>
            <h2 id="at-a-glance-title">Compare the workflow, not only the checklist</h2>
            <p>The same feature label can hide a different operating model. The table describes how each product approaches the work.</p>
          </div>
          <CompetitorComparisonTable profiles={[vranceFlexProfile, competitor]} />
        </section>

        <section className="competitor-section" aria-labelledby="detail-title">
          <div className="competitor-section-heading">
            <span className="section-label">Detailed comparison</span>
            <h2 id="detail-title">Where the differences matter</h2>
          </div>
          <div className="comparison-dimension-stack">
            {comparisonFeatureRows.map(({ key, label }) => (
              <article key={key}>
                <div><span>{label}</span><strong>{vranceFlexProfile.name}</strong><p>{vranceFlexProfile.features[key]}</p></div>
                <div><span>{label}</span><strong>{competitor.name}</strong><p>{competitor.features[key]}</p></div>
                <p className="comparison-bottom-line"><strong>Decision lens:</strong> Choose VranceFlex when the durable checkpoint and approval model is the requirement. Choose {competitor.name} when its broader category strengths better match the job.</p>
              </article>
            ))}
          </div>
        </section>

        <section className="competitor-section" aria-labelledby="pricing-comparison-title">
          <div className="competitor-section-heading">
            <span className="section-label">Pricing and total cost</span>
            <h2 id="pricing-comparison-title">Compare the unit you are paying for</h2>
          </div>
          <div className="comparison-pricing-grid">
            {[vranceFlexProfile, competitor].map((profile) => (
              <article key={profile.slug}>
                <span>{profile.name}</span>
                <h3>{profile.pricing.entry}</h3>
                <p>{profile.pricing.summary}</p>
                <dl><div><dt>Model</dt><dd>{profile.pricing.model}</dd></div><div><dt>Free access</dt><dd>{profile.pricing.freeTier}</dd></div><div><dt>Enterprise</dt><dd>{profile.pricing.enterprise}</dd></div></dl>
              </article>
            ))}
          </div>
          <p className="comparison-cost-note">VranceFlex excludes Resend, Twilio, domains, mailboxes, and carrier fees because those providers remain customer-owned. Evaluate {competitor.name} add-ons, usage meters, seats, and infrastructure separately before comparing totals.</p>
        </section>

        <section className="competitor-section comparison-audience" aria-labelledby="best-fit-title">
          <div className="competitor-section-heading">
            <span className="section-label">Best fit</span>
            <h2 id="best-fit-title">Who should choose each product?</h2>
          </div>
          <div className="comparison-audience-grid">
            {[vranceFlexProfile, competitor].map((profile) => (
              <article key={profile.slug}>
                <h3>Choose {profile.name} if…</h3>
                <ul>{profile.bestFor.map((item) => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul>
                <h4>Probably not if…</h4>
                <ul className="comparison-muted-list">{profile.notIdealFor.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
            ))}
          </div>
        </section>

        <section className="competitor-section comparison-migration" aria-labelledby="migration-title">
          <div className="competitor-section-heading">
            <span className="section-label">Controlled migration</span>
            <h2 id="migration-title">Switching from {competitor.name}</h2>
            <p>{competitor.migration.note}</p>
          </div>
          <div className="comparison-migration-grid">
            <article><h3>Prepare to transfer</h3><ul>{competitor.migration.transfers.map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article><h3>Reconfigure deliberately</h3><ul>{competitor.migration.reconfigure.map((item) => <li key={item}>{item}</li>)}</ul></article>
          </div>
          <p className="comparison-evidence-note"><strong>Customer evidence policy:</strong> VranceFlex does not yet publish approved switcher testimonials. We will not manufacture quotes or imply a one-click migration that does not exist.</p>
        </section>

        <section className="competitor-section comparison-faq" aria-labelledby="faq-title">
          <div className="competitor-section-heading"><span className="section-label">FAQ</span><h2 id="faq-title">Evaluation questions</h2></div>
          <div>{faq.map((item) => <article key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}</div>
        </section>

        <CompetitorSourceList profiles={[vranceFlexProfile, competitor]} reviewed={competitorLastReviewed} />

        <section className="comparison-final-cta">
          <span className="section-label">Evaluate with your own workflow</span>
          <h2>See whether the approval-led model fits.</h2>
          <p>Use the guided demo before purchasing live research. If {competitor.name} is the better fit, this comparison should make that clear too.</p>
          <div className="public-hero-actions"><Link className="button-primary" href="/demo">Open the guided demo <ArrowRight size={16} /></Link><Link className="button-secondary" href={`/alternatives/${competitor.slug}`}>Read the alternative guide <MoveRight size={16} /></Link></div>
        </section>
      </div>
    </PublicSiteShell>
  );
}
