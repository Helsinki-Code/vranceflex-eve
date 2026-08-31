import type { Metadata } from "next";
import { PublicHubPage } from "@/components/public-hub-page";
import { productPages } from "@/lib/seo/public-content";

export const metadata: Metadata = {
  title: "Product — Research, verify, approve and schedule outreach | VranceFlex",
  description: "Explore the VranceFlex workflow for market research, verified leads, Eve personalization, human approval and recurring outreach schedules.",
  alternates: { canonical: "/product" },
  openGraph: { url: "/product", title: "VranceFlex product workflow", description: "From a product idea to verified, human-approved outreach through providers you own." },
};

export default function ProductPage() {
  return <PublicHubPage
    eyebrow="Product"
    title="One durable path from market question to approved outreach."
    description="VranceFlex turns research, discovery, verification, personalization, approval, and scheduling into visible stages. Each stage produces durable work that the next stage can use—or a person can inspect."
    links={productPages.map((page) => ({ href: `/product/${page.slug}`, label: page.title, description: page.description }))}
    note={{ title: "Automation prepares the decision. It does not take the decision away.", body: "Every sequence remains a draft until an authorized person approves it. Delivery uses the workspace's own Resend or Twilio account and is recorded only after a real provider response." }}
  />;
}
