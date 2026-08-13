import { BarChart3, LogOut, MessageSquareText, Settings2, Users } from "lucide-react";
import type { ReactNode } from "react";
import { AuthWorkspaceControls } from "./auth-workspace-controls";
import { ThemeToggle } from "./motion/theme-toggle";
import { AceternityBackdrop } from "./aceternity";
import { GlowingEffect } from "./ui/glowing-effect";
import { Button as MovingBorderButton } from "./ui/moving-border";

const links = [
  ["Campaigns", "/dashboard", BarChart3],
  ["Leads", "/leads", Users],
  ["Replies", "/replies", MessageSquareText],
  ["Settings", "/settings", Settings2],
] as const;

export function AppShell({
  children,
  title,
  eyebrow,
  authConfigured = false,
  activeHref = "/dashboard",
}: {
  children: ReactNode;
  title: string;
  eyebrow: string;
  authConfigured?: boolean;
  activeHref?: string;
}) {
  return (
    <div className="product-app">
      <aside className="app-sidebar">
        <GlowingEffect disabled={false} proximity={120} spread={38} />
        <a className="brand" href="/" aria-label="VranceFlex home">
          <span className="brand-mark">VF</span>
          <span>VranceFlex</span>
        </a>
        <nav aria-label="Application">
          {links.map(([label, href, Icon]) => (
            <a className={href === activeHref ? "active" : ""} href={href} key={label}>
              <Icon size={17} /> {label}
            </a>
          ))}
        </nav>
        {authConfigured ? (
          <AuthWorkspaceControls />
        ) : (
          <div className="sidebar-account">
            <span>DV</span>
            <div><strong>Demo workspace</strong><small>Setup mode</small></div>
            <LogOut size={16} />
          </div>
        )}
      </aside>
      <main className="app-main">
        <AceternityBackdrop subtle />
        <header className="app-header">
          <GlowingEffect disabled={false} proximity={100} spread={30} />
          <div><span>{eyebrow}</span><h1>{title}</h1></div>
          <div className="app-header-actions">
            <ThemeToggle
              variant="rectangle"
              start="bottom-up"
              className="theme-toggle"
              iconClassName="theme-toggle-icon"
            />
            <MovingBorderButton
              as="a"
              borderRadius="0.75rem"
              className="aceternity-button-inner"
              containerClassName="aceternity-button compact"
              href="/campaigns/new"
            >
              New campaign
            </MovingBorderButton>
          </div>
        </header>
        <section className="app-surface">
          <GlowingEffect
            borderWidth={1}
            disabled={false}
            proximity={140}
            spread={44}
          />
          {children}
        </section>
      </main>
    </div>
  );
}
