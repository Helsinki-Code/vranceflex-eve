"use client";

import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Pause,
  Play,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NativeTextarea } from "./design-system";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Chip, FormField, Notice, SelectField } from "./product/kit";
import { findUnresolvedPlaceholders } from "../lib/server/message-placeholders";
import {
  campaignStatusLabels,
  type Campaign,
} from "../lib/domain/campaign";
import type {
  CampaignExecution,
  CampaignProgressEvent,
  OutreachWorkspaceMessage,
  OutreachWorkspaceSequence,
} from "../lib/domain/pipeline";
import { AsyncState } from "./product-ui";

type CandidateSummary = {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  status: "discovered" | "enriching" | "verified" | "approved" | "failed";
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  xHandle: string | null;
  companyName: string | null;
  jobTitle: string | null;
  errorMessage: string | null;
};

type WorkspacePayload = {
  campaign: Campaign;
  execution: CampaignExecution | null;
  sequences: OutreachWorkspaceSequence[];
  progress?: CampaignProgressEvent[];
  candidates?: CandidateSummary[];
  billing?: {
    active: boolean;
    plan: { name: string } | null;
    credits: { included: number; topUp: number; available: number };
  };
  error?: string;
};

const pipelineSteps = [
  ["queued", "Queued"],
  ["researching", "Organizing leads"],
  ["enriching", "Personalizing outreach"],
  ["copy_generated", "Drafting outreach"],
  ["awaiting_approval", "Ready for review"],
] as const;


const checkboxClass = "size-4 shrink-0 cursor-pointer rounded border-input accent-[var(--primary)] disabled:cursor-not-allowed";

// One card shape for every pipeline state (ready, stopped, failed, empty) so the
// page reads as a single column of decisions rather than a wall of panels.
function StageCard({ icon, title, children, action, tone = "neutral" }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; tone?: "neutral" | "verified" | "danger" }) {
  return <motion.section layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
    className={cn("flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5 sm:flex-row sm:items-center", tone === "danger" ? "border-destructive/30" : tone === "verified" ? "border-verified/30" : "border-border")}>
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md border [&_svg]:size-4", tone === "danger" ? "border-destructive/25 bg-destructive/8 text-destructive" : tone === "verified" ? "border-verified/25 bg-verified/8 text-verified" : "border-border bg-surface-raised text-muted-foreground")}>{icon}</span>
    <div className="min-w-0 flex-1 space-y-1"><p className="text-sm font-semibold">{title}</p>{children ? <div className="text-sm leading-6 text-muted-foreground">{children}</div> : null}</div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </motion.section>;
}

