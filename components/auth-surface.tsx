import { ArrowLeft, Check, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./motion/theme-toggle";
import { AppBackdrop } from "./design-system";

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
        <Link className="brand auth-brand" href="/"><span className="brand-mark">VF</span><span>VranceFlex</span></Link>
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
        <AppBackdrop subtle />
        <div className="auth-page-actions">
          <ThemeToggle
            variant="rectangle"
            start="bottom-up"
            className="theme-toggle"
            iconClassName="theme-toggle-icon"
          />
          <Link className="auth-back" href="/"><ArrowLeft size={15} /> Back to VranceFlex</Link>
        </div>
        <div className="auth-component-wrap">{children}</div>
      </section>
    </main>
  );
}
