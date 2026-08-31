import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileCheck2 } from "lucide-react";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";

export const metadata: Metadata = {
  title: "Customer stories | VranceFlex",
  description: "VranceFlex customer stories will appear here after customer approval and evidence review.",
  robots: { index: false, follow: true },
};

export default function CustomersPage() {
  return (
    <PublicSiteShell>
      <div className="public-page-shell">
        <PublicBreadcrumbs items={[{ label: "Resources", href: "/resources" }, { label: "Customer stories" }]} />
        <section className="public-contact-hero">
          <span className="eyebrow">Resources · Customer stories</span>
          <h1>Evidence first—even for our own stories.</h1>
          <p>We will publish customer stories only after the customer approves the narrative and the outcomes can be stated precisely. Until then, no anonymous logos, invented quotations, or unsupported performance claims appear here.</p>
          <div className="public-hero-actions">
            <Link className="button-primary" href="/demo"><FileCheck2 size={16} /> Explore verified sample data</Link>
            <Link className="button-secondary" href="/contact">Discuss your use case <ArrowRight size={16} /></Link>
          </div>
        </section>
      </div>
    </PublicSiteShell>
  );
}
