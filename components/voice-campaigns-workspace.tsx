"use client";

import { Check, LoaderCircle, Pause, Phone, Play, Plus, Users, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { consentSourceLabels } from "../lib/domain/voice-consent-labels";
import { outcomeLabels, voiceLevelInfo, voiceLevels, type CallOutcome, type VoiceLevel } from "../lib/domain/voice";
import type { CallableLead } from "../lib/server/voice-calls";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { ConfirmAction } from "./product-ui";
import { Chip, EmptyState, FormField, Notice, Panel, SelectField, fieldClass } from "./product/kit";
import { outcomeTone, requestJson } from "./voice-shared";

type VoiceCampaign = {
  id: string; campaignId: string; name: string; level: VoiceLevel; status: "draft" | "approved" | "running" | "paused" | "completed" | "cancelled";
  pausedReason: string | null; maxAttempts: number; retryGapHours: number; approvedAt: string | null; playbook: Record<string, unknown>;
  targets: Record<string, number>; outcomes: Record<string, number>;
};
type OutreachCampaign = { id: string; businessName: string; productName: string; productSummary: string; offer?: string };

const statusTone = { draft: "neutral", approved: "info", running: "verified", paused: "warning", completed: "neutral", cancelled: "neutral" } as const;
const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

export function VoiceCampaignsWorkspace({ isAdmin }: { isAdmin: boolean }) {
  const [campaigns, setCampaigns] = useState<VoiceCampaign[] | null>(null);
  const [outreach, setOutreach] = useState<OutreachCampaign[]>([]);
  const [creating, setCreating] = useState(false);
  const [leadsFor, setLeadsFor] = useState<VoiceCampaign | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, base] = await Promise.all([requestJson<{ campaigns: VoiceCampaign[] }>("/api/voice/campaigns"), requestJson<{ campaigns: OutreachCampaign[] }>("/api/campaigns")]);
      setCampaigns(mine.campaigns);
      setOutreach(base.campaigns);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't load voice campaigns."); setCampaigns([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (campaign: VoiceCampaign, action: "approve" | "start" | "pause" | "cancel", success: string) => {
    setBusy(`${campaign.id}:${action}`);
    try { await requestJson(`/api/voice/campaigns/${campaign.id}`, { method: "POST", body: JSON.stringify({ action }) }); toast.success(success); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "That didn't work."); } finally { setBusy(null); }
  };

  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-3">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">A voice campaign calls the leads you choose, and only leads with recorded consent. You decide how far the agent goes, approve the script, and review every call afterwards.</p>
      {isAdmin ? <Button onClick={() => setCreating(true)} disabled={!outreach.length}><Plus />New voice campaign</Button> : null}
    </div>

    {!campaigns ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading…</div> : campaigns.length ? <div className="space-y-4">
      {campaigns.map((campaign) => <Panel key={campaign.id} title={<span className="flex flex-wrap items-center gap-2">{campaign.name}<Chip tone={statusTone[campaign.status]}>{campaign.status}</Chip><Chip tone="info">{voiceLevelInfo[campaign.level].label}</Chip></span>} description={voiceLevelInfo[campaign.level].summary}
        actions={isAdmin ? <>
          {["draft", "approved", "paused"].includes(campaign.status) ? <Button size="sm" variant="outline" onClick={() => setLeadsFor(campaign)}><Users />Leads</Button> : null}
          {campaign.status === "draft" ? <Button size="sm" disabled={busy !== null} onClick={() => void act(campaign, "approve", "Approved. Start it when you're ready.")}>{busy === `${campaign.id}:approve` ? <LoaderCircle className="animate-spin" /> : <Check />}Approve script and list</Button> : null}
          {["approved", "paused"].includes(campaign.status) ? <Button size="sm" disabled={busy !== null} onClick={() => void act(campaign, "start", "Calling started.")}><Play />{campaign.status === "paused" ? "Resume" : "Start calling"}</Button> : null}
          {campaign.status === "running" ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(campaign, "pause", "Paused.")}><Pause />Pause</Button> : null}
          {!["completed", "cancelled"].includes(campaign.status) ? <ConfirmAction destructive title="Cancel this campaign?" description="Leads still waiting won't be called. Calls in progress finish." confirmLabel="Cancel campaign" onConfirm={() => void act(campaign, "cancel", "Campaign cancelled.")} trigger={<Button size="sm" variant="ghost" className="text-muted-foreground"><X />Cancel</Button>} /> : null}
        </> : null}>
        {campaign.status === "paused" && campaign.pausedReason ? <Notice tone="warning" title="Paused">{campaign.pausedReason}</Notice> : null}
        <dl className="mt-1 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {[["Waiting", campaign.targets.queued ?? 0], ["On a call", campaign.targets.in_progress ?? 0], ["Finished", campaign.targets.done ?? 0], ["Skipped", campaign.targets.skipped ?? 0]].map(([label, value]) => <div key={label as string}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-mono text-lg tabular-nums">{value}</dd></div>)}
        </dl>
        {Object.keys(campaign.outcomes).length ? <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(campaign.outcomes).map(([outcome, count]) => <Chip key={outcome} tone={outcomeTone(outcome as CallOutcome)}>{(outcomeLabels as Record<string, string>)[outcome] ?? "In progress"} · {count}</Chip>)}</div> : null}
        <p className="mt-3 text-xs text-muted-foreground">Up to {campaign.maxAttempts} attempts per person, {campaign.retryGapHours}h apart.</p>
      </Panel>)}
    </div> : <EmptyState icon={<Phone />} title="No voice campaigns yet" description={outreach.length ? "Create one to have an AI caller work through leads who have agreed to be called." : "Create an outreach campaign and approve some leads first; voice campaigns call those leads."} />}

    {creating ? <CreateDialog outreach={outreach} onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await load(); }} /> : null}
    {leadsFor ? <LeadsDialog campaign={leadsFor} onClose={() => { setLeadsFor(null); void load(); }} /> : null}
  </div>;
}

