import { ArrowLeft, Check, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "./motion/theme-toggle";
import { AceternityBackdrop } from "./aceternity";
import { GlowingEffect } from "./ui/glowing-effect";

export function AuthSurface({
  children,
  eyebrow,
  title,
  description,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <main className="auth-page">
      <aside className="auth-story">
        <GlowingEffect disabled={false} proximity={120} spread={40} />
        <a className="brand auth-brand" href="/"><span className="brand-mark">VF</span><span>VranceFlex</span></a>
        <div>
          <p className="section-label light"><Sparkles size={13} /> {eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <ul>
            <li><Check size={16} /> Organization-scoped campaign data</li>
            <li><Check size={16} /> Human approval before outreach</li>
            <li><Check size={16} /> Auditable campaign activity</li>
          </ul>
        </div>
        <span><ShieldCheck size={15} /> Secrets remain in the hosting platform</span>
      </aside>
      <section className="auth-content">
        <AceternityBackdrop subtle />
        <div className="auth-page-actions">
          <ThemeToggle
            variant="rectangle"
            start="bottom-up"
            className="theme-toggle"
            iconClassName="theme-toggle-icon"
          />
          <a className="auth-back" href="/"><ArrowLeft size={15} /> Back to VranceFlex</a>
        </div>
        <div className="auth-component-wrap">{children}</div>
      </section>
    </main>
  );
}
