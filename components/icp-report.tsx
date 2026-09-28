import { ExternalLink } from "lucide-react";
import type { IcpProfile } from "../lib/domain/lead";
import { Chip, EvidenceMeter } from "./product/kit";
import { FadeIn } from "./product/motion";

const priorityTone = { primary: "info", secondary: "neutral", influencer: "neutral" } as const;

function Section({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return <section className="grid gap-4 border-t border-rule py-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
    <h3 className="flex items-baseline gap-3 text-sm font-semibold"><span className="font-mono text-xs font-normal text-muted-foreground">{index}</span>{title}</h3>
    <div className="min-w-0">{children}</div>
  </section>;
}

function List({ items, marker }: { items: string[]; marker: string }) {
  return <ul className="grid gap-2 text-sm leading-6">{items.map((item) => <li key={item} className="flex gap-3"><span aria-hidden="true" className="font-mono text-xs leading-6 text-muted-foreground">{marker}</span><span>{item}</span></li>)}</ul>;
}

export function IcpReport({ profile }: { profile: IcpProfile }) {
  const firmographics = [
    ["Industries", profile.companyProfile.industries.join(", ")],
    ["Employees", profile.companyProfile.employeeRange],
    ["Revenue", profile.companyProfile.revenueRange],
    ["Maturity", profile.companyProfile.maturity],
    ["Regions", profile.companyProfile.geographies.join(", ")],
  ] as const;

  return <FadeIn className="space-y-2">
    <section className="grid gap-6 rounded-[var(--radius)] border border-border bg-card p-6 md:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="space-y-2">
        <p className="font-mono text-xs text-muted-foreground">ideal customer profile</p>
        <h2 className="text-2xl font-semibold tracking-tight">{profile.name}</h2>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">{profile.summary}</p>
      </div>
      <div className="flex flex-col justify-between gap-3 border-t border-rule pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
        <p className="text-xs text-muted-foreground">Research confidence</p>
        <p className="font-mono text-4xl font-medium tracking-[-0.04em] tabular-nums">{profile.confidence}%</p>
        <EvidenceMeter value={profile.confidence} hideValue />
        <p className="text-xs text-muted-foreground">Built from {profile.evidenceCount} evidence signals</p>
      </div>
    </section>

    <div className="px-1">
      <Section index="01" title="Company fit">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {firmographics.map(([label, value]) => <div key={label} className="grid grid-cols-[6.5rem_1fr] gap-3"><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </Section>
      <Section index="02" title="Who buys">
        <ul className="grid gap-3 sm:grid-cols-2">
          {profile.buyerRoles.map((role) => <li key={role.title} className="rounded-md border border-border p-4">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{role.title}</p><Chip tone={priorityTone[role.priority]}>{role.priority}</Chip></div>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{role.motivation}</p>
          </li>)}
        </ul>
      </Section>
      <Section index="03" title="Problems they have"><List items={profile.painPoints} marker="—" /></Section>
      <Section index="04" title="Signals to prioritise"><List items={profile.buyingSignals} marker="+" /></Section>
      <Section index="05" title="Leave out"><List items={profile.exclusions} marker="×" /></Section>
      <Section index="06" title="Sources">
        <ol className="grid gap-2">
          {profile.evidence.map((item, index) => <li key={item.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-border p-3 text-sm">
            <span className="font-mono text-xs leading-6 text-muted-foreground">[{index + 1}]</span>
            <span className="min-w-0"><span className="block font-medium">{item.sourceTitle}</span><span className="mt-0.5 block leading-6 text-muted-foreground">{item.excerpt}</span></span>
            <span className="flex items-center gap-3"><span className="font-mono text-xs tabular-nums">{item.confidence}%</span><a className="text-muted-foreground hover:text-foreground" href={item.sourceUrl} rel="noreferrer" target="_blank" aria-label={`Open source: ${item.sourceTitle}`}><ExternalLink className="size-4" /></a></span>
          </li>)}
        </ol>
      </Section>
    </div>
  </FadeIn>;
}
