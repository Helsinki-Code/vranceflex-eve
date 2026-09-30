"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Globe, LoaderCircle, Mail, MoreHorizontal, Pause, Play, Plus, RefreshCw, Send, SlidersHorizontal, Trash2, XCircle } from "lucide-react";
import { FormEvent, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ConfirmAction } from "./product-ui";
import { Chip, EmptyState, FormField, LedgerStats, Notice, Panel, SelectField, StatusDot } from "./product/kit";
import { ledgerEase, Stagger, StaggerItem } from "./product/motion";
import { cn } from "@/lib/utils";
import { mailboxPresets, type MailboxPresetKey } from "../lib/domain/mailboxes";
import type { DomainSummary, MailboxSummary, SendingOverview } from "../lib/server/mailbox-store";

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string; issues?: Array<{ message: string }> };
  if (!response.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "The request could not be completed.");
  return data;
}

function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, action: () => Promise<void>, failure: string) => {
    setBusy(key);
    try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : failure); } finally { setBusy(null); }
  };
  return { busy, run };
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso: string | null) {
  if (!iso) return "never";
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function SendingWorkspace({ initial, isAdmin }: { initial: SendingOverview; isAdmin: boolean }) {
  const router = useRouter();
  const [overview, setOverview] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [addingDomain, setAddingDomain] = useState(false);
  const refresh = async () => {
    setOverview(await requestJson<SendingOverview>("/api/settings/mailboxes"));
    router.refresh();
  };

  const active = overview.mailboxes.filter((mailbox) => mailbox.status === "active");
  const capacity = active.reduce((sum, mailbox) => sum + mailbox.capToday, 0);
  const sentToday = overview.mailboxes.reduce((sum, mailbox) => sum + mailbox.sentToday, 0);
  const sentWeek = overview.mailboxes.reduce((sum, mailbox) => sum + mailbox.sentWeek, 0);
  const bouncedWeek = overview.mailboxes.reduce((sum, mailbox) => sum + mailbox.bouncedWeek, 0);
  // Only domains with a connected mailbox affect deliverability today.
  const sendingDomains = overview.domains.filter((domain) => domain.mailboxCount > 0);
  const verified = sendingDomains.filter((domain) => domain.status === "verified").length;
  const usingMailboxes = overview.emailTransport !== "resend" || !overview.resendConnected;

  return <div className="space-y-6">
    <LedgerStats items={[
      { label: "Active mailboxes", value: active.length, note: overview.mailboxes.length > active.length ? `${overview.mailboxes.length - active.length} paused or need attention` : "in rotation" },
      { label: "Sent today", value: sentToday, note: `of ${capacity.toLocaleString()} mailbox capacity` },
      { label: "Domains authenticated", value: verified, note: sendingDomains.length ? `of ${sendingDomains.length} domain${sendingDomains.length === 1 ? "" : "s"} you send from` : "no mailbox on your own domain yet", tone: sendingDomains.length && verified === sendingDomains.length ? "verified" : "default" },
      { label: "Bounce rate · 7 days", value: sentWeek ? (bouncedWeek / sentWeek) * 100 : 0, format: "percent", note: `${bouncedWeek} of ${sentWeek} sends`, tone: sentWeek && bouncedWeek / sentWeek >= 0.05 ? "danger" : "default" },
    ]} />

    {overview.resendConnected && overview.mailboxes.length ? <TransportChoice value={overview.emailTransport} isAdmin={isAdmin} onChange={refresh} /> : null}
    {capacity > overview.orgDailyEmailLimit && usingMailboxes ? <Notice tone="info" title={`The workspace-wide cap of ${overview.orgDailyEmailLimit} emails a day still applies`}>Your mailboxes could send {capacity} today. Raise the workspace limit in scheduling settings if you want to use all of it.</Notice> : null}

    <Panel
      title="Mailboxes"
      description="Outreach rotates across these inboxes. Each lead stays on the mailbox that first wrote to them, so follow-ups thread and replies land in one place."
      actions={isAdmin ? <Button size="sm" onClick={() => setAdding(true)}><Plus />Add mailbox</Button> : null}
      bodyClassName="p-0"
    >
      {overview.mailboxes.length ? <Stagger as="ul" className="divide-y divide-rule">
        {overview.mailboxes.map((mailbox) => <MailboxRow key={mailbox.id} mailbox={mailbox} isAdmin={isAdmin} onChange={refresh} />)}
      </Stagger> : <div className="p-5"><EmptyState icon={<Mail />} title="No mailboxes yet" description="Connect a Google Workspace mailbox with an App Password, or any mailbox that supports SMTP and IMAP. Use a secondary domain (e.g. getacme.com) so your main domain's reputation stays safe." action={isAdmin ? <Button size="sm" onClick={() => setAdding(true)}><Plus />Add your first mailbox</Button> : undefined} /></div>}
    </Panel>

    <Panel
      title="Sending domains"
      description="Receivers check SPF, DKIM and DMARC on every email. Missing records are the most common reason cold email lands in spam."
      actions={isAdmin ? <Button size="sm" variant="outline" onClick={() => setAddingDomain(true)}><Globe />Add domain</Button> : null}
      bodyClassName="p-0"
    >
      {overview.domains.length ? <ul className="divide-y divide-rule">
        {overview.domains.map((domain) => <DomainRow key={domain.id} domain={domain} isAdmin={isAdmin} onChange={refresh} />)}
      </ul> : <div className="p-5"><EmptyState icon={<Globe />} title="No domains to check" description="Domains are added automatically when you connect a mailbox on your own domain. Personal addresses like gmail.com don't need DNS setup." /></div>}
    </Panel>

    {isAdmin ? <AddMailboxDialog open={adding} onOpenChange={setAdding} onConnected={refresh} /> : null}
    {isAdmin ? <AddDomainDialog open={addingDomain} onOpenChange={setAddingDomain} onAdded={refresh} /> : null}
  </div>;
}

function TransportChoice({ value, isAdmin, onChange }: { value: SendingOverview["emailTransport"]; isAdmin: boolean; onChange: () => Promise<void> }) {
  const { busy, run } = useBusy();
  const current = value === "resend" ? "resend" : "mailboxes";
  const choose = (next: "mailboxes" | "resend") => void run(next, async () => {
    await requestJson("/api/settings/sending", { method: "PATCH", body: JSON.stringify({ emailTransport: next }) });
    await onChange();
    toast.success(next === "resend" ? "Outreach email now sends through Resend." : "Outreach email now rotates across your mailboxes.");
  }, "Couldn't change the sending method.");
  const options = [
    { key: "mailboxes" as const, title: "Mailbox rotation", body: "Recommended for cold outreach." },
    { key: "resend" as const, title: "Resend", body: "For opt-in or existing customers." },
  ];
  return <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
    <div><h3 className="text-sm font-semibold">Send outreach email from</h3><p className="text-xs text-muted-foreground">Both are connected. Resend&apos;s terms don&apos;t allow cold email.</p></div>
    <div role="radiogroup" className="inline-flex rounded-md border border-border bg-muted/50 p-1">
      {options.map((option) => <button key={option.key} type="button" role="radio" aria-checked={current === option.key} disabled={!isAdmin || busy !== null} onClick={() => current !== option.key && choose(option.key)} className={cn("relative rounded px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed", current === option.key ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
        {current === option.key ? <motion.span layoutId="transport-pill" className="absolute inset-0 rounded bg-background shadow-sm" transition={{ duration: 0.25, ease: ledgerEase }} /> : null}
        <span className="relative flex items-center gap-1.5 font-medium">{busy === option.key ? <LoaderCircle className="size-3.5 animate-spin" /> : null}{option.title}</span>
        <span className="relative hidden text-xs text-muted-foreground md:block">{option.body}</span>
      </button>)}
    </div>
  </section>;
}

function CapacityBar({ sent, cap }: { sent: number; cap: number }) {
  const percent = cap ? Math.min(100, (sent / cap) * 100) : 0;
  return <span className="block h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
    <motion.span className={cn("block h-full rounded-full", percent >= 100 ? "bg-warning" : "bg-primary")} initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.6, ease: ledgerEase }} />
  </span>;
}

function MailboxRow({ mailbox, isAdmin, onChange }: { mailbox: MailboxSummary; isAdmin: boolean; onChange: () => Promise<void> }) {
  const { busy, run } = useBusy();
  const [editing, setEditing] = useState(false);
  const patch = (body: Record<string, unknown>, success: string) => void run("patch", async () => {
    await requestJson(`/api/settings/mailboxes/${mailbox.id}`, { method: "PATCH", body: JSON.stringify(body) });
    await onChange();
    toast.success(success);
  }, "Couldn't update the mailbox.");
  const test = () => void run("test", async () => {
    const result = await requestJson<{ to: string }>(`/api/settings/mailboxes/${mailbox.id}/test`, { method: "POST" });
    toast.success(`Test email sent to ${result.to}. Check the inbox (and spam).`);
  }, "The test email couldn't be sent.");
  const remove = () => void run("remove", async () => {
    await requestJson(`/api/settings/mailboxes/${mailbox.id}`, { method: "DELETE" });
    await onChange();
    toast.success(`${mailbox.email} removed.`);
  }, "Couldn't remove the mailbox.");

  const statusLabel = mailbox.status === "active" ? "Active" : mailbox.status === "paused" ? "Paused" : "Needs attention";
  return <StaggerItem as="li" className="px-5 py-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised [&_svg]:size-4", mailbox.status === "error" ? "text-destructive" : "text-muted-foreground")}>{mailbox.status === "error" ? <AlertTriangle /> : <Mail />}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{mailbox.fromName ? <>{mailbox.fromName} <span className="font-normal text-muted-foreground">&lt;{mailbox.email}&gt;</span></> : mailbox.email}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusDot on={mailbox.status === "active"} label={statusLabel} />
            <Chip>{mailbox.provider === "google" ? "Google" : "SMTP / IMAP"}</Chip>
            {mailbox.consumer ? <Chip tone="warning">Personal address</Chip> : mailbox.domainStatus === "verified" ? <Chip tone="verified">Domain authenticated</Chip> : mailbox.domainStatus ? <Chip tone="warning">DNS incomplete</Chip> : null}
          </div>
        </div>
      </div>
      <div className="grid w-full gap-1.5 md:w-64">
        <div className="flex items-baseline justify-between text-xs"><span className="text-muted-foreground">Today</span><span className="font-mono tabular-nums">{mailbox.sentToday} / {mailbox.capToday}</span></div>
        <CapacityBar sent={mailbox.sentToday} cap={mailbox.capToday} />
        <p className="text-xs text-muted-foreground">{mailbox.rampCompletesOn ? `Ramping up · reaches ${mailbox.dailyLimit}/day ${shortDate(mailbox.rampCompletesOn)}` : `${mailbox.dailyLimit}/day limit`} · inbox checked {ago(mailbox.lastPolledAt)}</p>
      </div>
      {isAdmin ? <div className="flex items-center gap-2 md:justify-end">
        <Button size="sm" variant="outline" onClick={test} disabled={busy !== null}>{busy === "test" ? <LoaderCircle className="animate-spin" /> : <Send />}Send test</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" aria-label={`More actions for ${mailbox.email}`} disabled={busy !== null}>{busy && busy !== "test" ? <LoaderCircle className="animate-spin" /> : <MoreHorizontal />}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {mailbox.status === "active"
              ? <DropdownMenuItem onSelect={() => patch({ status: "paused" }, "Mailbox paused. Replies are still collected.")}><Pause />Pause sending</DropdownMenuItem>
              : <DropdownMenuItem onSelect={() => patch({ status: "active" }, "Mailbox back in rotation.")}><Play />{mailbox.status === "error" ? "Retry and resume" : "Resume sending"}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => setEditing(true)}><SlidersHorizontal />Limits &amp; sender name</DropdownMenuItem>
            <DropdownMenuSeparator />
            <ConfirmAction destructive title={`Remove ${mailbox.email}?`} description="It stops sending and its inbox stops being checked. Leads it wrote to continue from another mailbox in a new thread." confirmLabel="Remove" onConfirm={remove} trigger={<DropdownMenuItem onSelect={(event) => event.preventDefault()} className="text-destructive focus:text-destructive"><Trash2 />Remove</DropdownMenuItem>} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div> : null}
    </div>
    {mailbox.status !== "active" && mailbox.statusReason ? <p className={cn("mt-3 rounded-md border px-3 py-2 text-xs leading-5", mailbox.status === "error" ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-muted-foreground")}>{mailbox.statusReason}</p> : null}
    {mailbox.consumer && mailbox.status === "active" ? <p className="mt-3 text-xs leading-5 text-muted-foreground">Personal Gmail is capped at about 500 emails a day, and cold outreach from a personal account risks suspension. A Google Workspace mailbox on a secondary domain is safer.</p> : null}
    {isAdmin ? <EditMailboxDialog mailbox={mailbox} open={editing} onOpenChange={setEditing} onSave={(body) => { patch(body, "Mailbox updated."); setEditing(false); }} /> : null}
  </StaggerItem>;
}

function EditMailboxDialog({ mailbox, open, onOpenChange, onSave }: { mailbox: MailboxSummary; open: boolean; onOpenChange: (open: boolean) => void; onSave: (body: Record<string, unknown>) => void }) {
  const [rampUp, setRampUp] = useState(mailbox.rampUp);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({ fromName: String(form.get("fromName") ?? "").trim() || null, dailyLimit: Number(form.get("dailyLimit")), rampUp });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={submit}>
        <DialogHeader><DialogTitle>{mailbox.email}</DialogTitle><DialogDescription>Keep new mailboxes at 30–50 a day. Going higher on a fresh inbox is how domains end up in spam.</DialogDescription></DialogHeader>
        <FormField label="Sender name" hint="Shown as the From name. Leave blank to use the address alone."><Input name="fromName" defaultValue={mailbox.fromName ?? ""} maxLength={80} placeholder="Priya from Acme" /></FormField>
        <FormField label="Daily limit"><Input name="dailyLimit" type="number" min={1} max={500} defaultValue={mailbox.dailyLimit} required /></FormField>
        <label className="flex items-start gap-3 text-sm"><Checkbox checked={rampUp} onCheckedChange={(checked) => setRampUp(checked === true)} className="mt-0.5" /><span><span className="font-medium">Ramp up gradually</span><span className="block text-xs text-muted-foreground">Starts at 10 a day and adds 5 each day until the limit.</span></span></label>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit">Save</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function AddMailboxDialog({ open, onOpenChange, onConnected }: { open: boolean; onOpenChange: (open: boolean) => void; onConnected: () => Promise<void> }) {
  const { busy, run } = useBusy();
  const [tab, setTab] = useState<"google" | "smtp">("google");
  const [preset, setPreset] = useState<MailboxPresetKey>("zoho");
  const [rampUp, setRampUp] = useState(true);
  const [secure, setSecure] = useState({ smtp: true, imap: true });
  const hosts = mailboxPresets[preset];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const shared = { email: form.get("email"), fromName: form.get("fromName"), dailyLimit: Number(form.get("dailyLimit") || 30), rampUp };
    const body = tab === "google"
      ? { provider: "google", ...shared, appPassword: form.get("appPassword") }
      : {
          provider: "smtp",
          ...shared,
          username: form.get("username"),
          password: form.get("password"),
          smtpHost: form.get("smtpHost"),
          smtpPort: Number(form.get("smtpPort")),
          smtpSecure: secure.smtp,
          imapHost: form.get("imapHost"),
          imapPort: Number(form.get("imapPort")),
          imapSecure: secure.imap,
        };
    void run("connect", async () => {
      const result = await requestJson<{ email: string }>("/api/settings/mailboxes", { method: "POST", body: JSON.stringify(body) });
      await onConnected();
      onOpenChange(false);
      toast.success(`${result.email} connected and in rotation.`);
    }, "The mailbox couldn't be connected.");
  };

  const sharedFields = <>
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Sender name"><Input name="fromName" maxLength={80} placeholder="Priya from Acme" /></FormField>
      <FormField label="Daily limit" hint="30–50 is safe for most inboxes."><Input name="dailyLimit" type="number" min={1} max={500} defaultValue={30} required /></FormField>
    </div>
    <label className="flex items-start gap-3 text-sm"><Checkbox checked={rampUp} onCheckedChange={(checked) => setRampUp(checked === true)} className="mt-0.5" /><span><span className="font-medium">Ramp up gradually</span><span className="block text-xs text-muted-foreground">Starts at 10 a day and adds 5 each day until the limit. Recommended for new inboxes.</span></span></label>
  </>;

  return <Dialog open={open} onOpenChange={(next) => busy ? null : onOpenChange(next)}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <form className="grid gap-4" onSubmit={submit}>
        <DialogHeader>
          <DialogTitle>Add a mailbox</DialogTitle>
          <DialogDescription>We sign in once to check sending and inbox access, then store the password encrypted. It&apos;s never shown again.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(value) => setTab(value as "google" | "smtp")}>
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="google">Google Workspace / Gmail</TabsTrigger><TabsTrigger value="smtp">Other (SMTP / IMAP)</TabsTrigger></TabsList>
          <TabsContent value="google" className="grid gap-4">
            <ol className="grid gap-1.5 rounded-md border border-border bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
              <li><span className="font-mono text-foreground">1</span> Turn on <a className="text-primary underline-offset-2 hover:underline" href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noreferrer">2-Step Verification</a> for the mailbox.</li>
              <li><span className="font-mono text-foreground">2</span> Create an <a className="text-primary underline-offset-2 hover:underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">App Password</a> named &ldquo;VranceFlex&rdquo;.</li>
              <li><span className="font-mono text-foreground">3</span> Paste the 16 letters below. Workspace admins may need to allow IMAP in Admin → Gmail → End user access.</li>
            </ol>
            {tab === "google" ? <>
              <FormField label="Mailbox address"><Input name="email" type="email" required autoComplete="off" placeholder="priya@getacme.com" /></FormField>
              <FormField label="App Password"><Input name="appPassword" required type="password" autoComplete="off" placeholder="abcd efgh ijkl mnop" className="font-mono" /></FormField>
              {sharedFields}
            </> : null}
          </TabsContent>
          <TabsContent value="smtp" className="grid gap-4">
            {tab === "smtp" ? <>
              <FormField label="Provider"><SelectField value={preset} onChange={(event) => setPreset(event.target.value as MailboxPresetKey)} wrapperClassName="sm:w-full" className="sm:w-full">
                {(Object.keys(mailboxPresets) as MailboxPresetKey[]).filter((key) => key !== "google").map((key) => <option key={key} value={key}>{mailboxPresets[key].label}</option>)}
              </SelectField></FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Mailbox address"><Input name="email" type="email" required autoComplete="off" placeholder="priya@getacme.com" /></FormField>
                <FormField label="Username" hint="Leave blank if it's the address."><Input name="username" autoComplete="off" /></FormField>
              </div>
              <FormField label="Password or app password"><Input name="password" required type="password" autoComplete="off" /></FormField>
              <ServerFields key={`smtp-${preset}`} label="SMTP (sending)" prefix="smtp" host={hosts.smtp.host} port={hosts.smtp.port} secure={secure.smtp} onSecure={(value) => setSecure((current) => ({ ...current, smtp: value }))} />
              <ServerFields key={`imap-${preset}`} label="IMAP (replies)" prefix="imap" host={hosts.imap.host} port={hosts.imap.port} secure={secure.imap} onSecure={(value) => setSecure((current) => ({ ...current, imap: value }))} />
              {sharedFields}
            </> : null}
          </TabsContent>
        </Tabs>
        <p className="text-xs leading-5 text-muted-foreground">Microsoft 365 and Outlook need Microsoft sign-in, which is coming next. Microsoft no longer accepts passwords for SMTP.</p>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy !== null}>Cancel</Button><Button type="submit" disabled={busy !== null}>{busy ? <><LoaderCircle className="animate-spin" />Checking the mailbox…</> : "Connect mailbox"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function ServerFields({ label, prefix, host, port, secure, onSecure }: { label: string; prefix: "smtp" | "imap"; host: string; port: number; secure: boolean; onSecure: (value: boolean) => void }) {
  return <fieldset className="grid gap-2">
    <legend className="mb-1.5 text-sm font-medium">{label}</legend>
    <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
      <Input name={`${prefix}Host`} defaultValue={host} required placeholder={`${prefix}.example.com`} aria-label={`${label} host`} />
      <Input name={`${prefix}Port`} type="number" defaultValue={port} required min={1} max={65535} aria-label={`${label} port`} className="font-mono" />
    </div>
    <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={secure} onCheckedChange={(checked) => onSecure(checked === true)} />Use SSL/TLS from the start (off = STARTTLS)</label>
  </fieldset>;
}

const checkLabels = { mx: "MX", spf: "SPF", dkim: "DKIM", dmarc: "DMARC" } as const;

function CheckIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  return status === "pass" ? <CheckCircle2 className="size-3.5 text-verified" /> : status === "warn" ? <AlertTriangle className="size-3.5 text-warning" /> : <XCircle className="size-3.5 text-destructive" />;
}

