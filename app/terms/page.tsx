import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of service | VranceFlex",
  description: "Terms governing access to VranceFlex research, verification, generation, scheduling and BYOK delivery services.",
  alternates: { canonical: "/terms" },
  openGraph: { url: "/terms", title: "VranceFlex terms of service", description: "Terms for using the VranceFlex website and application." },
};

const sections = [
  { title: "Using the service", paragraphs: ["You may use VranceFlex only if you can form a binding agreement and are authorized to act for the workspace you create or join. You are responsible for users invited to your organization and for activity performed through your account."] },
  { title: "Responsible outreach", paragraphs: ["You are responsible for the audiences, messages, lawful basis, consent where required, suppression, opt-out handling, sender identity, and jurisdictions involved in your campaigns. You must not use VranceFlex for unlawful, deceptive, abusive, discriminatory, or harassing activity.", "Human approval controls, suppression checks, and daily caps support responsible operation but do not replace your legal or provider-policy obligations."] },
  { title: "Third-party services", paragraphs: ["VranceFlex interoperates with services such as Parallel, Resend, Twilio, authentication, model, billing, hosting, and database providers. Your use of connected accounts is also governed by their terms, pricing, limits, and acceptable-use policies.", "Delivery is bring-your-own-provider. You are responsible for provider charges, senders, registration, reputation, and account security."] },
  { title: "Subscriptions and credits", paragraphs: ["Paid plans include plan-specific verified-prospect credits and entitlements. Included credits reset according to the billing cycle and do not roll over. Purchased top-ups are used after included credits and expire according to the terms shown at purchase.", "A verified-prospect credit is consumed for a successful usable verification. Failed verification should not consume a customer credit. Fees and renewal terms are presented before purchase and processed through the billing provider."] },
  { title: "Your content and permissions", paragraphs: ["You retain rights in content and data you submit. You grant VranceFlex the limited permission needed to host, process, transmit, and transform that information to provide, secure, and support the service. You represent that you have the rights required to provide it."] },
  { title: "Availability and changes", paragraphs: ["The service may change as features, providers, pricing, and technical requirements evolve. We may suspend access to protect users, providers, infrastructure, or third parties, or when payment is overdue. Beta or preview functionality may be modified or withdrawn."] },
  { title: "Disclaimers and liability", paragraphs: ["Research, verification, generated content, and provider delivery can contain errors or become unavailable. You must review outputs before relying on them. To the maximum extent permitted by law, the service is provided without warranties not expressly stated in an applicable written agreement, and liability is limited as permitted by law."] },
  { title: "Contact and updates", paragraphs: ["Questions about these terms can be sent to sales@vranceflex.com with “Terms” in the subject. Material commercial terms in an executed Enterprise agreement control over conflicting provisions here."] },
];

export default function TermsPage() { return <LegalPage title="Terms of service" description="These terms describe the operating responsibilities that apply when using VranceFlex and connected research or delivery providers." sections={sections} />; }
