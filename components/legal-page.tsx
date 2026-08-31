import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";

type LegalSection = { title: string; paragraphs: string[] };

export function LegalPage({ title, description, sections }: { title: string; description: string; sections: LegalSection[] }) {
  return (
    <PublicSiteShell>
      <div className="public-page-shell">
        <PublicBreadcrumbs items={[{ label: title }]} />
        <section className="public-legal-hero">
          <span className="eyebrow">Legal</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </section>
        <div className="public-legal-layout">
          <aside className="public-legal-aside"><strong>Effective</strong><br />August 31, 2026<br /><br />Plain-language website version.</aside>
          <div className="public-legal-copy">
            {sections.map((section) => (
              <section className="public-legal-section" key={section.title}>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </section>
            ))}
          </div>
        </div>
      </div>
    </PublicSiteShell>
  );
}
