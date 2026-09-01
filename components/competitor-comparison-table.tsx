import type { CompetitorProfile } from "@/lib/competitors/data";
import { comparisonFeatureRows } from "@/lib/competitors/data";

export function CompetitorComparisonTable({ profiles }: { profiles: CompetitorProfile[] }) {
  return (
    <div className="competitor-table-scroll" tabIndex={0} role="region" aria-label="Product feature comparison">
      <table className="competitor-table">
        <thead>
          <tr>
            <th scope="col">Evaluation area</th>
            {profiles.map((profile) => <th scope="col" key={profile.slug}>{profile.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {comparisonFeatureRows.map(({ key, label }) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              {profiles.map((profile) => <td key={profile.slug}>{profile.features[key]}</td>)}
            </tr>
          ))}
          <tr>
            <th scope="row">Starting point</th>
            {profiles.map((profile) => <td key={profile.slug}>{profile.pricing.entry}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
