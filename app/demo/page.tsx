import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDashed,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  AppBackdrop,
  ActionLink,
  SurfaceCard,
} from "../../components/design-system";
import { LiveAvatarSalesGuide } from "../../components/live-avatar-sales-guide";
import { ThemeToggle } from "../../components/motion/theme-toggle";
import Link from "next/link";

const sampleLeads = [
  ["Maya Chen", "VP Revenue Operations", "Northstar Cloud", "Verified"],
  ["Jon Bell", "Founder", "Signal Layer", "Verified"],
  ["Amara Okafor", "Head of Growth", "Waypoint", "Needs review"],
];

export const metadata = {
  title: "Guided product demo · VranceFlex",
  description: "Explore a sample VranceFlex campaign without starting paid live research.",
};

export default function DemoPage() {
  return (
    <main className="marketing-page demo-page">
      <AppBackdrop subtle />
      <nav className="nav-shell" aria-label="Demo navigation">
        <Link className="brand" href="/"><span className="brand-mark">VF</span><span>VranceFlex</span></Link>
        <Link className="settings-back" href="/"><ArrowLeft size={15} /> Back to product</Link>
        <ThemeToggle variant="rectangle" start="bottom-up" className="theme-toggle" iconClassName="theme-toggle-icon" />
      </nav>

      <header className="demo-hero">
        <span className="section-label">GUIDED SAMPLE · NO LIVE PROVIDER CALLS</span>
        <h1>See how a campaign moves from market signal to approved outreach.</h1>
        <p>This sample uses fixed data, so you can inspect the product before a subscription activates Parallel research and Eve generation.</p>
        <ActionLink className="button-primary" href="/pricing">View plans <ArrowRight size={15} /></ActionLink>
      </header>

      <section className="demo-workflow-grid">
        <SurfaceCard as="article" className="demo-stage-card">
          <span><Search size={18} /> 01 · DISCOVER</span>
          <h2>Northstar expansion</h2>
          <p>Revenue leaders at 50–500 person B2B SaaS companies in the UK and DACH.</p>
          <strong>75 sample candidates found</strong>
        </SurfaceCard>
        <SurfaceCard as="article" className="demo-stage-card">
          <span><Users size={18} /> 02 · VERIFY</span>
          <h2>25 selected prospects</h2>
          <p>Contact details are checked before one prospect credit is consumed.</p>
          <strong>21 verified · 4 returned</strong>
        </SurfaceCard>
        <SurfaceCard as="article" className="demo-stage-card">
          <span><Sparkles size={18} /> 03 · PREPARE</span>
          <h2>Eve builds the sequence</h2>
          <p>ICP grouping, source-backed personalization and channel-ready drafts.</p>
          <strong>Nothing sent automatically</strong>
        </SurfaceCard>
      </section>

      <SurfaceCard as="section" className="demo-review-card">
        <header>
          <div><span className="section-label">SAMPLE REVIEW WORKSPACE</span><h2>People and approval state</h2></div>
          <span className="status-badge status-awaiting_approval">Awaiting approval</span>
        </header>
        <ul>
          {sampleLeads.map(([name, title, company, status]) => (
            <li key={name}>
              <span className={status === "Verified" ? "demo-check" : "demo-pending"}>
                {status === "Verified" ? <Check size={15} /> : <CircleDashed size={15} />}
              </span>
              <div><strong>{name}</strong><small>{title} · {company}</small></div>
              <em>{status}</em>
            </li>
          ))}
        </ul>
        <footer>
          <span><ShieldCheck size={17} /> Human approval remains mandatory</span>
          <span><Mail size={17} /> Resend and Twilio stay BYOK</span>
        </footer>
      </SurfaceCard>

      <section className="demo-avatar-section">
        <div><span className="section-label">ASK THE PRODUCT GUIDE</span><h2>Want the walkthrough in your own words?</h2><p>Open the LiveAvatar guide and ask how discovery, credits, approvals, scheduling, or BYOK delivery work.</p></div>
        <LiveAvatarSalesGuide embedUrl={process.env.NEXT_PUBLIC_LIVEAVATAR_EMBED_URL} />
      </section>
    </main>
  );
}
