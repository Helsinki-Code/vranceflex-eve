import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, CircleHelp, ShieldCheck } from "lucide-react";
import { PublicBreadcrumbs } from "@/components/public-breadcrumbs";
import { PublicSiteShell } from "@/components/public-site-shell";

export const metadata: Metadata = {
  title: "Contact VranceFlex",
  description: "Contact VranceFlex about Agency or Enterprise plans, product evaluation, security, or provider integration requirements.",
  alternates: { canonical: "/contact" },
  openGraph: { url: "/contact", title: "Contact VranceFlex", description: "Choose a direct path for product, sales, or security questions." },
};

const paths = [
  { icon: Building2, title: "Agency or Enterprise", description: "Discuss client workspaces, governance, custom limits, onboarding, or an annual agreement.", href: "mailto:sales@vranceflex.com?subject=VranceFlex%20Agency%20or%20Enterprise", action: "Email sales" },
  { icon: CircleHelp, title: "Evaluate the product", description: "Use the guided demo first, then ask a specific question about discovery, credits, Eve, approvals, or schedules.", href: "/demo", action: "Open guided demo" },
  { icon: ShieldCheck, title: "Security or providers", description: "Ask about a deployment requirement, workspace boundary, Resend connection, or Twilio delivery setup.", href: "mailto:sales@vranceflex.com?subject=VranceFlex%20security%20or%20integration%20question", action: "Send a technical question" },
] as const;

export default function ContactPage() {
  return (
    <PublicSiteShell>
      <div className="public-page-shell">
        <PublicBreadcrumbs items={[{ label: "Company", href: "/company" }, { label: "Contact" }]} />
        <section className="public-contact-hero">
          <span className="eyebrow">Company · Contact</span>
          <h1>Start with the conversation you actually need.</h1>
          <p>Choose a focused route below. Include your workspace, intended audience, channels, and timeline when they are relevant; never include provider secrets in an email.</p>
        </section>
        <section className="public-contact-grid" aria-label="Contact options">
          {paths.map(({ icon: Icon, title, description, href, action }) => (
            <Link className="public-contact-card" href={href} key={title}>
              <Icon size={23} />
              <h2>{title}</h2>
              <p>{description}</p>
              <span className="public-link-action">{action} <ArrowRight size={15} /></span>
            </Link>
          ))}
        </section>
      </div>
    </PublicSiteShell>
  );
}
