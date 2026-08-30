"use client";

import { useEffect, useState } from "react";
import { BrandWordmark, VranceLoader } from "./vranceflex-logo";

type LoaderPhase = "active" | "leaving" | "hidden";

const FULL_SEQUENCE_MS = 2700;
const EXIT_MS = 420;
const REDUCED_SEQUENCE_MS = 650;

export function StartupLoader() {
  const [phase, setPhase] = useState<LoaderPhase>("active");

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sequenceDuration = reducedMotion ? REDUCED_SEQUENCE_MS : FULL_SEQUENCE_MS;
    const leaveTimer = window.setTimeout(() => setPhase("leaving"), sequenceDuration);
    const hideTimer = window.setTimeout(
      () => setPhase("hidden"),
      sequenceDuration + (reducedMotion ? 80 : EXIT_MS),
    );

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="vf-startup-overlay"
      data-phase={phase}
      role="status"
    >
      <div className="vf-startup-field" aria-hidden="true" />
      <div className="vf-startup-aurora" aria-hidden="true" />

      <div className="vf-startup-sequence">
        <div className="vf-startup-mark-wrap">
          <VranceLoader idPrefix="vf-startup" />
          <span className="vf-startup-ring" aria-hidden="true" />
        </div>

        <BrandWordmark className="vf-startup-wordmark" />
        <p className="vf-startup-manifesto">Intelligence, directed.</p>

        <div className="vf-startup-status" aria-hidden="true">
          <span>Connecting signals</span>
          <span>Aligning agents</span>
          <span>Workspace ready</span>
        </div>

        <div className="vf-startup-progress" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}

export function RouteLoader({ label = "Preparing your workspace" }: { label?: string }) {
  return (
    <main className="vf-route-loader" aria-busy="true" aria-label={label}>
      <div className="vf-route-loader-mark">
        <VranceLoader idPrefix="vf-route" label={label} />
      </div>
      <BrandWordmark className="vf-route-loader-wordmark" />
      <p>{label}</p>
      <span className="vf-route-loader-signal" aria-hidden="true" />
    </main>
  );
}

export function InlineLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="vf-inline-loader" aria-busy="true" aria-label={label} role="status">
      <VranceLoader idPrefix="vf-inline" label={label} />
      <div><strong>{label}</strong><span>VranceFlex is synchronizing the latest state.</span></div>
    </div>
  );
}
