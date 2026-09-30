import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "./motion";

// Product surface kit. The dashboard reads like a research ledger: hairline rules
// instead of stacked boxes, tabular mono numerals for anything countable, and one
// accent reserved for actions. Green is only ever used for verified evidence.

export function PageHeader({ title, description, meta, actions, className }: { title: string; description?: ReactNode; meta?: ReactNode; actions?: ReactNode; className?: string }) {
  return <header className={cn("flex flex-col gap-4 border-b border-rule pb-6 md:flex-row md:items-end md:justify-between", className)}>
    <div className="min-w-0 space-y-1.5">
      {meta ? <p className="font-mono text-xs text-muted-foreground">{meta}</p> : null}
      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
      {description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </header>;
}

export function Panel({ title, description, actions, children, className, bodyClassName, id }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return <section id={id} className={cn("rounded-[var(--radius)] border border-border bg-card", className)}>
    {title || actions ? <div className="flex flex-col gap-3 border-b border-rule px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div> : null}
    <div className={cn("p-5", bodyClassName)}>{children}</div>
  </section>;
}

export type LedgerStat = { label: string; value: number; note?: string; tone?: "default" | "verified" | "warning" | "danger"; format?: "number" | "percent" };

const toneText = { default: "text-foreground", verified: "text-verified", warning: "text-warning", danger: "text-destructive" } as const;

export function LedgerStats({ items, className }: { items: LedgerStat[]; className?: string }) {
  return <dl className={cn("grid grid-cols-2 overflow-hidden rounded-[var(--radius)] border border-border bg-card lg:grid-cols-4", className)}>
    {items.map((item, index) => <div key={item.label} className={cn("flex min-w-0 flex-col gap-1 px-5 py-4", index % 2 === 1 && "border-l border-rule", index >= 2 && "border-t border-rule lg:border-t-0", index >= 1 && "lg:border-l lg:border-rule")}>
      <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
      <dd className={cn("font-mono text-[1.75rem] font-medium leading-none tracking-[-0.03em] tabular-nums", toneText[item.tone ?? "default"])}>
        <CountUp value={item.value} format={item.format === "percent" ? (n) => `${Math.round(n)}%` : undefined} />
      </dd>
      {item.note ? <dd className="truncate text-xs text-muted-foreground/80">{item.note}</dd> : null}
    </div>)}
  </dl>;
}

// Five-tick meter. Reads at a glance in a dense table; the number stays alongside for precision.
export function EvidenceMeter({ value, className, hideValue = false }: { value: number; className?: string; hideValue?: boolean }) {
  const filled = Math.round(Math.max(0, Math.min(100, value)) / 20);
  const tone = value >= 80 ? "bg-verified" : value >= 60 ? "bg-primary" : "bg-warning";
  return <span className={cn("inline-flex items-center gap-2", className)} aria-label={`${value}% confidence`}>
    <span className="inline-flex gap-[3px]" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} className={cn("h-3 w-[5px] rounded-[1px]", index < filled ? tone : "bg-muted")} />)}</span>
    {hideValue ? null : <span className="font-mono text-xs tabular-nums text-foreground">{value}%</span>}
  </span>;
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>{children}</div>;
}

export const fieldClass = "h-9 w-full rounded-md border border-input bg-surface-raised px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60";

export function SelectField({ className, wrapperClassName, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return <span className={cn("relative inline-flex w-full sm:w-auto", wrapperClassName)}>
    <select className={cn(fieldClass, "appearance-none pr-8 sm:w-auto", className)} {...props}>{children}</select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
  </span>;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col items-start gap-3 rounded-[var(--radius)] border border-dashed border-border px-6 py-10 sm:items-center sm:text-center", className)}>
    {icon ? <span className="flex size-9 items-center justify-center rounded-md border border-border bg-surface-raised text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
    {action}
  </div>;
}

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "info" | "verified" | "warning" | "danger"; className?: string }) {
  const tones = {
    neutral: "border-border text-muted-foreground",
    info: "border-primary/25 bg-primary/8 text-primary",
    verified: "border-verified/25 bg-verified/8 text-verified",
    warning: "border-warning/30 bg-warning/8 text-warning",
    danger: "border-destructive/25 bg-destructive/8 text-destructive",
  } as const;
  return <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-mono text-[11px] font-medium text-muted-foreground", className)}>{letters}</span>;
}

export function Bone({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse rounded-md bg-muted", className)} />;
}

export function PageSkeleton({ stats = true, rows = 6 }: { stats?: boolean; rows?: number }) {
  return <div className="space-y-6" role="status" aria-label="Loading">
    <div className="space-y-2 border-b border-rule pb-6"><Bone className="h-3 w-28" /><Bone className="h-7 w-56" /><Bone className="h-4 w-96 max-w-full" /></div>
    {stats ? <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-border lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-2 bg-card px-5 py-4"><Bone className="h-3 w-20" /><Bone className="h-7 w-12" /></div>)}</div> : null}
    <div className="rounded-[var(--radius)] border border-border bg-card">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-4 border-b border-rule px-5 py-4 last:border-0"><Bone className="size-8" /><Bone className="h-4 flex-1" /><Bone className="h-4 w-24" /></div>)}</div>
  </div>;
}

export function Notice({ tone = "info", title, children, action, className }: { tone?: "info" | "warning" | "danger" | "verified"; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const bar = { info: "before:bg-primary", warning: "before:bg-warning", danger: "before:bg-destructive", verified: "before:bg-verified" } as const;
  return <div role={tone === "danger" ? "alert" : "status"} className={cn("relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius)] border border-border bg-card py-3.5 pl-5 pr-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] sm:flex-row sm:items-center sm:justify-between", bar[tone], className)}>
    <div className="min-w-0 space-y-0.5"><p className="text-sm font-medium text-foreground">{title}</p>{children ? <div className="text-sm leading-6 text-muted-foreground">{children}</div> : null}</div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>;
}

export function FormField({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={cn("grid content-start gap-1.5 text-sm", className)}>
    <span className="font-medium text-foreground">{label}</span>
    {children}
    {hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}
  </label>;
}

export function StatusDot({ on, label }: { on: boolean; label: string }) {
  return <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"><span aria-hidden="true" className={cn("size-1.5 rounded-full", on ? "bg-verified" : "bg-muted-foreground/40")} />{label}</span>;
}
