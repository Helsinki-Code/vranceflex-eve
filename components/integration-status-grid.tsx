import type { IntegrationStatus } from "../lib/server/integration-status";
import { Chip, StatusDot } from "./product/kit";

export function IntegrationStatusGrid({ integrations }: { integrations: IntegrationStatus[] }) {
  return <ul className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
    {integrations.map((integration) => <li key={integration.id} className="flex flex-col gap-2 border-b border-rule px-5 py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0"><p className="text-sm font-medium">{integration.name}</p><p className="text-sm text-muted-foreground">{integration.description}</p></div>
      <div className="flex shrink-0 items-center gap-3">
        {integration.required ? null : <Chip>Optional</Chip>}
        <StatusDot on={integration.configured} label={integration.configured ? "Configured" : integration.required ? "Missing" : "Not set"} />
      </div>
    </li>)}
  </ul>;
}
