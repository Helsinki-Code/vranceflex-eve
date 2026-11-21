import { ccTldCountries, countryAliases, countryNames } from "../domain/countries";
import { timezoneForLocation } from "./lead-timezone";

/**
 * Best-effort country for a lead, as an ISO code, or null when it can't be
 * told. Used to decide whether a country's rules need a person's confirmation.
 * A wrong "null" only means no extra check, so this errs toward returning
 * nothing rather than guessing.
 */

// The zones lead-timezone.ts can return, and the country each one is in.
const ZONE_COUNTRY: Record<string, string> = {
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Phoenix": "US",
  "America/Los_Angeles": "US", "America/Anchorage": "US", "Pacific/Honolulu": "US", "America/Boise": "US",
  "America/Indiana/Indianapolis": "US", "America/Detroit": "US",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA",
  "America/Halifax": "CA", "America/Moncton": "CA",
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Amsterdam": "NL",
  "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Brussels": "BE", "Europe/Zurich": "CH", "Europe/Vienna": "AT",
  "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Warsaw": "PL",
  "Europe/Lisbon": "PT", "Europe/Athens": "GR", "Europe/Prague": "CZ", "Europe/Istanbul": "TR",
  "Asia/Kolkata": "IN", "Asia/Singapore": "SG", "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Jerusalem": "IL",
  "Asia/Dubai": "AE", "Asia/Qatar": "QA", "Asia/Riyadh": "SA", "Asia/Manila": "PH", "Asia/Hong_Kong": "HK",
  "Asia/Shanghai": "CN", "Pacific/Auckland": "NZ", "Africa/Johannesburg": "ZA", "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE", "Africa/Cairo": "EG", "America/Bogota": "CO", "America/Santiago": "CL",
  "America/Argentina/Buenos_Aires": "AR", "America/Sao_Paulo": "BR", "America/Mexico_City": "MX",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU", "Australia/Perth": "AU",
  "Australia/Adelaide": "AU",
};

/** The country a website's top-level domain points to ("shop.example.de" -> "DE"). */
export function countryForDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const labels = domain.trim().toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length < 2) return null;
  return ccTldCountries[labels[labels.length - 1]!] ?? null;
}

/** The country a free-text place ("Munich, Germany", "Austin, TX", "UK") is in. */
export function countryForLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const parts = location
    .split(/[,;/|()]+|\s-\s/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const byName = new Map(Object.entries(countryNames).map(([code, name]) => [name.toLowerCase(), code]));
  for (const part of parts) {
    const code = countryAliases[part] ?? byName.get(part);
    if (code) return code;
  }
  const zone = timezoneForLocation(location);
  return zone ? (ZONE_COUNTRY[zone] ?? null) : null;
}

/** A lead's country: the company website's domain first (most reliable), else where the campaign targets. */
export function countryForLead(input: { companyDomain?: string | null; geography?: string | null }) {
  return countryForDomain(input.companyDomain) ?? countryForLocation(input.geography);
}
