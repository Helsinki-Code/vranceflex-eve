"use client";

import { LoaderCircle, OctagonPause, Phone, Play, ShieldCheck, Unplug } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ConfirmAction } from "./product-ui";
import { Chip, FormField, LedgerStats, Notice, Panel } from "./product/kit";
import { minutesText, requestJson } from "./voice-shared";
import type { VoiceSettings } from "../lib/server/voice-settings";

type Balance = { availableSeconds: number; includedSeconds: number; packSeconds: number; addonActive: boolean; nextExpiry: string | null };

const DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 7]] as const;

type Offer = { addonConfigured: boolean; includedMinutes: number; packs: Array<{ key: string; minutes: number; label: string; configured: boolean }> };

export function VoiceSettingsPanel({ initial, balance, offer, isAdmin }: { initial: VoiceSettings; balance: Balance; offer: Offer; isAdmin: boolean }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [line, setLine] = useState({ sipAddress: "", username: "", password: "", callerNumber: "" });
  const [lineKind, setLineKind] = useState<"twilio" | "sip">("twilio");
  const [twilio, setTwilio] = useState({ accountSid: "", keySid: "", keySecret: "", callerNumber: "" });
  const [hours, setHours] = useState({ days: initial.window.days, start: initial.window.start, end: initial.window.end, maxConcurrentCalls: initial.maxConcurrentCalls, dailyCallLimit: initial.dailyCallLimit });

  const run = async (key: string, action: () => Promise<void>, failure: string) => {
    setBusy(key);
    try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : failure); } finally { setBusy(null); }
  };
  const apply = (next: VoiceSettings) => { setSettings(next); router.refresh(); };

  const hoursDirty = hours.days.join() !== settings.window.days.join() || hours.start !== settings.window.start || hours.end !== settings.window.end || hours.maxConcurrentCalls !== settings.maxConcurrentCalls || hours.dailyCallLimit !== settings.dailyCallLimit;
  const toggleDay = (day: number) => setHours((current) => ({ ...current, days: current.days.includes(day) ? current.days.filter((item) => item !== day) : [...current.days, day].sort((a, b) => a - b) }));

  return <div className="space-y-6">
    <LedgerStats items={[
      { label: "Minutes left", value: Math.floor(balance.availableSeconds / 60), note: balance.nextExpiry ? `next expiry ${new Date(balance.nextExpiry).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "none available", tone: balance.availableSeconds < 120 ? "danger" : "default" },
      { label: "Included this period", value: Math.floor(balance.includedSeconds / 60), note: "from the voice add-on" },
      { label: "From minute packs", value: Math.floor(balance.packSeconds / 60), note: "used after included minutes" },
      { label: "Voice add-on", value: balance.addonActive ? 1 : 0, note: balance.addonActive ? "active" : "not active", tone: balance.addonActive ? "verified" : "warning", format: "number" },
    ]} />

    {!balance.addonActive ? <Notice tone="warning" title="Voice calling is a paid add-on" action={isAdmin && offer.addonConfigured ? <Button size="sm" disabled={busy !== null} onClick={() => void run("addon", async () => { await requestJson("/api/billing/voice/addon", { method: "POST", body: "{}" }); toast.success("Voice calling added to your plan."); router.refresh(); }, "Couldn't add voice calling.")}>{busy === "addon" ? <LoaderCircle className="animate-spin" /> : <Phone />}Add voice calling</Button> : <Button asChild size="sm" variant="outline"><Link href="/settings/billing">Plans & usage</Link></Button>}>It includes {offer.includedMinutes} call minutes each month; when they run out, minute packs cover the rest. You can set everything up now, but calls only run with the add-on.</Notice> : null}

    {balance.addonActive && isAdmin ? <Panel title="Need more minutes?" description="Included minutes are used first. Packs last a year and are used after them." bodyClassName="flex flex-wrap gap-2">
      {offer.packs.filter((pack) => pack.configured).length ? offer.packs.filter((pack) => pack.configured).map((pack) => <Button key={pack.key} variant="outline" disabled={busy !== null} onClick={() => void run(pack.key, async () => { const { url } = await requestJson<{ url: string }>("/api/billing/voice/pack", { method: "POST", body: JSON.stringify({ packKey: pack.key }) }); window.location.href = url; }, "Couldn't start checkout.")}>{busy === pack.key ? <LoaderCircle className="animate-spin" /> : null}Buy {pack.label}</Button>) : <p className="text-sm text-muted-foreground">Minute packs aren't set up yet.</p>}
    </Panel> : null}

    {settings.voicePaused ? <Notice tone="danger" title="Calling is paused" action={isAdmin ? <Button size="sm" disabled={busy !== null} onClick={() => void run("resume", async () => { apply(await requestJson<VoiceSettings>("/api/voice/settings", { method: "POST", body: JSON.stringify({ action: "resume" }) })); toast.success("Calling resumed."); }, "Couldn't resume calling.")}>{busy === "resume" ? <LoaderCircle className="animate-spin" /> : <Play />}Resume</Button> : null}>{settings.pausedReason} No calls are placed until it's resumed. Calls already in progress finish.</Notice> : null}

    <Panel
      title="Your phone line"
      description="Calls go out over your own Twilio account, so they carry your number and your Twilio bill."
      actions={settings.telephonyConnected ? <Chip tone="verified">Connected</Chip> : <Chip tone="warning">Not connected</Chip>}
    >
      {settings.telephonyConnected ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm"><p className="font-medium">{settings.callerNumber}</p><p className="font-mono text-xs text-muted-foreground">{settings.lineType === "twilio" ? `Twilio account ${settings.twilioAccountSid}` : `SIP trunk ${settings.sipAddress}`}</p></div>
        {isAdmin ? <ConfirmAction destructive title="Disconnect your phone line?" description="No calls can be placed until a line is connected again. Calls in progress finish." confirmLabel="Disconnect" onConfirm={() => void run("disconnect", async () => { apply(await requestJson<VoiceSettings>("/api/voice/settings/telephony", { method: "DELETE" })); toast.success("Phone line disconnected."); }, "Couldn't disconnect.")} trigger={<Button size="sm" variant="outline" disabled={busy !== null}><Unplug />Disconnect</Button>} /> : null}
      </div> : isAdmin ? <div className="grid gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Phone line type">
          <Button type="button" size="sm" role="tab" aria-selected={lineKind === "twilio"} variant={lineKind === "twilio" ? "default" : "outline"} onClick={() => setLineKind("twilio")}>Your Twilio account</Button>
          <Button type="button" size="sm" role="tab" aria-selected={lineKind === "sip"} variant={lineKind === "sip" ? "default" : "outline"} onClick={() => setLineKind("sip")}>Another carrier (SIP)</Button>
        </div>
        {lineKind === "twilio" ? <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void run("connect", async () => { apply(await requestJson<VoiceSettings>("/api/voice/settings/twilio", { method: "POST", body: JSON.stringify(twilio) })); setTwilio({ accountSid: "", keySid: "", keySecret: "", callerNumber: "" }); toast.success("Phone line connected."); }, "Couldn't connect the phone line."); }}>
          <ol className="list-decimal space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
            <li>In Twilio, open Account → API keys &amp; tokens and create an API key of type <strong>Restricted</strong>.</li>
            <li>Give it only these permissions: Voice → Calls (create, read, update) and Phone Numbers → Incoming Phone Numbers (read).</li>
            <li>Copy the key SID (starts with SK) and its secret straight away, because Twilio shows the secret once. We never ask for your Auth Token.</li>
            <li>Twilio bills the call, its voicemail detection and your number to your account.</li>
          </ol>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Account SID" hint="Starts with AC."><Input required autoComplete="off" value={twilio.accountSid} onChange={(event) => setTwilio({ ...twilio, accountSid: event.target.value })} placeholder="AC…" /></FormField>
            <FormField label="Number to call from" hint="A number on this Twilio account, in international format."><Input required value={twilio.callerNumber} onChange={(event) => setTwilio({ ...twilio, callerNumber: event.target.value })} placeholder="+14155550100" /></FormField>
            <FormField label="API key SID" hint="Starts with SK."><Input required autoComplete="off" value={twilio.keySid} onChange={(event) => setTwilio({ ...twilio, keySid: event.target.value })} placeholder="SK…" /></FormField>
            <FormField label="API key secret" hint="Stored encrypted. Never shown again."><Input required type="password" autoComplete="new-password" value={twilio.keySecret} onChange={(event) => setTwilio({ ...twilio, keySecret: event.target.value })} /></FormField>
          </div>
          <Button type="submit" className="justify-self-start" disabled={busy !== null}>{busy === "connect" ? <LoaderCircle className="animate-spin" /> : <Phone />}Connect phone line</Button>
        </form> : <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void run("connect", async () => { apply(await requestJson<VoiceSettings>("/api/voice/settings/telephony", { method: "POST", body: JSON.stringify(line) })); setLine({ sipAddress: "", username: "", password: "", callerNumber: "" }); toast.success("Phone line connected."); }, "Couldn't connect the phone line."); }}>
          <ol className="list-decimal space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
            <li>With your carrier (Twilio Elastic SIP Trunking, Telnyx, Plivo and others), create an outbound SIP trunk and note its SIP host (like <span className="font-mono">yourname.pstn.twilio.com</span>).</li>
            <li>Give it a username and password, and add the number you want to call from.</li>
            <li>On a SIP trunk the agent listens for voicemail itself, so the Twilio account option above, where Twilio detects it first, is the better fit when you use Twilio.</li>
          </ol>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="SIP host"><Input required value={line.sipAddress} onChange={(event) => setLine({ ...line, sipAddress: event.target.value })} placeholder="sip.yourcarrier.com" /></FormField>
            <FormField label="Number to call from" hint="International format."><Input required value={line.callerNumber} onChange={(event) => setLine({ ...line, callerNumber: event.target.value })} placeholder="+14155550100" /></FormField>
            <FormField label="SIP username"><Input required autoComplete="off" value={line.username} onChange={(event) => setLine({ ...line, username: event.target.value })} /></FormField>
            <FormField label="SIP password" hint="Stored encrypted. Never shown again."><Input required type="password" autoComplete="new-password" value={line.password} onChange={(event) => setLine({ ...line, password: event.target.value })} /></FormField>
          </div>
          <Button type="submit" className="justify-self-start" disabled={busy !== null}>{busy === "connect" ? <LoaderCircle className="animate-spin" /> : <Phone />}Connect phone line</Button>
        </form>}
      </div> : <p className="text-sm text-muted-foreground">Ask a workspace admin to connect the phone line.</p>}
    </Panel>

    <Panel
      title="Consent"
      description="Calls use an AI voice, so everyone you call must have agreed to be called that way. Record where and when each person agreed when you add leads to a campaign."
      actions={settings.consentAttestedAt ? <Chip tone="verified">Confirmed {new Date(settings.consentAttestedAt).toLocaleDateString()}</Chip> : <Chip tone="warning">Not confirmed</Chip>}
    >
      <p className="text-sm leading-6 text-muted-foreground">{settings.consentAttestedAt ? "An admin has confirmed your workspace only calls people who have consented. Leads without a consent record are never called." : "An admin must confirm that your workspace only calls people who have given the consent the law requires for AI-voice calls. Leads without a recorded consent are never called, and anyone who asks to stop is removed at once."}</p>
      {!settings.consentAttestedAt && isAdmin ? <Button className="mt-3" disabled={busy !== null} onClick={() => void run("attest", async () => { apply(await requestJson<VoiceSettings>("/api/voice/settings", { method: "POST", body: JSON.stringify({ action: "attest" }) })); toast.success("Consent confirmed."); }, "Couldn't save the confirmation.")}>{busy === "attest" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}I confirm we hold consent for the people we call</Button> : null}
    </Panel>

    <Panel
      title="Calling hours and limits"
      description="Calls only start inside these hours in the person's own time zone, and never before 8:00 or after 21:00 there."
      actions={isAdmin && !settings.voicePaused ? <ConfirmAction destructive title="Pause all calling?" description="No new calls start until you resume. Calls in progress finish." confirmLabel="Pause calling" onConfirm={() => void run("pause", async () => { apply(await requestJson<VoiceSettings>("/api/voice/settings", { method: "POST", body: JSON.stringify({ action: "pause" }) })); toast.success("Calling paused."); }, "Couldn't pause calling.")} trigger={<Button size="sm" variant="outline" disabled={busy !== null}><OctagonPause />Pause all calling</Button>} /> : null}
    >
      <fieldset className="grid gap-4" disabled={!isAdmin}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days to call on">
          {DAYS.map(([label, day]) => <button key={day} type="button" aria-pressed={hours.days.includes(day)} onClick={() => toggleDay(day)} className={cn("h-9 min-w-12 rounded-md border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60", hours.days.includes(day) ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:border-input")}>{label}</button>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField label="From"><Input type="time" value={hours.start} onChange={(event) => setHours({ ...hours, start: event.target.value })} /></FormField>
          <FormField label="Until"><Input type="time" value={hours.end} onChange={(event) => setHours({ ...hours, end: event.target.value })} /></FormField>
          <FormField label="Calls at once"><Input type="number" min={1} max={10} value={hours.maxConcurrentCalls} onChange={(event) => setHours({ ...hours, maxConcurrentCalls: Number(event.target.value) })} /></FormField>
          <FormField label="Calls per day"><Input type="number" min={1} max={1000} value={hours.dailyCallLimit} onChange={(event) => setHours({ ...hours, dailyCallLimit: Number(event.target.value) })} /></FormField>
        </div>
        {isAdmin ? <Button className="justify-self-start" disabled={!hoursDirty || busy !== null} onClick={() => void run("hours", async () => { apply(await requestJson<VoiceSettings>("/api/voice/settings", { method: "PATCH", body: JSON.stringify({ callDays: hours.days, callStart: hours.start, callEnd: hours.end, maxConcurrentCalls: hours.maxConcurrentCalls, dailyCallLimit: hours.dailyCallLimit }) })); toast.success("Calling hours saved."); }, "Couldn't save the hours.")}>{busy === "hours" ? <LoaderCircle className="animate-spin" /> : null}Save hours</Button> : null}
      </fieldset>
    </Panel>
    <p className="text-xs leading-5 text-muted-foreground">Calls are charged from your voice minutes only while a person is on the line ({minutesText(balance.availableSeconds)} left). A call never runs past 15 minutes or the minutes you have.</p>
  </div>;
}
