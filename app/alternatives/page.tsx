import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Replace } from "lucide-react";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { alternativesSlugFor, competitorLastReviewed, competitorMethodology, competitorProfiles } from "@/lib/competitors/data";
import { absoluteSiteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "VranceFlex alternatives to B2B outreach and GTM platforms",
  description: "Evaluate VranceFlex as an alternative to Instantly, Smartlead, Apollo, Clay, and lemlist with honest strengths, limitations, pricing models, and migration boundaries.",
  alternates: { canonical: "/alternatives" },
  openGraph: { url: "/alternatives", title: "VranceFlex alternative guides", description: "Choose an outreach platform by the job your team needs to control." },
};

export default function AlternativesIndexPage() {
  return (
    <PublicSiteShell>
      <SeoJsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "VranceFlex alternative guides", description: metadata.description, url: absoluteSiteUrl("/alternatives"), dateModified: competitorLastReviewed }} />
      <div className="public-page-shell competitor-index-page">
        <PublicBreadcrumbs items={[{ label: "Alternatives" }]} />
        <section className="public-index-hero"><span className="eyebrow">Alternative guides · Updated {competitorLastReviewed}</span><h1>Switch because the workflow fits—not because a page says “best.”</h1><p>VranceFlex is an alternative for teams that want research continuity, successful-verification credits, mandatory approval, and BYOK delivery. It is not a substitute for every mailbox, CRM, enrichment, or multichannel capability.</p><div className="public-hero-actions"><Link className="button-primary" href="/demo">Try the sample workflow <ArrowRight size={16} /></Link><Link className="button-secondary" href="/compare">View direct comparisons</Link></div></section>
        <aside className="comparison-disclosure"><strong>Transparent evaluation</strong><p>{competitorMethodology} Each guide states who should keep the competing product and which capabilities VranceFlex does not replace.</p></aside>
        <section className="competitor-index-section" aria-labelledby="alternative-guides-title"><div className="public-index-heading"><span className="section-label">Explore by current platform</span><h2 id="alternative-guides-title">Five controlled-switch guides</h2><p>Each page covers the reason to evaluate, direct comparison, best fit, migration boundaries, and official sources.</p></div><div className="competitor-index-grid">{competitorProfiles.map((profile) => <Link key={profile.slug} href={`/alternatives/${profile.slug}`}><Replace aria-hidden="true" /><span>{profile.category}</span><h3>{profile.name} alternative</h3><p>Consider VranceFlex when approval-led orchestration matters more than {profile.strengths[0].toLowerCase()}.</p><span className="public-link-action">Evaluate the alternative <ArrowRight size={15} /></span></Link>)}</div></section>
        <section className="competitor-index-section" aria-labelledby="alternative-lists-title"><div className="public-index-heading"><span className="section-label">Earlier-stage research</span><h2 id="alternative-lists-title">Compare the wider shortlist</h2><p>Each market guide evaluates five genuine options and recommends products by use case instead of naming one universal winner.</p></div><div className="competitor-index-grid">{competitorProfiles.map((profile) => <Link key={profile.slug} href={`/alternatives/${alternativesSlugFor(profile)}`}><Replace aria-hidden="true" /><span>Five credible options</span><h3>{profile.name} alternatives</h3><p>Compare approval-led, email-first, sales-intelligence, enrichment, and multichannel operating models.</p><span className="public-link-action">Explore the shortlist <ArrowRight size={15} /></span></Link>)}</div></section>
        <section className="comparison-final-cta"><span className="section-label">No free live-research trap</span><h2>Inspect the workflow with sample data first.</h2><p>The guided demo explains the stages and controls without consuming a verified-prospect credit.</p><div className="public-hero-actions"><Link className="button-primary" href="/demo">Open guided demo <ArrowRight size={16} /></Link><Link className="button-secondary" href="/pricing">Review plans</Link></div></section>
      </div>
    </PublicSiteShell>
  );
}
