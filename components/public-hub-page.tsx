import Link from "next/link";
import { ArrowRight, MoveRight } from "lucide-react";
import { PublicSiteShell } from "@/components/public-site-shell";
import type { PublicPageLink } from "@/lib/seo/public-content";

export function PublicHubPage({ eyebrow, title, description, links, note }: {
  eyebrow: string;
  title: string;
  description: string;
  links: PublicPageLink[];
  note: { title: string; body: string };
}) {
  return (
    <PublicSiteShell>
      <div className="public-page-shell">
        <section className="public-hub-hero">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
          <div className="public-hero-actions">
            <Link className="button-primary" href="/sign-up">Start a campaign <ArrowRight size={16} /></Link>
            <Link className="button-secondary" href="/pricing">Review pricing</Link>
          </div>
        </section>
        <section className="public-hub-grid" aria-label={`${eyebrow} topics`}>
          {links.map((item, index) => (
            <Link href={item.href} className="public-hub-card" key={item.href}>
              <span className="public-card-number">{String(index + 1).padStart(2, "0")}</span>
              <h2>{item.label}</h2>
              <p>{item.description}</p>
              <span className="public-link-action">Explore <MoveRight size={17} /></span>
            </Link>
          ))}
        </section>
        <section className="public-hub-note">
          <span className="section-label">Operating principle</span>
          <h2>{note.title}</h2>
          <p>{note.body}</p>
          <Link href="/demo">See the full workflow <ArrowRight size={16} /></Link>
        </section>
      </div>
    </PublicSiteShell>
  );
}
