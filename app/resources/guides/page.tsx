import type { Metadata } from "next";
import { BookOpen, TimerReset } from "lucide-react";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";
import { guidePages } from "@/lib/seo/public-content";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guides to verified, human-approved B2B outreach | VranceFlex",
  description: "Read practical guides to ICP research, lead verification, human approval, recurring schedules and BYOK email and SMS delivery.",
  alternates: { canonical: "/resources/guides" },
  openGraph: { url: "/resources/guides", title: "VranceFlex guides", description: "Practical field guides for controlled B2B outreach operations." },
};

export default function GuidesPage() {
  return (
    <PublicSiteShell>
      <div className="public-page-shell">
        <PublicBreadcrumbs items={[{ label: "Resources", href: "/resources" }, { label: "Guides" }]} />
        <section className="public-index-hero">
          <span className="eyebrow">Resources · Guides</span>
          <h1>Field guides for work that happens before send.</h1>
          <p>Five practical guides for defining the audience, verifying contact data, assigning approval, operating recurrence, and owning the delivery providers.</p>
        </section>
        <section className="public-index-grid" aria-label="Guides">
          {guidePages.map((page) => (
            <Link className="public-index-card" href={`/resources/guides/${page.slug}`} key={page.slug}>
              <BookOpen size={22} />
              <h2>{page.title}</h2>
              <p>{page.description}</p>
              <span className="public-link-action"><TimerReset size={15} /> 6–9 minute guide</span>
            </Link>
          ))}
        </section>
      </div>
    </PublicSiteShell>
  );
}
