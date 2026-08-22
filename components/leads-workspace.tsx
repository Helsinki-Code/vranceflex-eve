"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldOff,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  ActionButton,
  ActionLink,
  NativeSelect,
  SurfaceCard,
} from "./design-system";
import { Input } from "./ui/input";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  leadStatusLabels,
  type ConfidenceBand,
  type Lead,
  type LeadStatus,
} from "../lib/domain/lead";
import { AsyncState, StatusBadge } from "./product-ui";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";

type LoadState = "loading" | "ready" | "error";

function buildParams({
  search,
  confidence,
  status,
  contact,
  campaignId,
}: {
  search: string;
  confidence: ConfidenceBand | "";
  status: LeadStatus | "";
  contact: "any" | "email" | "phone";
  campaignId?: string;
}) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (confidence) params.set("confidence", confidence);
  if (status) params.set("status", status);
  if (contact !== "any") params.set("contact", contact);
  if (campaignId) params.set("campaignId", campaignId);
  return params;
}

function Confidence({ lead }: { lead: Lead }) {
  return (
    <span className={`lead-confidence confidence-${lead.confidenceBand}`}>
      <i />
      {lead.confidence}%
    </span>
  );
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
  const [density, setDensity] = useState<"comfortable" | "compact">("compact");

  useEffect(() => {
    const stored = window.localStorage.getItem("vranceflex:leads-density");
    if (stored === "comfortable" || stored === "compact") setDensity(stored);
  }, []);

  useEffect(() => { window.localStorage.setItem("vranceflex:leads-density", density); }, [density]);

  const params = useMemo(
    () =>
      buildParams({
        search: deferredSearch,
        confidence,
        status,
        contact,
        campaignId,
      }),
    [campaignId, confidence, contact, deferredSearch, status],
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState("loading");
      setError("");

      try {
        const response = await fetch(`/api/leads?${params.toString()}`, {
          cache: "no-store",
          signal,
        });
        const data = (await response.json()) as {
          leads?: Lead[];
          total?: number;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Leads could not be loaded.");
        setLeads(data.leads ?? []);
        setTotal(data.total ?? 0);
        setState("ready");
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Leads could not be loaded.");
        setState("error");
      }
    },
    [params],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selected = leads.find((lead) => lead.id === selectedId) ?? null;
  const exportHref = `/api/leads/export?${params.toString()}`;
  const hasFilters = Boolean(search || confidence || status || contact !== "any");

  return (
    <>
      <section className="lead-metrics" aria-label="Lead summary">
        <SurfaceCard as="article">
          <span><UserRound size={15} /> Matched leads</span>
          <strong>{state === "ready" ? total : "—"}</strong>
          <small>Scoped to this workspace</small>
        </SurfaceCard>
        <SurfaceCard as="article">
          <span><Sparkles size={15} /> High confidence</span>
          <strong>
            {state === "ready"
              ? leads.filter((lead) => lead.confidenceBand === "high").length
              : "—"}
          </strong>
          <small>80% confidence or higher</small>
        </SurfaceCard>
        <SurfaceCard as="article">
          <span><BadgeCheck size={15} /> Verified email</span>
          <strong>
            {state === "ready"
              ? leads.filter((lead) => lead.emailVerified).length
              : "—"}
          </strong>
          <small>Verification is shown separately</small>
        </SurfaceCard>
        <SurfaceCard as="article">
          <span><ShieldOff size={15} /> Suppressed</span>
          <strong>
            {state === "ready"
              ? leads.filter((lead) => lead.doNotContact).length
              : "—"}
          </strong>
          <small>Never eligible for outreach</small>
        </SurfaceCard>
      </section>

      <section className="leads-panel">
        <div className="leads-toolbar">
          <div>
            <span className="section-label">RESEARCH RESULTS</span>
            <h2>Evidence-backed people</h2>
          </div>
          <div className="lead-toolbar-actions">
            <label className="density-control"><span className="sr-only">Table density</span><NativeSelect value={density} onChange={(event) => setDensity(event.target.value as "comfortable" | "compact")}><option value="compact">Compact rows</option><option value="comfortable">Comfortable rows</option></NativeSelect></label>
            <ActionLink className="button-secondary compact" href="/icp">
              View ICP report <ArrowUpRight size={15} />
            </ActionLink>
            <ActionLink className="button-primary compact" download href={exportHref}>
              <Download size={15} /> Export CSV
            </ActionLink>
          </div>
        </div>

        <div className="lead-filters">
          <label className="lead-search">
            <Search size={16} />
            <span className="sr-only">Search leads</span>
            <Input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search company, person, title or market"
              type="search"
              value={search}
            />
          </label>
          <label>
            <span className="sr-only">Confidence</span>
            <NativeSelect
              onChange={(event) =>
                setConfidence(event.target.value as ConfidenceBand | "")
              }
              value={confidence}
            >
              <option value="">All confidence</option>
              <option value="high">High confidence</option>
              <option value="medium">Medium confidence</option>
              <option value="low">Low confidence</option>
            </NativeSelect>
          </label>
          <label>
            <span className="sr-only">Lead status</span>
            <NativeSelect
              onChange={(event) => setStatus(event.target.value as LeadStatus | "")}
              value={status}
            >
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="qualified">Qualified</option>
              <option value="needs_review">Needs review</option>
              <option value="approved">Approved</option>
              <option value="suppressed">Suppressed</option>
            </NativeSelect>
          </label>
          <label>
            <span className="sr-only">Contact availability</span>
            <NativeSelect
              onChange={(event) =>
                setContact(event.target.value as "any" | "email" | "phone")
              }
              value={contact}
            >
              <option value="any">Any contact</option>
              <option value="email">Has email</option>
              <option value="phone">Has phone</option>
            </NativeSelect>
          </label>
          {hasFilters && (
            <ActionButton
              className="clear-filters"
              onClick={() => {
                setSearch("");
                setConfidence("");
                setStatus("");
                setContact("any");
              }}
              type="button"
            >
              <X size={14} /> Clear
            </ActionButton>
          )}
        </div>

        {state === "loading" && (
          <AsyncState state="loading" title="Checking current evidence" />
        )}

        {state === "error" && (
          <AsyncState state="error" title="Lead research is unavailable" description={error} action={<ActionButton className="button-secondary" onClick={() => void load()} type="button"><RefreshCw size={15} /> Retry</ActionButton>} />
        )}

        {state === "ready" && leads.length === 0 && (
          <AsyncState state="empty" title="No leads match these filters" description="Change the filters or wait for research and enrichment to produce evidence." />
        )}

        {state === "ready" && leads.length > 0 && (
          <div className={`lead-table-wrap lead-density-${density}`}>
            <table className="lead-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Decision-maker</th>
                  <th>Contact</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th><span className="sr-only">View evidence</span></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr className={lead.doNotContact ? "suppressed" : ""} key={lead.id}>
                    <td data-label="Company">
                      <div className="lead-company">
                        <span>{lead.companyName.slice(0, 2).toUpperCase()}</span>
                        <div>
                          <strong>{lead.companyName}</strong>
                          <small>
                            {lead.industry ?? "Market pending"} · {lead.companySize ?? "Size pending"}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Decision-maker">
                      <strong>{lead.personName}</strong>
                      <small>{lead.jobTitle}</small>
                    </td>
                    <td data-label="Contact">
                      <div className="lead-contact">
                        {lead.email ? (
                          <span>
                            <Mail size={13} /> {lead.email}
                            {lead.emailVerified && <Check size={12} />}
                          </span>
                        ) : (
                          <span className="muted">Email unavailable</span>
                        )}
                        {lead.phone && (
                          <span>
                            <Phone size={13} /> {lead.phone}
                            {lead.phoneVerified && <Check size={12} />}
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Confidence"><Confidence lead={lead} /></td>
                    <td data-label="Status">
                      <StatusBadge tone={lead.status === "suppressed" ? "danger" : lead.status === "approved" ? "success" : lead.status === "needs_review" ? "warning" : "info"}>{leadStatusLabels[lead.status]}</StatusBadge>
                    </td>
                    <td>
                      <ActionButton
                        aria-label={`Inspect evidence for ${lead.personName} at ${lead.companyName}`}
                        onClick={() => setSelectedId(lead.id)}
                        type="button"
                      >
                        <ChevronRight size={17} />
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Sheet open={Boolean(selected)} onOpenChange={(next) => { if (!next) setSelectedId(null); }}>
        {selected ? <SheetContent side="right" className="lead-detail">
          <SheetHeader className="sr-only"><SheetTitle>Evidence for {selected.personName}</SheetTitle><SheetDescription>Verification sources, confidence, and suppression state.</SheetDescription></SheetHeader>
            <div className="lead-detail-head">
              <div>
                <span className="section-label">LEAD EVIDENCE</span>
                <h2>{selected.personName}</h2>
                <p>{selected.jobTitle} · {selected.companyName}</p>
              </div>
              <ActionButton
                aria-label="Close lead evidence"
                onClick={() => setSelectedId(null)}
                type="button"
              >
                <X size={18} />
              </ActionButton>
            </div>

            <div className="lead-detail-score">
              <Confidence lead={selected} />
              <span>{selected.evidence.length} source{selected.evidence.length === 1 ? "" : "s"} shown</span>
            </div>

            <dl className="lead-facts">
              <div><dt><Building2 size={14} /> Company</dt><dd>{selected.companyName}</dd></div>
              <div><dt><MapPin size={14} /> Geography</dt><dd>{selected.geography ?? "Not confirmed"}</dd></div>
              <div><dt><UserRound size={14} /> ICP</dt><dd>{selected.icpName ?? "Not assigned"}</dd></div>
            </dl>

            <section className="buying-signals">
              <h3>Buying signals</h3>
              <ul>
                {selected.buyingSignals.map((signal) => (
                  <li key={signal}><Sparkles size={14} /> {signal}</li>
                ))}
              </ul>
            </section>

            <section className="evidence-list">
              <h3>Source evidence</h3>
              {selected.evidence.map((item) => (
                <SurfaceCard as="article" key={item.id}>
                  <div>
                    <span>{item.kind}</span>
                    <strong>{item.confidence}%</strong>
                  </div>
                  <h4>{item.sourceTitle}</h4>
                  <p>{item.excerpt}</p>
                  <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                    Open source <ExternalLink size={13} />
                  </a>
                </SurfaceCard>
              ))}
            </section>

            {selected.doNotContact && (
              <div className="suppression-notice">
                <ShieldOff size={17} />
                <p><strong>Do not contact.</strong> This lead is permanently excluded from outreach.</p>
              </div>
            )}
        </SheetContent> : null}
      </Sheet>
    </>
  );
}
