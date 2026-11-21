type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * When a domain was first registered, from public RDAP records via the
 * rdap.org redirector. Only the domain name is sent. Best effort: any failure
 * (no record, a registry that doesn't publish dates, a timeout) is null, and
 * callers treat null as "unknown", never as "young".
 */
export async function fetchDomainRegistration(domain: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Date | null> {
  const name = domain.trim().toLowerCase();
  if (!DOMAIN_PATTERN.test(name)) return null;
  try {
    const response = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { accept: "application/rdap+json, application/json" },
    });
    if (!response.ok) return null;
    return registrationDateFromRdap(await response.json());
  } catch {
    return null;
  }
}

/** The "registration" event in an RDAP domain response, if it has a usable date. */
export function registrationDateFromRdap(body: unknown): Date | null {
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return null;
  for (const event of events) {
    const { eventAction, eventDate } = (event ?? {}) as { eventAction?: unknown; eventDate?: unknown };
    if (eventAction === "registration" && typeof eventDate === "string") {
      const date = new Date(eventDate);
      // Registries sometimes publish placeholder dates; anything before the web existed or in the future is noise.
      if (!Number.isNaN(date.getTime()) && date.getUTCFullYear() >= 1990 && date.getTime() <= Date.now()) return date;
    }
  }
  return null;
}

export function domainAgeDays(registeredAt: Date | null | undefined, now = new Date()) {
  return registeredAt ? Math.max(0, Math.floor((now.getTime() - registeredAt.getTime()) / 86_400_000)) : null;
}