function DomainRow({ domain, isAdmin, onChange }: { domain: DomainSummary; isAdmin: boolean; onChange: () => Promise<void> }) {
  const usedForSending = domain.mailboxCount > 0;
  // Unused domains stay folded: their records don't affect any mailbox yet.
  const [open, setOpen] = useState(usedForSending && domain.status !== "verified");
  const { busy, run } = useBusy();
  const recheck = () => void run("check", async () => {
    await requestJson(`/api/settings/domains/${domain.id}/check`, { method: "POST" });
    await onChange();
    toast.success(`Checked ${domain.domain}.`);
  }, "The DNS check failed.");
  const remove = () => void run("remove", async () => {
    await requestJson(`/api/settings/domains/${domain.id}`, { method: "DELETE" });
    await onChange();
  }, "Couldn't remove the domain.");
  const tone = !usedForSending ? "neutral" : domain.status === "verified" ? "verified" : domain.status === "partial" ? "warning" : "danger";
  const statusLabel = !usedForSending ? "Not used for sending" : domain.status === "verified" ? "Authenticated" : domain.status === "partial" ? "Partly set up" : "Not set up";
  const forwardOnly = domain.receivedBy?.canSend === false;
  const byKind = new Map(domain.checks.map((check) => [check.kind, check]));

  return <li>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-muted-foreground"><Globe className="size-4" /></span>
        <span className="min-w-0"><span className="block truncate font-mono text-sm">{domain.domain}</span><span className="block text-xs text-muted-foreground">Mail handled by {domain.receivedBy?.label ?? (domain.provider === "google" ? "Google Workspace" : domain.provider === "microsoft" ? "Microsoft 365" : "unknown")} · {domain.mailboxCount} mailbox{domain.mailboxCount === 1 ? "" : "es"} · checked {ago(domain.lastCheckedAt)}</span></span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        {(["mx", "spf", "dkim", "dmarc"] as const).map((kind) => { const check = byKind.get(kind); return <span key={kind} className="inline-flex h-6 items-center gap-1 rounded-full border border-border px-2 text-xs font-medium">{check ? <CheckIcon status={check.status} /> : <span className="size-1.5 rounded-full bg-muted-foreground/40" />}{checkLabels[kind]}</span>; })}
        <Chip tone={tone}>{statusLabel}</Chip>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </span>
    </button>
    <AnimatePresence initial={false}>
      {open ? <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: ledgerEase }} className="overflow-hidden">
        <div className="grid gap-4 border-t border-rule bg-muted/20 px-5 py-4">
          {!usedForSending ? <p className="rounded-md border border-border bg-card px-3 py-2 text-sm leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">Nothing to fix for now.</span> No connected mailbox uses this domain, so these records don&apos;t affect your sending.{forwardOnly ? " It receives mail through a forwarding service, which can't send. To send from an address on this domain, set up mailboxes with Google Workspace or Zoho Mail first, then connect them here." : " Connect a mailbox on this domain and the checks below start to matter."}
          </p> : forwardOnly ? <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm leading-6 text-muted-foreground">This domain&apos;s mail goes to a forwarding service that can&apos;t send. Move it to a mailbox provider (Google Workspace, Zoho Mail) and use the records it gives you.</p> : null}
          {domain.checks.length ? <ul className="grid gap-2">
            {domain.checks.map((check) => <li key={check.kind} className="flex items-start gap-2 text-sm"><span className="mt-0.5"><CheckIcon status={check.status} /></span><span className="min-w-0"><span className="font-medium">{checkLabels[check.kind]}</span> <span className="text-muted-foreground">{check.summary}</span>{check.found.length ? <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">{check.found.join(" · ")}</code> : null}</span></li>)}
          </ul> : <p className="text-sm text-muted-foreground">Not checked yet.</p>}
          {domain.status !== "verified" && usedForSending ? <div className="grid gap-3">
            <p className="text-sm font-medium">Add these records at your DNS provider</p>
            {domain.records.filter((record) => byKind.get(record.kind)?.status !== "pass").map((record) => <RecordRow key={`${record.kind}-${record.host}`} record={record} />)}
          </div> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={recheck} disabled={busy !== null}>{busy === "check" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Check again</Button>
            {isAdmin ? <ConfirmAction destructive title={`Stop checking ${domain.domain}?`} description="This only removes the DNS check. Mailboxes on the domain keep sending." confirmLabel="Remove" onConfirm={remove} trigger={<Button size="sm" variant="ghost" disabled={busy !== null}><Trash2 />Remove</Button>} /> : null}
            <span className="text-xs text-muted-foreground">DNS changes can take up to an hour to show up.</span>
          </div>
        </div>
      </motion.div> : null}
    </AnimatePresence>
  </li>;
}

function CopyCell({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return <div className="grid min-w-0 gap-1.5 text-sm">
    <span className="font-medium">{label}</span>
    <div className="flex min-w-0 items-start gap-1 rounded-md border border-dashed border-border bg-muted/40 py-1.5 pl-3 pr-1">
      <code className={cn("min-w-0 flex-1 py-1 font-mono text-xs leading-5", wrap ? "whitespace-pre-wrap break-all" : "truncate")}>{value}</code>
      <Button type="button" variant="ghost" size="sm" className="h-7 min-h-7 shrink-0 px-2" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => { void navigator.clipboard?.writeText(value); toast.success("Copied."); }}><Copy /></Button>
    </div>
  </div>;
}

function RecordRow({ record }: { record: DomainSummary["records"][number] }) {
  return <div className="grid min-w-0 gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-[4.5rem_minmax(0,13rem)_minmax(0,1fr)] md:items-start">
    <div className="flex items-center gap-2 md:block"><Chip>{record.type}</Chip><span className="text-xs font-medium uppercase text-muted-foreground md:mt-1.5 md:block">{checkLabels[record.kind]}</span></div>
    <CopyCell label="Host" value={record.host} />
    <div className="grid min-w-0 gap-1"><CopyCell label="Value" value={record.value} wrap />{record.note ? <p className="text-xs leading-5 text-muted-foreground">{record.note}</p> : null}</div>
  </div>;
}

function AddDomainDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; onAdded: () => Promise<void> }) {
  const { busy, run } = useBusy();
  const [provider, setProvider] = useState<"google" | "microsoft" | "other">("google");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selector = String(form.get("dkimSelector") ?? "").trim();
    void run("add", async () => {
      await requestJson("/api/settings/domains", { method: "POST", body: JSON.stringify({ domain: form.get("domain"), provider, ...(selector ? { dkimSelector: selector } : {}) }) });
      await onAdded();
      onOpenChange(false);
      toast.success("Domain added and checked.");
    }, "Couldn't add the domain.");
  };
  const selectorHint: Record<typeof provider, ReactNode> = {
    google: "Google's default is \"google\".",
    microsoft: "Microsoft 365 uses selector1 and selector2.",
    other: "Your provider's DKIM setup page shows it.",
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={submit}>
        <DialogHeader><DialogTitle>Check a sending domain</DialogTitle><DialogDescription>We look up its MX, SPF, DKIM and DMARC records and show exactly what to add.</DialogDescription></DialogHeader>
        <FormField label="Domain"><Input name="domain" required placeholder="getacme.com" autoComplete="off" /></FormField>
        <FormField label="Mail provider"><SelectField value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)} wrapperClassName="sm:w-full" className="sm:w-full"><option value="google">Google Workspace</option><option value="microsoft">Microsoft 365</option><option value="other">Other</option></SelectField></FormField>
        <FormField label="DKIM selector" hint={selectorHint[provider]}><Input key={provider} name="dkimSelector" placeholder={provider === "google" ? "google" : provider === "microsoft" ? "selector1" : "default"} autoComplete="off" /></FormField>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy !== null}>{busy ? <LoaderCircle className="animate-spin" /> : null}Add and check</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
