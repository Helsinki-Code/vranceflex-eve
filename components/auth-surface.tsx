import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./motion/theme-toggle";
import { BrandLockup } from "./brand/vranceflex-logo";
import { EvidenceMeter } from "./product/kit";
import { FadeIn } from "./product/motion";

// The left panel shows what the product actually produces (a lead with its
// sources), not a list of claims about it.
function EvidenceSpecimen() {
  const sources = [
    ["company", "Northstar Cloud opens Berlin office", "Press release · Sep 2026"],
    ["person", "Elena Visser named VP Revenue", "LinkedIn · Jul 2026"],
    ["contact", "elena@northstarcloud.eu deliverable", "SMTP check · today"],
  ];
  return <div className="w-full max-w-sm rounded-[var(--radius)] border border-border bg-card text-left shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)]">
    <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
      <div><p className="text-sm font-medium">Elena Visser</p><p className="text-xs text-muted-foreground">VP Revenue · Northstar Cloud</p></div>
      <EvidenceMeter value={94} />
    </div>
    <ol className="grid gap-2.5 px-4 py-3">
      {sources.map(([kind, title, meta], index) => <li key={title} className="grid grid-cols-[1.75rem_1fr] gap-2 text-xs">
        <span className="font-mono text-muted-foreground">[{index + 1}]</span>
        <span><span className="block text-foreground">{title}</span><span className="text-muted-foreground">{kind} · {meta}</span></span>
      </li>)}
    </ol>
  </div>;
}

export function AuthSurface({ children, eyebrow, title, description }: { children: ReactNode; eyebrow: string; title: string; description: string }) {
  return (
    <main className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-rule bg-muted/40 p-10 lg:flex">
        <Link className="[&_svg]:h-7 [&_svg]:w-auto" href="/" aria-label="VranceFlex home"><BrandLockup /></Link>
        <FadeIn className="space-y-8">
          <div className="space-y-3">
            <p className="font-mono text-xs text-muted-foreground">{eyebrow.toLowerCase()}</p>
            <h1 className="max-w-md text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em]">{title}</h1>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <EvidenceSpecimen />
        </FadeIn>
        <p className="text-xs text-muted-foreground">Every lead ships with the sources behind it. Nothing is sent without a person approving it.</p>
      </aside>
      <section className="flex flex-col">
        <div className="flex items-center justify-between gap-3 p-4 sm:p-6">
          <Link className="[&_svg]:h-6 [&_svg]:w-auto lg:invisible" href="/" aria-label="VranceFlex home"><BrandLockup /></Link>
          <div className="flex items-center gap-2">
            <Link className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" href="/"><ArrowLeft className="size-3.5" />Home</Link>
            <ThemeToggle className="size-9" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
          <FadeIn className="w-full max-w-sm">{children}</FadeIn>
        </div>
      </section>
    </main>
  );
}
