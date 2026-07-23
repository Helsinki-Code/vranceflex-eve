"use client";

import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Flame,
  LoaderCircle,
  Mail,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReplyIntent, ReplyStatus } from "../lib/domain/pipeline";

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

async function parseResponse<T>(response: Response) {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The request failed.");
  return payload;
}

export function ReplyInbox() {
  const [rows, setRows] = useState<ReplyRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "attention" | ReplyIntent>("all");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/replies", { cache: "no-store" });
      const payload = await parseResponse<{ replies: ReplyRow[] }>(response);
      setRows(payload.replies);
      setError("");
      setState("ready");
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Replies could not be loaded.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      rows.filter(({ reply }) => {
        if (filter === "all") return reply.status !== "archived";
        if (filter === "attention") {
          return reply.flagForHuman && reply.status === "classified";
        }
        return reply.intent === filter && reply.status !== "archived";
      }),
    [filter, rows],
  );

  async function updateStatus(id: string, status: "reviewed" | "archived") {
    setBusy(id);
    setError("");
    try {
      const response = await fetch(`/api/replies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await parseResponse(response);
      setRows((current) =>
        current.map((row) =>
          row.reply.id === id
            ? { ...row, reply: { ...row.reply, status } }
            : row,
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Reply status could not be updated.",
      );
    } finally {
      setBusy("");
    }
  }

  if (state === "loading") {
    return (
      <div className="dashboard-state">
        <LoaderCircle className="spin" />
        <h2>Loading reply inbox</h2>
        <p>Reading verified inbound email and SMS activity…</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="dashboard-state error">
        <AlertCircle />
        <h2>Reply inbox is unavailable</h2>
        <p>{error}</p>
        <button className="button-secondary" onClick={() => void load()} type="button">
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  const filters: Array<["all" | "attention" | ReplyIntent, string]> = [
    ["all", "All"],
    ["attention", "Needs attention"],
    ["HOT", "Hot"],
    ["WARM", "Warm"],
    ["OBJECTION", "Objections"],
    ["UNSUBSCRIBE", "Unsubscribed"],
  ];

  return (
    <div className="reply-inbox">
      <section className="reply-summary">
        <div><Mail size={18} /><span>Verified replies</span><strong>{rows.length}</strong></div>
        <div><Flame size={18} /><span>Hot</span><strong>{rows.filter(({ reply }) => reply.intent === "HOT").length}</strong></div>
        <div><ShieldAlert size={18} /><span>Needs attention</span><strong>{rows.filter(({ reply }) => reply.flagForHuman && reply.status === "classified").length}</strong></div>
      </section>

      <div className="reply-filters" aria-label="Reply filters">
        {filters.map(([value, label]) => (
          <button
            className={filter === value ? "active" : ""}
            key={value}
            onClick={() => setFilter(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {visible.length === 0 ? (
        <section className="reply-empty">
          <Mail size={24} />
          <h2>No replies in this view</h2>
          <p>
            Verified inbound replies appear here. Any reply pauses the remaining
            sequence before a human responds.
          </p>
        </section>
      ) : (
        <section className="reply-list">
          {visible.map(({ reply, leadName, companyName, campaignName }) => (
            <article className={`reply-card intent-${reply.intent ?? "NEUTRAL"}`} key={reply.id}>
              <header>
                <div>
                  <span>{reply.intent ?? "UNCLASSIFIED"}</span>
                  <h2>{leadName} · {companyName}</h2>
                  <p>{campaignName} · {new Date(reply.receivedAt).toLocaleString()}</p>
                </div>
                <small>{reply.confidence ?? "pending"} confidence</small>
              </header>
              <div className="reply-body">
                <strong>{reply.subject || "Email reply"}</strong>
                <p>{reply.text}</p>
              </div>
              <div className="reply-analysis">
                <div><span>Why</span><p>{reply.reasoning ?? "Classification pending."}</p></div>
                <div><span>Next action</span><p>{reply.actionDetail ?? reply.nextAction ?? "Human review"}</p></div>
                {reply.suggestedResponse && (
                  <div><span>Suggested response</span><p>{reply.suggestedResponse}</p></div>
                )}
              </div>
              <footer>
                <span>
                  {reply.status === "classified" ? "Awaiting review" : reply.status}
                </span>
                <div>
                  <button
                    className="button-secondary"
                    disabled={busy === reply.id}
                    onClick={() => void updateStatus(reply.id, "archived")}
                    type="button"
                  >
                    <Archive size={14} /> Archive
                  </button>
                  <button
                    className="button-primary compact"
                    disabled={busy === reply.id || reply.status === "reviewed"}
                    onClick={() => void updateStatus(reply.id, "reviewed")}
                    type="button"
                  >
                    {busy === reply.id ? <LoaderCircle className="spin" size={14} /> : <CheckCircle2 size={14} />}
                    Mark reviewed
                  </button>
                </div>
              </footer>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
