"use client";

import { ArrowUpRight, Building2, Check, ChevronRight, Download, ExternalLink, Linkedin, Mail, MapPin, Phone, RefreshCw, Rows3, Rows4, Search, ShieldOff, Target, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { leadStatusLabels, type ConfidenceBand, type Lead, type LeadStatus } from "../lib/domain/lead";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Chip, EmptyState, EvidenceMeter, fieldClass, Initials, LedgerStats, SelectField, Toolbar } from "./product/kit";
import { AsyncState } from "./product-ui";
import Link from "next/link";

type LoadState = "loading" | "ready" | "error";
type Density = "comfortable" | "compact";

function buildParams({ search, confidence, status, contact, campaignId }: { search: string; confidence: ConfidenceBand | ""; status: LeadStatus | ""; contact: "any" | "email" | "phone"; campaignId?: string }) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (confidence) params.set("confidence", confidence);
  if (status) params.set("status", status);
  if (contact !== "any") params.set("contact", contact);
  if (campaignId) params.set("campaignId", campaignId);
  return params;
}

const statusTone = (status: LeadStatus) => status === "suppressed" ? "danger" : status === "approved" ? "verified" : status === "needs_review" ? "warning" : status === "qualified" ? "info" : "neutral";

function ContactLine({ icon: Icon, value, verified }: { icon: typeof Mail; value: string; verified: boolean }) {
  return <span className="flex min-w-0 items-center gap-1.5 text-xs">
    <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
    <span className="truncate text-foreground">{value}</span>
    {verified ? <Check aria-label="verified" className="size-3.5 shrink-0 text-verified" /> : null}
  </span>;
}

