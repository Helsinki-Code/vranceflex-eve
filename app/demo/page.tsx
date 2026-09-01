import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Eye, ShieldCheck } from "lucide-react";
import { LiveAvatarSalesGuide } from "@/components/live-avatar-sales-guide";
import { PublicDemo } from "@/components/public-demo";
import { PublicSiteShell } from "@/components/public-site-shell";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { absoluteSiteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Interactive product demo · VranceFlex",
  description: "Explore a sample VranceFlex campaign from market discovery through verification, Eve preparation, human approval, and recurring scheduling—without live provider calls.",
  alternates: { canonical: "/demo" },
  openGraph: { url: "/demo", title: "Interactive VranceFlex campaign demo", description: "Follow the complete approval-led B2B outreach workflow using safe sample data." },
};

export default function DemoPage() {
  return (
    <PublicSiteShell>
      <SeoJsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: "Interactive VranceFlex product demo", description: metadata.description, url: absoluteSiteUrl("/demo") }} />

      <div className="public-page-shell demo-page-shell">
        <header className="demo-hero">
          <div>
            <span className="eyebrow">Interactive sample · zero provider calls</span>
            <h1>See exactly where the agent works—and where you decide.</h1>
          </div>
          <div className="demo-hero-summary">
            <p>Walk through a complete campaign using fixed data. Inspect the research context, verification outcome, Eve-prepared sequence, approval boundary, and recurring schedule before paying for live work.</p>
            <div className="public-hero-actions"><Link className="button-primary" href="#interactive-demo">Start walkthrough <ArrowRight size={16} /></Link><Link className="button-secondary" href="/pricing">Review plans</Link></div>
          </div>
        </header>

        <section className="demo-assurance-strip" aria-label="Demo assurances">
          <span><Eye /> Real product concepts</span>
          <span><ShieldCheck /> Nothing is sent</span>
          <span><CheckCircle2 /> No credits consumed</span>
          <span><CheckCircle2 /> No provider credentials required</span>
        </section>

        <div id="interactive-demo"><PublicDemo /></div>

        <section className="demo-value-grid" aria-labelledby="demo-value-title">
          <div className="demo-section-heading"><div><span className="section-label">What this walkthrough proves</span><h2 id="demo-value-title">Automation without an invisible handoff.</h2></div><p>Every stage exposes its inputs, output, and next human or system decision.</p></div>
          <div><article><span>01</span><h3>Context stays attached</h3><p>The campaign brief and ICP criteria remain visible during verification and writing.</p></article><article><span>02</span><h3>Credits map to outcomes</h3><p>Failed contact checks return the reserved prospect credit instead of hiding waste.</p></article><article><span>03</span><h3>Approval is structural</h3><p>The reviewed version, recipients, channels, and cadence form one explicit decision.</p></article><article><span>04</span><h3>Schedules stay controllable</h3><p>Recurring work can pause and resume while caps and suppression are rechecked at delivery.</p></article></div>
        </section>

        <section className="demo-avatar-section">
          <div><span className="section-label">Ask the product guide</span><h2>Prefer a conversational walkthrough?</h2><p>Open the LiveAvatar guide and ask how discovery, credits, approval, scheduling, or BYOK delivery work. The avatar loads only after you open it.</p></div>
          <LiveAvatarSalesGuide embedUrl={process.env.NEXT_PUBLIC_LIVEAVATAR_EMBED_URL} />
        </section>

        <section className="demo-final-cta">
          <div><span className="section-label">Ready for a real workspace?</span><h2>Start with a campaign you still control.</h2><p>Launch includes 150 verified prospects, two seats, and the same approval and provider-ownership boundary.</p></div>
          <Link className="button-primary" href="/sign-up">Create workspace <ArrowRight size={16} /></Link>
        </section>
      </div>
    </PublicSiteShell>
  );
}
