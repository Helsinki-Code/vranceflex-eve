import { ArrowLeft, CircleDashed } from "lucide-react";
import { ActionLink, SurfaceCard } from "../components/design-system";

export default function NotFound() {
  return (
    <main className="dashboard-state">
      <SurfaceCard as="section" interactive={false}>
        <CircleDashed aria-hidden="true" />
        <h1>Page not found</h1>
        <p>The page may have moved, or the campaign is not available in this workspace.</p>
        <ActionLink className="button-primary" href="/dashboard">
          <ArrowLeft aria-hidden="true" size={16} /> Back to campaigns
        </ActionLink>
      </SurfaceCard>
    </main>
  );
}
