"use client";

import { Archive, CheckCircle2, Copy, Inbox, LoaderCircle, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ReplyIntent, ReplyStatus } from "../lib/domain/pipeline";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Chip, EmptyState, LedgerStats } from "./product/kit";
import { AsyncState } from "./product-ui";

type ReplyRow = {
  reply: {
    id: string;
    subject: string | null;
    text: string;
    intent: ReplyIntent | null;
    sentimentScore: number | null;
    confidence: string | null;
    reasoning: string | null;
    nextAction: string | null;
    actionDetail: string | null;
    suggestedResponse: string | null;
    flagForHuman: boolean;
    flagReason: string | null;
    status: ReplyStatus;
    receivedAt: string;
  };
  leadName: string;
  companyName: string;
  campaignName: string;
};

type Filter = "open" | "attention" | ReplyIntent | "archived";

const intentMeta: Record<ReplyIntent, { label: string; tone: "verified" | "info" | "warning" | "danger" | "neutral" }> = {
  HOT: { label: "Hot", tone: "verified" },
  WARM: { label: "Warm", tone: "info" },
  NEUTRAL: { label: "Neutral", tone: "neutral" },
  OBJECTION: { label: "Objection", tone: "warning" },
  NOT_FIT: { label: "Not a fit", tone: "neutral" },
  OUT_OF_OFFICE: { label: "Out of office", tone: "neutral" },
  UNSUBSCRIBE: { label: "Unsubscribed", tone: "danger" },
};

const filters: Array<[Filter, string]> = [
  ["open", "Open"],
  ["attention", "Needs you"],
  ["HOT", "Hot"],
  ["WARM", "Warm"],
  ["OBJECTION", "Objections"],
  ["archived", "Archived"],
];

async function parseResponse<T>(response: Response) {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The request failed.");
  return payload;
}

function relativeTime(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
}

