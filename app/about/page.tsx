import type { Metadata } from "next";
import { PublicContentPage } from "@/components/public-content-page";
import type { PublicPageRecord } from "@/lib/seo/public-content";

export const metadata: Metadata = {
  title: "About VranceFlex",
  description: "Why VranceFlex combines agent-led B2B research with verified prospects, human approval and workspace-owned delivery.",
  alternates: { canonical: "/about" },
  openGraph: { url: "/about", title: "About VranceFlex", description: "A controlled approach to agent-led B2B research and outreach." },
};

const page: PublicPageRecord = {
  slug: "about",
  eyebrow: "Company · About",
  title: "Outreach automation should preserve judgment",
  description: "VranceFlex coordinates B2B research and outreach preparation without hiding the evidence, approval, or delivery provider.",
  intro: "B2B teams lose time moving between research tools, lead lists, enrichment jobs, prompt windows, spreadsheets, and sending platforms. VranceFlex brings that work into one durable campaign while keeping the consequential decisions human.",
  sections: [
    { title: "The problem is fragmentation, not a lack of automation", body: "More automation does not help when market context disappears between tools, verification is confused with discovery, generated copy bypasses review, or a retry sends twice. VranceFlex focuses on the boundaries between those stages." },
    { title: "Evidence before volume", body: "The platform begins with a product and market question, produces observable ICP criteria, finds candidates, and charges prospect credits only when the required usable verification succeeds." },
    { title: "Control before delivery", body: "Eve can prepare work, organize context, and resume interrupted stages. A person still selects the audience, reviews the sequence, approves external action, and controls the Resend or Twilio account used to deliver it." },
    { title: "A product that states its limits", body: "Provider availability, public data, verification outcomes, sender reputation, and legal obligations vary. VranceFlex surfaces missing data and provider failures instead of presenting guesses or internal status as confirmed reality." },
  ],
  related: [
    { href: "/product", label: "Explore the product workflow", description: "See each durable stage from research to delivery." },
    { href: "/trust", label: "Review the operating controls", description: "Understand security, approval, and provider ownership." },
    { href: "/contact", label: "Talk to the team", description: "Choose the right evaluation or support path." },
  ],
};

export default function AboutPage() {
  return <PublicContentPage page={page} breadcrumbs={[{ label: "Company", href: "/company" }, { label: "About" }]} />;
}
