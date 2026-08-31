import Link from "next/link";
import { ArrowRight, Check, CornerDownRight } from "lucide-react";
import type { BreadcrumbItem } from "@/components/public-breadcrumbs";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";
import { SeoJsonLd } from "@/components/seo-json-ld";
import type { PublicPageRecord } from "@/lib/seo/public-content";
import { absoluteSiteUrl } from "@/lib/seo/site";

export function PublicContentPage({ page, breadcrumbs }: { page: PublicPageRecord; breadcrumbs: BreadcrumbItem[] }) {
  const isGuide = page.eyebrow.startsWith("Guide");
  const parentPath = [...breadcrumbs].reverse().find((item) => item.href)?.href;
  const canonicalPath = page.slug === "security" || page.slug === "about"
    ? `/${page.slug}`
    : `${parentPath ?? ""}/${page.slug}`;

  return (
    <PublicSiteShell>
      <SeoJsonLd data={{
        "@context": "https://schema.org",
        "@type": isGuide ? "Article" : "WebPage",
        name: page.title,
        headline: page.title,
        description: page.description,
        url: absoluteSiteUrl(canonicalPath),
        datePublished: isGuide ? "2026-08-31" : undefined,
        dateModified: "2026-08-31",
        author: { "@type": "Organization", name: "VranceFlex", url: absoluteSiteUrl("/") },
        publisher: { "@type": "Organization", name: "VranceFlex", url: absoluteSiteUrl("/") },
        isPartOf: { "@type": "WebSite", name: "VranceFlex", url: absoluteSiteUrl("/") },
      }} />
      <div className="public-page-shell">
        <PublicBreadcrumbs items={breadcrumbs} />
        <section className="public-detail-hero">
          <div>
            <span className="eyebrow">{page.eyebrow}</span>
            <h1>{page.title}</h1>
          </div>
          <div className="public-detail-summary">
            <p>{page.intro}</p>
            <div className="public-hero-actions">
              <Link className="button-primary" href="/sign-up">Start a campaign <ArrowRight size={16} /></Link>
              <Link className="button-secondary" href="/demo">View guided demo</Link>
            </div>
          </div>
        </section>

        {page.answer ? (
          <section className="geo-answer-block" aria-labelledby="geo-answer-title">
            <span>Direct answer</span>
            <div>
              <h2 id="geo-answer-title">{page.answerTitle}</h2>
              <p>{page.answer}</p>
            </div>
          </section>
        ) : null}

        {isGuide ? <p className="public-editorial-meta">Published and reviewed by the VranceFlex editorial team · Updated August 31, 2026</p> : null}

        <div className="public-section-stack">
          {page.sections.map((section, index) => (
            <section className="public-content-section" key={section.title}>
              <div className="public-section-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                {section.eyebrow ? <span className="section-label">{section.eyebrow}</span> : null}
                <h2>{section.title}</h2>
                <p>{section.body}</p>
                {section.points ? (
                  <ul>
                    {section.points.map((point) => <li key={point}><Check aria-hidden="true" size={17} /><span>{point}</span></li>)}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>

        {page.sources?.length ? (
          <section className="public-source-section" aria-labelledby="source-title">
            <span className="section-label">Primary sources</span>
            <h2 id="source-title">Provider documentation</h2>
            <ul>{page.sources.map((source) => <li key={source.href}><a href={source.href} rel="noreferrer" target="_blank"><strong>{source.label}</strong><span>{source.description}</span></a></li>)}</ul>
          </section>
        ) : null}

        <section className="public-related-section" aria-labelledby="related-title">
          <div className="public-related-heading">
            <span className="section-label">Continue exploring</span>
            <h2 id="related-title">The next useful step</h2>
          </div>
          <div className="public-link-grid">
            {page.related.map((item) => (
              <Link href={item.href} className="public-link-card" key={item.href}>
                <CornerDownRight aria-hidden="true" size={20} />
                <strong>{item.label}</strong>
                <span>{item.description}</span>
                <span className="public-link-action">Explore <ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </PublicSiteShell>
  );
}
