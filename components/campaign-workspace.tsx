"use client";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  LoaderCircle,
  Mail,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  campaignStatusLabels,
  type Campaign,
} from "../lib/domain/campaign";
import type {
  CampaignExecution,
  OutreachWorkspaceMessage,
  OutreachWorkspaceSequence,
} from "../lib/domain/pipeline";

type WorkspacePayload = {
  campaign: Campaign;
  execution: CampaignExecution | null;
  sequences: OutreachWorkspaceSequence[];
  error?: string;
};

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
  const [drafts, setDrafts] = useState<Record<string, MessageDraft>>({});
  const [busyAction, setBusyAction] = useState("");

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
        <section className="pipeline-live-card">
          <span><LoaderCircle className="spin" size={20} /></span>
          <div>
            <strong>Eve is preparing this campaign</strong>
            <p>
              Current stage: {execution.stage.replaceAll("_", " ")}. This page
              refreshes automatically; nothing is being sent.
            </p>
          </div>
          <small>Attempt {execution.attempt}</small>
        </section>
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

          <section className="sequence-review-list">
            {sequences.map((sequence) => {
              const editable = sequence.status === "awaiting_approval";
              return (
                <article className="sequence-review-card" key={sequence.id}>
                  <header>
                    <label>
                      <input
                        checked={selected.includes(sequence.id)}
                        disabled={!editable}
                        onChange={(event) =>
                          setSelected((current) =>
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
              inert until a separate schedule is created and a provider confirms delivery.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
