import type { ReactNode } from "react";
import { AppChrome } from "./app-chrome";
import { AuthWorkspaceControls } from "./auth-workspace-controls";

export function AppShell({ children, title, eyebrow, authConfigured = false }: { children: ReactNode; title: string; eyebrow: string; authConfigured?: boolean; activeHref?: string }) {
  const fallback = <div className="demo-account"><span>DV</span><div><strong>Demo workspace</strong><small>Setup mode</small></div></div>;
  return <AppChrome title={title} eyebrow={eyebrow} account={authConfigured ? <AuthWorkspaceControls /> : fallback}>{children}</AppChrome>;
}
