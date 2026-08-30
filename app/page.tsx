import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  MessagesSquare,
  Radio,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { BrandLockup } from "@/components/brand/vranceflex-logo";
import { PublicNav } from "@/components/public-nav";

export const metadata: Metadata = {
  title: "VranceFlex — Agent-led B2B outreach, approved by you before it sends",
  description:
    "Give VranceFlex a product and it researches your market, builds ideal-customer profiles, finds and verifies real leads, and drafts a multi-channel outreach sequence for each one. Nothing sends until you approve it — through your own Resend and Twilio accounts.",
};

const agents: Array<{
  icon: typeof Search;
  title: string;
  description: string;
}> = [
  {
    icon: Search,
    title: "Market & ICP research",
    description:
      "Reads what you're selling and who you're selling it to, then builds evidence-backed ideal-customer profiles from the leads it actually finds — not a generic persona template.",
  },
  {
    icon: Users,
    title: "Lead discovery & verification",
    description:
      "Finds real people and companies matching your ICP, with confirmed names, roles, and contact details — checked before you ever see them, not after you've paid to email them.",
  },
  {
    icon: Mail,
    title: "Sequence & channel copy",
    description:
      "Drafts a multi-step email and SMS sequence personalized per lead, using only the channels you've actually verified for that person.",
  },
  {
    icon: MessagesSquare,
    title: "Reply monitor",
    description:
      "Classifies incoming replies — interested, objection, out of office, unsubscribe — and flags anything that needs a human, fast.",
  },
];

const workflow: Array<{ title: string; description: string }> = [
  {
    title: "Tell it what you sell",
    description:
      "A product URL or a short description. That's the whole brief.",
  },
  {
    title: "It researches and verifies",
    description:
      "Market context, ideal-customer profiles, and a list of real, verified leads — not a scraped guess.",
  },
  {
    title: "It drafts the sequence",
    description:
      "A personalized multi-step email and SMS sequence for every lead, ready for review.",
  },
  {
    title: "You approve, then it sends",
    description:
      "Nothing goes out until someone on your team says go — through your own Resend and Twilio accounts.",
  },
];

const trustPoints: Array<{
  icon: typeof KeyRound;
  title: string;
  description: string;
}> = [
  {
    icon: KeyRound,
    title: "Bring your own Resend & Twilio",
    description:
      "Connected per workspace from Settings, validated against the provider on save, and encrypted at rest. No shared sending pool, ever.",
  },
  {
    icon: ShieldCheck,
    title: "Explicit approval required",
    description:
      "Every sequence sits in a queue until someone with permission approves it. There's no autopilot setting.",
  },
  {
    icon: Lock,
    title: "Tenant-isolated by design",
    description:
      "Every read and write is scoped to your organization's verified session — never a form field, a prompt, or a URL.",
  },
  {
    icon: CheckCircle2,
    title: "Real delivery only",
    description:
      "The agent never claims a message sent unless a real provider confirmed it. If it isn't sent, it says so.",
  },
];

