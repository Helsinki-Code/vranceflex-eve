"use client";

import { ArrowRight, Check, Coins, RefreshCcw, ShieldCheck, WalletCards } from "lucide-react";
import { useState } from "react";
import {
  planCatalog,
  topUpCatalog,
  type BillingInterval,
  type PaidPlanKey,
} from "../lib/domain/billing";
import { ActionButton, ActionLink } from "./design-system";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const planKeys: PaidPlanKey[] = ["launch", "growth", "agency", "enterprise"];

const planDetails: Record<PaidPlanKey, { eyebrow: string; benefit: string; support: string }> = {
  launch: { eyebrow: "Validate outbound", benefit: "A focused first prospecting motion", support: "Standard" },
  growth: { eyebrow: "Run consistently", benefit: "Analytics and priority support", support: "Priority" },
  agency: { eyebrow: "Manage clients", benefit: "Client reporting, API, and webhooks", support: "Dedicated" },
  enterprise: { eyebrow: "Govern at scale", benefit: "SSO, audit retention, SLA, and onboarding", support: "SLA & onboarding" },
};

const topUps = Object.values(topUpCatalog);

export function PublicPricing() {
  const [interval, setInterval] = useState<BillingInterval>("month");

  return (
    <div className="public-pricing">
      <div className="pricing-toolbar">
        <div>
          <span className="section-label">Choose your operating scale</span>
          <p>Start with included verified prospects. Upgrade or add non-expiring top-ups when demand grows.</p>
        </div>
        <div className="pricing-toggle public-pricing-toggle" aria-label="Billing interval" role="group">
          <ActionButton aria-pressed={interval === "month"} className={interval === "month" ? "active" : ""} onClick={() => setInterval("month")} type="button">Monthly</ActionButton>
          <ActionButton aria-pressed={interval === "year"} className={interval === "year" ? "active" : ""} onClick={() => setInterval("year")} type="button">Annual <span>Save 17%</span></ActionButton>
        </div>
      </div>

      <div className="pricing-mobile-cta">
        <ActionLink className="button-primary" href={`/sign-up?next=/settings/billing&plan=growth&interval=${interval}`}>Choose Growth <ArrowRight size={16} /></ActionLink>
      </div>

      <div className="pricing-card-grid public-pricing-grid">
        {planKeys.map((key) => {
          const plan = planCatalog[key];
          const annual = interval === "year" ? plan.annualPriceUsd : null;
          const displayPrice = annual ? Math.round(annual / 12) : plan.monthlyPriceUsd;
          const salesLed = !plan.selfServe;
          const featured = key === "growth";

          return (
            <article className={`pricing-plan-card ${featured ? "recommended" : ""}`} key={key}>
              <header>
                <div>
                  <span className="pricing-plan-eyebrow">{planDetails[key].eyebrow}</span>
                  <h2>{plan.name}</h2>
                </div>
                {featured ? <span className="pricing-recommended">Most popular</span> : null}
              </header>

              <div className="pricing-plan-price">
                {key === "enterprise" ? <><span>From</span><strong>$1,500</strong><small>/month</small></> : <><strong>${displayPrice}</strong><small>/month</small></>}
              </div>
              <p className="pricing-plan-billing">{key === "enterprise" ? "Annual agreement with custom limits" : interval === "year" ? `$${plan.annualPriceUsd?.toLocaleString()} billed annually` : "Billed monthly · cancel at renewal"}</p>
              <p className="pricing-plan-description">{plan.description}</p>

              <div className="pricing-plan-anchor">
                <strong>{plan.verifiedProspects.toLocaleString()}</strong>
                <span>verified prospects / month</span>
              </div>

              <ul>
                <li><Check size={16} aria-hidden="true" /> {plan.seats} seats</li>
                <li><Check size={16} aria-hidden="true" /> {plan.workspaces} {plan.workspaces === 1 ? "workspace" : "workspaces"} · {plan.activeCampaigns} active campaigns</li>
                <li><Check size={16} aria-hidden="true" /> {plan.discoveryRuns} included discovery runs</li>
                <li><Check size={16} aria-hidden="true" /> {planDetails[key].benefit}</li>
                <li><Check size={16} aria-hidden="true" /> Human approval and recurring schedules</li>
                <li><Check size={16} aria-hidden="true" /> BYOK Resend and Twilio delivery</li>
              </ul>

              <ActionLink
                className={featured ? "button-primary" : "button-secondary"}
                href={salesLed ? "mailto:sales@vranceflex.com?subject=VranceFlex%20plan%20consultation" : `/sign-up?next=/settings/billing&plan=${key}&interval=${interval}`}
              >
                {salesLed ? "Talk to sales" : `Choose ${plan.name}`} <ArrowRight size={16} />
              </ActionLink>
            </article>
          );
        })}
      </div>

      <section className="pricing-credit-story" aria-labelledby="credit-story-title">
        <div className="pricing-section-heading">
          <span className="section-label">Outcome-based credits</span>
          <h2 id="credit-story-title">A credit is charged only when verification succeeds.</h2>
          <p>Discovery is metered separately for fair use. Prospect credits represent usable contact outcomes—not rows searched or failed verification attempts.</p>
        </div>
        <div className="pricing-credit-steps">
          <article><span><Coins /></span><strong>Reserve</strong><p>A credit is reserved before verification so concurrent campaigns cannot overspend.</p></article>
          <article><span><ShieldCheck /></span><strong>Verify</strong><p>Parallel checks the contact fields required by the campaign.</p></article>
          <article><span><RefreshCcw /></span><strong>Consume or return</strong><p>Success consumes one credit. Failure releases it automatically.</p></article>
        </div>
      </section>

      <section className="pricing-topups" aria-labelledby="topups-title">
        <div>
          <span className="section-label">Flexible capacity</span>
          <h2 id="topups-title">Add credits without changing plans.</h2>
          <p>Monthly credits are used first. Purchased top-ups remain available for 12 months and follow the same successful-verification rule.</p>
        </div>
        <div className="pricing-topup-grid">
          {topUps.map((topUp) => (
            <article key={topUp.key}>
              <WalletCards aria-hidden="true" />
              <strong>{topUp.credits.toLocaleString()}</strong>
              <span>verified prospect credits</span>
              <b>${topUp.priceUsd}</b>
            </article>
          ))}
        </div>
      </section>

      <section className="pricing-comparison" aria-labelledby="comparison-title">
        <div className="pricing-section-heading">
          <span className="section-label">Plan comparison</span>
          <h2 id="comparison-title">Every plan keeps the same safety boundary.</h2>
          <p>Scale changes capacity, collaboration, and support—not the requirement that a person approves outreach.</p>
        </div>
        <div className="pricing-table-scroll" tabIndex={0} role="region" aria-label="Plan entitlement comparison">
          <Table>
            <TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Verified prospects</TableHead><TableHead>Discovery runs</TableHead><TableHead>Seats</TableHead><TableHead>Workspaces</TableHead><TableHead>Active campaigns</TableHead><TableHead>Support</TableHead></TableRow></TableHeader>
            <TableBody>{planKeys.map((key) => { const plan = planCatalog[key]; return <TableRow key={key}><TableCell><strong>{plan.name}</strong></TableCell><TableCell className="font-mono">{plan.verifiedProspects.toLocaleString()}</TableCell><TableCell className="font-mono">{plan.discoveryRuns}</TableCell><TableCell className="font-mono">{plan.seats}</TableCell><TableCell className="font-mono">{plan.workspaces}</TableCell><TableCell className="font-mono">{plan.activeCampaigns}</TableCell><TableCell>{planDetails[key].support}</TableCell></TableRow>; })}</TableBody>
          </Table>
        </div>
        <div className="pricing-provider-note"><ShieldCheck aria-hidden="true" /><p><strong>Provider costs remain transparent.</strong> Resend, Twilio, mailboxes, domains, and carrier fees are excluded because delivery remains in accounts you own.</p></div>
      </section>
    </div>
  );
}
