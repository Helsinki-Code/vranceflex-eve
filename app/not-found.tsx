import { ArrowLeft, CircleDashed } from "lucide-react";
import { AceternityLink, GlowCard } from "../components/aceternity";

export default function NotFound() {
  return (
    <main className="dashboard-state">
      <GlowCard as="section" interactive={false}>
        <CircleDashed aria-hidden="true" />
        <h1>Page not found</h1>
        <p>The page may have moved, or the campaign is not available in this workspace.</p>
        <AceternityLink className="button-primary" href="/dashboard">
          <ArrowLeft aria-hidden="true" size={16} /> Back to campaigns
        </AceternityLink>
      </GlowCard>
    </main>
  );
}