export function LeadsWorkspace({ campaignId }: { campaignId?: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [confidence, setConfidence] = useState<ConfidenceBand | "">("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [contact, setContact] = useState<"any" | "email" | "phone">("any");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("vranceflex:leads-density");
      if (stored === "comfortable" || stored === "compact") setDensity(stored);
    } catch {}
  }, []);
  const changeDensity = (next: Density) => { setDensity(next); try { window.localStorage.setItem("vranceflex:leads-density", next); } catch {} };

  const params = useMemo(() => buildParams({ search: deferredSearch, confidence, status, contact, campaignId }), [campaignId, confidence, contact, deferredSearch, status]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState((current) => current === "ready" ? "ready" : "loading");
    setError("");
    try {
      const response = await fetch(`/api/leads?${params.toString()}`, { cache: "no-store", signal });
      const data = (await response.json()) as { leads?: Lead[]; total?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Leads could not be loaded.");
      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
      setState("ready");
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Leads could not be loaded.");
      setState("error");
    }
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selected = leads.find((lead) => lead.id === selectedId) ?? null;
  const exportHref = `/api/leads/export?${params.toString()}`;
  const hasFilters = Boolean(search || confidence || status || contact !== "any");
  const clearFilters = () => { setSearch(""); setConfidence(""); setStatus(""); setContact("any"); };
  const cellY = density === "compact" ? "py-2" : "py-3.5";

  return <div className="space-y-6">
    {state === "loading" && !leads.length ? null : <LedgerStats items={[
      { label: "Matched leads", value: total, note: campaignId ? "In this campaign" : "Across this workspace" },
      { label: "High confidence", value: leads.filter((lead) => lead.confidenceBand === "high").length, note: "80% or higher", tone: "verified" },
      { label: "Verified email", value: leads.filter((lead) => lead.emailVerified).length, note: "Deliverability checked" },
      { label: "Suppressed", value: leads.filter((lead) => lead.doNotContact).length, note: "Never contacted", tone: leads.some((lead) => lead.doNotContact) ? "danger" : "default" },
    ]} />}

    <section className="rounded-[var(--radius)] border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-rule p-4 lg:flex-row lg:items-center lg:justify-between">
        <Toolbar className="flex-1">
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Search leads</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input className={cn(fieldClass, "pl-9")} onChange={(event) => setSearch(event.target.value)} placeholder="Company, person, title or market" type="search" value={search} />
          </label>
          <SelectField aria-label="Confidence" onChange={(event) => setConfidence(event.target.value as ConfidenceBand | "")} value={confidence}>
            <option value="">Any confidence</option><option value="high">High · 80%+</option><option value="medium">Medium · 60–79%</option><option value="low">Low · under 60%</option>
          </SelectField>
          <SelectField aria-label="Lead status" onChange={(event) => setStatus(event.target.value as LeadStatus | "")} value={status}>
            <option value="">Any status</option>{Object.entries(leadStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>
          <SelectField aria-label="Contact availability" onChange={(event) => setContact(event.target.value as "any" | "email" | "phone")} value={contact}>
            <option value="any">Any contact</option><option value="email">Has email</option><option value="phone">Has phone</option>
          </SelectField>
          <AnimatePresence>{hasFilters ? <motion.span initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
            <Button variant="ghost" size="sm" onClick={clearFilters} type="button"><X />Clear</Button>
          </motion.span> : null}</AnimatePresence>
        </Toolbar>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Row density">
            {(["comfortable", "compact"] as const).map((value) => { const Icon = value === "compact" ? Rows4 : Rows3; return <button key={value} type="button" aria-pressed={density === value} aria-label={`${value} rows`} onClick={() => changeDensity(value)} className={cn("flex size-7 items-center justify-center rounded-[5px] transition-colors", density === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}><Icon className="size-3.5" /></button>; })}
          </div>
          <Button asChild variant="outline" size="sm"><Link href="/icp"><Target />ICP report</Link></Button>
          <Button asChild size="sm"><a download href={exportHref}><Download />Export CSV</a></Button>
        </div>
      </div>

      {state === "loading" && !leads.length ? <AsyncState state="loading" title="Loading leads" className="rounded-none border-0" /> : null}
      {state === "error" ? <div className="p-4"><AsyncState state="error" title="Leads could not be loaded" description={error} action={<Button variant="outline" size="sm" onClick={() => void load()} type="button"><RefreshCw />Try again</Button>} /></div> : null}
      {state === "ready" && leads.length === 0 ? <div className="p-4"><EmptyState icon={<Search />} title={hasFilters ? "No leads match these filters" : "No leads yet"} description={hasFilters ? "Loosen a filter, or clear them to see every lead in this workspace." : "Leads appear here once a campaign finishes research and verification."} action={hasFilters ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : <Button asChild size="sm"><Link href="/campaigns/new">Start a campaign</Link></Button>} /></div> : null}

      {leads.length > 0 && state !== "error" ? <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead>
            <tr className="border-b border-rule text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">Decision-maker</th>
              <th className="px-4 py-2.5 font-medium">Contact</th>
              <th className="px-4 py-2.5 font-medium">Confidence</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="w-10 px-4 py-2.5"><span className="sr-only">Evidence</span></th>
            </tr>
          </thead>
          <motion.tbody initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025 } } }} className={cn(state === "loading" && "opacity-60 transition-opacity")}>
            {leads.map((lead) => <motion.tr key={lead.id} variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }} onClick={() => setSelectedId(lead.id)}
              className={cn("group cursor-pointer border-b border-rule last:border-0 transition-colors hover:bg-muted/40", lead.doNotContact && "text-muted-foreground")}>
              <td className={cn("px-4", cellY)}><div className="flex items-center gap-3"><Initials name={lead.companyName} className={density === "compact" ? "size-7" : undefined} /><div className="min-w-0"><p className="truncate font-medium text-foreground">{lead.companyName}</p><p className="truncate text-xs text-muted-foreground">{[lead.industry, lead.companySize].filter(Boolean).join(" · ") || "Market pending"}</p></div></div></td>
              <td className={cn("px-4", cellY)}><p className="truncate text-foreground">{lead.personName}</p><p className="truncate text-xs text-muted-foreground">{lead.jobTitle}</p></td>
              <td className={cn("max-w-[16rem] px-4", cellY)}><div className="grid gap-1">
                {lead.email ? <ContactLine icon={Mail} value={lead.email} verified={lead.emailVerified} /> : <span className="text-xs text-muted-foreground">No email found</span>}
                {lead.phone && density === "comfortable" ? <ContactLine icon={Phone} value={lead.phone} verified={lead.phoneVerified} /> : null}
              </div></td>
              <td className={cn("px-4", cellY)}><EvidenceMeter value={lead.confidence} /></td>
              <td className={cn("px-4", cellY)}><Chip tone={statusTone(lead.status)}>{leadStatusLabels[lead.status]}</Chip></td>
              <td className={cn("px-4", cellY)}><button type="button" aria-label={`Open evidence for ${lead.personName} at ${lead.companyName}`} onClick={(event) => { event.stopPropagation(); setSelectedId(lead.id); }} className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:bg-card group-hover:text-foreground"><ChevronRight className="size-4" /></button></td>
            </motion.tr>)}
          </motion.tbody>
        </table>
      </div> : null}
    </section>

    <Sheet open={Boolean(selected)} onOpenChange={(next) => { if (!next) setSelectedId(null); }}>
      {selected ? <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b border-rule p-5 text-left">
          <p className="font-mono text-xs text-muted-foreground">lead evidence</p>
          <SheetTitle className="text-lg">{selected.personName}</SheetTitle>
          <SheetDescription>{selected.jobTitle} · {selected.companyName}</SheetDescription>
          <div className="flex items-center gap-3 pt-2"><EvidenceMeter value={selected.confidence} /><span className="text-xs text-muted-foreground">{selected.evidence.length} source{selected.evidence.length === 1 ? "" : "s"}</span><Chip tone={statusTone(selected.status)}>{leadStatusLabels[selected.status]}</Chip></div>
        </SheetHeader>
        <div className="space-y-6 p-5">
          {selected.doNotContact ? <div className="flex gap-3 rounded-md border border-destructive/25 bg-destructive/6 p-3 text-sm"><ShieldOff className="mt-0.5 size-4 shrink-0 text-destructive" /><p><span className="font-medium text-foreground">Do not contact.</span> <span className="text-muted-foreground">This person is excluded from every sequence.</span></p></div> : null}
          <dl className="grid gap-2.5 text-sm">
            {[
              { icon: Building2, label: "Company", value: selected.companyDomain ? `${selected.companyName} · ${selected.companyDomain}` : selected.companyName },
              { icon: MapPin, label: "Geography", value: selected.geography ?? "Not confirmed" },
              { icon: Target, label: "ICP", value: selected.icpName ?? "Not assigned" },
            ].map(({ icon: Icon, label, value }) => <div key={label} className="grid grid-cols-[7rem_1fr] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><Icon className="size-3.5" />{label}</dt><dd className="min-w-0 truncate text-foreground">{value}</dd></div>)}
          </dl>
          <div className="grid gap-1.5">
            {selected.email ? <ContactLine icon={Mail} value={selected.email} verified={selected.emailVerified} /> : null}
            {selected.phone ? <ContactLine icon={Phone} value={selected.phone} verified={selected.phoneVerified} /> : null}
            {selected.linkedinUrl ? <a className="flex items-center gap-1.5 text-xs text-primary hover:underline" href={selected.linkedinUrl} rel="noreferrer" target="_blank"><Linkedin className="size-3.5" />LinkedIn profile</a> : null}
          </div>
          {selected.buyingSignals.length ? <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">Buying signals</h3>
            <ul className="grid gap-1.5 text-sm">{selected.buyingSignals.map((signal) => <li key={signal} className="flex gap-2"><span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-primary" />{signal}</li>)}</ul>
          </section> : null}
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">Sources</h3>
            <ol className="grid gap-2">{selected.evidence.map((item, index) => <li key={item.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2 text-xs"><span className="font-mono text-muted-foreground">[{index + 1}] {item.kind}</span><span className="font-mono tabular-nums text-foreground">{item.confidence}%</span></div>
              <p className="mt-1.5 text-sm font-medium text-foreground">{item.sourceTitle}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.excerpt}</p>
              <a className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline" href={item.sourceUrl} rel="noreferrer" target="_blank">Open source<ExternalLink className="size-3" /></a>
            </li>)}</ol>
          </section>
          <Button asChild variant="outline" size="sm" className="w-full"><Link href={`/campaigns/${selected.campaignId}`}>Open campaign<ArrowUpRight /></Link></Button>
        </div>
      </SheetContent> : null}
    </Sheet>
  </div>;
}
