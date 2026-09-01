import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { CompetitorComparisonTable } from "@/components/competitor-comparison-table";
import { CompetitorSourceList } from "@/components/competitor-source-list";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";
import { SeoJsonLd } from "@/components/seo-json-ld";
import {
  competitorLastReviewed,
  competitorMethodology,
  type CompetitorProfile,
  type PairComparison,
  vranceFlexProfile,
} from "@/lib/competitors/data";
import { absoluteSiteUrl } from "@/lib/seo/site";

export function CompetitorPairPage({ comparison, left, right }: { comparison: PairComparison; left: CompetitorProfile; right: CompetitorProfile }) {
  const canonical = `/compare/${comparison.slug}`;
  const faq = [
    { question: `Which is better: ${left.name} or ${right.name}?`, answer: `${left.name} is the better fit when ${left.bestFor[0].toLowerCase()}. ${right.name} is the better fit when ${right.bestFor[0].toLowerCase()}. The right choice depends on the operating job, not a universal ranking.` },
    { question: `How is VranceFlex different from ${left.name} and ${right.name}?`, answer: "VranceFlex is a narrower approval-led workflow connecting market context, successful contact verification, Eve-prepared drafts, required human approval, and customer-owned Resend or Twilio delivery." },
  ];

  return (
    <PublicSiteShell>
      <SeoJsonLd data={[
        { "@context": "https://schema.org", "@type": "WebPage", name: `${left.name} vs ${right.name}`, description: comparison.summary, url: absoluteSiteUrl(canonical), dateModified: competitorLastReviewed, about: [left, right].map((profile) => ({ "@type": "SoftwareApplication", name: profile.name, url: profile.website })) },
        { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) },
      ]} />
      <div className="public-page-shell competitor-page">
        <PublicBreadcrumbs items={[{ label: "Compare", href: "/compare" }, { label: `${left.name} vs ${right.name}` }]} />
        <section className="competitor-hero">
          <div><span className="eyebrow">Head-to-head comparison · Reviewed {competitorLastReviewed}</span><h1>{left.name} vs {right.name}</h1></div>
          <div className="competitor-hero-summary"><p>{comparison.summary}</p><div className="public-hero-actions"><a className="button-secondary" href={left.website} target="_blank" rel="noreferrer">Visit {left.name}</a><a className="button-secondary" href={right.website} target="_blank" rel="noreferrer">Visit {right.name}</a></div></div>
        </section>
        <aside className="comparison-disclosure"><strong>Editorial disclosure</strong><p>VranceFlex publishes this page and appears as a third option. The comparison relies on vendor-controlled sources and does not claim independent testing. {competitorMethodology}</p></aside>
        <section className="comparison-tldr" aria-labelledby="pair-tldr-title"><span>TL;DR</span><div><h2 id="pair-tldr-title">Choose by operating model.</h2><p>{comparison.summary}</p></div></section>

        <section className="competitor-section" aria-labelledby="pair-table-title"><div className="competitor-section-heading"><span className="section-label">Three-way view</span><h2 id="pair-table-title">How the workflows differ</h2><p>VranceFlex is included as a third option, not disguised as the winner of every row.</p></div><CompetitorComparisonTable profiles={[left, right, vranceFlexProfile]} /></section>

        <section className="competitor-section comparison-audience" aria-labelledby="pair-fit-title"><div className="competitor-section-heading"><span className="section-label">Best fit</span><h2 id="pair-fit-title">Which team should choose each?</h2></div><div className="comparison-three-grid">{[left, right, vranceFlexProfile].map((profile) => <article key={profile.slug}><span>{profile.category}</span><h3>{profile.name}</h3><p>{profile.positioning}</p><ul>{profile.bestFor.map((item) => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul></article>)}</div></section>

        <section className="competitor-section" aria-labelledby="pair-pricing-title"><div className="competitor-section-heading"><span className="section-label">Pricing lens</span><h2 id="pair-pricing-title">Different meters produce different totals</h2></div><div className="comparison-three-grid">{[left, right, vranceFlexProfile].map((profile) => <article key={profile.slug}><span>{profile.pricing.model}</span><h3>{profile.pricing.entry}</h3><p>{profile.pricing.summary}</p></article>)}</div></section>

        <section className="competitor-section comparison-faq" aria-labelledby="pair-faq-title"><div className="competitor-section-heading"><span className="section-label">FAQ</span><h2 id="pair-faq-title">A concise decision guide</h2></div><div>{faq.map((item) => <article key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}</div></section>
        <CompetitorSourceList profiles={[left, right, vranceFlexProfile]} reviewed={competitorLastReviewed} />
        <section className="comparison-final-cta"><span className="section-label">The focused third option</span><h2>Evaluate VranceFlex without live provider calls.</h2><p>Use sample data to inspect the research, verification, approval, and scheduling model before subscribing.</p><div className="public-hero-actions"><Link className="button-primary" href="/demo">Open guided demo <ArrowRight size={16} /></Link><Link className="button-secondary" href="/compare">View all comparisons</Link></div></section>
      </div>
    </PublicSiteShell>
  );
}
