"use client";

import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { planCatalog, type BillingInterval } from "../lib/domain/billing";
import { ActionButton, ActionLink, SurfaceCard } from "./design-system";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const planSpecificBenefits = {
  launch: "One workspace for a focused outbound motion",
  growth: "Campaign analytics and priority support",
  agency: "5 client workspaces, reporting, API and webhooks",
  enterprise: "SSO, audit retention, SLA and assisted onboarding",
} as const;

export function PublicPricing() {
  const [interval, setInterval] = useState<BillingInterval>("month");
  return (
    <>
      <div className="pricing-toggle public-pricing-toggle" aria-label="Billing interval">
        <ActionButton aria-pressed={interval === "month"} className={interval === "month" ? "active" : ""} onClick={() => setInterval("month")} type="button">Monthly</ActionButton>
        <ActionButton aria-pressed={interval === "year"} className={interval === "year" ? "active" : ""} onClick={() => setInterval("year")} type="button">Annual · 2 months free</ActionButton>
      </div>
      <div className="pricing-mobile-cta"><ActionLink className="button-primary" href="/sign-up?next=/settings/billing">Choose a plan <ArrowRight /></ActionLink></div>
      <div className="pricing-card-grid public-pricing-grid">
        {(["launch", "growth", "agency", "enterprise"] as const).map((key) => {
          const plan = planCatalog[key];
          const annual = interval === "year" ? plan.annualPriceUsd : null;
          const displayPrice = annual ? Math.round(annual / 12) : plan.monthlyPriceUsd;
          const salesLed = key === "agency" || key === "enterprise";
          return (
            <SurfaceCard className={`pricing-plan-card ${key === "growth" ? "recommended" : ""}`} key={key}>
              {key === "growth" ? <span className="pricing-recommended">RECOMMENDED · BEST FOR CONSISTENT PROSPECTING</span> : null}
              <span className="section-label">{plan.name.toUpperCase()}</span>
              <h3>{key === "enterprise" ? "Custom" : `$${displayPrice}`}<small>{key === "enterprise" ? "" : "/mo"}</small></h3>
              <p>{plan.description}</p>
              <ul>
                <li><Check size={14} /> {plan.verifiedProspects.toLocaleString()} verified prospects monthly</li>
                <li><Check size={14} /> {plan.seats} seats</li>
                <li><Check size={14} /> {plan.workspaces} {plan.workspaces === 1 ? "workspace" : "workspaces"} · {plan.activeCampaigns} active campaigns</li>
                <li><Check size={14} /> {planSpecificBenefits[key]}</li>
                <li><Check size={14} /> Human-approved email and SMS sequences</li>
                <li><Check size={14} /> BYOK delivery providers</li>
              </ul>
              <ActionLink
                className={key === "growth" ? "button-primary" : "button-secondary"}
                href={salesLed ? "mailto:sales@vranceflex.com?subject=VranceFlex%20demo" : "/sign-up?next=/settings/billing"}
              >
                {salesLed ? "Book a demo" : `Choose ${plan.name}`} <ArrowRight size={15} />
              </ActionLink>
            </SurfaceCard>
          );
        })}
      </div>
      <section className="pricing-credit-definition" aria-labelledby="credit-definition-title"><div><span className="section-label">ONE CREDIT, ONE USABLE PROSPECT</span><h2 id="credit-definition-title">You pay only when verification succeeds.</h2><p>Failed contact verification consumes no customer credit. Included credits reset monthly; purchased top-ups remain valid for 12 months.</p></div><ul><li><strong>100</strong><span>$49</span></li><li><strong>500</strong><span>$199</span></li><li><strong>2,000</strong><span>$699</span></li></ul></section>
      <section className="pricing-comparison" aria-labelledby="comparison-title"><h2 id="comparison-title">Compare plans</h2><Table><TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Verified prospects</TableHead><TableHead>Seats</TableHead><TableHead>Workspaces</TableHead><TableHead>Support</TableHead></TableRow></TableHeader><TableBody>{(["launch", "growth", "agency", "enterprise"] as const).map((key) => { const plan = planCatalog[key]; return <TableRow key={key}><TableCell><strong>{plan.name}</strong></TableCell><TableCell className="font-mono">{plan.verifiedProspects.toLocaleString()}</TableCell><TableCell className="font-mono">{plan.seats}</TableCell><TableCell className="font-mono">{plan.workspaces}</TableCell><TableCell>{key === "enterprise" ? "SLA & onboarding" : key === "agency" ? "Sales-assisted" : key === "growth" ? "Priority" : "Standard"}</TableCell></TableRow>; })}</TableBody></Table><p>Resend, Twilio, mailboxes, domains, and carrier fees are excluded because delivery remains in your provider accounts.</p></section>
    </>
  );
}
