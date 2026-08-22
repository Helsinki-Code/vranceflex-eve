"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { ActionButton, SurfaceCard } from "../components/design-system";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="dashboard-state error" role="alert">
      <SurfaceCard as="section" interactive={false}>
        <AlertCircle aria-hidden="true" />
        <h1>This page could not be rendered</h1>
        <p>Your saved campaign data was not changed. Retry the page to reconnect.</p>
        <ActionButton className="button-primary" onClick={reset} type="button">
          <RefreshCw aria-hidden="true" size={16} /> Retry page
        </ActionButton>
      </SurfaceCard>
    </main>
  );
}
