import type { CompetitorProfile } from "@/lib/competitors/data";

export function CompetitorSourceList({ profiles, reviewed }: { profiles: CompetitorProfile[]; reviewed: string }) {
  const sources = profiles.flatMap((profile) => profile.sources.map((source) => ({ ...source, product: profile.name })));

  return (
    <section className="competitor-sources" aria-labelledby="competitor-sources-title">
      <span className="section-label">Primary sources</span>
      <h2 id="competitor-sources-title">Verify the current details</h2>
      <p>Official product and pricing pages reviewed {reviewed}. Vendors can change plans and features; confirm final terms before purchasing.</p>
      <ul>
        {sources.map((source) => (
          <li key={`${source.product}-${source.url}`}>
            <a href={source.url} target="_blank" rel="noreferrer">
              <span>{source.product}</span>
              <strong>{source.label}</strong>
              <small>{new URL(source.url).hostname}</small>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
