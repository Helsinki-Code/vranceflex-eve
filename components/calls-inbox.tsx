"use client";

import { Clock, LoaderCircle, Phone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { callOutcomes, outcomeLabels, voiceLevelInfo, type CallOutcome } from "../lib/domain/voice";
import type { CallSummary } from "../lib/server/voice-calls";
import { Button } from "./ui/button";
import { Chip, EmptyState, LedgerStats, Notice, Panel } from "./product/kit";
import { fieldClass } from "./product/kit";
import { minutesText, outcomeTone, requestJson } from "./voice-shared";

type Detail = CallSummary & { transcript: Array<{ role: "agent" | "prospect"; text: string; at?: string }> };
type Filter = "needs_review" | "all" | CallOutcome;

const FILTERS: Array<[Filter, string]> = [
  ["needs_review", "Needs review"],
  ["all", "All calls"],
  ["meeting_requested", "Meetings agreed"],
  ["deal_progressed", "Deals moved"],
  ["qualified", "Qualified"],
  ["callback_requested", "Callbacks"],
  ["not_interested", "Not interested"],
  ["no_answer", "No answer"],
  ["do_not_call", "Do not call"],
];

export function CallsInbox() {
  const [filter, setFilter] = useState<Filter>("needs_review");
  const [data, setData] = useState<{ calls: CallSummary[]; needsReview: number } | null>(null);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (next: Filter) => {
    setLoading(true);
    try { setData(await requestJson(`/api/voice/calls?filter=${next}`)); } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't load calls."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(filter); }, [filter, load]);

  const open = async (id: string) => {
    try {
      const detail = await requestJson<Detail>(`/api/voice/calls/${id}`);
      setSelected(detail);
      setNote(detail.reviewNote ?? "");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't open the call."); }
  };

  const review = async (reviewed: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      await requestJson(`/api/voice/calls/${selected.id}`, { method: "PATCH", body: JSON.stringify({ reviewed, note }) });
      toast.success(reviewed ? "Marked as reviewed." : "Reopened.");
      setSelected({ ...selected, reviewStatus: reviewed ? "reviewed" : "unreviewed", reviewNote: note || null });
      await load(filter);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't save the review."); } finally { setBusy(false); }
  };

  const calls = data?.calls ?? [];
  return <div className="space-y-6">
    <LedgerStats items={[
      { label: "Needs review", value: data?.needsReview ?? 0, note: "Outcomes that call for a person", tone: data?.needsReview ? "warning" : "default" },
      { label: "Meetings agreed", value: calls.filter((call) => call.outcome === "meeting_requested").length, note: "in this view", tone: "verified" },
      { label: "Qualified or moved forward", value: calls.filter((call) => call.outcome === "qualified" || call.outcome === "deal_progressed").length, note: "in this view", tone: "verified" },
      { label: "Asked not to be called", value: calls.filter((call) => call.outcome === "do_not_call").length, note: "removed automatically" },
    ]} />

    <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Call filters">
      {FILTERS.map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={cn("h-8 shrink-0 rounded-md px-3 text-sm transition-colors", filter === value ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}
    </div>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Panel bodyClassName="p-0">
        {loading && !data ? <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading calls…</div> : calls.length ? <ul className="divide-y divide-rule">
          {calls.map((call) => <li key={call.id}><button onClick={() => void open(call.id)} className={cn("flex w-full flex-col gap-1.5 px-5 py-3.5 text-left transition-colors hover:bg-muted/40", selected?.id === call.id && "bg-muted/50")}>
            <span className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium">{call.personName}<span className="font-normal text-muted-foreground"> · {call.companyName}</span></span><Chip tone={outcomeTone(call.outcome)}>{call.outcome ? outcomeLabels[call.outcome] : call.status === "failed" ? "Failed" : "In progress"}</Chip></span>
            {call.summary ? <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">{call.summary}</span> : null}
            <span className="flex items-center gap-3 text-xs text-muted-foreground"><span>{new Date(call.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span><span className="flex items-center gap-1"><Clock className="size-3" />{minutesText(call.durationSeconds)}</span><span>{call.campaignName}</span>{call.reviewStatus === "reviewed" ? <span>Reviewed</span> : null}</span>
          </button></li>)}
        </ul> : <div className="p-5"><EmptyState icon={<Phone />} title={filter === "needs_review" ? "Nothing needs review" : "No calls here"} description="Calls appear as they finish, with what was said, what was agreed and what to do next." /></div>}
      </Panel>

      <Panel title={selected ? selected.personName : "Call details"} description={selected ? `${selected.companyName} · ${selected.phone} · ${voiceLevelInfo[selected.level].label}` : "Choose a call to read the summary and transcript."} bodyClassName="space-y-5">
        {selected ? <>
          <div className="flex flex-wrap gap-2"><Chip tone={outcomeTone(selected.outcome)}>{selected.outcome ? outcomeLabels[selected.outcome] : "In progress"}</Chip><Chip>{minutesText(selected.durationSeconds)} on the line</Chip>{selected.callbackAt ? <Chip tone="info">Callback {new Date(selected.callbackAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</Chip> : null}</div>
          {selected.flags.length ? <Notice tone="warning" title="For your attention"><ul className="list-disc space-y-0.5 pl-4">{selected.flags.map((flag) => <li key={flag}>{flag}</li>)}</ul></Notice> : null}
          {selected.summary ? <section><h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What happened</h4><p className="mt-1 text-sm leading-6">{selected.summary}</p></section> : null}
          {selected.followUp ? <section><h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Follow-up</h4><p className="mt-1 text-sm leading-6">{selected.followUp}</p></section> : null}
          <section>
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Transcript</h4>
            {selected.transcript.length ? <ol className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">{selected.transcript.map((turn, index) => <li key={index} className={cn("rounded-md px-3 py-2 text-sm leading-6", turn.role === "agent" ? "bg-primary/6" : "bg-muted/60")}><span className="mr-2 text-xs font-medium text-muted-foreground">{turn.role === "agent" ? "AI" : selected.personName.split(" ")[0]}</span>{turn.text}</li>)}</ol> : <p className="mt-1 text-sm text-muted-foreground">No transcript was recorded.</p>}
          </section>
          <section className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your note</h4>
            <textarea className={cn(fieldClass, "h-20 py-2")} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What you did about it" aria-label="Review note" />
            <div className="flex gap-2">
              {selected.reviewStatus === "unreviewed" ? <Button disabled={busy} onClick={() => void review(true)}>{busy ? <LoaderCircle className="animate-spin" /> : null}Mark reviewed</Button> : <Button variant="outline" disabled={busy} onClick={() => void review(false)}>Reopen</Button>}
              {selected.reviewStatus === "reviewed" && note !== (selected.reviewNote ?? "") ? <Button disabled={busy} onClick={() => void review(true)}>Save note</Button> : null}
            </div>
          </section>
        </> : null}
      </Panel>
    </div>
    <p className="text-xs text-muted-foreground">Outcomes: {callOutcomes.map((outcome) => outcomeLabels[outcome]).join(" · ")}</p>
  </div>;
}
