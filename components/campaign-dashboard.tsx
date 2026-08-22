"use client";

import { ArrowRight, Check, Plus, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { campaignStatusLabels, type Campaign } from "../lib/domain/campaign";
import { ActionButton, ActionLink, SurfaceCard } from "./design-system";
import { AsyncState, StatusBadge } from "./product-ui";
import { Input } from "./ui/input";

const progressStatuses = [
  "researching",
  "enriching",
  "copy_generated",
  "awaiting_approval",
  "scheduled",
  "sent",
  "delivered",
  "replied",
] as const;

export function CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [cadence, setCadence] = useState<"all" | "one-shot" | "recurring">("all");

  const load = useCallback(async () => {
    setState("loading");
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

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return <AsyncState state="loading" title="Loading campaigns" />;
  }

  if (state === "error") {
    return <AsyncState state="error" title="Campaigns are unavailable" description={error} action={<ActionButton className="button-secondary" onClick={() => void load()} type="button"><RefreshCw size={16} /> Retry</ActionButton>} />;
  }

  if (campaigns.length === 0) {
    return <AsyncState state="empty" title="No campaigns yet" description="Start with a website or an unlaunched product idea. VranceFlex will turn either into a research plan." action={<ActionLink className="button-primary" href="/campaigns/new"><Plus size={17} /> Create your first campaign</ActionLink>} />;
  }

  const visibleCampaigns = campaigns.filter((campaign) => {
    const matchesQuery = `${campaign.productName} ${campaign.audience} ${campaign.geography}`.toLowerCase().includes(query.toLowerCase());
    const matchesCadence = cadence === "all" || (cadence === "recurring" ? Boolean(campaign.recurrence) : !campaign.recurrence);
    return matchesQuery && matchesCadence;
  });

  return (
    <>
      <section className="metric-grid">
        <article><span>Active campaigns</span><strong>{campaigns.filter((campaign) => !["replied", "stopped"].includes(campaign.status)).length}</strong><small>Across this workspace</small></article>
        <article><span>Verified leads requested</span><strong>{campaigns.reduce((total, campaign) => total + campaign.leadCount, 0)}</strong><small>Not yet counted as delivered</small></article>
        <article><span>Awaiting approval</span><strong>{campaigns.filter((campaign) => campaign.status === "awaiting_approval").length}</strong><small>Nothing sends automatically</small></article>
      </section>
      <section className="campaign-list">
        <div className="list-heading"><div><span>CAMPAIGNS</span><h2>Live work</h2></div><ActionButton aria-label="Refresh campaigns" onClick={() => void load()} type="button"><RefreshCw size={16} /></ActionButton></div>
        <div className="campaign-list-controls"><label><span className="sr-only">Search campaigns</span><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns" /></label><div role="group" aria-label="Campaign cadence"><button className={cadence === "all" ? "active" : ""} onClick={() => setCadence("all")} type="button">All</button><button className={cadence === "one-shot" ? "active" : ""} onClick={() => setCadence("one-shot")} type="button">One-shot</button><button className={cadence === "recurring" ? "active" : ""} onClick={() => setCadence("recurring")} type="button">Recurring</button></div></div>
        {visibleCampaigns.map((campaign) => {
          const statusIndex = progressStatuses.indexOf(campaign.status as (typeof progressStatuses)[number]);
          return (
            <SurfaceCard as="article" className="campaign-row" key={campaign.id}>
              <div className="campaign-identity">
                <span>{campaign.source.kind === "website" ? "URL" : "IDEA"}</span>
                <div><h3>{campaign.productName}</h3><p>{campaign.audience}</p></div>
              </div>
              <div className="status-track" aria-label={`Campaign status: ${campaignStatusLabels[campaign.status]}`}>
                {progressStatuses.slice(0, 4).map((status, index) => <i className={index <= statusIndex ? "complete" : ""} key={status} />)}
              </div>
              <StatusBadge tone={campaign.status === "stopped" ? "danger" : campaign.status === "replied" || campaign.status === "delivered" ? "success" : campaign.status === "awaiting_approval" ? "warning" : "info"}>{campaignStatusLabels[campaign.status]}</StatusBadge>
              <div className="campaign-meta"><span>{campaign.leadCount} leads</span><span>{campaign.geography}</span></div>
              <Link href={`/campaigns/${campaign.id}`} aria-label={`Open ${campaign.productName}`}><ArrowRight size={17} /></Link>
            </SurfaceCard>
          );
        })}
        {!visibleCampaigns.length ? <AsyncState state="empty" title="No campaigns match" description="Change the search or cadence filter." /> : null}
      </section>
      <div className="truth-banner"><Check size={18} /><p><strong>Truthful by design.</strong> Generated messages never appear as sent. Sent, delivered and replied states require verified provider events.</p></div>
    </>
  );
}
