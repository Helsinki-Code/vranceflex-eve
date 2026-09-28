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
  { title: "Service providers", paragraphs: [
    "We use these providers to run the service: Vercel (hosting, scheduled jobs and the AI Gateway), Anthropic (Claude models, reached through the Vercel AI Gateway, which draft research summaries, sequences and reply classifications), Parallel (company and contact discovery and verification), Stripe (subscription and credit-pack payments; we never see full card numbers), Resend (sign-in codes and team invitations from our own account), and a managed PostgreSQL database host that stores workspace data. When the video product guide is switched on, the home page embeds it from LiveAvatar, which receives what you say to the guide.",
    "Outreach email and SMS are sent through the Resend and Twilio accounts each workspace connects. For that delivery, the workspace's own provider account applies, and replies and delivery reports from those accounts are stored in the workspace.",
  ] },
  { title: "People we research", paragraphs: [
    "When a workspace runs a campaign, we look up business contact details for people in professional roles from public sources through Parallel, and store the name, role, employer, business email or phone, public profile link and the sources used. The workspace decides whether to contact them, and every message is approved by a person first.",
    "Anyone contacted can stop further outreach at any time: use the unsubscribe link in the email, reply STOP to a text, or reply asking to be removed. That address or number is then suppressed for the workspace. To ask what we hold about you or to have it deleted, email sales@vranceflex.com with “Privacy” in the subject.",
  ] },
  { title: "Cookies and local storage", paragraphs: [
    "We set one essential cookie, vranceflex_session, to keep you signed in. The app also keeps a few preferences in your browser's local storage, such as colour theme, table density and an unfinished campaign draft, plus a session-only flag so the intro animation plays once. We don't use advertising cookies.",
  ] },
  { title: "Provider connections", paragraphs: ["Resend and Twilio credentials are connected per workspace for bring-your-own-provider delivery. They are used server-side for requested operations and are not a substitute for the customer's responsibility to secure, configure, and monitor those provider accounts."] },
  { title: "Retention and deletion", paragraphs: ["We retain information for as long as needed to provide the service, maintain security and financial records, resolve disputes, and meet applicable obligations. Retention can vary by record type and plan. Contact us to request account assistance or deletion; some records may remain where legally or operationally required."] },
  { title: "Your choices", paragraphs: ["You can control workspace members, connected providers, campaign approvals, schedules, suppression, and account settings through the product. Depending on your location, you may have rights to access, correct, delete, restrict, or receive certain personal information."] },
  { title: "Security and international processing", paragraphs: ["We use technical and organizational safeguards appropriate to the service, but no internet service is risk-free. Service providers may process data in countries different from your own, subject to their contractual and legal frameworks."] },
  { title: "Contact and updates", paragraphs: ["Questions about this policy can be sent to sales@vranceflex.com with “Privacy” in the subject. We may update this policy as the product and legal requirements change; the effective date on this page identifies the current version."] },
];

export default function PrivacyPage() { return <LegalPage title="Privacy policy" description="This policy explains the categories of information VranceFlex processes and the operational purposes behind that processing." sections={sections} effective="September 28, 2026" />; }
