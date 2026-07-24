"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

export function BillingActions({
  hasActiveSubscription,
  priceId,
}: {
  hasActiveSubscription: boolean;
  priceId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    if (!priceId) return;
    setBusy(true);
    setError("");
    try {
      const data = await requestJson<{ url: string }>("/api/billing/checkout", {
        body: JSON.stringify({ priceId }),
      });
      window.location.href = data.url;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Checkout could not start.",
      );
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    setError("");
    try {
      const data = await requestJson<{ url: string }>("/api/billing/portal");
      window.location.href = data.url;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The billing portal could not open.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="billing-actions">
      {error ? <div className="auth-form-error" role="alert">{error}</div> : null}
      {hasActiveSubscription ? (
        <button className="button-primary" disabled={busy} onClick={() => void openPortal()} type="button">
          {busy ? <LoaderCircle className="spin" size={16} /> : null}
          Manage subscription <ArrowRight size={16} />
        </button>
      ) : (
        <button
          className="button-primary"
          disabled={busy || !priceId}
          onClick={() => void startCheckout()}
          type="button"
        >
          {busy ? <LoaderCircle className="spin" size={16} /> : null}
          Upgrade to Pro <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
