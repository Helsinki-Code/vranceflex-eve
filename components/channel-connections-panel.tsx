"use client";

import { Check, CircleDashed, LoaderCircle, Unlink } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ResendSummary = { connected: true; fromEmail: string; replyDomain: string } | { connected: false };
type TwilioSummary = { connected: true; messagingServiceSid: string } | { connected: false };

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

export function ChannelConnectionsPanel({
  organizationId,
  initialResend,
  initialTwilio,
  isAdmin,
}: {
  organizationId: string;
  initialResend: ResendSummary;
  initialTwilio: TwilioSummary;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [resend, setResend] = useState(initialResend);
  const [twilio, setTwilio] = useState(initialTwilio);
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/webhooks/resend/${organizationId}`);
  }, [organizationId]);

  return (
    <div className="channel-connections">
      <ResendCard
        isAdmin={isAdmin}
        onChange={(next) => {
          setResend(next);
          router.refresh();
        }}
        summary={resend}
        webhookUrl={webhookUrl}
      />
      <TwilioCard
        isAdmin={isAdmin}
        onChange={(next) => {
          setTwilio(next);
          router.refresh();
        }}
        summary={twilio}
      />
    </div>
  );
}

function ResendCard({
  summary,
  webhookUrl,
  isAdmin,
  onChange,
}: {
  summary: ResendSummary;
  webhookUrl: string;
  isAdmin: boolean;
  onChange: (next: ResendSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await requestJson<{ fromEmail: string; replyDomain: string }>(
        "/api/settings/integrations/resend",
        {
          method: "POST",
          body: JSON.stringify({
            apiKey: form.get("apiKey"),
            fromEmail: form.get("fromEmail"),
            replyDomain: form.get("replyDomain"),
            webhookSecret: form.get("webhookSecret"),
          }),
        },
      );
      onChange({ connected: true, fromEmail: result.fromEmail, replyDomain: result.replyDomain });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Resend could not be connected.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/settings/integrations/resend", { method: "DELETE" });
      onChange({ connected: false });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Resend could not be disconnected.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="channel-card">
      <div className="channel-card-head">
        <span className={summary.connected ? "configured" : ""}>
          {summary.connected ? <Check size={15} /> : <CircleDashed size={15} />}
        </span>
        <div>
          <h2>Resend (email outreach)</h2>
          <p>Your own Resend account sends this workspace's approved outreach email.</p>
        </div>
      </div>

      {error ? <div className="auth-form-error" role="alert">{error}</div> : null}

      {summary.connected ? (
        <div className="channel-connected">
          <div><span>Sending from</span><strong>{summary.fromEmail}</strong></div>
          <div><span>Reply domain</span><strong>{summary.replyDomain}</strong></div>
          {isAdmin && (
            <button className="button-secondary compact" disabled={busy} onClick={() => void disconnect()} type="button">
              {busy ? <LoaderCircle className="spin" size={14} /> : <Unlink size={14} />}
              Disconnect
            </button>
          )}
        </div>
      ) : isAdmin ? (
        <form className="channel-connect-form" onSubmit={connect}>
          <p className="channel-webhook-hint">
            Add an inbound webhook in Resend pointing to:
            <code>{webhookUrl || "…"}</code>
          </p>
          <label><span>Resend API key</span><input name="apiKey" required type="password" /></label>
          <label><span>From address</span><input name="fromEmail" placeholder="Acme <outreach@yourdomain.com>" required /></label>
          <label><span>Reply domain</span><input name="replyDomain" placeholder="reply.yourdomain.com" required /></label>
          <label><span>Webhook signing secret</span><input name="webhookSecret" required type="password" /></label>
          <button className="button-primary compact" disabled={busy} type="submit">
            {busy ? <LoaderCircle className="spin" size={14} /> : null}
            Connect Resend
          </button>
        </form>
      ) : (
        <p className="channel-empty-note">Not connected. Ask a workspace admin to connect Resend.</p>
      )}
    </section>
  );
}

function TwilioCard({
  summary,
  isAdmin,
  onChange,
}: {
  summary: TwilioSummary;
  isAdmin: boolean;
  onChange: (next: TwilioSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await requestJson<{ messagingServiceSid: string }>(
        "/api/settings/integrations/twilio",
        {
          method: "POST",
          body: JSON.stringify({
            accountSid: form.get("accountSid"),
            authToken: form.get("authToken"),
            messagingServiceSid: form.get("messagingServiceSid"),
          }),
        },
      );
      onChange({ connected: true, messagingServiceSid: result.messagingServiceSid });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Twilio could not be connected.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/settings/integrations/twilio", { method: "DELETE" });
      onChange({ connected: false });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Twilio could not be disconnected.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="channel-card">
      <div className="channel-card-head">
        <span className={summary.connected ? "configured" : ""}>
          {summary.connected ? <Check size={15} /> : <CircleDashed size={15} />}
        </span>
        <div>
          <h2>Twilio (SMS outreach)</h2>
          <p>Your own Twilio account sends this workspace's approved outreach SMS.</p>
        </div>
      </div>

      {error ? <div className="auth-form-error" role="alert">{error}</div> : null}

      {summary.connected ? (
        <div className="channel-connected">
          <div><span>Messaging Service</span><strong>{summary.messagingServiceSid}</strong></div>
          {isAdmin && (
            <button className="button-secondary compact" disabled={busy} onClick={() => void disconnect()} type="button">
              {busy ? <LoaderCircle className="spin" size={14} /> : <Unlink size={14} />}
              Disconnect
            </button>
          )}
        </div>
      ) : isAdmin ? (
        <form className="channel-connect-form" onSubmit={connect}>
          <label><span>Account SID</span><input name="accountSid" placeholder="AC…" required /></label>
          <label><span>Auth token</span><input name="authToken" required type="password" /></label>
          <label><span>Messaging Service SID</span><input name="messagingServiceSid" placeholder="MG…" required /></label>
          <button className="button-primary compact" disabled={busy} type="submit">
            {busy ? <LoaderCircle className="spin" size={14} /> : null}
            Connect Twilio
          </button>
        </form>
      ) : (
        <p className="channel-empty-note">Not connected. Ask a workspace admin to connect Twilio.</p>
      )}
    </section>
  );
}
