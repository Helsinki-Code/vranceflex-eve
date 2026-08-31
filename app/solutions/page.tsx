import type { Metadata } from "next";
import { PublicHubPage } from "@/components/public-hub-page";
import { solutionPages } from "@/lib/seo/public-content";

export const metadata: Metadata = {
  title: "Solutions for founders, agencies and revenue operations | VranceFlex",
  description: "See how different B2B teams use VranceFlex for controlled research, verification, personalization and outreach delivery.",
  alternates: { canonical: "/solutions" },
  openGraph: { url: "/solutions", title: "VranceFlex solutions", description: "A controlled prospecting workflow for founders, agencies and revenue operations teams." },
};

export default function SolutionsPage() {
  return <PublicHubPage
    eyebrow="Solutions"
    title="The same controls, shaped around different operating teams."
    description="A founder validating demand, an agency preparing client campaigns, and a revenue-operations team governing execution need different outcomes. They should still share a clear research trail, approval boundary, and provider truth."
    links={solutionPages.map((page) => ({ href: `/solutions/${page.slug}`, label: page.title, description: page.description }))}
    note={{ title: "Buy capacity around verified prospects—not arbitrary activity.", body: "Plans include successful verified-prospect outcomes, while provider delivery remains BYOK. That keeps VranceFlex's value metric aligned with useful audience data rather than seats or message volume alone." }}
  />;
}
