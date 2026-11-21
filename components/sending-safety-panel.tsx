"use client";

import { LoaderCircle, OctagonPause, Play, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { ConfirmAction } from "./product-ui";
import { FormField, Notice, Panel, SelectField } from "./product/kit";
import { fieldClass } from "./product/kit";
import { cn } from "@/lib/utils";
import { countryNames } from "../lib/domain/countries";
import type { SendingSafetySettings } from "../lib/server/sending-settings";

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string; issues?: Array<{ message: string }> };
  if (!response.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "The request could not be completed.");
  return data;
}

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

function parseDomains(text: string) {
  return text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function zoneOptions(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  const set = new Set(["UTC", ...zones, current]);
  return [...set].sort();
}

export function SendingSafetyPanel({ safety, isAdmin, onChange }: { safety: SendingSafetySettings; isAdmin: boolean; onChange: () => Promise<void> }) {
  const [form, setForm] = useState(() => ({
    days: safety.window.days,
    start: safety.window.start,
    end: safety.window.end,
    timezone: safety.timezone,
    useRecipientTimezone: safety.useRecipientTimezone,
    stopCompanyOnReply: safety.stopCompanyOnReply,
    allowRiskyEmail: safety.allowRiskyEmail,
    countries: safety.acknowledgedCountries,
    linkDomains: safety.linkDomains.join("\n"),
  }));
  const [busy, setBusy] = useState<"save" | "pause" | "resume" | null>(null);
  const zones = useMemo(() => zoneOptions(safety.timezone), [safety.timezone]);

  const dirty =
    form.days.join() !== safety.window.days.join() ||
    form.start !== safety.window.start ||
    form.end !== safety.window.end ||
    form.timezone !== safety.timezone ||
    form.useRecipientTimezone !== safety.useRecipientTimezone ||
    form.stopCompanyOnReply !== safety.stopCompanyOnReply ||
    form.allowRiskyEmail !== safety.allowRiskyEmail ||
    [...form.countries].sort().join() !== [...safety.acknowledgedCountries].sort().join() ||
    parseDomains(form.linkDomains).join() !== safety.linkDomains.join();

  const run = async (key: "save" | "pause" | "resume", action: () => Promise<void>, failure: string) => {
    setBusy(key);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(null);
    }
  };

  const toggleCountry = (code: string) =>
    setForm((current) => ({
      ...current,
      countries: current.countries.includes(code) ? current.countries.filter((item) => item !== code) : [...current.countries, code],
    }));

  const toggleDay = (day: number) =>
    setForm((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((item) => item !== day) : [...current.days, day].sort((a, b) => a - b),
    }));

  const save = () =>
    void run("save", async () => {
      await requestJson("/api/settings/sending/safety", {
        method: "PATCH",
        body: JSON.stringify({
          timezone: form.timezone,
          sendDays: form.days,
          windowStart: form.start,
          windowEnd: form.end,
          useRecipientTimezone: form.useRecipientTimezone,
          stopCompanyOnReply: form.stopCompanyOnReply,
          allowRiskyEmail: form.allowRiskyEmail,
          acknowledgedCountries: form.countries,
          linkDomains: parseDomains(form.linkDomains),
        }),
      });
      await onChange();
      toast.success("Sending safety settings saved.");
    }, "Couldn't save the settings.");

  const pause = () =>
    void run("pause", async () => {
      await requestJson("/api/settings/sending/pause", { method: "POST", body: JSON.stringify({}) });
      await onChange();
      toast.success("All sending is paused.");
    }, "Couldn't pause sending.");

  const resume = () =>
    void run("resume", async () => {
      await requestJson("/api/settings/sending/pause", { method: "DELETE" });
      await onChange();
      toast.success("Sending resumed. Queued emails go out inside your sending hours.");
    }, "Couldn't resume sending.");

  return <div className="space-y-6">
    {safety.sendingPaused ? <Notice
      tone="danger"
      title="Sending is paused for this workspace"
      action={isAdmin ? <Button size="sm" onClick={resume} disabled={busy !== null}>{busy === "resume" ? <LoaderCircle className="animate-spin" /> : <Play />}Resume sending</Button> : null}
    >
      {safety.pausedReason ?? "Paused by an admin."} Nothing will send, and queued emails stay queued, until sending is resumed.
    </Notice> : null}

    <Panel
      title="Sending safety"
      description="Rules that protect your domain and your reputation. They apply to every campaign in this workspace."
      actions={isAdmin && !safety.sendingPaused ? <ConfirmAction
        destructive
        title="Pause all sending?"
        description="Every queued email waits until you resume. Replies and bounces are still read, and nothing is lost."
        confirmLabel="Pause sending"
        onConfirm={pause}
        trigger={<Button size="sm" variant="outline" disabled={busy !== null}>{busy === "pause" ? <LoaderCircle className="animate-spin" /> : <OctagonPause />}Pause all sending</Button>}
      /> : null}
    >
      <div className="grid gap-6">
        <fieldset className="grid gap-3" disabled={!isAdmin}>
          <legend className="text-sm font-medium">Sending hours</legend>
          <p className="text-xs leading-5 text-muted-foreground">Emails only go out on these days and between these hours, in your recipient&apos;s local time when it&apos;s known. Anything due outside the window waits for the next opening.</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days to send on">
            {DAYS.map((day) => <button
              key={day.value}
              type="button"
              aria-pressed={form.days.includes(day.value)}
              onClick={() => toggleDay(day.value)}
              className={cn("h-9 min-w-12 rounded-md border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60", form.days.includes(day.value) ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:border-input")}
            >{day.label}</button>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="From"><Input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></FormField>
            <FormField label="Until"><Input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></FormField>
            <FormField label="Workspace time zone" hint="Used when a recipient's zone isn't known.">
              <SelectField wrapperClassName="w-full" className="w-full" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}>
                {zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </SelectField>
            </FormField>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={form.useRecipientTimezone} onCheckedChange={(checked) => setForm({ ...form, useRecipientTimezone: checked === true })} className="mt-0.5" />
            <span><span className="font-medium">Use each recipient&apos;s time zone when it&apos;s known</span><span className="block text-xs text-muted-foreground">Turn off to apply the hours above in the workspace time zone for everyone.</span></span>
          </label>
        </fieldset>

        <fieldset className="grid gap-3" disabled={!isAdmin}>
          <legend className="text-sm font-medium">Replies</legend>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={form.stopCompanyOnReply} onCheckedChange={(checked) => setForm({ ...form, stopCompanyOnReply: checked === true })} className="mt-0.5" />
            <span><span className="font-medium">When anyone at a company replies, pause everyone else there</span><span className="block text-xs text-muted-foreground">A colleague getting email #3 the morning after their boss replied looks automated. Paused outreach waits for a person to decide. Out-of-office notices don&apos;t count.</span></span>
          </label>
        </fieldset>

        <fieldset className="grid gap-3" disabled={!isAdmin}>
          <legend className="text-sm font-medium">Email addresses</legend>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={form.allowRiskyEmail} onCheckedChange={(checked) => setForm({ ...form, allowRiskyEmail: checked === true })} className="mt-0.5" />
            <span><span className="font-medium">Also email &ldquo;risky&rdquo; addresses</span><span className="block text-xs text-muted-foreground">Catch-all domains and role addresses like info@ are probably deliverable but can&apos;t be proven, and they bounce more often. Off by default, and only verified addresses are charged as credits unless this is on.</span></span>
          </label>
        </fieldset>

        <fieldset className="grid gap-2" disabled={!isAdmin}>
          <legend className="text-sm font-medium">Countries you&apos;ve checked</legend>
          <p className="text-xs leading-5 text-muted-foreground">Leads in the United States send as usual. For any other country, cold email often needs prior consent or a documented lawful basis, and the rules can depend on whether the recipient is a company or an individual, so those leads are held until you confirm here. Only confirm a country after you&apos;ve checked its rules (ask a lawyer if you&apos;re unsure). Who confirmed what, and when, is recorded.</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Countries confirmed">
            {Object.entries(countryNames).filter(([code]) => code !== "US").map(([code, name]) => <button
              key={code}
              type="button"
              aria-pressed={form.countries.includes(code)}
              onClick={() => toggleCountry(code)}
              className={cn("h-8 rounded-md border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60", form.countries.includes(code) ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:border-input")}
            >{name}</button>)}
          </div>
        </fieldset>

        <fieldset className="grid gap-2" disabled={!isAdmin}>
          <legend className="text-sm font-medium">Domains your emails may link to</legend>
          <p className="text-xs leading-5 text-muted-foreground">Copy that links anywhere else is held back at approval and again before sending, so a poisoned web page can&apos;t slip a link into an email. The website your campaign was built from is always allowed. Add booking or pricing pages here, one per line.</p>
          <textarea
            className={cn(fieldClass, "h-24 py-2 font-mono text-xs leading-5")}
            placeholder={"cal.com\nyourcompany.com"}
            value={form.linkDomains}
            onChange={(event) => setForm({ ...form, linkDomains: event.target.value })}
            aria-label="Allowed link domains"
          />
        </fieldset>

        {isAdmin ? <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!dirty || busy !== null}>{busy === "save" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}Save settings</Button>
          {dirty ? <span className="text-xs text-muted-foreground">Unsaved changes</span> : null}
        </div> : <p className="text-xs text-muted-foreground">Ask a workspace admin to change these.</p>}
      </div>
    </Panel>
  </div>;
}
