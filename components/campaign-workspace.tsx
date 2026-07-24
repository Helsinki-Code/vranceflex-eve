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

type WorkspacePayload = {
  campaign: Campaign;
  execution: CampaignExecution | null;
  sequences: OutreachWorkspaceSequence[];
  progress?: CampaignProgressEvent[];
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
  const processing = execution && ["queued", "running"].includes(execution.status);
  const failed = execution?.status === "failed";

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

      {!processing && !failed && sequences.length === 0 && (
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
