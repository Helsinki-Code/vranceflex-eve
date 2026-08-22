"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { AceternityButton, GlowCard } from "../components/aceternity";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="dashboard-state error" role="alert">
      <GlowCard as="section" interactive={false}>
        <AlertCircle aria-hidden="true" />
        <h1>This page could not be rendered</h1>
        <p>Your saved campaign data was not changed. Retry the page to reconnect.</p>
        <AceternityButton className="button-primary" onClick={reset} type="button">
          <RefreshCw aria-hidden="true" size={16} /> Retry page
        </AceternityButton>
      </GlowCard>
    </main>
  );
}
