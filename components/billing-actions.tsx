"use client";

import { Check, CreditCard, ExternalLink, FileText, LoaderCircle, Plus, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { planCatalog, planRank, type BillingInterval, type PaidPlanKey, type SelfServePlanKey, type TopUpPackageKey } from "../lib/domain/billing";
import type { checkoutConfiguration } from "../lib/server/billing-prices";
import type { BillingOverview } from "../lib/server/billing-entitlements";
import type { InvoiceSummary } from "../lib/server/billing-store";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { Chip, EmptyState, Notice, Panel } from "./product/kit";
import { CountUp } from "./product/motion";

type CheckoutConfiguration = ReturnType<typeof checkoutConfiguration>;
type ReturnState = "checkout_success" | "checkout_cancelled" | "topup_success" | "topup_cancelled" | null;

async function postJson<T>(path: string, body?: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : "—");
const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

function Meter({ label, used, limit, suffix }: { label: string; used: number; limit: number; suffix?: string }) {
  const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = percent >= 90 ? "bg-destructive" : percent >= 75 ? "bg-warning" : "bg-primary";
  return <div className="space-y-2">
    <div className="flex items-baseline justify-between gap-3 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-mono tabular-nums text-foreground">{used.toLocaleString()}<span className="text-muted-foreground"> / {limit.toLocaleString()}{suffix}</span></span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className={cn("h-full rounded-full", tone)} initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.7 }} /></div>
  </div>;
}

function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (value: BillingInterval) => void }) {
  return <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-sm" role="radiogroup" aria-label="Billing interval">
    {(["month", "year"] as const).map((option) => <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)} className={cn("relative h-8 rounded-[5px] px-3 transition-colors", value === option ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
      {value === option ? <motion.span layoutId="interval-pill" className="absolute inset-0 rounded-[5px] bg-muted" transition={{ type: "spring", stiffness: 500, damping: 40 }} /> : null}
      <span className="relative">{option === "month" ? "Monthly" : "Annual"}{option === "year" ? <span className="ml-1.5 text-xs text-verified">2 months free</span> : null}</span>
    </button>)}
  </div>;
}

