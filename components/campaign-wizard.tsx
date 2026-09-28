"use client";

import { ArrowLeft, ArrowRight, Check, Globe2, Lightbulb, LoaderCircle, Mail, MessageSquare } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CampaignCreateInput } from "../lib/domain/campaign";
import { cn } from "@/lib/utils";
import { NativeTextarea } from "./design-system";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FormField, Notice, SelectField } from "./product/kit";

type Mode = "website" | "idea";
type FormState = {
  businessName: string;
  productName: string;
  productSummary: string;
  websiteUrl: string;
  ideaName: string;
  ideaDescription: string;
  ideaStage: "concept" | "prototype" | "mvp" | "launched";
  audience: string;
  geography: string;
  goal: CampaignCreateInput["goal"];
  leadCount: CampaignCreateInput["leadCount"];
  monthlyBudgetUsd: number;
  channels: Array<"email" | "sms">;
};

const initialForm: FormState = {
  businessName: "",
  productName: "",
  productSummary: "",
  websiteUrl: "",
  ideaName: "",
  ideaDescription: "",
  ideaStage: "concept",
  audience: "",
  geography: "",
  goal: "book_meetings",
  leadCount: 25,
  monthlyBudgetUsd: 500,
  channels: ["email"],
};

const stepNames = ["Product", "Audience", "Run settings", "Review"];

function Choice({ active, onClick, icon, title, description, disabled }: { active: boolean; onClick: () => void; icon?: ReactNode; title: string; description?: string; disabled?: boolean }) {
  return <button type="button" aria-pressed={active} onClick={onClick} disabled={disabled}
    className={cn("relative flex items-start gap-3 rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50", active ? "border-primary bg-primary/6" : "border-border hover:border-input")}>
    {icon ? <span className={cn("mt-0.5 [&_svg]:size-4", active ? "text-primary" : "text-muted-foreground")}>{icon}</span> : null}
    <span><span className="block text-sm font-medium">{title}</span>{description ? <span className="block text-xs leading-5 text-muted-foreground">{description}</span> : null}</span>
    {active ? <Check className="absolute right-3 top-3 size-3.5 text-primary" /> : null}
  </button>;
}

function StepHeading({ index, title, description }: { index: number; title: string; description: string }) {
  return <div className="space-y-1"><p className="font-mono text-xs text-muted-foreground">step {index} of 4</p><h2 className="text-xl font-semibold tracking-tight">{title}</h2><p className="text-sm leading-6 text-muted-foreground">{description}</p></div>;
}