// ---- New campaign ----------------------------------------------------------------------

function CreateDialog({ outreach, onClose, onCreated }: { outreach: OutreachCampaign[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({
    campaignId: outreach[0]?.id ?? "", name: "", level: "meetings" as VoiceLevel, agentName: "Alex",
    productFacts: outreach[0]?.productSummary ?? "", offer: outreach[0]?.offer ?? "", idealOutcome: "", questions: "", objections: "",
    pricingMode: "never" as "never" | "ranges" | "quote", pricingNotes: "", maxDiscountPercent: 0, handoffs: "", maxAttempts: 3, retryGapHours: 24,
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const pickCampaign = (id: string) => { const next = outreach.find((item) => item.id === id); setForm((current) => ({ ...current, campaignId: id, productFacts: next?.productSummary ?? current.productFacts, offer: next?.offer ?? "" })); };

  const submit = async () => {
    setSaving(true);
    try {
      const objections = lines(form.objections).map((line) => { const [objection, ...rest] = line.split("=>"); return { objection: (objection ?? "").trim(), response: rest.join("=>").trim() }; }).filter((item) => item.objection && item.response);
      await requestJson("/api/voice/campaigns", { method: "POST", body: JSON.stringify({
        campaignId: form.campaignId, name: form.name, level: form.level, maxAttempts: form.maxAttempts, retryGapHours: form.retryGapHours,
        playbook: {
          agentName: form.agentName, productFacts: form.productFacts, ...(form.offer.trim() ? { offer: form.offer.trim() } : {}), ...(form.idealOutcome.trim() ? { idealOutcome: form.idealOutcome.trim() } : {}),
          qualifyingQuestions: lines(form.questions), objections, handoffTriggers: lines(form.handoffs),
          pricing: { mode: form.level === "meetings" ? "never" : form.pricingMode, ...(form.pricingNotes.trim() ? { notes: form.pricingNotes.trim() } : {}) },
          maxDiscountPercent: form.level === "sell" ? form.maxDiscountPercent : 0,
        },
      }) });
      toast.success("Draft created. Add leads, then approve it.");
      await onCreated();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't create the campaign."); } finally { setSaving(false); }
  };

  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>New voice campaign</DialogTitle><DialogDescription>Choose how far the agent goes, and tell it what it may say.</DialogDescription></DialogHeader>
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Outreach campaign"><SelectField wrapperClassName="w-full" className="w-full" value={form.campaignId} onChange={(event) => pickCampaign(event.target.value)}>{outreach.map((item) => <option key={item.id} value={item.id}>{item.businessName} · {item.productName}</option>)}</SelectField></FormField>
          <FormField label="Name"><Input value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Q1 warm leads" /></FormField>
        </div>

        <fieldset className="grid gap-2"><legend className="text-sm font-medium">How far should the agent go?</legend>
          <div className="grid gap-2">{voiceLevels.map((level) => <button key={level} type="button" aria-pressed={form.level === level} onClick={() => set("level", level)} className={cn("rounded-md border p-3 text-left transition-colors", form.level === level ? "border-primary bg-primary/6" : "border-border hover:border-input")}><span className="block text-sm font-medium">{voiceLevelInfo[level].label}</span><span className="block text-xs leading-5 text-muted-foreground">{voiceLevelInfo[level].summary}</span></button>)}</div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2"><FormField label="Agent's first name" hint="Said at the start of every call, with the AI disclosure."><Input value={form.agentName} onChange={(event) => set("agentName", event.target.value)} /></FormField>
          <FormField label="A successful call" hint="In your words."><Input value={form.idealOutcome} onChange={(event) => set("idealOutcome", event.target.value)} placeholder={form.level === "meetings" ? "A 30-minute intro with our team" : form.level === "qualify" ? "A qualified lead with a meeting booked" : "A trial started or a proposal agreed"} /></FormField></div>

        <FormField label="What the agent may say about the product" hint="It will state nothing beyond this. Be specific about what it does, who it's for and what makes it different."><textarea className={cn(fieldClass, "h-28 py-2")} value={form.productFacts} onChange={(event) => set("productFacts", event.target.value)} /></FormField>
        <FormField label="Free offer to mention (optional)"><Input value={form.offer} onChange={(event) => set("offer", event.target.value)} /></FormField>

        {form.level !== "meetings" ? <div className="grid gap-4">
          <FormField label="Questions to ask (one per line)"><textarea className={cn(fieldClass, "h-20 py-2")} value={form.questions} onChange={(event) => set("questions", event.target.value)} placeholder={"How do you handle this today?\nWho else is involved in the decision?"} /></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Talking about price"><SelectField wrapperClassName="w-full" className="w-full" value={form.pricingMode} onChange={(event) => set("pricingMode", event.target.value as typeof form.pricingMode)}><option value="never">Never discuss price</option><option value="ranges">Broad ranges only</option>{form.level === "sell" ? <option value="quote">Quote prices</option> : null}</SelectField></FormField>
            {form.level === "sell" ? <FormField label="Largest discount it may offer (%)" hint="0 means it can't negotiate price."><Input type="number" min={0} max={50} value={form.maxDiscountPercent} onChange={(event) => set("maxDiscountPercent", Number(event.target.value))} /></FormField> : null}
          </div>
          {form.pricingMode !== "never" ? <FormField label="Pricing notes"><textarea className={cn(fieldClass, "h-16 py-2")} value={form.pricingNotes} onChange={(event) => set("pricingNotes", event.target.value)} placeholder="Plans run from $99 to $699 a month; annual billing saves two months." /></FormField> : null}
        </div> : null}

        <FormField label="Objections and your answers (one per line, like: objection => answer)"><textarea className={cn(fieldClass, "h-20 py-2")} value={form.objections} onChange={(event) => set("objections", event.target.value)} placeholder="We already use a spreadsheet => Most customers did; the difference is time saved each month." /></FormField>
        <FormField label="Always hand to a person when… (one per line)"><textarea className={cn(fieldClass, "h-16 py-2")} value={form.handoffs} onChange={(event) => set("handoffs", event.target.value)} placeholder="They mention a competitor's contract" /></FormField>

        <div className="grid gap-4 sm:grid-cols-2"><FormField label="Attempts per person"><Input type="number" min={1} max={5} value={form.maxAttempts} onChange={(event) => set("maxAttempts", Number(event.target.value))} /></FormField><FormField label="Hours between attempts"><Input type="number" min={1} max={72} value={form.retryGapHours} onChange={(event) => set("retryGapHours", Number(event.target.value))} /></FormField></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving || form.name.trim().length < 2 || form.productFacts.trim().length < 40} onClick={() => void submit()}>{saving ? <LoaderCircle className="animate-spin" /> : null}Create draft</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}

// ---- Leads and consent --------------------------------------------------------------------

function LeadsDialog({ campaign, onClose }: { campaign: VoiceCampaign; onClose: () => void }) {
  const [leads, setLeads] = useState<CallableLead[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [source, setSource] = useState<keyof typeof consentSourceLabels>("web_form");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setLeads((await requestJson<{ leads: CallableLead[] }>(`/api/voice/campaigns/${campaign.id}/leads`)).leads); } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't load leads."); setLeads([]); } }, [campaign.id]);
  useEffect(() => { void load(); }, [load]);

  const selectable = (leads ?? []).filter((lead) => !lead.inCampaign);
  const toggle = (id: string) => setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const needConsent = picked.filter((id) => leads?.find((lead) => lead.leadId === id)?.consent !== "granted");

  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : "That didn't work."); } finally { setBusy(false); } };
  const recordConsent = () => run(async () => {
    const result = await requestJson<{ recorded: number; failed: Array<{ reason: string }> }>("/api/voice/consents", { method: "POST", body: JSON.stringify({ leadIds: needConsent, source, evidence }) });
    toast.success(`Consent recorded for ${result.recorded}.${result.failed.length ? ` ${result.failed.length} couldn't be: ${result.failed[0]!.reason}` : ""}`);
    await load();
  });
  const addPicked = () => run(async () => {
    const result = await requestJson<{ added: number; skipped: Array<{ reason: string }> }>(`/api/voice/campaigns/${campaign.id}`, { method: "POST", body: JSON.stringify({ action: "add_targets", leadIds: picked }) });
    toast.success(`${result.added} added.${result.skipped.length ? ` ${result.skipped.length} skipped: ${result.skipped[0]!.reason}` : ""}`);
    setPicked([]);
    await load();
  });

  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>Leads for {campaign.name}</DialogTitle><DialogDescription>Only leads with recorded consent can be added. Editing the list after approval takes the campaign back to draft.</DialogDescription></DialogHeader>
      {!leads ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading…</div> : leads.length ? <>
        <ul className="max-h-72 divide-y divide-rule overflow-y-auto rounded-md border border-border">
          {leads.map((lead) => <li key={lead.leadId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <Checkbox checked={picked.includes(lead.leadId)} disabled={lead.inCampaign} onCheckedChange={() => toggle(lead.leadId)} aria-label={`Select ${lead.personName}`} />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{lead.personName}</span><span className="block truncate text-xs text-muted-foreground">{lead.jobTitle} at {lead.companyName} · {lead.phone}</span></span>
            {lead.inCampaign ? <Chip tone="info">In campaign</Chip> : lead.consent === "granted" ? <Chip tone="verified">Consent recorded</Chip> : lead.consent === "revoked" ? <Chip tone="danger">Withdrawn</Chip> : <Chip tone="warning">No consent</Chip>}
          </li>)}
        </ul>
        {needConsent.length ? <div className="grid gap-3 rounded-md border border-border p-4">
          <p className="text-sm font-medium">Record consent for {needConsent.length} selected lead{needConsent.length === 1 ? "" : "s"}</p>
          <p className="text-xs leading-5 text-muted-foreground">Only record consent you actually hold: that these people agreed to be called by an AI voice. This is saved with your name and the date.</p>
          <FormField label="How they agreed"><SelectField wrapperClassName="w-full" className="w-full" value={source} onChange={(event) => setSource(event.target.value as typeof source)}>{Object.entries(consentSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></FormField>
          <FormField label="Where and when" hint="For example: Agreed on our /contact form on 10 January 2030 to receive a call from an AI voice assistant."><textarea className={cn(fieldClass, "h-16 py-2")} value={evidence} onChange={(event) => setEvidence(event.target.value)} /></FormField>
          <Button className="justify-self-start" disabled={busy || evidence.trim().length < 15} onClick={() => void recordConsent()}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />}Record consent</Button>
        </div> : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Done</Button><Button disabled={busy || !picked.length || needConsent.length > 0} onClick={() => void addPicked()}>{busy ? <LoaderCircle className="animate-spin" /> : <Plus />}Add {picked.length || ""} to campaign</Button></div>
        {selectable.length === 0 ? <p className="text-xs text-muted-foreground">Every lead with a phone number is already in this campaign.</p> : null}
      </> : <EmptyState icon={<Users />} title="No leads with a phone number" description="Leads need a phone number to be called. Approve leads in the outreach campaign first." />}
    </DialogContent>
  </Dialog>;
}
