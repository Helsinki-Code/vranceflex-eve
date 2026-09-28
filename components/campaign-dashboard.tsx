"use client";

import { ArrowUpRight, Globe, Lightbulb, Plus, RefreshCw, Repeat, Search } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { campaignStatusLabels, type Campaign, type CampaignStatus } from "../lib/domain/campaign";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Chip, EmptyState, fieldClass, LedgerStats } from "./product/kit";
import { AsyncState } from "./product-ui";

// The five stages a campaign moves through before anything is sent.
const stages = [
  { label: "Research", statuses: ["draft", "researching"] },
  { label: "Verify", statuses: ["enriching"] },
  { label: "Write", statuses: ["copy_generated"] },
  { label: "Approve", statuses: ["awaiting_approval"] },
  { label: "Send", statuses: ["scheduled", "sent", "delivered", "replied"] },
] as const satisfies ReadonlyArray<{ label: string; statuses: readonly CampaignStatus[] }>;

function stageIndex(status: CampaignStatus) {
  return stages.findIndex((stage) => (stage.statuses as readonly CampaignStatus[]).includes(status));
}

const statusTone = (status: CampaignStatus) => status === "stopped" ? "danger" : status === "awaiting_approval" ? "warning" : ["delivered", "replied", "sent"].includes(status) ? "verified" : status === "scheduled" ? "info" : "neutral";

function StageTrack({ status }: { status: CampaignStatus }) {
  const current = stageIndex(status);
  return <ol className="flex items-center gap-1" aria-label={`Stage: ${campaignStatusLabels[status]}`}>
    {stages.map((stage, index) => <li key={stage.label} title={stage.label} className={cn("h-1.5 w-7 rounded-full", status === "stopped" ? "bg-muted" : index < current ? "bg-primary" : index === current ? "bg-primary/45" : "bg-muted")} />)}
  </ol>;
}

function timeAgo(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [cadence, setCadence] = useState<"all" | "one-shot" | "recurring">("all");

  const load = useCallback(async () => {
    setState((current) => current === "ready" ? "ready" : "loading");
    try {
      const response = await fetch("/api/campaigns", { cache: "no-store" });
      const data = (await response.json()) as { campaigns?: Campaign[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Campaigns could not be loaded.");
      setCampaigns(data.campaigns ?? []);
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Campaigns could not be loaded.");
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => campaigns.filter((campaign) => {
    const matchesQuery = `${campaign.productName} ${campaign.audience} ${campaign.geography}`.toLowerCase().includes(query.toLowerCase());
    const matchesCadence = cadence === "all" || (cadence === "recurring" ? Boolean(campaign.recurrence) : !campaign.recurrence);
    return matchesQuery && matchesCadence;
  }), [cadence, campaigns, query]);

  if (state === "loading") return <AsyncState state="loading" title="Loading campaigns" />;
  if (state === "error") return <AsyncState state="error" title="Campaigns could not be loaded" description={error} action={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw />Try again</Button>} />;

  if (campaigns.length === 0) {
    return <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="rounded-[var(--radius)] border border-border bg-card p-8">
        <h2 className="text-xl font-semibold tracking-tight">Start with a website or an idea</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Paste your product's URL, or describe something you haven't launched yet. Research finds companies that match, verifies the people to contact and drafts the outreach. You approve every message before it goes out.</p>
        <Button asChild className="mt-6"><Link href="/campaigns/new"><Plus />Create your first campaign</Link></Button>
      </div>
      <ol className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-rule text-sm">
        {stages.map((stage, index) => <li key={stage.label} className="flex items-center gap-4 bg-card px-5 py-3.5"><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span><span className="font-medium">{stage.label}</span></li>)}
      </ol>
    </div>;
  }

  const active = campaigns.filter((campaign) => !["replied", "stopped", "delivered"].includes(campaign.status));
  const awaiting = campaigns.filter((campaign) => campaign.status === "awaiting_approval").length;

  return <div className="space-y-6">
    <LedgerStats items={[
      { label: "Active campaigns", value: active.length, note: `${campaigns.length} in total` },
      { label: "Awaiting your approval", value: awaiting, note: "Nothing sends until approved", tone: awaiting ? "warning" : "default" },
      { label: "Leads requested", value: campaigns.reduce((total, campaign) => total + campaign.leadCount, 0), note: "Across all campaigns" },
      { label: "Recurring", value: campaigns.filter((campaign) => campaign.recurrence).length, note: "Re-run on a schedule" },
    ]} />

    <section className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-rule p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Search campaigns</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(fieldClass, "pl-9")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Product, audience or region" type="search" />
        </label>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5 text-sm" role="radiogroup" aria-label="Cadence">
            {(["all", "one-shot", "recurring"] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={cadence === value} onClick={() => setCadence(value)} className={cn("relative h-7 rounded-[5px] px-2.5 capitalize transition-colors", cadence === value ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {cadence === value ? <motion.span layoutId="cadence-pill" className="absolute inset-0 rounded-[5px] bg-muted" transition={{ type: "spring", stiffness: 500, damping: 40 }} /> : null}
              <span className="relative">{value.replace("-", " ")}</span>
            </button>)}
          </div>
          <Button variant="ghost" size="icon" className="size-8 min-h-8 text-muted-foreground" aria-label="Refresh" onClick={() => void load()}><RefreshCw /></Button>
        </div>
      </div>

      {visible.length === 0 ? <div className="p-4"><EmptyState icon={<Search />} title="No campaigns match" description="Try a different search or cadence." /></div> :
        <motion.ul initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}>
          {visible.map((campaign) => {
            const Icon = campaign.source.kind === "website" ? Globe : Lightbulb;
            return <motion.li key={campaign.id} variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }} className="border-b border-rule last:border-0">
              <Link href={`/campaigns/${campaign.id}`} className="group grid items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_9rem_10rem_8rem_1.5rem] md:gap-6">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-muted-foreground" title={campaign.source.kind === "website" ? "From a website" : "From a product idea"}><Icon className="size-4" /></span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2"><span className="truncate text-sm font-medium text-foreground">{campaign.productName}</span>{campaign.recurrence ? <Repeat aria-label="Recurring" className="size-3.5 shrink-0 text-muted-foreground" /> : null}</span>
                    <span className="block truncate text-xs text-muted-foreground">{campaign.audience}</span>
                  </span>
                </span>
                <StageTrack status={campaign.status} />
                <span><Chip tone={statusTone(campaign.status)}>{campaignStatusLabels[campaign.status]}</Chip></span>
                <span className="text-xs text-muted-foreground"><span className="font-mono tabular-nums text-foreground">{campaign.leadCount}</span> leads · {timeAgo(campaign.updatedAt)}</span>
                <ArrowUpRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground md:block" />
              </Link>
            </motion.li>;
          })}
        </motion.ul>}
    </section>
    <p className="text-xs leading-5 text-muted-foreground">Statuses only move to sent, delivered or replied when the email or SMS provider confirms it. Drafted copy is never shown as sent.</p>
  </div>;
}
