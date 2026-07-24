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
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  error?: string;
};

const pipelineSteps = [
  ["queued", "Queued"],
  ["researching", "Researching market"],
  ["enriching", "Verifying leads"],
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
  onRetry,
  retryBusy,
}: {
  execution: CampaignExecution;
  progress: CampaignProgressEvent[];
  onRetry: () => void;
  retryBusy: boolean;
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
            this run may have stalled. Retrying is safe: nothing is sent without
            your approval.
          </p>
          <button
            className="button-secondary compact"
            disabled={retryBusy}
            onClick={onRetry}
            type="button"
          >
            {retryBusy ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
            Retry research
          </button>
        </div>
      )}
    </section>
  );
}

function CandidateWorkspacePanel({
  candidates,
  busyAction,
  onVerify,
  onApprove,
  onRediscover,
}: {
  candidates: CandidateSummary[];
  busyAction: string;
  onVerify: (candidateIds: string[]) => void;
  onApprove: (candidateIds: string[]) => void;
  onRediscover: () => void;
}) {
  const discovered = candidates.filter((candidate) => candidate.status === "discovered");
  const enriching = candidates.filter((candidate) => candidate.status === "enriching");
  const verified = candidates.filter((candidate) => candidate.status === "verified");
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
        <button
          className="button-secondary"
          disabled={busyAction === "rediscover"}
          onClick={onRediscover}
          type="button"
        >
          {busyAction === "rediscover" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
          Search again
        </button>
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
            </div>
            <div className="candidate-stage-actions">
              <button
                className="button-secondary compact"
                disabled={busyAction === "rediscover"}
                onClick={onRediscover}
                type="button"
              >
                {busyAction === "rediscover" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
                Search again
              </button>
              <button
                className="button-secondary compact"
                onClick={() =>
                  setSelectedDiscovered(
                    selectedDiscovered.length === discovered.length
                      ? []
                      : discovered.map((candidate) => candidate.id),
                  )
                }
                type="button"
              >
                {selectedDiscovered.length === discovered.length ? "Clear all" : "Select all"}
              </button>
              <button
                className="button-primary compact"
                disabled={!selectedDiscovered.length || busyAction === "verify"}
                onClick={() => onVerify(selectedDiscovered)}
                type="button"
              >
                {busyAction === "verify" ? <LoaderCircle className="spin" size={14} /> : null}
                Verify {selectedDiscovered.length || ""} selected
              </button>
            </div>
          </header>
          <ul className="candidate-list">
            {discovered.map((candidate) => (
              <li key={candidate.id}>
                <label>
                  <input
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
              <p>Approved leads get personalized outreach sequences drafted for your review next.</p>
            </div>
            <div className="candidate-stage-actions">
              <button
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
              </button>
              <button
                className="button-primary compact"
                disabled={!selectedVerified.length || busyAction === "approve-leads"}
                onClick={() => onApprove(selectedVerified)}
                type="button"
              >
                {busyAction === "approve-leads" ? <LoaderCircle className="spin" size={14} /> : null}
                Approve {selectedVerified.length || ""} &amp; generate outreach
              </button>
            </div>
          </header>
          <ul className="candidate-list">
            {verified.map((candidate) => (
              <li key={candidate.id}>
                <label>
                  <input
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
  const [scheduleTimezone, setScheduleTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState("loading");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        cache: "no-store",
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
      setState("error");
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

  const hasEnrichingCandidates = (payload?.candidates ?? []).some(
    (candidate) => candidate.status === "enriching",
  );

  useEffect(() => {
    if (!hasEnrichingCandidates) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/campaigns/${campaignId}/candidates/refresh`, { method: "POST" })
        .catch(() => undefined)
        .finally(() => void load(true));
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [campaignId, hasEnrichingCandidates, load]);

  const pendingIds = useMemo(
    () =>
      payload?.sequences
        .filter((sequence) => sequence.status === "awaiting_approval")
        .map((sequence) => sequence.id) ?? [],
    [payload],
  );
  const approvedEmailIds = useMemo(
    () =>
      payload?.sequences
        .filter(
          (sequence) =>
            sequence.status === "approved" && sequence.channel === "email",
        )
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

  if (state === "loading") {
    return (
      <div className="dashboard-state">
        <LoaderCircle className="spin" />
        <h2>Loading campaign workspace</h2>
        <p>Reading the latest durable agent and approval state…</p>
      </div>
    );
  }

  if (state === "error" || !payload) {
    return (
      <div className="dashboard-state error">
        <AlertCircle />
        <h2>Campaign workspace is unavailable</h2>
        <p>{error}</p>
        <button className="button-secondary" onClick={() => void load()} type="button">
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  const { campaign, execution, sequences } = payload;
  const candidates = payload.candidates ?? [];
  const processing = execution && ["queued", "running"].includes(execution.status);
  const failed = execution?.status === "failed";
  const showCandidateWorkspace = !execution && candidates.length > 0;

  return (
    <div className="campaign-workspace">
      <a className="settings-back" href="/dashboard">
        <ArrowLeft size={15} /> Campaigns
      </a>

      <section className="campaign-workspace-head">
        <div>
          <span>{campaign.source.kind === "website" ? "WEBSITE CAMPAIGN" : "PRODUCT IDEA"}</span>
          <h2>{campaign.productName}</h2>
          <p>{campaign.audience}</p>
        </div>
        <div className={`status-badge status-${campaign.status}`}>
          {campaignStatusLabels[campaign.status]}
        </div>
      </section>

      {error && <div className="form-error" role="alert">{error}</div>}

      {showCandidateWorkspace && (
        <CandidateWorkspacePanel
          busyAction={busyAction}
          candidates={candidates}
          onApprove={(ids) => void approveLeads(ids)}
          onRediscover={() => void rediscoverCandidates()}
          onVerify={(ids) => void startVerification(ids)}
        />
      )}

      {processing && (
        <ExecutionProgressPanel
          execution={execution}
          onRetry={() => void retryExecution()}
          progress={payload.progress ?? []}
          retryBusy={busyAction === "retry"}
        />
      )}

      {failed && (
        <section className="pipeline-live-card failed">
          <span><AlertCircle size={20} /></span>
          <div>
            <strong>Campaign preparation needs attention</strong>
            <p>{execution.errorMessage ?? "The Eve run did not start or complete."}</p>
          </div>
          <button
            className="button-secondary"
            disabled={busyAction === "retry"}
            onClick={() => void retryExecution()}
            type="button"
          >
            {busyAction === "retry" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
            Retry research
          </button>
        </section>
      )}

      {!processing && !failed && !showCandidateWorkspace && sequences.length === 0 && (
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
          <section className="approval-toolbar">
            <div>
              <span><ShieldCheck size={16} /> HUMAN REVIEW</span>
              <h3>Review every sequence before approval.</h3>
              <p>Approval changes draft records only. It does not schedule or send them.</p>
            </div>
            <div>
              <button
                className="button-secondary"
                onClick={() =>
                  setSelected(
                    selected.length === pendingIds.length ? [] : pendingIds,
                  )
                }
                type="button"
              >
                {selected.length === pendingIds.length ? "Clear selection" : "Select pending"}
              </button>
              <button
                className="button-primary"
                disabled={!selected.length || busyAction === "approve"}
                onClick={() => void approveSelected()}
                type="button"
              >
                {busyAction === "approve" ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}
                Approve {selected.length || ""}
              </button>
            </div>
          </section>

          {approvedEmailIds.length > 0 && (
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
                  <input
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setScheduleDate(event.target.value)}
                    type="date"
                    value={scheduleDate}
                  />
                </label>
                <label>
                  Local time
                  <input
                    onChange={(event) => setScheduleTime(event.target.value)}
                    type="time"
                    value={scheduleTime}
                  />
                </label>
                <label>
                  Time zone
                  <input
                    onChange={(event) => setScheduleTimezone(event.target.value)}
                    value={scheduleTimezone}
                  />
                </label>
              </div>
              <div className="schedule-actions">
                <button
                  className="button-secondary"
                  onClick={() =>
                    setScheduleSelected(
                      scheduleSelected.length === approvedEmailIds.length
                        ? []
                        : approvedEmailIds,
                    )
                  }
                  type="button"
                >
                  {scheduleSelected.length === approvedEmailIds.length
                    ? "Clear approved"
                    : "Select approved email"}
                </button>
                <button
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
                </button>
              </div>
            </section>
          )}

          <section className="sequence-review-list">
            {sequences.map((sequence) => {
              const editable = sequence.status === "awaiting_approval";
              const schedulable =
                sequence.status === "approved" && sequence.channel === "email";
              return (
                <article className="sequence-review-card" key={sequence.id}>
                  <header>
                    <label>
                      <input
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
                                  <input
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
                                  <input
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
                              <textarea
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
                            <button
                              aria-label={`Save step ${message.stepNumber}`}
                              disabled={busyAction === message.id}
                              onClick={() => void saveMessage(message.id)}
                              type="button"
                            >
                              {busyAction === message.id ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
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
