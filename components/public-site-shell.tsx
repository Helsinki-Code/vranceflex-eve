import type { ReactNode } from "react";
import { PublicFooter } from "@/components/public-footer";
import { PublicNav } from "@/components/public-nav";

export function PublicSiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-page public-architecture-page">
      <div aria-hidden="true" className="app-backdrop" />
      <header><PublicNav /></header>
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}
