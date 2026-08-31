import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy | VranceFlex",
  description: "How VranceFlex handles account, workspace, campaign, integration, billing and operational data.",
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy", title: "VranceFlex privacy policy", description: "Privacy information for the VranceFlex website and application." },
};

const sections = [
  { title: "Information we process", paragraphs: ["We process account and workspace information, campaign inputs, lead and sequence data, integration configuration, billing and entitlement records, support communications, and technical logs necessary to operate and secure the service.", "When a workspace starts live research or delivery, the relevant campaign data is sent to the providers selected for that operation, such as Parallel, Resend, Twilio, model infrastructure, billing, authentication, hosting, and database services."] },
  { title: "How we use information", paragraphs: ["We use information to authenticate users, provide organization-scoped workspaces, execute requested research and generation, enforce plan and safety controls, deliver approved messages, process billing, prevent abuse, diagnose failures, and improve reliability.", "We do not represent generated campaign content as sent unless a connected delivery provider returns a real result."] },
  { title: "Provider connections", paragraphs: ["Resend and Twilio credentials are connected per workspace for bring-your-own-provider delivery. They are used server-side for requested operations and are not a substitute for the customer's responsibility to secure, configure, and monitor those provider accounts."] },
  { title: "Retention and deletion", paragraphs: ["We retain information for as long as needed to provide the service, maintain security and financial records, resolve disputes, and meet applicable obligations. Retention can vary by record type and plan. Contact us to request account assistance or deletion; some records may remain where legally or operationally required."] },
  { title: "Your choices", paragraphs: ["You can control workspace members, connected providers, campaign approvals, schedules, suppression, and account settings through the product. Depending on your location, you may have rights to access, correct, delete, restrict, or receive certain personal information."] },
  { title: "Security and international processing", paragraphs: ["We use technical and organizational safeguards appropriate to the service, but no internet service is risk-free. Service providers may process data in countries different from your own, subject to their contractual and legal frameworks."] },
  { title: "Contact and updates", paragraphs: ["Questions about this policy can be sent to sales@vranceflex.com with “Privacy” in the subject. We may update this policy as the product and legal requirements change; the effective date on this page identifies the current version."] },
];

export default function PrivacyPage() { return <LegalPage title="Privacy policy" description="This policy explains the categories of information VranceFlex processes and the operational purposes behind that processing." sections={sections} />; }
