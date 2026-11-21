import type { CallOutcome } from "../lib/domain/voice";

export async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string; issues?: Array<{ message: string }> };
  if (!response.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "The request could not be completed.");
  return data;
}

export const outcomeTone = (outcome: CallOutcome | null): "verified" | "info" | "warning" | "danger" | "neutral" => {
  switch (outcome) {
    case "meeting_requested":
    case "deal_progressed":
    case "qualified":
      return "verified";
    case "interested":
    case "callback_requested":
      return "info";
    case "needs_human":
    case "failed":
      return "warning";
    case "do_not_call":
      return "danger";
    default:
      return "neutral";
  }
};

export function minutesText(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `${seconds}s`;
  const rest = seconds % 60;
  return minutes < 100 && rest ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${minutes} min`;
}