export function BillingActions({ billing, configuration, canManage, setupGaps, returnState }: { billing: BillingOverview; configuration: CheckoutConfiguration; canManage: boolean; setupGaps: string[]; returnState: ReturnState }) {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>(billing.billingInterval ?? "month");
  const [busy, setBusy] = useState("");
  const [pendingChange, setPendingChange] = useState<{ plan: SelfServePlanKey; interval: BillingInterval } | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [activating, setActivating] = useState(returnState === "checkout_success" && !billing.active);
  const polls = useRef(0);

  // Checkout returns before Stripe's webhook lands; refresh until the plan is live.
  useEffect(() => {
    if (!activating) return;
    if (billing.active) { setActivating(false); toast.success(`${billing.plan?.name ?? "Your"} plan is active.`); return; }
    if (polls.current >= 15) { setActivating(false); return; }
    const timer = window.setTimeout(() => { polls.current += 1; router.refresh(); }, 2_000);
    return () => window.clearTimeout(timer);
  }, [activating, billing.active, billing.plan?.name, router]);

  useEffect(() => {
    if (returnState === "topup_success") toast.success("Credits purchased. They appear as soon as Stripe confirms the payment.");
    if (returnState && returnState !== "checkout_success" && returnState !== "topup_success") toast("Checkout closed. Nothing was charged.");
    if (returnState) window.history.replaceState(null, "", "/settings/billing");
  }, [returnState]);

  useEffect(() => {
    if (!canManage || !billing.hasCustomer) { setInvoices([]); return; }
    let cancelled = false;
    fetch("/api/billing/invoices", { cache: "no-store" }).then((response) => response.ok ? response.json() : { invoices: [] }).then((data: { invoices?: InvoiceSummary[] }) => { if (!cancelled) setInvoices(data.invoices ?? []); }).catch(() => { if (!cancelled) setInvoices([]); });
    return () => { cancelled = true; };
  }, [billing.hasCustomer, canManage]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    try { await action(); } catch (error) { toast.error(error instanceof Error ? error.message : "Something went wrong."); setBusy(""); }
  }
  const redirect = (key: string, path: string, body?: unknown) => run(key, async () => { const data = await postJson<{ url: string }>(path, body); window.location.href = data.url; });
  const openPortal = (flow?: "payment_method_update" | "subscription_cancel") => redirect(`portal-${flow ?? "home"}`, "/api/billing/portal", flow ? { flow } : {});

  async function confirmChange() {
    if (!pendingChange) return;
    const change = pendingChange;
    setPendingChange(null);
    await run("change", async () => {
      const result = await postJson<{ changed: boolean; pending?: boolean }>("/api/billing/change-plan", change);
      toast.success(result.pending ? "Stripe needs the payment confirmed before the change applies. Check the invoice email." : `Switched to ${planCatalog[change.plan].name}.`);
      setBusy("");
      router.refresh();
    });
  }

  const current = billing.planKey;
  const currentPlan = billing.plan;
  const pastDue = billing.status === "past_due";
  const configuredPlans = Object.fromEntries(configuration.plans.map((plan) => [plan.key, plan])) as Record<SelfServePlanKey, CheckoutConfiguration["plans"][number]>;
  const planOrder: PaidPlanKey[] = ["launch", "growth", "agency", "enterprise"];

  return <div className="space-y-8">
    {setupGaps.length ? <Notice tone="warning" title="Stripe isn't fully connected">
      Checkout stays off until these are set in the hosting environment: <span className="font-mono text-xs">{setupGaps.join(", ")}</span>. Run <span className="font-mono text-xs">npm run stripe:setup</span> to create them.
    </Notice> : null}

    {activating ? <Notice tone="info" title="Payment received. Activating your plan…" action={<LoaderCircle className="size-4 animate-spin text-primary" />}>This usually takes a few seconds while Stripe confirms the subscription.</Notice> : null}

    {pastDue ? <Notice tone="danger" title="The last renewal payment failed" action={canManage ? <Button size="sm" onClick={() => void openPortal("payment_method_update")} disabled={Boolean(busy)}><CreditCard />Update card</Button> : null}>
      {billing.lastPaymentError ? `${billing.lastPaymentError} ` : ""}Research keeps running until {formatDate(billing.graceEndsAt)}. Stripe retries the card automatically.
    </Notice> : null}

    {billing.cancelAtPeriodEnd && billing.active ? <Notice tone="warning" title={`${currentPlan?.name ?? "Your plan"} ends on ${formatDate(billing.currentPeriodEnd)}`} action={canManage ? <Button size="sm" variant="outline" onClick={() => void run("resume", async () => { await postJson("/api/billing/resume"); toast.success("Subscription resumed."); setBusy(""); router.refresh(); })} disabled={Boolean(busy)}>{busy === "resume" ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}Keep plan</Button> : null}>
      Credits and campaigns stay available until then. Nothing renews after that date.
    </Notice> : null}

    <section className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-rule lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col justify-between gap-6 bg-card p-6">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Current plan</p>
          <p className="text-2xl font-semibold tracking-tight">{billing.active ? currentPlan?.name : "No active plan"}</p>
          <p className="text-sm text-muted-foreground">{billing.active
            ? `${billing.billingInterval === "year" ? "Annual" : "Monthly"} · ${billing.cancelAtPeriodEnd ? "ends" : "renews"} ${formatDate(billing.currentPeriodEnd)}`
            : "Pick a plan below to start research. You can change or cancel any time."}</p>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-4xl font-medium tracking-[-0.04em] tabular-nums"><CountUp value={billing.credits.available} /></p>
            <p className="mt-1 text-xs text-muted-foreground">prospect credits available · {billing.credits.included.toLocaleString()} monthly, {billing.credits.topUp.toLocaleString()} top-up</p>
          </div>
          {canManage && billing.hasCustomer ? <Button variant="outline" size="sm" onClick={() => void openPortal()} disabled={Boolean(busy)}>{busy === "portal-home" ? <LoaderCircle className="animate-spin" /> : <ExternalLink />}Manage in Stripe</Button> : null}
        </div>
      </div>
      <div className="grid content-center gap-5 bg-card p-6">
        {currentPlan && billing.active ? <>
          <Meter label="Monthly credits used" used={Math.max(0, currentPlan.verifiedProspects - billing.credits.included)} limit={currentPlan.verifiedProspects} />
          <Meter label="Research runs this month" used={billing.usage.discoveryRuns} limit={billing.usage.discoveryRunLimit} />
          <Meter label="Active campaigns" used={billing.usage.activeCampaigns} limit={currentPlan.activeCampaigns} />
          <Meter label="Seats" used={billing.usage.seats} limit={currentPlan.seats} />
          {billing.creditWindowEnd ? <p className="text-xs text-muted-foreground">Monthly credits reset {formatDate(billing.creditWindowEnd)}. Top-up credits last 12 months.</p> : null}
        </> : <p className="text-sm leading-6 text-muted-foreground">Usage limits appear here once a plan is active: monthly verified prospects, research runs, active campaigns and seats.</p>}
      </div>
    </section>

    <section className="space-y-4" aria-labelledby="plans-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 id="plans-heading" className="text-lg font-semibold tracking-tight">{billing.hasSubscription ? "Change plan" : "Choose a plan"}</h2><p className="text-sm text-muted-foreground">Upgrades apply now and are prorated. Downgrades credit the difference to your next invoice.</p></div>
        <IntervalToggle value={interval} onChange={setInterval} />
      </div>
      {!canManage ? <p className="text-sm text-muted-foreground">Only workspace admins and billing members can change the plan.</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {planOrder.map((key, index) => {
          const plan = planCatalog[key];
          const selfServe = key !== "enterprise";
          const config = selfServe ? configuredPlans[key as SelfServePlanKey] : null;
          const configured = interval === "year" ? config?.annualConfigured : config?.monthlyConfigured;
          const isCurrent = billing.active && current === key && billing.billingInterval === interval;
          const featured = key === "growth";
          const price = interval === "year" && plan.annualPriceUsd ? Math.round(plan.annualPriceUsd / 12) : plan.monthlyPriceUsd;
          const direction = current ? (planRank(key) > planRank(current) ? "Upgrade to" : planRank(key) < planRank(current) ? "Move to" : "Switch to") : "Choose";
          const actionKey = `plan-${key}`;
          let action;
          if (!selfServe) action = <Button asChild variant="outline" className="w-full"><Link href="/contact">Talk to sales</Link></Button>;
          else if (isCurrent) action = <Button variant="outline" className="w-full" disabled><Check />Current plan</Button>;
          else if (!configured) action = <Button variant="outline" className="w-full" disabled title="Price not set up in Stripe yet">Not available yet</Button>;
          else action = <Button className="w-full" variant={featured ? "default" : "outline"} disabled={!canManage || Boolean(busy) || pastDue && billing.hasSubscription}
            onClick={() => billing.hasSubscription ? setPendingChange({ plan: key as SelfServePlanKey, interval }) : void redirect(actionKey, "/api/billing/checkout", { plan: key, interval })}>
            {busy === actionKey ? <LoaderCircle className="animate-spin" /> : null}{direction} {plan.name}
          </Button>;
          return <motion.article key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
            className={cn("relative flex flex-col gap-5 rounded-[var(--radius)] border bg-card p-5", featured ? "border-primary/50 shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_10%,transparent)]" : "border-border", isCurrent && "border-verified/50")}>
            <div className="flex min-h-6 items-center justify-between gap-2"><h3 className="text-sm font-semibold">{plan.name}</h3>{isCurrent ? <Chip tone="verified">Current</Chip> : featured ? <Chip tone="info">Most teams</Chip> : null}</div>
            <div>
              {selfServe ? <p className="flex items-baseline gap-1"><span className="font-mono text-3xl font-medium tracking-[-0.04em] tabular-nums">${price.toLocaleString()}</span><span className="text-sm text-muted-foreground">/mo</span></p> : <p className="text-3xl font-medium tracking-tight">Custom</p>}
              <p className="mt-1 h-4 text-xs text-muted-foreground">{selfServe ? interval === "year" && plan.annualPriceUsd ? `$${plan.annualPriceUsd.toLocaleString()} billed yearly` : "billed monthly" : `from $${plan.monthlyPriceUsd.toLocaleString()}/mo`}</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{plan.description}</p>
            </div>
            <ul className="grid gap-2 border-t border-rule pt-4 text-sm">
              <li className="flex justify-between gap-2"><span className="text-muted-foreground">Verified prospects</span><span className="font-mono tabular-nums">{plan.verifiedProspects.toLocaleString()}/mo</span></li>
              <li className="flex justify-between gap-2"><span className="text-muted-foreground">Research runs</span><span className="font-mono tabular-nums">{plan.discoveryRuns}/mo</span></li>
              <li className="flex justify-between gap-2"><span className="text-muted-foreground">Active campaigns</span><span className="font-mono tabular-nums">{plan.activeCampaigns}</span></li>
              <li className="flex justify-between gap-2"><span className="text-muted-foreground">Seats · workspaces</span><span className="font-mono tabular-nums">{plan.seats} · {plan.workspaces}</span></li>
            </ul>
            <div className="mt-auto">{action}</div>
          </motion.article>;
        })}
      </div>
    </section>

    {billing.active ? <Panel title="Extra credits" description="One-time packs for a busy month. They're used after your monthly credits and last 12 months.">
      <div className="grid gap-3 sm:grid-cols-3">
        {configuration.topUps.map((item) => {
          const key = `topup-${item.key}`;
          return <button key={item.key} type="button" disabled={!canManage || !item.configured || Boolean(busy)} onClick={() => void redirect(key, "/api/billing/top-up", { packageKey: item.key as TopUpPackageKey })}
            className="group flex items-center justify-between gap-3 rounded-md border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/4 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-transparent">
            <span><span className="block font-mono text-lg tabular-nums">{item.credits.toLocaleString()}</span><span className="text-xs text-muted-foreground">credits · ${(item.priceUsd / item.credits).toFixed(2)} each</span></span>
            <span className="flex items-center gap-2 text-sm font-medium">{item.configured ? `$${item.priceUsd}` : "Not set up"}{busy === key ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4 text-muted-foreground group-hover:text-primary" />}</span>
          </button>;
        })}
      </div>
    </Panel> : null}

    {canManage ? <Panel title="Invoices" description="Receipts for subscriptions and credit packs." bodyClassName="p-0" actions={billing.hasSubscription && !billing.cancelAtPeriodEnd ? <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void openPortal("subscription_cancel")} disabled={Boolean(busy)}>Cancel plan</Button> : null}>
      {invoices === null ? <div className="space-y-2 p-5">{[0, 1, 2].map((row) => <div key={row} className="h-4 animate-pulse rounded bg-muted" />)}</div>
        : invoices.length === 0 ? <div className="p-5"><EmptyState icon={<FileText />} title="No invoices yet" description="Invoices show up here after the first payment." /></div>
          : <ul>{invoices.map((invoice) => <li key={invoice.id} className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3 text-sm last:border-0">
            <span className="min-w-0"><span className="block truncate text-foreground">{invoice.description ?? invoice.number ?? "Invoice"}</span><span className="font-mono text-xs text-muted-foreground">{formatDate(invoice.created)}{invoice.number ? ` · ${invoice.number}` : ""}</span></span>
            <span className="flex shrink-0 items-center gap-3"><Chip tone={invoice.status === "paid" ? "verified" : invoice.status === "open" ? "warning" : "neutral"}>{invoice.status}</Chip><span className="font-mono tabular-nums">{money(invoice.status === "paid" ? invoice.amountPaid : invoice.amountDue, invoice.currency)}</span>{invoice.hostedInvoiceUrl ? <a className="text-muted-foreground hover:text-foreground" href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" aria-label="Open invoice"><ExternalLink className="size-4" /></a> : null}</span>
          </li>)}</ul>}
    </Panel> : null}

    <p className="border-t border-rule pt-5 text-xs leading-5 text-muted-foreground">Resend, Twilio, domains, mailboxes and carrier fees are billed to your own provider accounts. Prices exclude tax where it applies.</p>

    <AlertDialog open={Boolean(pendingChange)} onOpenChange={(open) => { if (!open) setPendingChange(null); }}>
      <AlertDialogContent>
        {pendingChange ? <>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to {planCatalog[pendingChange.plan].name} ({pendingChange.interval === "year" ? "annual" : "monthly"})?</AlertDialogTitle>
            <AlertDialogDescription>
              {current && planRank(pendingChange.plan) < planRank(current)
                ? "Your limits drop right away and the unused part of this period is credited to your next invoice. Credits you've already used stay used."
                : "The prorated difference is charged to your card now and the higher limits apply immediately."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep current plan</AlertDialogCancel><AlertDialogAction onClick={() => void confirmChange()}>Confirm change</AlertDialogAction></AlertDialogFooter>
        </> : null}
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
