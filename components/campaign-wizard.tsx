"use client";

import { ArrowLeft, ArrowRight, Check, Globe2, Lightbulb, LoaderCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { CampaignCreateInput } from "../lib/domain/campaign";
import {
  AceternityButton,
  AceternityLink,
  AceternitySelect,
  AceternityTextarea,
  GlowCard,
} from "./aceternity";
import { Input } from "./ui/input";

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

const stepNames = ["Product", "Audience", "Campaign"];

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
      setMessage(data.warning ?? "");
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign creation failed.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <GlowCard as="section" className="wizard-success">
        <span><Check size={24} /></span>
        <p className="section-label">Campaign accepted</p>
        <h2>{message ? "Campaign saved." : "Research has started."}</h2>
        <p>
          {message || (
            <>
              Your campaign is truthfully marked <strong>Researching</strong>. No outreach has been sent,
              scheduled or approved.
            </>
          )}
        </p>
        <div>
          <AceternityLink className="button-primary" href={`/campaigns/${campaignId}`}>
            View campaign <ArrowRight size={17} />
          </AceternityLink>
          <AceternityLink className="button-secondary" href="/campaigns/new">Create another</AceternityLink>
        </div>
      </GlowCard>
    );
  }

  return (
    <GlowCard as="section" className="campaign-wizard">
      <div className="wizard-progress" aria-label={`Step ${step + 1} of ${stepNames.length}`}>
        {stepNames.map((name, index) => (
          <div className={index <= step ? "active" : ""} key={name}>
            <span>{index < step ? <Check size={13} /> : index + 1}</span>
            <small>{name}</small>
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="wizard-panel">
          <div className="panel-heading">
            <span>01 · PRODUCT CONTEXT</span>
            <h2>What are you taking to market?</h2>
            <p>Start with a live website or describe an idea that has not launched yet.</p>
          </div>
          <div className="source-choice">
            <AceternityButton className={mode === "website" ? "active" : ""} onClick={() => switchMode("website")} type="button">
              <Globe2 size={19} /><span><strong>Website</strong><small>We analyse your existing pages.</small></span>
            </AceternityButton>
            <AceternityButton className={mode === "idea" ? "active" : ""} onClick={() => switchMode("idea")} type="button">
              <Lightbulb size={19} /><span><strong>Product idea</strong><small>No website or launch required.</small></span>
            </AceternityButton>
          </div>
          <div className="field-grid two">
            <label>Business or founder name<Input value={form.businessName} onChange={(event) => update("businessName", event.target.value)} placeholder="Acme Labs" /></label>
            <label>Product name<Input value={form.productName} onChange={(event) => update("productName", event.target.value)} placeholder="SignalOS" /></label>
          </div>
          {mode === "website" ? (
            <label>Website URL<Input value={form.websiteUrl} onChange={(event) => update("websiteUrl", event.target.value)} placeholder="https://example.com" type="url" /></label>
          ) : (
            <div className="field-grid idea-grid">
              <label>Idea name<Input value={form.ideaName} onChange={(event) => update("ideaName", event.target.value)} placeholder="AI onboarding copilot" /></label>
              <label>Current stage<AceternitySelect value={form.ideaStage} onChange={(event) => update("ideaStage", event.target.value as FormState["ideaStage"])}><option value="concept">Concept</option><option value="prototype">Prototype</option><option value="mvp">MVP</option><option value="launched">Launched</option></AceternitySelect></label>
              <label className="full">Describe the idea<AceternityTextarea value={form.ideaDescription} onChange={(event) => update("ideaDescription", event.target.value)} placeholder="What does it do, who needs it, and what painful problem does it solve?" rows={4} /></label>
            </div>
          )}
          <label>Product summary<AceternityTextarea value={form.productSummary} onChange={(event) => update("productSummary", event.target.value)} placeholder="Explain the outcome customers get and why your approach is different." rows={4} /></label>
        </div>
      )}

      {step === 1 && (
        <div className="wizard-panel">
          <div className="panel-heading">
            <span>02 · MARKET</span>
            <h2>Who should care first?</h2>
            <p>Give the agents a strong starting hypothesis. Research will validate and sharpen it.</p>
          </div>
          <label>Ideal audience<AceternityTextarea value={form.audience} onChange={(event) => update("audience", event.target.value)} placeholder="e.g. RevOps leaders at 50–500 person B2B SaaS companies struggling with stale CRM data" rows={5} /></label>
          <div className="field-grid two">
            <label>Primary geography<Input value={form.geography} onChange={(event) => update("geography", event.target.value)} placeholder="United Kingdom and DACH" /></label>
            <label>Campaign goal<AceternitySelect value={form.goal} onChange={(event) => update("goal", event.target.value as FormState["goal"])}><option value="book_meetings">Book qualified meetings</option><option value="validate_demand">Validate market demand</option><option value="build_waitlist">Build a waitlist</option><option value="sell_product">Generate sales opportunities</option></AceternitySelect></label>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-panel">
          <div className="panel-heading">
            <span>03 · CAMPAIGN CONTROLS</span>
            <h2>Set a deliberate first run.</h2>
            <p>Choose the research depth and channels. Every message still requires approval.</p>
          </div>
          <div className="choice-section">
            <label>Verified lead target</label>
            <div className="option-row">
              {[10, 25, 50, 100, 250, 500].map((count) => (
                <AceternityButton
                  className={form.leadCount === count ? "active" : ""}
                  disabled={count > creditBalance}
                  onClick={() => update("leadCount", count as FormState["leadCount"])}
                  title={count > creditBalance ? "Not enough prospect credits" : undefined}
                  type="button"
                  key={count}
                >
                  {count}
                </AceternityButton>
              ))}
            </div>
            <p className="option-row-note">
              We&apos;ll find up to {Math.min(1_000, form.leadCount * 3)} candidates instantly, then you choose who to verify.
            </p>
            <div className="wizard-credit-meter" role="status">
              <div>
                <strong>{creditBalance.toLocaleString()} credits available</strong>
                <span>{planName} plan · this campaign can consume up to {form.leadCount} after successful verification</span>
              </div>
              <a href="/settings/billing">Add credits</a>
            </div>
          </div>
          <div className="field-grid two">
            <label>
              Monthly outreach budget (USD)
              <Input min={100} onChange={(event) => update("monthlyBudgetUsd", Number(event.target.value))} type="number" value={form.monthlyBudgetUsd} />
              <small className="field-help">Planning only—this never changes your VranceFlex subscription charge.</small>
            </label>
            <div className="choice-section">
              <label>Channels to prepare</label>
              <div className="channel-row">
                {(["email", "sms"] as const).map((channel) => (
                  <AceternityButton className={form.channels.includes(channel) ? "active" : ""} onClick={() => toggleChannel(channel)} type="button" key={channel}><span>{form.channels.includes(channel) && <Check size={12} />}</span>{channel.toUpperCase()}</AceternityButton>
                ))}
              </div>
            </div>
          </div>
          <div className="approval-note"><Check size={18} /><div><strong>Human approval is mandatory.</strong><p>Generated copy remains “Copy Generated” or “Awaiting Approval.” It cannot become “Sent” without a confirmed provider event.</p></div></div>
        </div>
      )}

      {state === "error" && <div className="form-error" role="alert">{message}<AceternityButton onClick={() => setState("idle")} type="button">Try again</AceternityButton></div>}

      <div className="wizard-actions">
        {step > 0 ? <AceternityButton className="button-secondary" onClick={() => setStep((current) => current - 1)} type="button"><ArrowLeft size={16} /> Back</AceternityButton> : <AceternityLink className="button-secondary" href="/">Cancel</AceternityLink>}
        {step < 2 ? (
          <AceternityButton className="button-primary" disabled={!canContinue} onClick={() => setStep((current) => current + 1)} type="button">Continue <ArrowRight size={16} /></AceternityButton>
        ) : (
          <AceternityButton className="button-primary" disabled={!canContinue || state === "submitting"} onClick={() => void submit()} type="button">
            {state === "submitting" ? <><LoaderCircle className="spin" size={17} /> Creating campaign</> : <>Start research <ArrowRight size={16} /></>}
          </AceternityButton>
        )}
      </div>
    </GlowCard>
  );
}
