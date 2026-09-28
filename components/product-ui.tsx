"use client";

import { AlertCircle, CheckCircle2, CircleDashed, LockKeyhole, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export function StatusBadge({ children, tone = "neutral", className }: { children: ReactNode; tone?: StatusTone; className?: string }) {
  const variant = tone === "success" ? "success" : tone === "warning" ? "warning" : tone === "danger" ? "destructive" : tone === "neutral" ? "secondary" : "default";
  return <Badge variant={variant} className={className}>{children}</Badge>;
}

export function AsyncState({ state, title, description, action, className }: { state: "loading" | "empty" | "error" | "offline" | "permission" | "credits"; title?: string; description?: string; action?: ReactNode; className?: string }) {
  if (state === "loading") return <div role="status" aria-label={title ?? "Loading"} className={cn("space-y-px overflow-hidden rounded-[var(--radius)] border border-border bg-card", className)}>{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center gap-4 border-b border-rule px-5 py-4 last:border-0"><span className="size-8 animate-pulse rounded-md bg-muted" /><span className="h-3.5 flex-1 animate-pulse rounded bg-muted" /><span className="h-3.5 w-20 animate-pulse rounded bg-muted" /></div>)}</div>;
  const Icon = state === "error" || state === "offline" ? AlertCircle : state === "permission" || state === "credits" ? LockKeyhole : CircleDashed;
  const defaults = { empty: ["Nothing here yet", "Create your first item to get started."], error: ["Something went wrong", "Retry the request or return later."], offline: ["You are offline", "Reconnect to continue."], permission: ["Access required", "You do not have permission to view this workspace."], credits: ["More credits required", "Increase your verified-prospect balance before continuing."] } as const;
  const copy = defaults[state];
  return <div className={cn("flex min-h-52 flex-col items-center justify-center gap-3 rounded-[var(--radius)] border border-dashed border-border px-6 py-10 text-center", className)}><span className={cn("flex size-9 items-center justify-center rounded-md border border-border bg-surface-raised [&_svg]:size-4", state === "error" || state === "offline" ? "text-destructive" : "text-muted-foreground")}><Icon /></span><div className="space-y-1"><h2 className="text-sm font-semibold text-foreground">{title ?? copy[0]}</h2><p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">{description ?? copy[1]}</p></div>{action}</div>;
}

export type DataColumn<T> = { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string };
export function DataTable<T>({ rows, columns, getRowKey, empty }: { rows: T[]; columns: DataColumn<T>[]; getRowKey: (row: T) => string; empty?: ReactNode }) {
  if (!rows.length) return <>{empty ?? <AsyncState state="empty" />}</>;
  return <Table><TableHeader><TableRow>{columns.map((column) => <TableHead className={column.className} key={column.key}>{column.header}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={getRowKey(row)}>{columns.map((column) => <TableCell className={column.className} key={column.key}>{column.cell(row)}</TableCell>)}</TableRow>)}</TableBody></Table>;
}

export function PageHeader({ eyebrow, title, description, actions, children }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; children?: ReactNode }) { return <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0 space-y-1">{eyebrow ? <p className="font-mono text-xs text-muted-foreground">{eyebrow.toLowerCase()}</p> : null}<h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>{description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}{children}</div>{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}</header>; }

export function ConfirmAction({ trigger, title, description, confirmLabel = "Confirm", destructive = false, onConfirm }: { trigger: ReactNode; title: string; description: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void }) { return <AlertDialog><AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className={destructive ? "bg-destructive hover:bg-destructive/90" : undefined} onClick={onConfirm}>{confirmLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>; }

export function CreditMeter({ used, total, label = "Verified prospect credits" }: { used: number; total: number; label?: string }) { const remaining = Math.max(0, total - used); const percent = total ? Math.min(100, (used / total) * 100) : 0; return <div className="credit-meter"><div><span>{label}</span><strong className="font-mono">{remaining.toLocaleString()} remaining</strong></div><Progress value={percent} /><small className="font-mono">{used.toLocaleString()} of {total.toLocaleString()} used</small></div>; }

export function CampaignTimeline({ stages }: { stages: Array<{ label: string; state: "complete" | "current" | "failed" | "pending" | "cancelled" }> }) { return <ol className="campaign-timeline" aria-label="Campaign progress">{stages.map((stage) => <li className={stage.state} key={stage.label}>{stage.state === "complete" ? <CheckCircle2 /> : stage.state === "failed" ? <AlertCircle /> : <span />}<strong>{stage.label}</strong><small>{stage.state}</small></li>)}</ol>; }

export function StickyActionBar({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn("sticky-action-bar", className)}>{children}</div>; }

export function RetryButton({ onClick, busy = false }: { onClick: () => void; busy?: boolean }) { return <Button variant="outline" onClick={onClick} disabled={busy}><RefreshCw className={cn(busy && "animate-spin")} />Retry</Button>; }
