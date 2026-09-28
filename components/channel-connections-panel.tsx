"use client";

import { Copy, LoaderCircle, Mail, MessageSquare, Unlink } from "lucide-react";
import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ConfirmAction } from "./product-ui";
import { FormField, StatusDot } from "./product/kit";

type ResendSummary = { connected: true; fromEmail: string; replyDomain: string } | { connected: false };
type TwilioSummary = { connected: true; messagingServiceSid: string } | { connected: false };

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

function CopyValue({ label, value }: { label: string; value: string }) {
  return <div className="grid min-w-0 gap-1.5 text-sm">
    <span className="font-medium">{label}</span>
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 py-1.5 pl-3 pr-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{value || "…"}</code>
      <Button type="button" variant="ghost" size="sm" className="h-7 min-h-7" onClick={() => { void navigator.clipboard?.writeText(value); toast.success("Copied."); }}><Copy />Copy</Button>
    </div>
  </div>;
}

function ProviderCard({ icon, name, purpose, connected, children }: { icon: ReactNode; name: string; purpose: string; connected: boolean; children: ReactNode }) {
  return <section className="min-w-0 rounded-[var(--radius)] border border-border bg-card">
    <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
      <div className="flex gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-muted-foreground [&_svg]:size-4">{icon}</span>
        <div><h2 className="text-sm font-semibold">{name}</h2><p className="text-sm text-muted-foreground">{purpose}</p></div>
      </div>
      <StatusDot on={connected} label={connected ? "Connected" : "Not connected"} />
    </header>
    <div className="p-5">{children}</div>
  </section>;
}

export function ChannelConnectionsPanel({ organizationId, initialResend, initialTwilio, isAdmin }: { organizationId: string; initialResend: ResendSummary; initialTwilio: TwilioSummary; isAdmin: boolean }) {
  const router = useRouter();
  const [resend, setResend] = useState(initialResend);
  const [twilio, setTwilio] = useState(initialTwilio);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return <div className="grid gap-4 lg:grid-cols-2">
    <ResendCard isAdmin={isAdmin} webhookUrl={origin ? `${origin}/api/webhooks/resend/${organizationId}` : ""} summary={resend} onChange={(next) => { setResend(next); router.refresh(); }} />
    <TwilioCard isAdmin={isAdmin} webhookUrl={origin ? `${origin}/api/webhooks/twilio/${organizationId}` : ""} summary={twilio} onChange={(next) => { setTwilio(next); router.refresh(); }} />
  </div>;
}

function useProviderAction() {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : failure); } finally { setBusy(false); }
  };
  return { busy, run };
}

