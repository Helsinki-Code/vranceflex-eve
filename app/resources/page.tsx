import type { Metadata } from "next";
import { PublicHubPage } from "@/components/public-hub-page";

export const metadata: Metadata = {
  title: "B2B outreach resources and practical guides | VranceFlex",
  description: "Practical resources for ICP research, lead verification, human approval, recurring outreach and BYOK delivery.",
  alternates: { canonical: "/resources" },
  openGraph: { url: "/resources", title: "VranceFlex resources", description: "Evidence-first guidance for controlled B2B research and outreach." },
};

const links = [
  { href: "/resources/guides", label: "Practical outreach guides", description: "Detailed playbooks for ICP research, verification, approvals, recurring cadence, and provider setup." },
  { href: "/resources/glossary", label: "B2B outreach glossary", description: "Clear definitions for the workflow, data, scheduling, and delivery concepts used throughout VranceFlex." },
  { href: "/demo", label: "Interactive guided demo", description: "Explore a sample campaign workflow without external research or provider calls." },
];

export default function ResourcesPage() {
  return <PublicHubPage eyebrow="Resources" title="Build a prospecting system your team can explain." description="Use these guides and definitions to make market assumptions, verification standards, approval ownership, schedule cadence, and provider responsibilities explicit before a campaign sends." links={links} note={{ title: "Better outreach starts with better operating decisions.", body: "VranceFlex resources focus on the choices around the software: what makes a buyer relevant, what counts as usable verification, who approves delivery, and how repeated work stays controlled." }} />;
}
