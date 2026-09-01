import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GitCompareArrows, Scale } from "lucide-react";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { comparisonSlugFor, competitorLastReviewed, competitorMethodology, competitorProfiles, findProductProfile, pairComparisons } from "@/lib/competitors/data";
import { absoluteSiteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Compare VranceFlex with B2B outreach and GTM platforms",
  description: "Evidence-based VranceFlex comparisons with Instantly, Smartlead, Apollo, Clay, and lemlist, plus balanced head-to-head product evaluations.",
  alternates: { canonical: "/compare" },
  openGraph: { url: "/compare", title: "VranceFlex product comparisons", description: "Choose a B2B research and outreach platform by workflow, controls, data model, and total cost." },
};

export default function CompareIndexPage() {
  return (
    <PublicSiteShell>
      <SeoJsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "VranceFlex product comparisons", description: metadata.description, url: absoluteSiteUrl("/compare"), dateModified: competitorLastReviewed }} />
      <div className="public-page-shell competitor-index-page">
        <PublicBreadcrumbs items={[{ label: "Compare" }]} />
        <section className="public-index-hero"><span className="eyebrow">Product comparisons · Updated {competitorLastReviewed}</span><h1>Compare the operating model—not a wall of checkmarks.</h1><p>See where VranceFlex is intentionally different, where established platforms are stronger, what each pricing meter represents, and which teams should choose each option.</p><div className="public-hero-actions"><Link className="button-primary" href="/demo">See the VranceFlex workflow <ArrowRight size={16} /></Link><Link className="button-secondary" href="/alternatives">Browse alternative guides</Link></div></section>

        <aside className="comparison-disclosure"><strong>How comparisons are produced</strong><p>This is VranceFlex-owned editorial content. {competitorMethodology} We do not publish invented reviews, customer quotes, or universal winner badges.</p></aside>

        <section className="competitor-index-section" aria-labelledby="direct-comparisons-title"><div className="public-index-heading"><span className="section-label">VranceFlex vs competitors</span><h2 id="direct-comparisons-title">Direct comparisons</h2><p>Five high-intent evaluations covering email-first, sales-intelligence, enrichment, and multichannel platforms.</p></div><div className="competitor-index-grid">{competitorProfiles.map((profile) => <Link key={profile.slug} href={`/compare/${comparisonSlugFor(profile)}`}><GitCompareArrows aria-hidden="true" /><span>{profile.category}</span><h3>VranceFlex vs {profile.name}</h3><p>Choose VranceFlex for approval-led orchestration; choose {profile.name} when {profile.bestFor[0].toLowerCase()}.</p><span className="public-link-action">Compare products <ArrowRight size={15} /></span></Link>)}</div></section>

        <section className="competitor-index-section" aria-labelledby="head-to-head-title"><div className="public-index-heading"><span className="section-label">Independent decision intent</span><h2 id="head-to-head-title">Head-to-head comparisons</h2><p>Balanced evaluations of products buyers often consider together, with VranceFlex clearly labeled as a third option.</p></div><div className="competitor-index-grid competitor-index-grid-pairs">{pairComparisons.map((comparison) => { const left = findProductProfile(comparison.left)!; const right = findProductProfile(comparison.right)!; return <Link key={comparison.slug} href={`/compare/${comparison.slug}`}><Scale aria-hidden="true" /><span>Head to head</span><h3>{left.name} vs {right.name}</h3><p>{comparison.summary}</p><span className="public-link-action">Read comparison <ArrowRight size={15} /></span></Link>; })}</div></section>

        <section className="comparison-final-cta"><span className="section-label">Make the workflow tangible</span><h2>Use sample data before making a platform decision.</h2><p>The VranceFlex demo does not trigger live research, consume credits, or send outreach.</p><div className="public-hero-actions"><Link className="button-primary" href="/demo">Open guided demo <ArrowRight size={16} /></Link><Link className="button-secondary" href="/pricing">Review pricing</Link></div></section>
      </div>
    </PublicSiteShell>
  );
}
