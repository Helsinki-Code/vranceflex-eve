"use client";

import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { planCatalog, type BillingInterval } from "../lib/domain/billing";
import { AceternityButton, AceternityLink, GlowCard } from "./aceternity";

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
        <AceternityButton className={interval === "month" ? "active" : ""} onClick={() => setInterval("month")} type="button">Monthly</AceternityButton>
        <AceternityButton className={interval === "year" ? "active" : ""} onClick={() => setInterval("year")} type="button">Annual · 2 months free</AceternityButton>
      </div>
      <div className="pricing-card-grid public-pricing-grid">
        {(["launch", "growth", "agency", "enterprise"] as const).map((key) => {
          const plan = planCatalog[key];
          const annual = interval === "year" ? plan.annualPriceUsd : null;
          const displayPrice = annual ? Math.round(annual / 12) : plan.monthlyPriceUsd;
          const salesLed = key === "agency" || key === "enterprise";
          return (
            <GlowCard className={`pricing-plan-card ${key === "growth" ? "recommended" : ""}`} key={key}>
              {key === "growth" ? <span className="pricing-recommended">RECOMMENDED</span> : null}
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
              <AceternityLink
                className={key === "growth" ? "button-primary" : "button-secondary"}
                href={salesLed ? "mailto:sales@vranceflex.com?subject=VranceFlex%20demo" : "/sign-up?next=/settings/billing"}
              >
                {salesLed ? "Book a demo" : `Choose ${plan.name}`} <ArrowRight size={15} />
              </AceternityLink>
            </GlowCard>
          );
        })}
      </div>
    </>
  );
}
