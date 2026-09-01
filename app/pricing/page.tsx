import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { PublicPricing } from "@/components/public-pricing";
import { PublicSiteShell } from "@/components/public-site-shell";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { absoluteSiteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Pricing for verified B2B prospect outcomes · VranceFlex",
  description: "Compare VranceFlex workspace plans with verified-prospect credits, human approval, recurring schedules, and BYOK Resend and Twilio delivery.",
  alternates: { canonical: "/pricing" },
  openGraph: { url: "/pricing", title: "VranceFlex pricing for verified B2B prospects", description: "Pay for successful verification outcomes—not seats, sends, or failed contact checks." },
};

const faqs = [
  { question: "What uses a verified-prospect credit?", answer: "One credit is consumed only when the required usable contact information is successfully verified. Failed verification releases the reserved credit automatically." },
  { question: "Do included credits roll over?", answer: "Included credits reset each month. Purchased top-ups are used after monthly credits and remain valid for 12 months." },
  { question: "Are email and SMS sending costs included?", answer: "No. Resend, Twilio, mailboxes, domains, and carrier fees remain in your own provider accounts, preserving ownership and billing transparency." },
  { question: "Can I change plans later?", answer: "Launch and Growth are self-serve. Upgrades apply through billing, while Agency and Enterprise changes are coordinated to review workspaces, seats, and provider requirements." },
  { question: "Does AI draft regeneration cost extra?", answer: "Normal Eve personalization and draft regeneration are included with the verified-prospect workflow, subject to platform fair-use protections." },
  { question: "Is there a free live-research trial?", answer: "No. The guided demo uses sample data so you can evaluate the workflow without triggering Parallel, Eve, Resend, or Twilio calls." },
];

export default function PricingPage() {
  return (
    <PublicSiteShell>
      <SeoJsonLd data={[
        { "@context": "https://schema.org", "@type": "Product", name: "VranceFlex", description: metadata.description, url: absoluteSiteUrl("/pricing"), offers: { "@type": "AggregateOffer", lowPrice: "99", highPrice: "1500", priceCurrency: "USD", offerCount: "4" } },
        { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) },
      ]} />

      <div className="public-page-shell pricing-page-shell">
        <header className="pricing-hero">
          <span className="eyebrow">Transparent workspace pricing</span>
          <h1>Pay for verified opportunity—not failed lookups or sends.</h1>
          <p>Research the market, verify usable contacts, let Eve prepare the sequence, and keep a human at the send boundary. Every plan preserves provider ownership.</p>
          <div className="pricing-hero-actions">
            <Link className="button-primary" href="/sign-up">Start with Launch <ArrowRight size={16} /></Link>
            <Link className="button-secondary" href="/demo">Explore the guided demo</Link>
          </div>
          <div className="pricing-hero-proof" aria-label="Pricing assurances">
            <span><CheckCircle2 /> Successful verification only</span>
            <span><ShieldCheck /> Human approval on every sequence</span>
            <span><CheckCircle2 /> Two months free annually</span>
          </div>
        </header>

        <PublicPricing />

        <section className="pricing-faq" aria-labelledby="pricing-faq-title">
          <div className="pricing-section-heading">
            <span className="section-label">Frequently asked questions</span>
            <h2 id="pricing-faq-title">Know what you are buying.</h2>
            <p>No hidden provider bundle, automatic send commitment, or ambiguous credit definition.</p>
          </div>
          <div className="pricing-faq-list">
            {faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}
          </div>
        </section>

        <section className="pricing-final-cta">
          <div><span className="section-label">See the workflow first</span><h2>Evaluate with sample data before subscribing.</h2><p>The guided demo shows discovery, verification, Eve preparation, approval, and scheduling without consuming credits.</p></div>
          <Link className="button-primary" href="/demo">Open guided demo <ArrowRight size={16} /></Link>
        </section>
      </div>
    </PublicSiteShell>
  );
}
