import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AceternityBackdrop } from "../../components/aceternity";
import { PublicPricing } from "../../components/public-pricing";
import { ThemeToggle } from "../../components/motion/theme-toggle";

export const metadata = {
  title: "Pricing · VranceFlex",
  description: "Premium workspace pricing for verified, agent-prepared B2B outreach.",
};

export default function PricingPage() {
  return (
    <main className="aceternity-page pricing-page">
      <AceternityBackdrop subtle />
      <nav className="nav-shell" aria-label="Pricing navigation">
        <a className="brand" href="/"><span className="brand-mark">VF</span><span>VranceFlex</span></a>
        <a className="settings-back" href="/"><ArrowLeft size={15} /> Back to product</a>
        <ThemeToggle variant="rectangle" start="bottom-up" className="theme-toggle" iconClassName="theme-toggle-icon" />
      </nav>
      <header className="pricing-hero">
        <span className="section-label">PREMIUM WORKSPACE PRICING</span>
        <h1>Pay for verified opportunity—not seats or sends.</h1>
        <p>Every plan includes live research, verification, Eve personalization, human approval and recurring outreach orchestration. Delivery remains in your own Resend and Twilio accounts.</p>
        <div><ShieldCheck size={16} /> No free live-research tier · demo before purchase</div>
      </header>
      <PublicPricing />
      <section className="pricing-faq">
        <article><h2>What uses a prospect credit?</h2><p>One credit is consumed only when Parallel returns the required verified contact information. Failed verification returns the reserved credit automatically.</p></article>
        <article><h2>What happens to unused credits?</h2><p>Included credits reset each month. Purchased top-ups are used after included credits and remain valid for 12 months.</p></article>
        <article><h2>Are sending costs included?</h2><p>No. Resend, Twilio, mailboxes, domains and carrier fees stay in your own provider accounts, keeping ownership and deliverability transparent.</p></article>
      </section>
    </main>
  );
}
