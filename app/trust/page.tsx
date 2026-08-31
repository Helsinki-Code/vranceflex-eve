import type { Metadata } from "next";
import { PublicHubPage } from "@/components/public-hub-page";

export const metadata: Metadata = {
  title: "Trust, security and responsible outreach | VranceFlex",
  description: "Review VranceFlex workspace isolation, human approval, BYOK provider ownership, suppression, caps and delivery safeguards.",
  alternates: { canonical: "/trust" },
  openGraph: { url: "/trust", title: "Trust at VranceFlex", description: "Visible controls for research, approval, provider ownership and responsible outreach." },
};

const links = [
  { href: "/security", label: "Security and workspace boundaries", description: "How sessions, organization scope, credentials and server-side checks protect campaign operations." },
  { href: "/trust/responsible-outreach", label: "Responsible outreach", description: "How approval, suppression, daily caps and stop controls shape external action." },
  { href: "/trust/provider-ownership", label: "Data and provider ownership", description: "Why Resend and Twilio remain connected to accounts the workspace controls." },
];

export default function TrustPage() {
  return <PublicHubPage eyebrow="Trust" title="Controls that remain visible when the automation gets busy." description="VranceFlex is designed around durable state, explicit approval, workspace-owned delivery, and truthful provider outcomes. Explore the operating boundaries behind the product." links={links} note={{ title: "The system should be able to explain why an external action happened.", body: "Campaign stage, approval state, suppression checks, delivery-job identity, and provider response remain separate records rather than one ambiguous 'automation complete' status." }} />;
}
