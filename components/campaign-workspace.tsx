"use client";

import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
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
import {
  ActionButton,
  NativeSelect,
  NativeTextarea,
  SurfaceCard,
} from "./design-system";
import { Input } from "./ui/input";
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
import { AsyncState, CampaignTimeline, CreditMeter, StatusBadge, StickyActionBar } from "./product-ui";

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

  return (
    <section className="pipeline-live-card execution-progress">
      <header>
        <span><LoaderCircle className="spin" size={20} /></span>
        <div>
          <strong>Eve is preparing this campaign</strong>
          <p>Live progress from the agents working on your leads. Nothing is sent without your approval.</p>
        </div>
        <small>
          {elapsed ? `Running ${elapsed}` : null}
          {execution.attempt > 1 ? ` · attempt ${execution.attempt}` : ""}
        </small>
      </header>

      <ol className="execution-steps">
        {pipelineSteps.map(([stage, label], index) => (
          <li
            className={
              index < currentIndex
                ? "done"
                : index === currentIndex
                  ? "current"
                  : ""
            }
            key={stage}
          >
            <span>
              {index < currentIndex ? (
                <Check size={12} />
              ) : index === currentIndex ? (
                <LoaderCircle className="spin" size={12} />
              ) : (
                <CircleDashed size={12} />
              )}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <div className="execution-actions">
        <ActionButton
          className="button-secondary compact"
          disabled={stopBusy}
          onClick={onStop}
          type="button"
        >
          {stopBusy ? <LoaderCircle className="spin" size={14} /> : <Square size={13} />}
          Stop campaign
        </ActionButton>
      </div>

      {recent.length > 0 && (
        <ul aria-live="polite" className="execution-feed">
          {recent.map((event, index) => (
            <li className={index === recent.length - 1 ? "latest" : ""} key={event.id}>
              <span>{event.message}</span>
              <time dateTime={event.createdAt}>{relativeTime(event.createdAt, now)}</time>
            </li>
          ))}
        </ul>
      )}

      {stalled && (
        <div className="execution-stalled" role="status">
          <AlertCircle size={15} />
          <p>
            No updates for {Math.floor((now - lastActivityAt) / 60_000)} minutes —
            this run may have stalled. Stop the active run, then continue from
            its saved Eve checkpoint.
          </p>
        </div>
      )}
    </section>
  );
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
    return (
      <section className="pipeline-live-card">
        <span><CircleDashed size={20} /></span>
        <div>
          <strong>No candidates found yet</strong>
          <p>Discovery may still be starting, or the search may need broadening.</p>
        </div>
        <ActionButton
          className="button-secondary"
          disabled={busyAction === "rediscover"}
          onClick={onRediscover}
          type="button"
        >
          {busyAction === "rediscover" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
          Search again
        </ActionButton>
      </section>
    );
  }

  return (
    <section className="candidate-workspace">
      {discovered.length > 0 && (
        <div className="candidate-stage">
          <header>
            <div>
              <strong>{discovered.length} people found — choose who to verify</strong>
              <p>We check email, phone and LinkedIn for the people you select. Nothing is contacted yet.</p>
              <span className="candidate-credit-balance">
                {availableCredits.toLocaleString()} prospect credits available · failed verifications return their reservation
              </span>
            </div>
            <div className="candidate-stage-actions">
              <ActionButton
                className="button-secondary compact"
                disabled={busyAction === "rediscover"}
                onClick={onRediscover}
                type="button"
              >
                {busyAction === "rediscover" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
                Search again
              </ActionButton>
              <ActionButton
                className="button-secondary compact"
                onClick={() =>
                  setSelectedDiscovered(
                    selectedDiscovered.length === Math.min(discovered.length, availableCredits)
                      ? []
                      : discovered
                          .slice(0, availableCredits)
                          .map((candidate) => candidate.id),
                  )
                }
                type="button"
              >
                {selectedDiscovered.length === Math.min(discovered.length, availableCredits) ? "Clear all" : "Select available"}
              </ActionButton>
              <ActionButton
                className="button-primary compact"
                disabled={
                  !selectedDiscovered.length ||
                  selectedDiscovered.length > availableCredits ||
                  busyAction === "verify"
                }
                onClick={() => onVerify(selectedDiscovered)}
                type="button"
              >
                {busyAction === "verify" ? <LoaderCircle className="spin" size={14} /> : null}
                Verify {selectedDiscovered.length || ""} selected
              </ActionButton>
            </div>
          </header>
          <ul className="candidate-list">
            {discovered.map((candidate) => (
              <li key={candidate.id}>
                <label>
                  <Input
                    checked={selectedDiscovered.includes(candidate.id)}
                    onChange={(event) =>
                      setSelectedDiscovered((current) =>
                        event.target.checked
                          ? [...current, candidate.id]
                          : current.filter((id) => id !== candidate.id),
                      )
                    }
                    type="checkbox"
                  />
                  <div>
                    <strong>{candidate.name}</strong>
                    {candidate.description && <small>{candidate.description}</small>}
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {enriching.length > 0 && (
        <div className="candidate-stage">
          <header>
            <div>
              <strong>Verifying {enriching.length} {enriching.length === 1 ? "person" : "people"}…</strong>
              <p>Checking real email, phone and LinkedIn details. This runs in the background.</p>
            </div>
            <LoaderCircle className="spin" size={18} />
          </header>
        </div>
      )}

      {verified.length > 0 && (
        <div className="candidate-stage">
          <header>
            <div>
              <strong>{verified.length} verified — choose who to approve</strong>
              <p>Approval saves these enriched leads. You decide when Eve starts preparing outreach.</p>
            </div>
            <div className="candidate-stage-actions">
              <ActionButton
                className="button-secondary compact"
                onClick={() =>
                  setSelectedVerified(
                    selectedVerified.length === verified.length
                      ? []
                      : verified.map((candidate) => candidate.id),
                  )
                }
                type="button"
              >
                {selectedVerified.length === verified.length ? "Clear all" : "Select all"}
              </ActionButton>
              <ActionButton
                className="button-primary compact"
                disabled={!selectedVerified.length || busyAction === "approve-leads"}
                onClick={() => onApprove(selectedVerified)}
                type="button"
              >
                {busyAction === "approve-leads" ? <LoaderCircle className="spin" size={14} /> : null}
                Approve {selectedVerified.length || ""} selected
              </ActionButton>
            </div>
          </header>
          <ul className="candidate-list">
            {verified.map((candidate) => (
              <li key={candidate.id}>
                <label>
                  <Input
                    checked={selectedVerified.includes(candidate.id)}
                    onChange={(event) =>
                      setSelectedVerified((current) =>
                        event.target.checked
                          ? [...current, candidate.id]
                          : current.filter((id) => id !== candidate.id),
                      )
                    }
                    type="checkbox"
                  />
                  <div>
                    <strong>{candidate.name}</strong>
                    <small>
                      {[candidate.jobTitle, candidate.companyName].filter(Boolean).join(" at ")}
                      {candidate.email ? ` · ${candidate.email}` : ""}
                      {candidate.phone ? ` · ${candidate.phone}` : ""}
                    </small>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {approved.length > 0 && (
        <div className="candidate-stage muted">
          <header>
            <div>
              <strong>{approved.length} approved {approved.length === 1 ? "lead" : "leads"} saved</strong>
              <p>Parallel enrichment is complete for these leads. They are ready for the Eve handoff.</p>
            </div>
            <CheckCircle2 size={18} />
          </header>
        </div>
      )}

      {failed.length > 0 && (
        <div className="candidate-stage muted">
          <header>
            <div>
              <strong>{failed.length} could not be verified</strong>
              <p>No publicly verifiable email and LinkedIn were found for these people — they are excluded automatically.</p>
            </div>
          </header>
        </div>
      )}
    </section>
  );
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
    return <AsyncState state="loading" title="Loading campaign workspace" />;
  }

  if (state === "error" || !payload) {
    return <AsyncState state="error" title="Campaign workspace is unavailable" description={error} action={<ActionButton className="button-secondary" onClick={() => void load()} type="button"><RefreshCw size={16} /> Retry</ActionButton>} />;
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

  return (
    <div className="campaign-workspace">
      <Link className="settings-back" href="/dashboard">
        <ArrowLeft size={15} /> Campaigns
      </Link>

      <section className="campaign-workspace-head">
        <div>
          <span>{campaign.source.kind === "website" ? "WEBSITE CAMPAIGN" : "PRODUCT IDEA"}</span>
          <h2>{campaign.productName}</h2>
          <p>{campaign.audience}</p>
        </div>
        <StatusBadge tone={campaign.status === "stopped" ? "danger" : campaign.status === "delivered" || campaign.status === "replied" ? "success" : campaign.status === "awaiting_approval" ? "warning" : "info"}>{campaignStatusLabels[campaign.status]}</StatusBadge>
      </section>

      <CampaignTimeline stages={pipelineSteps.map(([stage, label], index) => {
        const currentIndex = execution ? Math.max(0, pipelineSteps.findIndex(([value]) => value === execution.stage)) : campaign.status === "awaiting_approval" ? pipelineSteps.length - 1 : 0;
        const state = execution?.status === "failed" && index === currentIndex ? (execution.errorCode === "user_cancelled" ? "cancelled" : "failed") : index < currentIndex ? "complete" : index === currentIndex ? "current" : "pending";
        return { label, state };
      })} />

      {payload.billing ? (
        <section className="campaign-credit-strip" aria-label="Workspace prospect credit balance">
          <span>{payload.billing.plan?.name ?? "No active plan"}</span>
          <strong>{availableCredits.toLocaleString()} prospect credits available</strong>
          <Link href="/settings/billing">Manage plan & credits</Link>
        </section>
      ) : null}

      {payload.billing ? <CreditMeter used={Math.max(0, payload.billing.credits.included + payload.billing.credits.topUp - availableCredits)} total={payload.billing.credits.included + payload.billing.credits.topUp} /> : null}

      {error && <div className="form-error" role="alert">{error}</div>}

      {showCandidateWorkspace && (
        <CandidateWorkspacePanel
          availableCredits={availableCredits}
          busyAction={busyAction}
          candidates={candidates}
          onApprove={(ids) => void approveLeads(ids)}
          onRediscover={() => void rediscoverCandidates()}
          onVerify={(ids) => void startVerification(ids)}
        />
      )}

      {readyForEve && (
        <section className="pipeline-live-card">
          <span><CheckCircle2 size={20} /></span>
          <div>
            <strong>Enrichment complete — continue with Eve</strong>
            <p>
              {approvedLeadCount} approved {approvedLeadCount === 1 ? "lead is" : "leads are"} safely saved.
              Eve will organize ICPs, research personalization signals and draft outreach from this point.
            </p>
          </div>
          <ActionButton
            className="button-primary"
            disabled={busyAction === "retry"}
            onClick={() => void retryExecution()}
            type="button"
          >
            {busyAction === "retry" ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}
            Continue with Eve
          </ActionButton>
        </section>
      )}

      {processing && (
        <ExecutionProgressPanel
          execution={execution}
          onStop={() => void stopExecution()}
          progress={payload.progress ?? []}
          stopBusy={busyAction === "stop"}
        />
      )}

      {cancelled && (
        <section className="pipeline-live-card">
          <span><Square size={18} /></span>
          <div>
            <strong>Campaign preparation stopped</strong>
            <p>
              Eve preserved this campaign at {execution.stage.replaceAll("_", " ")}.
              Continue when you are ready; completed work will not be repeated.
            </p>
          </div>
          <ActionButton
            className="button-primary"
            disabled={busyAction === "retry"}
            onClick={() => void retryExecution()}
            type="button"
          >
            {busyAction === "retry" ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}
            Continue from checkpoint
          </ActionButton>
        </section>
      )}

      {failed && (
        <section className="pipeline-live-card failed">
          <span><AlertCircle size={20} /></span>
          <div>
            <strong>Campaign preparation needs attention</strong>
            <p>{execution.errorMessage ?? "The Eve run did not start or complete."}</p>
            {approvedLeadCount > 0 && (
              <small>
                Parallel enrichment is complete and {approvedLeadCount} approved {approvedLeadCount === 1 ? "lead remains" : "leads remain"} saved.
                Continuing reuses the latest persisted campaign checkpoint and performs only unfinished Eve work.
              </small>
            )}
          </div>
          <ActionButton
            className="button-secondary"
            disabled={busyAction === "retry"}
            onClick={() => void retryExecution()}
            type="button"
          >
            {busyAction === "retry" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
            Continue with Eve
          </ActionButton>
        </section>
      )}

      {!processing && !failed && !cancelled && !showCandidateWorkspace && !readyForEve && sequences.length === 0 && (
        <section className="pipeline-live-card">
          <span><CircleDashed size={20} /></span>
          <div>
            <strong>Generated sequences will appear here</strong>
            <p>Eve has not persisted reviewable campaign artifacts yet.</p>
          </div>
        </section>
      )}

      {sequences.length > 0 && (
        <>
          <StickyActionBar className="approval-toolbar">
            <div>
              <span><ShieldCheck size={16} /> HUMAN REVIEW</span>
              <h3>Review every sequence before approval.</h3>
              <p>Approval changes draft records only. It does not schedule or send them.</p>
            </div>
            <div>
              <ActionButton
                className="button-secondary"
                onClick={() =>
                  setSelected(
                    selected.length === pendingIds.length ? [] : pendingIds,
                  )
                }
                type="button"
              >
                {selected.length === pendingIds.length ? "Clear selection" : "Select pending"}
              </ActionButton>
              <ActionButton
                className="button-primary"
                disabled={!selected.length || busyAction === "approve"}
                onClick={() => void approveSelected()}
                type="button"
              >
                {busyAction === "approve" ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}
                Approve {selected.length || ""}
              </ActionButton>
            </div>
          </StickyActionBar>

          {approvedScheduleIds.length > 0 && (
            <section className="schedule-toolbar">
              <div className="schedule-toolbar-copy">
                <span><CalendarDays size={16} /> DELIVERY SCHEDULE</span>
                <h3>Choose when approved sequences begin.</h3>
                <p>
                  Every step uses the selected local time and its own day offset.
                  Daily limits, retries and duplicate protection remain enforced.
                </p>
              </div>
              <div className="schedule-fields">
                <label>
                  Start date
                  <Input
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setScheduleDate(event.target.value)}
                    type="date"
                    value={scheduleDate}
                  />
                </label>
                <label>
                  Local time
                  <Input
                    onChange={(event) => setScheduleTime(event.target.value)}
                    type="time"
                    value={scheduleTime}
                  />
                </label>
                <label>
                  Time zone
                  <Input
                    onChange={(event) => setScheduleTimezone(event.target.value)}
                    value={scheduleTimezone}
                  />
                </label>
                <label>
                  Repeats
                  <NativeSelect
                    onChange={(event) =>
                      setScheduleCadence(
                        event.target.value as "once" | "daily" | "weekly",
                      )
                    }
                    value={scheduleCadence}
                  >
                    <option value="once">Does not repeat</option>
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                  </NativeSelect>
                </label>
              </div>
              <div className="schedule-actions">
                <ActionButton
                  className="button-secondary"
                  onClick={() =>
                    setScheduleSelected(
                      scheduleSelected.length === approvedScheduleIds.length
                        ? []
                        : approvedScheduleIds,
                    )
                  }
                  type="button"
                >
                  {scheduleSelected.length === approvedScheduleIds.length
                    ? "Clear approved"
                    : "Select approved sequences"}
                </ActionButton>
                <ActionButton
                  className="button-primary"
                  disabled={
                    !scheduleSelected.length || busyAction === "schedule"
                  }
                  onClick={() => void scheduleApproved()}
                  type="button"
                >
                  {busyAction === "schedule" ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Send size={16} />
                  )}
                  Schedule {scheduleSelected.length || ""}
                </ActionButton>
              </div>
            </section>
          )}

          {campaign.recurrence && (
            <section className="schedule-toolbar">
              <div className="schedule-toolbar-copy">
                <span><CalendarDays size={16} /> RECURRING DELIVERY</span>
                <h3>
                  {campaign.recurrence.intervalDays === 7
                    ? "Sends weekly"
                    : campaign.recurrence.intervalDays === 1
                      ? "Sends daily"
                      : campaign.recurrence.intervalDays
                        ? `Sends every ${campaign.recurrence.intervalDays} days`
                        : `Sends every ${campaign.recurrence.everyMinutes} minutes`}
                </h3>
                <p>
                  {campaign.schedulePaused
                    ? "This schedule is paused. No due deliveries will be claimed."
                    : "This schedule is active and checked by eve every minute."}
                </p>
              </div>
              <div className="schedule-actions">
                <ActionButton
                  className="button-secondary"
                  disabled={
                    busyAction === "pause-schedule" ||
                    busyAction === "resume-schedule"
                  }
                  onClick={() =>
                    void setSchedulePaused(!campaign.schedulePaused)
                  }
                  type="button"
                >
                  {campaign.schedulePaused ? (
                    <><Play size={16} /> Resume schedule</>
                  ) : (
                    <><Pause size={16} /> Pause schedule</>
                  )}
                </ActionButton>
              </div>
            </section>
          )}

          <section className="sequence-review-list">
            {sequences.map((sequence) => {
              const editable = sequence.status === "awaiting_approval";
              const schedulable = sequence.status === "approved";
              return (
                <SurfaceCard as="article" className="sequence-review-card" key={sequence.id}>
                  <header>
                    <label>
                      <Input
                        checked={
                          editable
                            ? selected.includes(sequence.id)
                            : scheduleSelected.includes(sequence.id)
                        }
                        disabled={!editable && !schedulable}
                        onChange={(event) =>
                          editable
                            ? setSelected((current) =>
                                event.target.checked
                                  ? [...current, sequence.id]
                                  : current.filter((id) => id !== sequence.id),
                              )
                            : setScheduleSelected((current) =>
                                event.target.checked
                                  ? [...current, sequence.id]
                                  : current.filter((id) => id !== sequence.id),
                              )
                        }
                        type="checkbox"
                      />
                      <span>
                        {sequence.channel === "email" ? <Mail size={17} /> : <MessageSquareText size={17} />}
                      </span>
                    </label>
                    <div>
                      <h3>{sequence.leadName} · {sequence.companyName}</h3>
                      <p>{sequence.name}</p>
                    </div>
                    <div className={`sequence-status sequence-status-${sequence.status}`}>
                      {sequence.status.replaceAll("_", " ")}
                    </div>
                    <small><Clock3 size={13} /> {sequence.timezone}</small>
                  </header>

                  <div className="sequence-message-list">
                    {sequence.messages.map((message) => {
                      const draft = drafts[message.id] ?? {
                        subject: message.subject,
                        subjectVariant: message.subjectVariant,
                        content: message.content,
                      };
                      return (
                        <div className="sequence-message-editor" key={message.id}>
                          <div className="message-step">
                            <span>{message.stepNumber.toString().padStart(2, "0")}</span>
                            <small>Day {message.dayOffset}</small>
                            <em className={`message-status message-status-${message.status}`}>
                              {message.status}
                            </em>
                            {message.scheduledFor && (
                              <time dateTime={message.scheduledFor}>
                                {new Intl.DateTimeFormat(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                  timeZone: sequence.timezone,
                                }).format(new Date(message.scheduledFor))}
                              </time>
                            )}
                          </div>
                          <div className="message-fields">
                            {sequence.channel === "email" && (
                              <div className="field-grid two">
                                <label>
                                  Subject A
                                  <Input
                                    disabled={!editable}
                                    onChange={(event) =>
                                      setDrafts((current) => ({
                                        ...current,
                                        [message.id]: { ...draft, subject: event.target.value },
                                      }))
                                    }
                                    value={draft.subject ?? ""}
                                  />
                                </label>
                                <label>
                                  Subject B
                                  <Input
                                    disabled={!editable}
                                    onChange={(event) =>
                                      setDrafts((current) => ({
                                        ...current,
                                        [message.id]: { ...draft, subjectVariant: event.target.value },
                                      }))
                                    }
                                    value={draft.subjectVariant ?? ""}
                                  />
                                </label>
                              </div>
                            )}
                            <label>
                              Message
                              <NativeTextarea
                                disabled={!editable}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [message.id]: { ...draft, content: event.target.value },
                                  }))
                                }
                                rows={6}
                                value={draft.content}
                              />
                            </label>
                          </div>
                          {editable && (
                            <ActionButton
                              aria-label={`Save step ${message.stepNumber}`}
                              disabled={busyAction === message.id}
                              onClick={() => void saveMessage(message.id)}
                              type="button"
                            >
                              {busyAction === message.id ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}
                            </ActionButton>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SurfaceCard>
              );
            })}
          </section>

          <div className="truth-banner">
            <Check size={18} />
            <p>
              <strong>Generated is not sent.</strong> Approved sequences remain
              inert until you create a schedule. Sent and delivered labels appear
              only after verified Resend events.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
