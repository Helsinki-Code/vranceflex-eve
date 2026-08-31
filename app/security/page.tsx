import type { Metadata } from "next";
import { PublicContentPage } from "@/components/public-content-page";
import type { PublicPageRecord } from "@/lib/seo/public-content";

export const metadata: Metadata = {
  title: "Security and workspace isolation | VranceFlex",
  description: "Review VranceFlex security boundaries for sessions, organizations, provider credentials, external actions and durable campaign state.",
  alternates: { canonical: "/security" },
  openGraph: { url: "/security", title: "VranceFlex security", description: "Workspace-scoped data, protected provider credentials and server-side delivery controls." },
};

const page: PublicPageRecord = {
  slug: "security",
  eyebrow: "Trust · Security",
  title: "Security boundaries designed around real external actions",
  description: "Workspace-scoped data, protected credentials, server-side authorization, and durable delivery records for B2B outreach operations.",
  intro: "VranceFlex coordinates systems that can spend credits and send messages. Its security model therefore treats organization scope, provider credentials, approval, and delivery identity as server-side boundaries—not browser hints.",
  sections: [
    { title: "Organization scope comes from the verified session", body: "Authenticated product reads and writes are resolved against the user's session and active organization. Campaign identifiers and form fields are not accepted as proof of workspace access.", points: ["Private product routes are excluded from search indexing", "Membership is checked before workspace data is returned", "Plan and credit entitlements are evaluated before provider work"] },
    { title: "Provider credentials remain server-side", body: "Resend and Twilio connections are configured per workspace and used only by server-side delivery code. Connections are validated when saved, and missing or rejected credentials produce a visible failure instead of a shared-provider fallback." },
    { title: "External actions require durable state", body: "Approval state, credit reservations, delivery jobs, suppression checks, and provider results are persisted. Atomic claims protect a delivery job from duplicate external sends when schedulers or workers retry." },
    { title: "Operational security is a shared responsibility", body: "Customers remain responsible for access to their workspace and provider accounts, sender configuration, domain and phone reputation, user offboarding, and the lawful operation of their outreach. Contact VranceFlex before relying on a specific certification or regulatory requirement." },
  ],
  related: [
    { href: "/trust/responsible-outreach", label: "Responsible outreach", description: "Review approval, suppression, caps, and stop controls." },
    { href: "/trust/provider-ownership", label: "Provider ownership", description: "Understand the BYOK responsibility boundary." },
    { href: "/contact", label: "Discuss a security requirement", description: "Ask about a specific deployment or governance need." },
  ],
};

export default function SecurityPage() {
  return <PublicContentPage page={page} breadcrumbs={[{ label: "Trust", href: "/trust" }, { label: "Security" }]} />;
}
