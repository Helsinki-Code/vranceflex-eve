"use client";

import { ArrowUpRight, BellOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NotificationStackItem = { id: string; title: ReactNode; description?: ReactNode; trailing?: ReactNode };
export interface NotificationStackProps { items: NotificationStackItem[]; maxVisible?: number; collapsedLabel?: string; expandedLabel?: string; className?: string }

export function NotificationStack({ items, maxVisible = 3, collapsedLabel = "Agent updates", expandedLabel = "Hide activity", className }: NotificationStackProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = items.slice(0, Math.max(1, maxVisible));
  if (!visibleItems.length) return <div className={cn("flex items-center justify-center gap-2 rounded-xl bg-muted px-5 py-8", className)}><BellOff className="size-4" />All caught up</div>;
  const shown = expanded ? visibleItems : visibleItems.slice(0, 1);
  return <div className={cn("activity-list", className)}>
    <div className="activity-list-items">{shown.map((item) => <article key={item.id}><div><strong>{item.title}</strong>{item.trailing ? <span>{item.trailing}</span> : null}</div>{item.description ? <p>{item.description}</p> : null}</article>)}</div>
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span>{items.length}</span>{expanded ? expandedLabel : collapsedLabel}<ArrowUpRight className={cn(expanded && "rotate-90")} /></button>
  </div>;
}
