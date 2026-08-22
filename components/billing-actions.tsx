"use client";

import { ArrowRight, Check, LoaderCircle, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import {
  planCatalog,
  topUpCatalog,
  type BillingInterval,
  type PaidPlanKey,
  type SelfServePlanKey,
  type TopUpPackageKey,
} from "../lib/domain/billing";
import type { checkoutConfiguration } from "../lib/server/billing-prices";
import { AceternityButton, AceternityLink, GlowCard } from "./aceternity";

type CheckoutConfiguration = ReturnType<typeof checkoutConfiguration>;

async function requestJson<T>(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

export function BillingActions({
  hasActiveSubscription,
  activePlan,
  configuration,
}: {
  hasActiveSubscription: boolean;
  activePlan: PaidPlanKey | null;
  configuration: CheckoutConfiguration;
}) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function redirectFrom(path: string, body?: unknown) {
    const actionKey = path + JSON.stringify(body ?? {});
    setBusy(actionKey);
    setError("");
    try {
      const data = await requestJson<{ url: string }>(path, body);
      window.location.href = data.url;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Checkout could not start.");
      setBusy("");
    }
  }

  const configuredByPlan = Object.fromEntries(
    configuration.plans.map((plan) => [plan.key, plan]),
  ) as Record<SelfServePlanKey, CheckoutConfiguration["plans"][number]>;

  return (
    <div className="premium-billing-actions">
      <div className="billing-action-head">
        <div className="pricing-toggle" aria-label="Billing interval">
          <AceternityButton className={interval === "month" ? "active" : ""} onClick={() => setInterval("month")} type="button">Monthly</AceternityButton>
          <AceternityButton className={interval === "year" ? "active" : ""} onClick={() => setInterval("year")} type="button">Annual · 2 months free</AceternityButton>
        </div>
        {hasActiveSubscription ? (
          <AceternityButton
            className="button-secondary compact"
            disabled={Boolean(busy)}
            onClick={() => void redirectFrom("/api/billing/portal")}
            type="button"
          >
            {busy.startsWith("/api/billing/portal") ? <LoaderCircle className="spin" size={15} /> : <Settings2 size={15} />}
            Manage subscription
          </AceternityButton>
        ) : null}
      </div>

      {error ? <div className="auth-form-error" role="alert">{error}</div> : null}

      <div className="pricing-card-grid">
        {(["launch", "growth", "agency", "enterprise"] as const).map((key) => {
          const plan = planCatalog[key];
          const annual = interval === "year" ? plan.annualPriceUsd : null;
          const displayPrice = annual ? Math.round(annual / 12) : plan.monthlyPriceUsd;
          const configured =
            key === "launch" || key === "growth"
              ? interval === "month"
                ? configuredByPlan[key].monthlyConfigured
                : configuredByPlan[key].annualConfigured
              : false;
          const checkoutBody = { plan: key, interval };
          const checkoutPath = hasActiveSubscription
            ? "/api/billing/portal"
            : "/api/billing/checkout";
          const actionKey = checkoutPath + JSON.stringify(
            hasActiveSubscription ? {} : checkoutBody,
          );
          return (
            <GlowCard className={`pricing-plan-card ${key === "growth" ? "recommended" : ""}`} key={key}>
              {key === "growth" ? <span className="pricing-recommended">RECOMMENDED</span> : null}
              <span className="section-label">{plan.name.toUpperCase()}</span>
              <h3>{key === "enterprise" ? "Custom" : `$${displayPrice}`}<small>{key === "enterprise" ? "" : "/mo"}</small></h3>
              <p>{plan.description}</p>
              <ul>
                <li><Check size={14} /> {plan.verifiedProspects.toLocaleString()} verified prospects monthly</li>
                <li><Check size={14} /> {plan.seats} seats · {plan.workspaces} {plan.workspaces === 1 ? "workspace" : "workspaces"}</li>
                <li><Check size={14} /> {plan.activeCampaigns} active campaigns</li>
                <li><Check size={14} /> {plan.discoveryRuns} research runs per credit month</li>
                <li><Check size={14} /> BYOK Resend and Twilio delivery</li>
              </ul>
              {activePlan === key ? (
                <AceternityButton className="pricing-current" disabled type="button">Current plan</AceternityButton>
              ) : key === "launch" || key === "growth" ? (
                <AceternityButton
                  className={key === "growth" ? "button-primary" : "button-secondary"}
                  disabled={Boolean(busy) || !configured}
                  onClick={() =>
                    void redirectFrom(
                      checkoutPath,
                      hasActiveSubscription ? undefined : checkoutBody,
                    )
                  }
                  type="button"
                >
                  {busy === actionKey ? <LoaderCircle className="spin" size={15} /> : null}
                  {configured
                    ? hasActiveSubscription
                      ? "Change in billing portal"
                      : `Choose ${plan.name}`
                    : "Stripe price not configured"} <ArrowRight size={15} />
                </AceternityButton>
              ) : (
                <AceternityLink className="button-secondary" href="mailto:sales@vranceflex.com?subject=VranceFlex%20premium%20plan">
                  Book a demo <ArrowRight size={15} />
                </AceternityLink>
              )}
            </GlowCard>
          );
        })}
      </div>

      {hasActiveSubscription ? (
        <section className="credit-topups">
          <div>
            <span className="section-label">CREDIT TOP-UPS</span>
            <h3>Keep a strong month moving.</h3>
            <p>Purchased credits are used after included credits and remain valid for 12 months.</p>
          </div>
          <div className="topup-grid">
            {configuration.topUps.map((configuredTopUp) => {
              const item = topUpCatalog[configuredTopUp.key];
              const actionKey = "/api/billing/top-up" + JSON.stringify({ packageKey: item.key });
              return (
                <AceternityButton
                  className="topup-button"
                  disabled={Boolean(busy) || !configuredTopUp.configured}
                  key={item.key}
                  onClick={() => void redirectFrom("/api/billing/top-up", { packageKey: item.key as TopUpPackageKey })}
                  type="button"
                >
                  {busy === actionKey ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}
                  <strong>{item.credits.toLocaleString()} credits</strong>
                  <span>{configuredTopUp.configured ? `$${item.priceUsd}` : "Not configured"}</span>
                </AceternityButton>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
