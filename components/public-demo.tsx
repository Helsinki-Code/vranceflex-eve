"use client";

import { useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CircleDashed,
  FileSearch,
  Mail,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const stages = [
  { id: "discover", label: "Discover", icon: Search, summary: "75 candidates found" },
  { id: "verify", label: "Verify", icon: Users, summary: "21 usable contacts" },
  { id: "prepare", label: "Prepare", icon: Sparkles, summary: "3-step sequence" },
  { id: "approve", label: "Approve", icon: ShieldCheck, summary: "Human decision" },
  { id: "schedule", label: "Schedule", icon: CalendarClock, summary: "Weekly cadence" },
] as const;

type StageId = (typeof stages)[number]["id"];

const sampleLeads = [
  { name: "Maya Chen", role: "VP Revenue Operations", company: "Northstar Cloud", state: "Verified" },
  { name: "Jon Bell", role: "Founder", company: "Signal Layer", state: "Verified" },
  { name: "Amara Okafor", role: "Head of Growth", company: "Waypoint", state: "Needs review" },
];

function StagePreview({ stage }: { stage: StageId }) {
  if (stage === "discover") return (
    <div className="demo-preview-content">
      <div className="demo-preview-heading"><span><FileSearch /></span><div><small>Evidence-backed campaign brief</small><h3>Northstar expansion</h3><p>Revenue leaders at 50–500 person B2B SaaS companies across the UK and DACH.</p></div></div>
      <div className="demo-signal-grid"><article><span>Market signal</span><strong>Expansion teams hiring RevOps</strong><p>Prioritize companies adding sales systems and pipeline roles.</p></article><article><span>Buyer roles</span><strong>Founder · VP Revenue · Head of Growth</strong><p>Decision owners with direct outbound accountability.</p></article><article><span>Exclusions</span><strong>Agencies · recruiters · <small>&lt; 50 employees</small></strong><p>Filters remain attached to every downstream step.</p></article></div>
    </div>
  );

  if (stage === "verify") return (
    <div className="demo-preview-content">
      <div className="demo-preview-heading"><span><Users /></span><div><small>Contact verification</small><h3>25 selected · 21 verified</h3><p>A prospect credit is consumed only after the campaign-required contact data succeeds.</p></div></div>
      <ul className="demo-lead-list">{sampleLeads.map((lead) => <li key={lead.name}><span className={lead.state === "Verified" ? "is-verified" : "is-pending"}>{lead.state === "Verified" ? <Check /> : <CircleDashed />}</span><div><strong>{lead.name}</strong><small>{lead.role} · {lead.company}</small></div><em>{lead.state}</em></li>)}</ul>
    </div>
  );

  if (stage === "prepare") return (
    <div className="demo-preview-content">
      <div className="demo-preview-heading"><span><Sparkles /></span><div><small>Eve personalization</small><h3>Sequence prepared for Maya</h3><p>Source context and verified channels stay visible beside every generated step.</p></div></div>
      <div className="demo-sequence-preview"><div><span>EMAIL · DAY 1</span><strong>A practical RevOps question for Northstar</strong><p>Hi Maya—Northstar’s expansion into DACH usually puts pipeline consistency and regional handoffs under the same spotlight…</p></div><div><span>EMAIL · DAY 4</span><strong>Follow-up with the relevant signal</strong><p>A short, contextual continuation—not a generic rewrite of the first message.</p></div><div><span>SMS · DAY 8</span><strong>Prepared only because a phone was verified</strong><p>Every channel remains editable before approval.</p></div></div>
    </div>
  );

  if (stage === "approve") return (
    <div className="demo-preview-content">
      <div className="demo-preview-heading"><span><ShieldCheck /></span><div><small>Human decision boundary</small><h3>Review before anything leaves VranceFlex</h3><p>Copy, evidence, channels, recipients, and cadence are reviewed together.</p></div></div>
      <div className="demo-approval-panel"><div><span>READY FOR REVIEW</span><strong>21 prospects · 42 emails · 8 eligible SMS steps</strong><p>No message has been sent. Approval records the reviewer and freezes the reviewed version.</p></div><div className="demo-approval-actions"><button type="button" disabled>Request changes</button><button type="button" disabled>Approve sequence</button></div></div>
      <p className="demo-simulation-note">Controls are intentionally disabled in this sample—use “Next stage” to continue the walkthrough.</p>
    </div>
  );

  return (
    <div className="demo-preview-content">
      <div className="demo-preview-heading"><span><CalendarClock /></span><div><small>Recurring delivery schedule</small><h3>Weekly, Tuesday at 10:00 Europe/London</h3><p>Eve dispatches due work; the delivery worker rechecks suppression, provider configuration, and organization caps.</p></div></div>
      <div className="demo-schedule-card"><div><span>Cadence</span><strong>Every 7 days</strong></div><div><span>Next run</span><strong>Tue · 10:00 BST</strong></div><div><span>Daily cap</span><strong>40 messages</strong></div><div><span>State</span><strong className="is-active">Active</strong></div></div>
      <div className="demo-safety-row"><span><ShieldCheck /> Suppression checked per send</span><span><Mail /> Resend and Twilio stay customer-owned</span><span><Check /> Idempotency protects provider side effects</span></div>
    </div>
  );
}

export function PublicDemo() {
  const [activeStage, setActiveStage] = useState<StageId>("discover");
  const currentIndex = stages.findIndex(({ id }) => id === activeStage);
  const current = stages[currentIndex];

  return (
    <section className="demo-product" aria-labelledby="demo-product-title">
      <div className="demo-section-heading">
        <div><span className="section-label">Interactive sample workspace</span><h2 id="demo-product-title">Follow one campaign from signal to schedule.</h2></div>
        <p>Fixed sample data. No Parallel, Eve, Resend, or Twilio request is made from this walkthrough.</p>
      </div>

      <div className="demo-stage-tabs" role="tablist" aria-label="Campaign stages">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const active = stage.id === activeStage;
          const complete = index < currentIndex;
          return <button key={stage.id} type="button" role="tab" aria-selected={active} aria-controls="demo-stage-panel" className={active ? "is-active" : complete ? "is-complete" : ""} onClick={() => setActiveStage(stage.id)}><span>{complete ? <Check /> : <Icon />}</span><div><small>0{index + 1}</small><strong>{stage.label}</strong><em>{stage.summary}</em></div></button>;
        })}
      </div>

      <div className="demo-product-frame">
        <header><div><span className="demo-live-dot" /> Sample campaign</div><strong>Northstar expansion</strong><span>{currentIndex + 1} of {stages.length}</span></header>
        <div id="demo-stage-panel" role="tabpanel" aria-live="polite"><StagePreview stage={activeStage} /></div>
        <footer>
          <button className="demo-reset" type="button" onClick={() => setActiveStage("discover")}><RotateCcw /> Restart</button>
          <div><span>Current stage</span><strong>{current.label}</strong></div>
          <Button type="button" onClick={() => setActiveStage(stages[Math.min(currentIndex + 1, stages.length - 1)].id)} disabled={currentIndex === stages.length - 1}>Next stage <ArrowRight /></Button>
        </footer>
      </div>
    </section>
  );
}
