import type { Metadata } from "next";
import { PublicHubPage } from "@/components/public-hub-page";

export const metadata: Metadata = {
  title: "Company | VranceFlex",
  description: "Learn why VranceFlex is building a controlled path from B2B market research to verified and human-approved outreach.",
  alternates: { canonical: "/company" },
  openGraph: { url: "/company", title: "VranceFlex company", description: "The product principles and contact paths behind VranceFlex." },
};

const links = [
  { href: "/about", label: "Why VranceFlex exists", description: "The product problem, operating principles, and boundaries that shape the platform." },
  { href: "/contact", label: "Contact the team", description: "Choose the right route for a product evaluation, Agency plan, Enterprise requirement, or security question." },
  { href: "/trust", label: "Trust and operating controls", description: "Review security, responsible outreach, and workspace-owned provider delivery." },
];

export default function CompanyPage() {
  return <PublicHubPage eyebrow="Company" title="Building calmer infrastructure for serious outreach." description="VranceFlex exists to remove fragmented preparation work while preserving the decisions and provider relationships that a responsible team should continue to own." links={links} note={{ title: "Useful automation should make accountability clearer.", body: "The platform is organized around durable evidence, explicit states, recoverable checkpoints, and truthful provider outcomes so a team can see what happened and choose what happens next." }} />;
}