function ResendCard({ summary, webhookUrl, isAdmin, onChange }: { summary: ResendSummary; webhookUrl: string; isAdmin: boolean; onChange: (next: ResendSummary) => void }) {
  const { busy, run } = useProviderAction();
  const connect = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const result = await requestJson<{ fromEmail: string; replyDomain: string }>("/api/settings/integrations/resend", { method: "POST", body: JSON.stringify({ apiKey: form.get("apiKey"), fromEmail: form.get("fromEmail"), replyDomain: form.get("replyDomain"), webhookSecret: form.get("webhookSecret") }) });
      onChange({ connected: true, fromEmail: result.fromEmail, replyDomain: result.replyDomain });
      toast.success("Resend connected.");
    }, "Resend could not be connected.");
  };
  const disconnect = () => void run(async () => { await requestJson("/api/settings/integrations/resend", { method: "DELETE" }); onChange({ connected: false }); toast.success("Resend disconnected."); }, "Resend could not be disconnected.");

  return <ProviderCard icon={<Mail />} name="Resend" purpose="Sends approved emails and receives replies." connected={summary.connected}>
    {summary.connected ? <div className="space-y-4">
      <dl className="grid gap-2 text-sm">
        <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Sending from</dt><dd className="truncate">{summary.fromEmail}</dd></div>
        <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Reply domain</dt><dd className="truncate font-mono text-xs leading-5">{summary.replyDomain}</dd></div>
      </dl>
      <CopyValue label="Inbound webhook" value={webhookUrl} />
      {isAdmin ? <ConfirmAction destructive title="Disconnect Resend?" description="Scheduled emails for this workspace stop sending until an account is connected again." confirmLabel="Disconnect" onConfirm={disconnect} trigger={<Button variant="outline" size="sm" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Unlink />}Disconnect</Button>} /> : null}
    </div> : isAdmin ? <form className="grid min-w-0 gap-4" onSubmit={connect}>
      <CopyValue label="1. Add this inbound webhook in Resend" value={webhookUrl} />
      <FormField label="API key"><Input name="apiKey" required type="password" autoComplete="off" placeholder="re_…" /></FormField>
      <FormField label="From address" hint="Must be on a domain verified in Resend."><Input name="fromEmail" placeholder="Acme <outreach@yourdomain.com>" required /></FormField>
      <FormField label="Reply domain" hint="The receiving domain replies are routed through."><Input name="replyDomain" placeholder="reply.yourdomain.com" required /></FormField>
      <FormField label="Webhook signing secret"><Input name="webhookSecret" required type="password" autoComplete="off" placeholder="whsec_…" /></FormField>
      <Button type="submit" disabled={busy} className="justify-self-start">{busy ? <LoaderCircle className="animate-spin" /> : null}Connect Resend</Button>
    </form> : <p className="text-sm text-muted-foreground">Ask a workspace admin to connect Resend.</p>}
  </ProviderCard>;
}

function TwilioCard({ summary, webhookUrl, isAdmin, onChange }: { summary: TwilioSummary; webhookUrl: string; isAdmin: boolean; onChange: (next: TwilioSummary) => void }) {
  const { busy, run } = useProviderAction();
  const connect = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const result = await requestJson<{ messagingServiceSid: string }>("/api/settings/integrations/twilio", { method: "POST", body: JSON.stringify({ accountSid: form.get("accountSid"), authToken: form.get("authToken"), messagingServiceSid: form.get("messagingServiceSid") }) });
      onChange({ connected: true, messagingServiceSid: result.messagingServiceSid });
      toast.success("Twilio connected.");
    }, "Twilio could not be connected.");
  };
  const disconnect = () => void run(async () => { await requestJson("/api/settings/integrations/twilio", { method: "DELETE" }); onChange({ connected: false }); toast.success("Twilio disconnected."); }, "Twilio could not be disconnected.");

  return <ProviderCard icon={<MessageSquare />} name="Twilio" purpose="Sends approved texts and captures replies and STOP requests." connected={summary.connected}>
    {summary.connected ? <div className="space-y-4">
      <dl className="grid gap-2 text-sm"><div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Messaging service</dt><dd className="truncate font-mono text-xs leading-5">{summary.messagingServiceSid}</dd></div></dl>
      <CopyValue label="Incoming message & status webhook" value={webhookUrl} />
      {isAdmin ? <ConfirmAction destructive title="Disconnect Twilio?" description="Scheduled texts for this workspace stop sending until an account is connected again." confirmLabel="Disconnect" onConfirm={disconnect} trigger={<Button variant="outline" size="sm" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Unlink />}Disconnect</Button>} /> : null}
    </div> : isAdmin ? <form className="grid min-w-0 gap-4" onSubmit={connect}>
      <FormField label="Account SID"><Input name="accountSid" placeholder="AC…" required autoComplete="off" /></FormField>
      <FormField label="Auth token"><Input name="authToken" required type="password" autoComplete="off" /></FormField>
      <FormField label="Messaging Service SID" hint="After connecting, set the service's incoming-message webhook to the URL shown here."><Input name="messagingServiceSid" placeholder="MG…" required autoComplete="off" /></FormField>
      <Button type="submit" disabled={busy} className="justify-self-start">{busy ? <LoaderCircle className="animate-spin" /> : null}Connect Twilio</Button>
    </form> : <p className="text-sm text-muted-foreground">Ask a workspace admin to connect Twilio.</p>}
  </ProviderCard>;
}
