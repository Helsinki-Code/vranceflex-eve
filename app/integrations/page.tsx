import type { Metadata } from "next";
import { PublicHubPage } from "@/components/public-hub-page";
import { integrationPages } from "@/lib/seo/public-content";

export const metadata: Metadata = {
  title: "Parallel, Resend and Twilio integrations | VranceFlex",
  description: "Connect live research and workspace-owned email and SMS delivery to the VranceFlex approval workflow.",
  alternates: { canonical: "/integrations" },
  openGraph: { url: "/integrations", title: "VranceFlex integrations", description: "Parallel research plus BYOK Resend and Twilio delivery." },
};

export default function IntegrationsPage() {
  return <PublicHubPage
    eyebrow="Integrations"
    title="Live research in. Approved delivery out."
    description="Parallel supplies candidate discovery and verification. Resend and Twilio deliver approved work through accounts owned by each workspace. VranceFlex is the controlled orchestration layer between them."
    links={integrationPages.map((page) => ({ href: `/integrations/${page.slug}`, label: page.title, description: page.description }))}
    note={{ title: "There is no hidden delivery fallback.", body: "If a provider credential is absent, invalid, or rejected, VranceFlex surfaces the problem. It never sends a customer's campaign through a shared platform provider account." }}
  />;
}
