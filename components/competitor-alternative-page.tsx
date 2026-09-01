import Link from "next/link";
import { ArrowRight, Check, MoveRight } from "lucide-react";
import { CompetitorComparisonTable } from "@/components/competitor-comparison-table";
import { CompetitorSourceList } from "@/components/competitor-source-list";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";
import { SeoJsonLd } from "@/components/seo-json-ld";
import {
  competitorLastReviewed,
  competitorMethodology,
  competitorProfiles,
  type CompetitorProfile,
  vranceFlexProfile,
} from "@/lib/competitors/data";
import { absoluteSiteUrl } from "@/lib/seo/site";

export function CompetitorAlternativePage({ competitor }: { competitor: CompetitorProfile }) {
  const alternatives = competitorProfiles.filter(({ slug }) => slug !== competitor.slug);
  const canonical = `/alternatives/${competitor.slug}`;
  const faq = [
    {
      question: `What is the best ${competitor.name} alternative for approval-led outreach?`,
      answer: `VranceFlex is designed for teams that want research, successful contact verification, generated drafts, mandatory human approval, and BYOK Resend or Twilio delivery in one durable workflow. It is not the best substitute for every ${competitor.name} capability.`,
    },
    {
      question: `Can VranceFlex replace every ${competitor.name} feature?`,
      answer: `No. ${competitor.name} is stronger for ${competitor.strengths.join("; ").toLowerCase()}. VranceFlex intentionally focuses on verified prospect outcomes, reviewable campaign context, and approval-controlled email and SMS orchestration.`,
    },
    {
      question: `How should a team switch from ${competitor.name}?`,
      answer: "Export contacts, exclusions, and reusable copy first. Then validate supported contact channels, connect customer-owned providers, and rebuild cadence and approval ownership before activating delivery.",
    },
  ];

  return (
    <PublicSiteShell>
      <SeoJsonLd data={[
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${competitor.name} alternative for approval-led outreach`,
          description: `Evaluate VranceFlex as a ${competitor.name} alternative, including strengths, tradeoffs, pricing model, and migration boundaries.`,
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
          mainEntity: faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
        },
      ]} />

      <div className="public-page-shell competitor-page">
        <PublicBreadcrumbs items={[{ label: "Alternatives", href: "/alternatives" }, { label: `${competitor.name} alternative` }]} />
        <section className="competitor-hero">
          <div>
            <span className="eyebrow">Alternative guide · Reviewed {competitorLastReviewed}</span>
            <h1>A {competitor.name} alternative for teams that keep a human at the send boundary.</h1>
          </div>
          <div className="competitor-hero-summary">
            <p>VranceFlex is not a clone of {competitor.name}. It is an alternative when a guided research workflow, successful-verification credits, mandatory approval, and customer-owned delivery matter more than {competitor.strengths[0].toLowerCase()}.</p>
            <div className="public-hero-actions"><Link className="button-primary" href="/demo">Explore with sample data <ArrowRight size={16} /></Link><Link className="button-secondary" href={`/compare/vranceflex-vs-${competitor.slug}`}>See the direct comparison</Link></div>
          </div>
        </section>

        <aside className="comparison-disclosure"><strong>Editorial disclosure</strong><p>This is a VranceFlex-owned comparison, not an independent review site. No competitor weakness, review quote, or migration result is invented. {competitorMethodology}</p></aside>

        <section className="comparison-tldr" aria-labelledby="alternative-summary-title">
          <span>TL;DR</span>
          <div><h2 id="alternative-summary-title">Switch for the operating model—not a longer checklist.</h2><p>Choose VranceFlex if you want the campaign brief, candidate selection, verification result, personalized draft, human decision, schedule, and provider response to remain connected. Stay with {competitor.name} if {competitor.bestFor[0].toLowerCase()} is the primary job and the VranceFlex provider/channel scope would be too narrow.</p></div>
        </section>

        <section className="competitor-section" aria-labelledby="why-alternative-title">
          <div className="competitor-section-heading"><span className="section-label">Why teams evaluate alternatives</span><h2 id="why-alternative-title">Start with the workflow constraint</h2><p>These are structural tradeoffs, not allegations about product quality.</p></div>
          <div className="alternative-reason-grid">
            {competitor.tradeoffs.map((tradeoff, index) => <article key={tradeoff}><span>{String(index + 1).padStart(2, "0")}</span><h3>{tradeoff}</h3><p>Decide whether this changes the outcome, control, or total cost your team actually needs.</p></article>)}
          </div>
        </section>

        <section className="competitor-section" aria-labelledby="alternative-comparison-title">
          <div className="competitor-section-heading"><span className="section-label">Detailed comparison</span><h2 id="alternative-comparison-title">What changes with VranceFlex?</h2><p>VranceFlex replaces a broad automation surface with a more prescriptive research, approval, and provider-ownership path.</p></div>
          <CompetitorComparisonTable profiles={[vranceFlexProfile, competitor]} />
        </section>

        <section className="competitor-section comparison-audience" aria-labelledby="switch-title">
          <div className="competitor-section-heading"><span className="section-label">Switching decision</span><h2 id="switch-title">Who should switch—and who should not?</h2></div>
          <div className="comparison-audience-grid">
            <article><h3>Consider VranceFlex if…</h3><ul>{vranceFlexProfile.bestFor.map((item) => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul><h4>Accept these limits</h4><ul className="comparison-muted-list">{vranceFlexProfile.tradeoffs.map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article><h3>Keep {competitor.name} if…</h3><ul>{competitor.bestFor.map((item) => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul><h4>{competitor.name} remains stronger at</h4><ul className="comparison-muted-list">{competitor.strengths.map((item) => <li key={item}>{item}</li>)}</ul></article>
          </div>
        </section>

        <section className="competitor-section comparison-migration" aria-labelledby="alternative-migration-title">
          <div className="competitor-section-heading"><span className="section-label">Migration path</span><h2 id="alternative-migration-title">Move without losing suppression or context</h2><p>{competitor.migration.note}</p></div>
          <div className="comparison-migration-grid"><article><h3>What can be prepared</h3><ul>{competitor.migration.transfers.map((item) => <li key={item}>{item}</li>)}</ul></article><article><h3>What must be rebuilt</h3><ul>{competitor.migration.reconfigure.map((item) => <li key={item}>{item}</li>)}</ul></article></div>
          <p className="comparison-evidence-note"><strong>No false migration promise:</strong> VranceFlex does not advertise one-click migration or switcher outcomes until those capabilities and customer approvals exist.</p>
        </section>

        <section className="competitor-section" aria-labelledby="other-alternatives-title">
          <div className="competitor-section-heading"><span className="section-label">Other real options</span><h2 id="other-alternatives-title">The right alternative depends on the job</h2><p>VranceFlex appears first because this is its site, but these are genuine alternatives with different strengths.</p></div>
          <div className="other-alternatives-grid">
            {alternatives.map((profile) => <Link href={`/alternatives/${profile.slug}`} key={profile.slug}><span>{profile.category}</span><h3>{profile.name}</h3><p>Best when {profile.bestFor[0].toLowerCase()}.</p><span className="public-link-action">Read the guide <MoveRight size={15} /></span></Link>)}
          </div>
        </section>

        <section className="competitor-section comparison-faq" aria-labelledby="alternative-faq-title"><div className="competitor-section-heading"><span className="section-label">FAQ</span><h2 id="alternative-faq-title">Before you change platforms</h2></div><div>{faq.map((item) => <article key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}</div></section>

        <CompetitorSourceList profiles={[vranceFlexProfile, competitor]} reviewed={competitorLastReviewed} />

        <section className="comparison-final-cta"><span className="section-label">See the difference in context</span><h2>Use a demo campaign before choosing.</h2><p>The guided demo uses sample data and does not call live research or delivery providers.</p><div className="public-hero-actions"><Link className="button-primary" href="/demo">Open guided demo <ArrowRight size={16} /></Link><Link className="button-secondary" href="/pricing">Review verified-prospect pricing</Link></div></section>
      </div>
    </PublicSiteShell>
  );
}