export function CampaignWizard({
  initialMode = "website",
  initialValue = "",
  creditBalance,
  planName,
}: {
  initialMode?: Mode;
  initialValue?: string;
  creditBalance: number;
  planName: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    ...initialForm,
    websiteUrl: initialMode === "website" ? initialValue : "",
    ideaDescription: initialMode === "idea" ? initialValue : "",
  });
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string>("");
  const [draftRestored, setDraftRestored] = useState(false);

  // Restore an unfinished draft unless the page was opened with a URL or idea to start from.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (initialValue) return;
    try {
      const raw = window.localStorage.getItem("vranceflex:campaign-draft");
      if (!raw) return;
      const draft = JSON.parse(raw) as { mode?: Mode; form?: Partial<FormState> };
      if (draft.form && (draft.form.productName || draft.form.businessName || draft.form.websiteUrl || draft.form.ideaDescription)) {
        setForm((current) => ({ ...current, ...draft.form }));
        if (draft.mode === "website" || draft.mode === "idea") setMode(draft.mode);
        setDraftRestored(true);
      }
    } catch {}
  }, [initialValue]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { window.localStorage.setItem("vranceflex:campaign-draft", JSON.stringify({ mode, form })); } catch {}
      setDraftSavedAt(new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form, mode]);

  const canContinue = useMemo(() => {
    if (step === 0) {
      const sourceReady =
        mode === "website"
          ? /^https?:\/\/.+/i.test(form.websiteUrl)
          : form.ideaName.trim().length >= 2 && form.ideaDescription.trim().length >= 30;
      return (
        sourceReady &&
        form.businessName.trim().length >= 2 &&
        form.productName.trim().length >= 2 &&
        form.productSummary.trim().length >= 30
      );
    }
    if (step === 1) return form.audience.trim().length >= 10 && form.geography.trim().length >= 2;
    return (
      form.channels.length > 0 &&
      form.monthlyBudgetUsd >= 100 &&
      form.leadCount <= creditBalance
    );
  }, [creditBalance, form, mode, step]);

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    idempotencyKey.current = null;
    setForm((current) => ({ ...current, [key]: value }));
  }

  function switchMode(nextMode: Mode) {
    idempotencyKey.current = null;
    setMode(nextMode);
  }

  function toggleChannel(channel: "email" | "sms") {
    update(
      "channels",
      form.channels.includes(channel)
        ? form.channels.filter((item) => item !== channel)
        : [...form.channels, channel],
    );
  }

  async function submit() {
    setState("submitting");
    setMessage("");

    const payload: CampaignCreateInput = {
      businessName: form.businessName,
      productName: form.productName,
      productSummary: form.productSummary,
      source:
        mode === "website"
          ? { kind: "website", url: form.websiteUrl }
          : {
              kind: "product_idea",
              ideaName: form.ideaName,
              description: form.ideaDescription,
              stage: form.ideaStage,
            },
      audience: form.audience,
      geography: form.geography,
      goal: form.goal,
      leadCount: form.leadCount,
      monthlyBudgetUsd: form.monthlyBudgetUsd,
      channels: form.channels,
    };

    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        campaign?: { id: string };
        execution?: { status: string } | null;
        warning?: string;
        error?: string;
      };
      if (!response.ok || !data.campaign) throw new Error(data.error ?? "Campaign creation failed.");
      setCampaignId(data.campaign.id);
      try { window.localStorage.removeItem("vranceflex:campaign-draft"); } catch {}
      setMessage(data.warning ?? "");
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign creation failed.");
      setState("error");
    }
  }

  if (state === "success") {
    return <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-xl rounded-[var(--radius)] border border-border bg-card p-8">
      <span className="flex size-10 items-center justify-center rounded-full bg-verified/12 text-verified"><Check className="size-5" /></span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{message ? "Campaign saved" : "Research has started"}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message || "Candidates usually appear within a few minutes. Nothing has been sent or scheduled; you'll choose who to verify next."}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild><Link href={`/campaigns/${campaignId}`}>Open campaign<ArrowRight /></Link></Button>
        <Button asChild variant="outline"><Link href="/campaigns/new">Start another</Link></Button>
      </div>
    </motion.section>;
  }

  const reviewRows: Array<[string, ReactNode]> = [
    ["Product", <>{form.productName}<span className="block text-xs text-muted-foreground">{mode === "website" ? form.websiteUrl : `${form.ideaName} · ${form.ideaStage}`}</span></>],
    ["Audience", <>{form.audience}<span className="block text-xs text-muted-foreground">{form.geography}</span></>],
    ["Goal", { book_meetings: "Book qualified meetings", validate_demand: "Validate demand", build_waitlist: "Build a waitlist", sell_product: "Generate sales opportunities" }[form.goal]],
    ["Verified leads", <><span className="font-mono tabular-nums">up to {form.leadCount}</span><span className="block text-xs text-muted-foreground">{creditBalance.toLocaleString()} credits available on {planName}. Credits are only used when a lead verifies.</span></>],
    ["Channels", form.channels.map((channel) => channel === "sms" ? "SMS" : "Email").join(" and ")],
    ["Sending", "Only after you approve the sequence and pick a schedule"],
  ];

  return <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
    <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1" aria-label={`Step ${step + 1} of ${stepNames.length}`}>
      {stepNames.map((name, index) => <li key={name}>
        <button type="button" disabled={index > step} onClick={() => setStep(index)} className={cn("flex h-9 w-full items-center gap-3 whitespace-nowrap rounded-md px-3 text-sm transition-colors", index === step ? "bg-card text-foreground ring-1 ring-border" : index < step ? "text-foreground hover:bg-muted/50" : "text-muted-foreground")}>
          <span className={cn("flex size-5 items-center justify-center rounded-full font-mono text-[10px]", index < step ? "bg-primary text-primary-foreground" : index === step ? "border border-primary text-primary" : "border border-border")}>{index < step ? <Check className="size-3" /> : index + 1}</span>{name}
        </button>
      </li>)}
      <li className="mt-auto hidden px-3 pt-4 text-xs text-muted-foreground lg:block" role="status">{draftSavedAt ? `Draft saved ${draftSavedAt}` : "Saving draft…"}</li>
    </ol>

    <section className="min-w-0 rounded-[var(--radius)] border border-border bg-card">
      <div className="p-6 sm:p-8">
        {draftRestored && step === 0 ? <Notice className="mb-6" tone="info" title="Picked up your unfinished draft" action={<Button variant="ghost" size="sm" onClick={() => { setForm(initialForm); setDraftRestored(false); }}>Start over</Button>} /> : null}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }} className="grid gap-6">
            {step === 0 ? <>
              <StepHeading index={1} title="What are you taking to market?" description="Point research at a live website, or describe a product that hasn't launched yet." />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice active={mode === "website"} onClick={() => switchMode("website")} icon={<Globe2 />} title="A website" description="Research reads your existing pages." />
                <Choice active={mode === "idea"} onClick={() => switchMode("idea")} icon={<Lightbulb />} title="A product idea" description="No website or launch needed." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Company or founder name"><Input value={form.businessName} onChange={(event) => update("businessName", event.target.value)} placeholder="Acme Labs" /></FormField>
                <FormField label="Product name"><Input value={form.productName} onChange={(event) => update("productName", event.target.value)} placeholder="SignalOS" /></FormField>
              </div>
              {mode === "website"
                ? <FormField label="Website URL"><Input value={form.websiteUrl} onChange={(event) => update("websiteUrl", event.target.value)} placeholder="https://example.com" type="url" /></FormField>
                : <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
                  <FormField label="Idea name"><Input value={form.ideaName} onChange={(event) => update("ideaName", event.target.value)} placeholder="AI onboarding copilot" /></FormField>
                  <FormField label="Stage"><SelectField wrapperClassName="sm:w-full" className="h-10 sm:w-full" value={form.ideaStage} onChange={(event) => update("ideaStage", event.target.value as FormState["ideaStage"])}><option value="concept">Concept</option><option value="prototype">Prototype</option><option value="mvp">MVP</option><option value="launched">Launched</option></SelectField></FormField>
                  <FormField className="sm:col-span-2" label="Describe the idea" hint={`${form.ideaDescription.trim().length}/30 characters minimum`}><NativeTextarea value={form.ideaDescription} onChange={(event) => update("ideaDescription", event.target.value)} placeholder="What it does, who needs it, and the problem it removes." rows={4} /></FormField>
                </div>}
              <FormField label="What customers get" hint={`${form.productSummary.trim().length}/30 characters minimum. The outcome, and why your approach is different.`}><NativeTextarea value={form.productSummary} onChange={(event) => update("productSummary", event.target.value)} placeholder="e.g. Finance teams close the month in two days instead of eight because reconciliation runs continuously." rows={4} /></FormField>
            </> : null}

            {step === 1 ? <>
              <StepHeading index={2} title="Who should hear about it first?" description="A starting guess is enough. Research checks it against real companies and sharpens it into an ICP." />
              <FormField label="Ideal audience" hint="Role, company size and the problem they have work best."><NativeTextarea value={form.audience} onChange={(event) => update("audience", event.target.value)} placeholder="RevOps leaders at 50–500 person B2B SaaS companies struggling with stale CRM data" rows={5} /></FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Region"><Input value={form.geography} onChange={(event) => update("geography", event.target.value)} placeholder="United Kingdom and DACH" /></FormField>
                <FormField label="Goal"><SelectField wrapperClassName="sm:w-full" className="h-10 sm:w-full" value={form.goal} onChange={(event) => update("goal", event.target.value as FormState["goal"])}><option value="book_meetings">Book qualified meetings</option><option value="validate_demand">Validate demand</option><option value="build_waitlist">Build a waitlist</option><option value="sell_product">Generate sales opportunities</option></SelectField></FormField>
              </div>
            </> : null}

            {step === 2 ? <>
              <StepHeading index={3} title="How big should the first run be?" description="Start small, check the quality, then scale. Every message still waits for your approval." />
              <div className="grid gap-2">
                <p className="text-sm font-medium">Verified leads</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {[10, 25, 50, 100, 250, 500].map((count) => <button key={count} type="button" aria-pressed={form.leadCount === count} disabled={count > creditBalance} title={count > creditBalance ? "Not enough credits" : undefined} onClick={() => update("leadCount", count as FormState["leadCount"])}
                    className={cn("h-10 rounded-md border font-mono text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40", form.leadCount === count ? "border-primary bg-primary/8 text-primary" : "border-border hover:border-input")}>{count}</button>)}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">Research finds up to {Math.min(1_000, form.leadCount * 3)} candidates. You pick who to verify, and a credit is used only when verification succeeds. <span className="font-mono text-foreground">{creditBalance.toLocaleString()}</span> credits left on {planName}. <Link className="text-primary hover:underline" href="/settings/billing">Add credits</Link></p>
              </div>
              <div className="grid gap-2">
                <p className="text-sm font-medium">Channels to draft</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice active={form.channels.includes("email")} onClick={() => toggleChannel("email")} icon={<Mail />} title="Email" description="Sent through your Resend account." />
                  <Choice active={form.channels.includes("sms")} onClick={() => toggleChannel("sms")} icon={<MessageSquare />} title="SMS" description="Sent through your Twilio account." />
                </div>
              </div>
              <FormField label="Monthly outreach budget (USD)" hint="For planning only. It doesn't change your VranceFlex bill."><Input className="sm:max-w-48" min={100} onChange={(event) => update("monthlyBudgetUsd", Number(event.target.value))} type="number" value={form.monthlyBudgetUsd} /></FormField>
            </> : null}

            {step === 3 ? <>
              <StepHeading index={4} title="Check it before research starts" description="Starting research runs a discovery search now. Verification and sending each wait for you." />
              <dl className="divide-y divide-rule rounded-md border border-border">
                {reviewRows.map(([label, value]) => <div key={label} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}
              </dl>
            </> : null}
          </motion.div>
        </AnimatePresence>
        {state === "error" ? <Notice className="mt-6" tone="danger" title="The campaign couldn't be created">{message}</Notice> : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-rule px-6 py-4 sm:px-8">
        {step > 0 ? <Button variant="ghost" onClick={() => setStep((current) => current - 1)} type="button"><ArrowLeft />Back</Button> : <Button asChild variant="ghost"><Link href="/dashboard">Cancel</Link></Button>}
        {step < stepNames.length - 1
          ? <Button disabled={!canContinue} onClick={() => setStep((current) => current + 1)} type="button">Continue<ArrowRight /></Button>
          : <Button disabled={!canContinue || state === "submitting"} onClick={() => void submit()} type="button">{state === "submitting" ? <><LoaderCircle className="animate-spin" />Starting research</> : <>Start research<ArrowRight /></>}</Button>}
      </div>
    </section>
  </div>;
}