// Mirrors the Parallel playground: name linked to the profile, description
// clamped to two lines with an inline toggle.
function CandidateSummaryText({ candidate }: { candidate: { name: string; url: string | null; description: string | null } }) {
  const [expanded, setExpanded] = useState(false);
  return <span className="min-w-0 flex-1">
    <span className="flex items-center gap-1.5 text-sm font-medium">
      {candidate.name}
      {candidate.url ? <a href={candidate.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="text-muted-foreground hover:text-primary" aria-label={`Open ${candidate.name}'s profile`}><ExternalLink className="size-3.5" /></a> : null}
    </span>
    {candidate.description ? <>
      <span className={cn("block text-xs leading-5 text-muted-foreground", !expanded && "line-clamp-2")}>{candidate.description}</span>
      {candidate.description.length > 160 ? <button type="button" onClick={(event) => { event.preventDefault(); setExpanded((value) => !value); }} className="mt-0.5 text-xs font-medium text-primary hover:underline">{expanded ? "Show less" : "Show more"}</button> : null}
    </> : null}
  </span>;
}

function Spinner({ busy, icon }: { busy: boolean; icon?: ReactNode }) {
  return busy ? <LoaderCircle className="animate-spin" /> : <>{icon ?? null}</>;
}

function relativeTime(iso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

function elapsedSince(iso: string | null, now: number) {
  if (!iso) return null;
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1_000));
  const minutes = Math.floor(seconds / 60);
  return minutes < 1
    ? `${seconds}s`
    : `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

const STALL_THRESHOLD_MS = 10 * 60 * 1_000;

function ExecutionProgressPanel({
  execution,
  progress,
  onStop,
  stopBusy,
}: {
  execution: CampaignExecution;
  progress: CampaignProgressEvent[];
  onStop: () => void;
  stopBusy: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentIndex = Math.max(
    0,
    pipelineSteps.findIndex(([stage]) => stage === execution.stage),
  );
  const elapsed = elapsedSince(execution.startedAt ?? execution.createdAt, now);
  const recent = progress.slice(-6);
  const lastActivityAt = Math.max(
    new Date(execution.updatedAt).getTime(),
    ...progress.map((event) => new Date(event.createdAt).getTime()),
  );
  const stalled = now - lastActivityAt > STALL_THRESHOLD_MS;

  return <section className="overflow-hidden rounded-[var(--radius)] border border-primary/30 bg-card">
    <header className="flex flex-col gap-3 border-b border-rule p-5 sm:flex-row sm:items-center">
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/8 text-primary"><LoaderCircle className="size-4 animate-spin" /></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Eve is preparing this campaign</p><p className="text-sm text-muted-foreground">Live progress from the agents. Nothing is sent without your approval.</p></div>
      <span className="font-mono text-xs text-muted-foreground">{elapsed ? `running ${elapsed}` : null}{execution.attempt > 1 ? ` · attempt ${execution.attempt}` : ""}</span>
      <Button variant="outline" size="sm" disabled={stopBusy} onClick={onStop} type="button"><Spinner busy={stopBusy} icon={<Square />} />Stop</Button>
    </header>
    <ol className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-5">
      {pipelineSteps.map(([stage, label], index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return <li key={stage} className={cn("flex items-center gap-2 bg-card px-4 py-3 text-xs", current ? "text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/60")}>
          <span className={cn("flex size-4 items-center justify-center rounded-full", done ? "bg-verified text-background" : current ? "text-primary" : "border border-border")}>{done ? <Check className="size-2.5" /> : current ? <LoaderCircle className="size-3.5 animate-spin" /> : null}</span>{label}
        </li>;
      })}
    </ol>
    {recent.length > 0 ? <ul aria-live="polite" className="grid gap-1.5 border-t border-rule p-5">
      <AnimatePresence initial={false}>
        {recent.map((event, index) => <motion.li key={event.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={cn("flex items-baseline justify-between gap-4 text-sm", index === recent.length - 1 ? "text-foreground" : "text-muted-foreground")}>
          <span className="flex items-baseline gap-2">{index === recent.length - 1 ? <span aria-hidden="true" className="size-1.5 translate-y-[-1px] animate-pulse rounded-full bg-primary" /> : <span aria-hidden="true" className="size-1.5" />}{event.message}</span>
          <time className="shrink-0 font-mono text-[11px] text-muted-foreground" dateTime={event.createdAt}>{relativeTime(event.createdAt, now)}</time>
        </motion.li>)}
      </AnimatePresence>
    </ul> : null}
    {stalled ? <div className="border-t border-rule p-5"><Notice tone="warning" title={`No updates for ${Math.floor((now - lastActivityAt) / 60_000)} minutes`}>The run may have stalled. Stop it, then continue from its saved checkpoint; finished steps aren't repeated.</Notice></div> : null}
  </section>;
}

function CandidateWorkspacePanel({
  candidates,
  availableCredits,
  busyAction,
  onVerify,
  onApprove,
  onRediscover,
}: {
  candidates: CandidateSummary[];
  availableCredits: number;
  busyAction: string;
  onVerify: (candidateIds: string[]) => void;
  onApprove: (candidateIds: string[]) => void;
  onRediscover: () => void;
}) {
  const discovered = candidates.filter((candidate) => candidate.status === "discovered");
  const enriching = candidates.filter((candidate) => candidate.status === "enriching");
  const verified = candidates.filter((candidate) => candidate.status === "verified");
  const approved = candidates.filter((candidate) => candidate.status === "approved");
  const failed = candidates.filter((candidate) => candidate.status === "failed");

  const [selectedDiscovered, setSelectedDiscovered] = useState<string[]>([]);
  const [selectedVerified, setSelectedVerified] = useState<string[]>([]);

  if (!candidates.length) {
    return <StageCard icon={<CircleDashed />} title="No candidates yet" action={<Button variant="outline" size="sm" disabled={busyAction === "rediscover"} onClick={onRediscover} type="button"><Spinner busy={busyAction === "rediscover"} icon={<RefreshCw />} />Search again</Button>}>
      Discovery may still be running. If it finished with nothing, broaden the audience or region and search again.
    </StageCard>;
  }

  const allAvailable = Math.min(discovered.length, availableCredits);
  return <section className="grid gap-4">
    {discovered.length > 0 ? <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-rule p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{discovered.length} people found. Choose who to verify.</p>
          <p className="text-sm text-muted-foreground">Verification checks email, phone and LinkedIn. Nobody is contacted. <span className="font-mono text-xs text-foreground">{availableCredits.toLocaleString()}</span> credits left; failed checks give their credit back.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" disabled={busyAction === "rediscover"} onClick={onRediscover} type="button"><Spinner busy={busyAction === "rediscover"} icon={<RefreshCw />} />Search again</Button>
          <Button variant="outline" size="sm" type="button" onClick={() => setSelectedDiscovered(selectedDiscovered.length === allAvailable ? [] : discovered.slice(0, availableCredits).map((candidate) => candidate.id))}>{selectedDiscovered.length === allAvailable ? "Clear" : `Select ${allAvailable}`}</Button>
          <Button size="sm" disabled={!selectedDiscovered.length || selectedDiscovered.length > availableCredits || busyAction === "verify"} onClick={() => onVerify(selectedDiscovered)} type="button"><Spinner busy={busyAction === "verify"} />Verify {selectedDiscovered.length || ""}</Button>
        </div>
      </header>
      <ul className="max-h-[28rem] overflow-y-auto">
        {discovered.map((candidate) => <li key={candidate.id} className="border-b border-rule last:border-0">
          <label className="flex cursor-pointer items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
            <input className={cn(checkboxClass, "mt-0.5")} checked={selectedDiscovered.includes(candidate.id)} onChange={(event) => setSelectedDiscovered((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))} type="checkbox" />
            <CandidateSummaryText candidate={candidate} />
          </label>
        </li>)}
      </ul>
    </div> : null}

    {enriching.length > 0 ? <StageCard icon={<LoaderCircle className="animate-spin" />} title={`Verifying ${enriching.length} ${enriching.length === 1 ? "person" : "people"}`}>Checking email, phone and LinkedIn in the background. You can leave this page.</StageCard> : null}

    {verified.length > 0 ? <div className="overflow-hidden rounded-[var(--radius)] border border-verified/30 bg-card">
      <header className="flex flex-col gap-3 border-b border-rule p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1"><p className="text-sm font-semibold">{verified.length} verified. Choose who to keep.</p><p className="text-sm text-muted-foreground">Approved leads are saved to the workspace. Eve starts drafting only when you say so.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" type="button" onClick={() => setSelectedVerified(selectedVerified.length === verified.length ? [] : verified.map((candidate) => candidate.id))}>{selectedVerified.length === verified.length ? "Clear" : "Select all"}</Button>
          <Button size="sm" disabled={!selectedVerified.length || busyAction === "approve-leads"} onClick={() => onApprove(selectedVerified)} type="button"><Spinner busy={busyAction === "approve-leads"} />Approve {selectedVerified.length || ""}</Button>
        </div>
      </header>
      <ul className="max-h-[28rem] overflow-y-auto">
        {verified.map((candidate) => <li key={candidate.id} className="border-b border-rule last:border-0">
          <label className="flex cursor-pointer items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
            <input className={cn(checkboxClass, "mt-0.5")} checked={selectedVerified.includes(candidate.id)} onChange={(event) => setSelectedVerified((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))} type="checkbox" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{candidate.name}</span><span className="block truncate text-xs text-muted-foreground">{[candidate.jobTitle, candidate.companyName].filter(Boolean).join(" at ")}</span></span>
            <span className="hidden shrink-0 text-right font-mono text-xs text-muted-foreground sm:block">{candidate.email}{candidate.phone ? <span className="block">{candidate.phone}</span> : null}</span>
          </label>
        </li>)}
      </ul>
    </div> : null}

    {approved.length > 0 ? <StageCard tone="verified" icon={<CheckCircle2 />} title={`${approved.length} approved ${approved.length === 1 ? "lead" : "leads"} saved`}>Verification is done for these people and they're ready for Eve.</StageCard> : null}
    {failed.length > 0 ? <StageCard icon={<AlertCircle />} title={`${failed.length} couldn't be verified`}>No usable public contact details were found, so they're left out automatically.</StageCard> : null}
  </section>;
}