export default function LandingPage() {
  return (
    <div className="marketing-page">
      <div aria-hidden="true" className="app-backdrop" />

      <header>
        <PublicNav />
      </header>

      <main>
        {/* ================= Hero ================= */}
        <section className="hero" id="product">
          <div className="hero-copy">
            <span className="eyebrow">Agent-led B2B outreach</span>

            <h1>It does the outreach work. You keep the send button.</h1>

            <p className="hero-lede">
              VranceFlex researches your market, builds verified buyer lists, and drafts a
              multi-channel sequence for each one — email through your own Resend account, SMS
              through your own Twilio account. Nothing goes out until you approve it.
            </p>

            <div className="hero-actions">
              <Link className="button-primary" href="/sign-up">
                Start a campaign <ArrowRight size={16} />
              </Link>
              <a className="button-secondary" href="#workflow">
                See how it works
              </a>
            </div>

            <div className="hero-proof">
              <span>
                <ShieldCheck size={14} /> Bring your own Resend &amp; Twilio
              </span>
              <span>
                <CheckCircle2 size={14} /> Every send needs your approval
              </span>
              <span>
                <Lock size={14} /> Isolated per workspace
              </span>
            </div>
          </div>

          <div className="hero-console-wrap">
            <div aria-hidden="true" className="console-glow" />
            <div className="hero-console">
              <div className="console-head">
                <div>
                  <span className="console-kicker">Live pipeline</span>
                  <strong>Nimbus CRM outreach</strong>
                </div>
                <span className="live-pill">
                  <Radio size={12} /> Running
                </span>
              </div>

              <ul className="console-log">
                <li className="activity-success">
                  <CheckCircle2 size={14} /> Researched market &amp; 3 competitors
                </li>
                <li className="activity-success">
                  <CheckCircle2 size={14} /> Built 2 ideal customer profiles
                </li>
                <li className="activity-success">
                  <CheckCircle2 size={14} /> Found &amp; verified 41 leads
                </li>
                <li className="activity-running">
                  <Mail size={14} /> Drafting 5-step email sequence
                </li>
                <li className="activity-waiting">
                  <Lock size={14} /> Waiting for your approval
                </li>
              </ul>

              <div className="console-foot">
                <span>Sends through your Resend</span>
                <span>Nothing sent yet</span>
              </div>
            </div>
          </div>
        </section>

        {/* ================= Signal strip ================= */}
        <section className="signal-strip">
          <article>
            <strong>Bring your own keys</strong>
            <p>Email and SMS send through your Resend and Twilio accounts. No shared sending pool.</p>
          </article>
          <article>
            <strong>Human approval, always</strong>
            <p>Every sequence sits in a queue until someone on your team approves it.</p>
          </article>
          <article>
            <strong>Verified, not guessed</strong>
            <p>Leads are checked before they reach you, not after you've already paid to email them.</p>
          </article>
          <article>
            <strong>Real infrastructure</strong>
            <p>Postgres, encrypted credentials, audited events — not a spreadsheet with a chatbot on top.</p>
          </article>
        </section>

        {/* ================= Agents ================= */}
        <section className="agents-section" id="agents">
          <div className="section-shell">
            <div className="section-heading">
              <div>
                <span className="section-label">The agents doing the work</span>
                <h2>Four specialists. One pipeline.</h2>
              </div>
              <p>
                Each stage of a campaign is handled by a purpose-built agent — not one model
                asked to do everything at once.
              </p>
            </div>

            <div className="agent-grid">
              {agents.map(({ icon: Icon, title, description }) => (
                <article className="agent-card" key={title}>
                  <div className="agent-card-top">
                    <Icon size={26} style={{ color: "var(--primary)" }} />
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ================= Workflow ================= */}
        <section className="workflow-section" id="workflow">
          <div className="section-shell">
            <div className="workflow-intro">
              <div>
                <span className="section-label">How a campaign runs</span>
                <h2>Four steps. One approval gate.</h2>
              </div>
              <p>
                The agent does everything up to the last step. That one is always yours.
              </p>
            </div>

            <div className="workflow-steps">
              {workflow.map(({ title, description }, index) => (
                <article key={title}>
                  <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ================= Trust ================= */}
        <section id="trust">
          <div className="section-shell">
            <div className="trust-card">
              <div className="trust-copy">
                <span className="section-label">Why teams trust it with real outreach</span>
                <h2>Nothing sends without a human in the loop.</h2>
                <p>
                  VranceFlex is strict about two things: outreach only ever goes out through a
                  workspace's own connected provider, and nothing goes out without an explicit
                  approval. There's no platform fallback and no autopilot toggle to find.
                </p>
              </div>

              <ul>
                {trustPoints.map(({ icon: Icon, title, description }) => (
                  <li key={title}>
                    <Icon size={20} />
                    <div>
                      <strong>{title}</strong>
                      <span>{description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ================= Final CTA ================= */}
        <section className="final-cta">
          <span className="section-label">Start a campaign</span>
          <h2>Give it a product. See what it finds.</h2>
          <p>
            No shared sending account, no autopilot. Just verified research and drafted
            outreach, waiting for your yes.
          </p>
          <Link className="button-light" href="/sign-up">
            Start a campaign <ArrowRight size={16} />
          </Link>
        </section>
      </main>

      <footer>
        <Link className="footer-brand" href="/" aria-label="VranceFlex home">
          <BrandLockup />
        </Link>
        <p>© {new Date().getFullYear()} VranceFlex. All rights reserved.</p>
        <Link href="/pricing">Plans and billing</Link>
      </footer>
    </div>
  );
}