export function ReplyInbox() {
  const [rows, setRows] = useState<ReplyRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const payload = await parseResponse<{ replies: ReplyRow[] }>(await fetch("/api/replies", { cache: "no-store" }));
      setRows(payload.replies);
      setError("");
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Replies could not be loaded.");
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => rows.filter(({ reply }) => {
    if (filter === "archived") return reply.status === "archived";
    if (reply.status === "archived") return false;
    if (filter === "open") return true;
    if (filter === "attention") return reply.flagForHuman && reply.status === "classified";
    return reply.intent === filter;
  }), [filter, rows]);

  const selected = visible.find(({ reply }) => reply.id === selectedId) ?? visible[0] ?? null;

  const updateStatus = useCallback(async (id: string, status: "reviewed" | "archived") => {
    setBusy(id);
    try {
      await parseResponse(await fetch(`/api/replies/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }));
      setRows((current) => current.map((row) => row.reply.id === id ? { ...row, reply: { ...row.reply, status } } : row));
      toast.success(status === "archived" ? "Reply archived." : "Marked as reviewed.");
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Reply status could not be updated.");
    } finally {
      setBusy("");
    }
  }, []);

  // j/k to move, e to archive, r to mark reviewed — the same keys most mail clients use.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (!visible.length) return;
      const index = Math.max(0, visible.findIndex(({ reply }) => reply.id === selected?.reply.id));
      if (event.key === "j" || event.key === "ArrowDown") { event.preventDefault(); setSelectedId(visible[Math.min(visible.length - 1, index + 1)]!.reply.id); }
      if (event.key === "k" || event.key === "ArrowUp") { event.preventDefault(); setSelectedId(visible[Math.max(0, index - 1)]!.reply.id); }
      if (event.key === "e" && selected && selected.reply.status !== "archived") void updateStatus(selected.reply.id, "archived");
      if (event.key === "r" && selected && selected.reply.status === "classified") void updateStatus(selected.reply.id, "reviewed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, updateStatus, visible]);

  if (state === "loading") return <AsyncState state="loading" title="Loading replies" />;
  if (state === "error") return <AsyncState state="error" title="Replies could not be loaded" description={error} action={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw />Try again</Button>} />;

  const open = rows.filter(({ reply }) => reply.status !== "archived");
  const attention = open.filter(({ reply }) => reply.flagForHuman && reply.status === "classified").length;

  return <div className="space-y-6">
    <LedgerStats items={[
      { label: "Open replies", value: open.length, note: "Sequences pause on any reply" },
      { label: "Needs you", value: attention, note: "Meetings, objections, questions", tone: attention ? "warning" : "default" },
      { label: "Hot", value: open.filter(({ reply }) => reply.intent === "HOT").length, note: "Asked for a next step", tone: "verified" },
      { label: "Unsubscribed", value: rows.filter(({ reply }) => reply.intent === "UNSUBSCRIBE").length, note: "Suppressed automatically" },
    ]} />

    <section className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-rule px-3 py-2" role="tablist" aria-label="Reply filters">
        {filters.map(([value, label]) => {
          const active = filter === value;
          return <button key={value} role="tab" aria-selected={active} type="button" onClick={() => { setFilter(value); setSelectedId(null); }}
            className={cn("relative h-8 shrink-0 rounded-md px-3 text-sm transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {active ? <motion.span layoutId="reply-filter" className="absolute inset-0 rounded-md bg-muted" transition={{ type: "spring", stiffness: 500, damping: 40 }} /> : null}
            <span className="relative">{label}</span>
          </button>;
        })}
        <span className="ml-auto hidden shrink-0 pl-3 font-mono text-[11px] text-muted-foreground md:inline">j/k move · r reviewed · e archive</span>
      </div>

      {visible.length === 0 ? <div className="p-4"><EmptyState icon={<Inbox />} title={filter === "open" ? "No replies yet" : "Nothing in this view"} description="Replies to your sequences land here, classified by intent. Any reply stops the remaining steps for that person until someone on the team responds." /></div>
        : <div className="grid min-h-[32rem] md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <ul className="max-h-[40rem] overflow-y-auto border-b border-rule md:border-b-0 md:border-r" aria-label="Replies">
            {visible.map(({ reply, leadName, companyName }) => {
              const active = selected?.reply.id === reply.id;
              const meta = reply.intent ? intentMeta[reply.intent] : null;
              return <li key={reply.id}>
                <button type="button" onClick={() => setSelectedId(reply.id)} aria-current={active ? "true" : undefined}
                  className={cn("relative block w-full border-b border-rule px-4 py-3 text-left transition-colors last:border-0", active ? "bg-muted/60" : "hover:bg-muted/30")}>
                  {active ? <motion.span layoutId="reply-active" className="absolute inset-y-0 left-0 w-[2px] bg-primary" /> : null}
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", reply.status === "classified" ? "font-semibold text-foreground" : "text-muted-foreground")}>{leadName}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{relativeTime(reply.receivedAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{companyName} · {reply.subject ?? "Email reply"}</span>
                  <span className="mt-2 flex items-center gap-1.5">{meta ? <Chip tone={meta.tone}>{meta.label}</Chip> : <Chip>Unclassified</Chip>}{reply.flagForHuman && reply.status === "classified" ? <span className="size-1.5 rounded-full bg-warning" aria-label="Needs attention" /> : null}</span>
                </button>
              </li>;
            })}
          </ul>

          <AnimatePresence mode="wait">
            {selected ? <motion.article key={selected.reply.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex min-w-0 flex-col">
              <header className="flex flex-col gap-3 border-b border-rule p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 className="text-base font-semibold">{selected.leadName} <span className="font-normal text-muted-foreground">· {selected.companyName}</span></h2>
                  <p className="text-xs text-muted-foreground">{selected.campaignName} · {new Date(selected.reply.receivedAt).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" disabled={busy === selected.reply.id || selected.reply.status === "archived"} onClick={() => void updateStatus(selected.reply.id, "archived")}><Archive />Archive</Button>
                  <Button size="sm" disabled={busy === selected.reply.id || selected.reply.status !== "classified"} onClick={() => void updateStatus(selected.reply.id, "reviewed")}>{busy === selected.reply.id ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}{selected.reply.status === "reviewed" ? "Reviewed" : "Mark reviewed"}</Button>
                </div>
              </header>
              <div className="space-y-6 p-5">
                <div>
                  <p className="text-sm font-medium">{selected.reply.subject ?? "Email reply"}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground/90">{selected.reply.text}</p>
                </div>
                <dl className="grid gap-4 border-t border-rule pt-5 text-sm sm:grid-cols-2">
                  <div className="space-y-1"><dt className="text-xs text-muted-foreground">Classification</dt><dd className="flex items-center gap-2">{selected.reply.intent ? <Chip tone={intentMeta[selected.reply.intent].tone}>{intentMeta[selected.reply.intent].label}</Chip> : <Chip>Pending</Chip>}<span className="text-xs text-muted-foreground">{selected.reply.confidence ?? "—"} confidence</span></dd></div>
                  <div className="space-y-1"><dt className="text-xs text-muted-foreground">Next step</dt><dd>{selected.reply.actionDetail ?? selected.reply.nextAction ?? "Review by hand"}</dd></div>
                  <div className="space-y-1 sm:col-span-2"><dt className="text-xs text-muted-foreground">Why</dt><dd className="leading-6 text-muted-foreground">{selected.reply.reasoning ?? "Classification pending."}</dd></div>
                </dl>
                {selected.reply.suggestedResponse ? <div className="rounded-md border border-border bg-surface-raised p-4">
                  <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Suggested reply · send it from your own inbox</p><Button variant="ghost" size="sm" className="h-7 min-h-7" onClick={() => { void navigator.clipboard?.writeText(selected.reply.suggestedResponse ?? ""); toast.success("Copied."); }}><Copy />Copy</Button></div>
                  <p className="mt-2 text-sm leading-6">{selected.reply.suggestedResponse}</p>
                </div> : null}
              </div>
            </motion.article> : null}
          </AnimatePresence>
        </div>}
    </section>
  </div>;
}