type MessageDraft = Pick<
  OutreachWorkspaceMessage,
  "subject" | "subjectVariant" | "content"
>;

async function readJson<ResponseType>(response: Response) {
  const payload = (await response.json()) as ResponseType & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "The request could not be completed.");
  }
  return payload;
}

export function CampaignWorkspace({ campaignId }: { campaignId: string }) {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [scheduleSelected, setScheduleSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MessageDraft>>({});
  const [busyAction, setBusyAction] = useState("");
  const [scheduleDate, setScheduleDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    return [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, "0"),
      String(tomorrow.getDate()).padStart(2, "0"),
    ].join("-");
  });
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleCadence, setScheduleCadence] = useState<
    "once" | "daily" | "weekly"
  >("once");
  const [scheduleTimezone, setScheduleTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState("loading");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      const next = await readJson<WorkspacePayload>(response);
      setPayload(next);
      setDrafts((current) => {
        const merged = { ...current };
        for (const sequence of next.sequences) {
          for (const message of sequence.messages) {
            if (!merged[message.id]) {
              merged[message.id] = {
                subject: message.subject,
                subjectVariant: message.subjectVariant,
                content: message.content,
              };
            }
          }
        }
        return merged;
      });
      setState("ready");
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Campaign workspace could not be loaded.",
      );
      if (!quiet) setState("error");
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!payload || !["queued", "running"].includes(payload.execution?.status ?? "")) {
      return;
    }
    const timer = window.setInterval(() => void load(true), 5_000);
    return () => window.clearInterval(timer);
  }, [load, payload]);

  // Once Eve has started (an execution exists), the candidate-selection
  // phase is over — any leftover "enriching" stragglers the user didn't
  // wait for are no longer relevant, and continuing to poll for them here
  // would keep writing "contact verification in progress" updates into the
  // same activity feed Eve's own ICP/personalization progress uses,
  // making the two unrelated processes look interleaved and broken.
  const hasEnrichingCandidates =
    !payload?.execution &&
    (payload?.candidates ?? []).some((candidate) => candidate.status === "enriching");

  useEffect(() => {
    if (!hasEnrichingCandidates) return;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetch(
          `/api/campaigns/${campaignId}/candidates/refresh`,
          { method: "POST" },
        );
        await readJson(response);
        await load(true);
      } catch (refreshError) {
        await load(true);
        setError(
          refreshError instanceof Error
            ? `Contact verification could not be refreshed: ${refreshError.message}`
            : "Contact verification could not be refreshed.",
        );
      } finally {
        refreshing = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [campaignId, hasEnrichingCandidates, load]);

  const pendingIds = useMemo(
    () =>
      payload?.sequences
        .filter((sequence) => sequence.status === "awaiting_approval")
        .map((sequence) => sequence.id) ?? [],
    [payload],
  );
  const approvedScheduleIds = useMemo(
    () =>
      payload?.sequences
        .filter((sequence) => sequence.status === "approved")
        .map((sequence) => sequence.id) ?? [],
    [payload],
  );

  async function rediscoverCandidates() {
    setBusyAction("rediscover");
    setError("");
    try {
      await readJson(
        await fetch(`/api/campaigns/${campaignId}/execution`, { method: "POST" }),
      );
      await load(true);
    } catch (rediscoverError) {
      setError(
        rediscoverError instanceof Error
          ? rediscoverError.message
          : "Search could not be restarted.",
      );
    } finally {
      setBusyAction("");
    }
  }

  async function startVerification(candidateIds: string[]) {
    setBusyAction("verify");
    setError("");
    try {
      await readJson(
        await fetch(`/api/campaigns/${campaignId}/candidates/enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateIds }),
        }),
      );
      await load(true);
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Verification could not be started.",
      );
    } finally {
      setBusyAction("");
    }
  }

  async function approveLeads(candidateIds: string[]) {
    setBusyAction("approve-leads");
    setError("");
    try {
      await readJson(
        await fetch(`/api/campaigns/${campaignId}/candidates/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateIds }),
        }),
      );
      await load(true);
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : "Leads could not be approved.",
      );
    } finally {
      setBusyAction("");
    }
  }

  async function retryExecution() {
    setBusyAction("retry");
    setError("");
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/execution`,
        { method: "POST" },
      );
      await readJson(response);
      await load(true);
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "Research could not be restarted.",
      );
    } finally {
      setBusyAction("");
    }
  }

  async function stopExecution() {
    setBusyAction("stop");
    setError("");
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/execution`,
        { method: "DELETE" },
      );
      await readJson(response);
      await load(true);
    } catch (stopError) {
      setError(
        stopError instanceof Error
          ? stopError.message
          : "Campaign preparation could not be stopped.",
      );
    } finally {
      setBusyAction("");
    }
  }

  async function saveMessage(messageId: string) {
    const draft = drafts[messageId];
    if (!draft) return;
    setBusyAction(messageId);
    setError("");
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      await readJson(response);
      await load(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Message could not be saved.",
      );
    } finally {
      setBusyAction("");
    }
  }

  async function approveSelected() {
    if (!selected.length) return;
    setBusyAction("approve");
    setError("");
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sequenceIds: selected,
            scope: "first_launch",
          }),
        },
      );
      await readJson(response);
      setSelected([]);
      await load(true);
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Sequences could not be approved.",
      );
    } finally {
      setBusyAction("");
    }
  }

  async function scheduleApproved() {
    if (!scheduleSelected.length) return;
    setBusyAction("schedule");
    setError("");
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sequenceIds: scheduleSelected,
            startDate: scheduleDate,
            sendTime: scheduleTime,
            timezone: scheduleTimezone,
            recurrence:
              scheduleCadence === "weekly"
                ? { intervalDays: 7 }
                : scheduleCadence === "daily"
                  ? { intervalDays: 1 }
                  : null,
          }),
        },
      );
      await readJson(response);
      setScheduleSelected([]);
      await load(true);
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error
          ? scheduleError.message
          : "The approved sequences could not be scheduled.",
      );
    } finally {
      setBusyAction("");
    }
  }

  async function setSchedulePaused(paused: boolean) {
    setBusyAction(paused ? "pause-schedule" : "resume-schedule");
    setError("");
    try {
      await readJson(
        await fetch(`/api/campaigns/${campaignId}/schedule`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paused }),
        }),
      );
      await load(true);
    } catch (scheduleError) {
      setError(
        scheduleError instanceof Error
          ? scheduleError.message
          : "The schedule could not be updated.",
      );
    } finally {
      setBusyAction("");
    }
  }

  if (state === "loading") {
    return <AsyncState state="loading" title="Loading campaign" />;
  }

  if (state === "error" || !payload) {
    return <AsyncState state="error" title="This campaign couldn't be loaded" description={error} action={<Button variant="outline" size="sm" onClick={() => void load()} type="button"><RefreshCw />Try again</Button>} />;
  }

  const { campaign, execution, sequences } = payload;
  const candidates = payload.candidates ?? [];
  const approvedLeadCount = candidates.filter((candidate) => candidate.status === "approved").length;
  const processing = execution && ["queued", "running"].includes(execution.status);
  const cancelled = execution?.status === "failed" && execution.errorCode === "user_cancelled";
  const failed = execution?.status === "failed" && !cancelled;
  const showCandidateWorkspace = !execution && candidates.length > 0;
  const readyForEve = !execution && approvedLeadCount > 0;
  const availableCredits = payload.billing?.credits.available ?? 0;

  // Where the campaign is on its path, from the records that actually exist.
  const path = ["Research", "Verify", "Write", "Approve", "Send"];
  const pathIndex = sequences.some((sequence) => ["scheduled", "active", "completed"].includes(sequence.status)) ? 4
    : sequences.length ? 3
      : execution ? 2
        : candidates.some((candidate) => candidate.status !== "discovered") ? 1 : 0;
  const statusTone = campaign.status === "stopped" ? "danger" : ["delivered", "replied", "sent"].includes(campaign.status) ? "verified" : campaign.status === "awaiting_approval" ? "warning" : "info";
  const sequenceTone = (status: string) => status === "approved" ? "verified" : status === "awaiting_approval" ? "warning" : ["scheduled", "active"].includes(status) ? "info" : status === "stopped" ? "danger" : "neutral";
  const messageTone = (status: string) => ["sent", "delivered", "replied"].includes(status) ? "verified" : ["bounced", "failed"].includes(status) ? "danger" : status === "scheduled" ? "info" : "neutral";

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <div className="flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1.5">
          <Link className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" href="/dashboard"><ArrowLeft className="size-3" />Campaigns</Link>
          <h2 className="text-2xl font-semibold tracking-tight">{campaign.productName}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{campaign.audience}</p>
          <p className="font-mono text-xs text-muted-foreground">{campaign.source.kind === "website" ? campaign.source.url : "product idea"} · {campaign.geography} · {campaign.leadCount} leads</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
          <Chip tone={statusTone}>{campaignStatusLabels[campaign.status]}</Chip>
          {payload.billing ? <Link href="/settings/billing" className="text-xs text-muted-foreground hover:text-foreground"><span className="font-mono text-foreground">{availableCredits.toLocaleString()}</span> credits · {payload.billing.plan?.name ?? "no plan"}</Link> : null}
        </div>
      </div>
      <ol className="grid grid-cols-5 border-t border-rule" aria-label="Campaign progress">
        {path.map((label, index) => <li key={label} className={cn("relative px-3 py-3 text-xs sm:px-5", index <= pathIndex ? "text-foreground" : "text-muted-foreground/70")}>
          <span className="absolute inset-x-0 top-0 h-[2px] bg-muted" aria-hidden="true" />
          {index < pathIndex ? <motion.span className="absolute inset-x-0 top-0 h-[2px] origin-left bg-verified" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: index * 0.08, duration: 0.3 }} aria-hidden="true" /> : null}
          {index === pathIndex && campaign.status !== "stopped" ? <motion.span className="absolute inset-x-0 top-0 h-[2px] origin-left bg-primary" initial={{ scaleX: 0 }} animate={{ scaleX: 0.5 }} transition={{ delay: index * 0.08, duration: 0.4 }} aria-hidden="true" /> : null}
          <span className="font-mono text-[10px] text-muted-foreground">0{index + 1}</span> <span className={cn(index === pathIndex && "font-medium")}>{label}</span>
        </li>)}
      </ol>
    </section>

    {error ? <Notice tone="danger" title="That didn't work">{error}</Notice> : null}

    {showCandidateWorkspace ? <CandidateWorkspacePanel availableCredits={availableCredits} busyAction={busyAction} candidates={candidates} onApprove={(ids) => void approveLeads(ids)} onRediscover={() => void rediscoverCandidates()} onVerify={(ids) => void startVerification(ids)} /> : null}

    {readyForEve ? <StageCard tone="verified" icon={<CheckCircle2 />} title="Leads approved. Ready for Eve." action={<Button disabled={busyAction === "retry"} onClick={() => void retryExecution()} type="button"><Spinner busy={busyAction === "retry"} icon={<Play />} />Start drafting</Button>}>
      {approvedLeadCount} {approvedLeadCount === 1 ? "lead is" : "leads are"} saved. Eve groups them into ICPs, researches a personal hook for each person and drafts the sequence.
    </StageCard> : null}

    {processing ? <ExecutionProgressPanel execution={execution} onStop={() => void stopExecution()} progress={payload.progress ?? []} stopBusy={busyAction === "stop"} /> : null}

    {cancelled ? <StageCard icon={<Square />} title="Drafting stopped" action={<Button disabled={busyAction === "retry"} onClick={() => void retryExecution()} type="button"><Spinner busy={busyAction === "retry"} icon={<Play />} />Continue</Button>}>
      Saved at “{execution.stage.replaceAll("_", " ")}”. Continuing picks up from there without repeating finished work.
    </StageCard> : null}

    {failed ? <StageCard tone="danger" icon={<AlertCircle />} title="Drafting needs attention" action={<Button variant="outline" disabled={busyAction === "retry"} onClick={() => void retryExecution()} type="button"><Spinner busy={busyAction === "retry"} icon={<RefreshCw />} />Try again</Button>}>
      <p>{execution.errorMessage ?? "The Eve run didn't start or finish."}</p>
      {approvedLeadCount > 0 ? <p className="text-xs">Your {approvedLeadCount} approved {approvedLeadCount === 1 ? "lead is" : "leads are"} still saved. Trying again only redoes unfinished work.</p> : null}
    </StageCard> : null}

    {!execution && candidates.length === 0 && sequences.length === 0 ? (() => {
      const latest = [...(payload.progress ?? [])].reverse().find((event) => event.stage === "researching");
      const searchFailed = Boolean(latest?.message.startsWith("Lead search failed"));
      return <StageCard tone={searchFailed ? "danger" : "neutral"} icon={searchFailed ? <AlertCircle /> : <CircleDashed />} title={searchFailed ? "The lead search didn't finish" : "No candidates yet"}
        action={<Button disabled={busyAction === "rediscover"} onClick={() => void rediscoverCandidates()} type="button"><Spinner busy={busyAction === "rediscover"} icon={<RefreshCw />} />Search again</Button>}>
        {latest ? latest.message : "Search runs one query per audience line and lists people to choose from. If nothing appears, run the search again."}
      </StageCard>;
    })() : null}

    {!processing && !failed && !cancelled && !showCandidateWorkspace && !readyForEve && sequences.length === 0 && (execution || candidates.length > 0) ? <StageCard icon={<CircleDashed />} title="Nothing to review yet">Drafted sequences appear here once Eve saves them.</StageCard> : null}

    {sequences.length > 0 ? <>
      <div className="sticky top-14 z-10 flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card/95 p-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><ShieldCheck className="size-4 text-muted-foreground" /><div><p className="text-sm font-semibold">Review each sequence, then approve</p><p className="text-xs text-muted-foreground">Approving doesn't send anything. You pick a schedule afterwards.</p></div></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" type="button" disabled={!pendingIds.length} onClick={() => setSelected(selected.length === pendingIds.length ? [] : pendingIds)}>{selected.length === pendingIds.length && pendingIds.length ? "Clear" : `Select ${pendingIds.length} pending`}</Button>
          <Button size="sm" disabled={!selected.length || busyAction === "approve"} onClick={() => void approveSelected()} type="button"><Spinner busy={busyAction === "approve"} icon={<CheckCircle2 />} />Approve {selected.length || ""}</Button>
        </div>
      </div>

      {approvedScheduleIds.length > 0 ? <section className="rounded-[var(--radius)] border border-border bg-card">
        <header className="flex items-center gap-3 border-b border-rule px-5 py-4"><CalendarDays className="size-4 text-muted-foreground" /><div><p className="text-sm font-semibold">Schedule approved sequences</p><p className="text-xs text-muted-foreground">Each step goes out at this local time on its own day offset. Daily caps, retries and duplicate checks still apply.</p></div></header>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Start date"><Input min={new Date().toISOString().slice(0, 10)} onChange={(event) => setScheduleDate(event.target.value)} type="date" value={scheduleDate} /></FormField>
          <FormField label="Local time"><Input onChange={(event) => setScheduleTime(event.target.value)} type="time" value={scheduleTime} /></FormField>
          <FormField label="Time zone"><Input onChange={(event) => setScheduleTimezone(event.target.value)} value={scheduleTimezone} /></FormField>
          <FormField label="Repeats"><SelectField wrapperClassName="sm:w-full" className="h-10 sm:w-full" onChange={(event) => setScheduleCadence(event.target.value as "once" | "daily" | "weekly")} value={scheduleCadence}><option value="once">Doesn't repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option></SelectField></FormField>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-rule px-5 py-3">
          <Button variant="outline" size="sm" type="button" onClick={() => setScheduleSelected(scheduleSelected.length === approvedScheduleIds.length ? [] : approvedScheduleIds)}>{scheduleSelected.length === approvedScheduleIds.length ? "Clear" : `Select ${approvedScheduleIds.length} approved`}</Button>
          <Button size="sm" disabled={!scheduleSelected.length || busyAction === "schedule"} onClick={() => void scheduleApproved()} type="button"><Spinner busy={busyAction === "schedule"} icon={<Send />} />Schedule {scheduleSelected.length || ""}</Button>
        </div>
      </section> : null}

      {campaign.recurrence ? <StageCard icon={<CalendarDays />} title={campaign.recurrence.intervalDays === 7 ? "Repeats weekly" : campaign.recurrence.intervalDays === 1 ? "Repeats daily" : campaign.recurrence.intervalDays ? `Repeats every ${campaign.recurrence.intervalDays} days` : `Repeats every ${campaign.recurrence.everyMinutes} minutes`}
        action={<Button variant="outline" size="sm" disabled={busyAction === "pause-schedule" || busyAction === "resume-schedule"} onClick={() => void setSchedulePaused(!campaign.schedulePaused)} type="button">{campaign.schedulePaused ? <><Play />Resume</> : <><Pause />Pause</>}</Button>}>
        {campaign.schedulePaused ? "Paused. Nothing due will be sent until you resume." : "Active. Due steps are picked up every minute."}
      </StageCard> : null}

      <section className="grid gap-4">
        {sequences.map((sequence) => {
          const editable = sequence.status === "awaiting_approval";
          const schedulable = sequence.status === "approved";
          const checked = editable ? selected.includes(sequence.id) : scheduleSelected.includes(sequence.id);
          return <article key={sequence.id} className={cn("overflow-hidden rounded-[var(--radius)] border bg-card transition-colors", checked ? "border-primary/50" : "border-border")}>
            <header className="flex items-center gap-3 border-b border-rule px-5 py-3.5">
              <input aria-label={`Select ${sequence.leadName}`} className={checkboxClass} checked={checked} disabled={!editable && !schedulable} type="checkbox"
                onChange={(event) => editable
                  ? setSelected((current) => event.target.checked ? [...current, sequence.id] : current.filter((id) => id !== sequence.id))
                  : setScheduleSelected((current) => event.target.checked ? [...current, sequence.id] : current.filter((id) => id !== sequence.id))} />
              <span className="text-muted-foreground [&_svg]:size-4">{sequence.channel === "email" ? <Mail /> : <MessageSquareText />}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{sequence.leadName} <span className="font-normal text-muted-foreground">· {sequence.companyName}</span></p><p className="truncate text-xs text-muted-foreground">{sequence.name}</p></div>
              <span className="hidden items-center gap-1 font-mono text-[11px] text-muted-foreground sm:flex"><Clock3 className="size-3" />{sequence.timezone}</span>
              <Chip tone={sequenceTone(sequence.status)}>{sequence.status.replaceAll("_", " ")}</Chip>
            </header>
            <ol>
              {sequence.messages.map((message) => {
                const draft = drafts[message.id] ?? { subject: message.subject, subjectVariant: message.subjectVariant, content: message.content };
                const dirty = draft.content !== message.content || draft.subject !== message.subject || draft.subjectVariant !== message.subjectVariant;
                const placeholders = findUnresolvedPlaceholders(draft.subject, draft.subjectVariant, draft.content);
                return <li key={message.id} className="grid gap-4 border-b border-rule p-5 last:border-0 md:grid-cols-[7rem_minmax(0,1fr)]">
                  <div className="flex items-center gap-2 md:flex-col md:items-start">
                    <span className="font-mono text-sm">{message.stepNumber.toString().padStart(2, "0")}</span>
                    <span className="text-xs text-muted-foreground">Day {message.dayOffset}</span>
                    <Chip tone={messageTone(message.status)}>{message.status}</Chip>
                    {message.scheduledFor ? <time className="font-mono text-[11px] text-muted-foreground" dateTime={message.scheduledFor}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: sequence.timezone }).format(new Date(message.scheduledFor))}</time> : null}
                  </div>
                  <div className="grid min-w-0 gap-3">
                    {sequence.channel === "email" ? <div className="grid gap-3 sm:grid-cols-2">
                      <FormField label="Subject A"><Input disabled={!editable} onChange={(event) => setDrafts((current) => ({ ...current, [message.id]: { ...draft, subject: event.target.value } }))} value={draft.subject ?? ""} /></FormField>
                      <FormField label="Subject B"><Input disabled={!editable} onChange={(event) => setDrafts((current) => ({ ...current, [message.id]: { ...draft, subjectVariant: event.target.value } }))} value={draft.subjectVariant ?? ""} /></FormField>
                    </div> : null}
                    <FormField label="Message" hint={sequence.channel === "sms" ? `${draft.content.length}/160 characters` : undefined}><NativeTextarea disabled={!editable} onChange={(event) => setDrafts((current) => ({ ...current, [message.id]: { ...draft, content: event.target.value } }))} rows={sequence.channel === "sms" ? 3 : 6} value={draft.content} /></FormField>
                    {placeholders.length ? <p className="text-xs text-warning">Replace {placeholders.join(", ")} before approving. Placeholders are blocked from sending.</p> : null}
                    {editable ? <div className="flex justify-end"><Button variant={dirty ? "default" : "outline"} size="sm" aria-label={`Save step ${message.stepNumber}`} disabled={!dirty || busyAction === message.id} onClick={() => void saveMessage(message.id)} type="button"><Spinner busy={busyAction === message.id} icon={<Save />} />{dirty ? "Save changes" : "Saved"}</Button></div> : null}
                  </div>
                </li>;
              })}
            </ol>
          </article>;
        })}
      </section>

      <p className="text-xs leading-5 text-muted-foreground">Approved sequences don't send until you schedule them. “Sent” and “delivered” only appear after the provider confirms them.</p>
    </> : null}
  </div>;
}
