import { countryName } from "../domain/countries";

/**
 * Whether cold email to a recipient's country needs a person's confirmation
 * first. This is a prompt to check, not legal advice and not a statement of
 * what any country's law says.
 *
 * The United States is allowed by default: the model there is an opt-out and a
 * physical address in every message, both of which VranceFlex adds. Everywhere
 * else the rules differ (many places require consent or a documented lawful
 * basis for some or all recipients, and they depend on things VranceFlex can't
 * see, such as whether the recipient is a company or a sole trader), so a
 * workspace admin confirms once per country that they have a basis, and the
 * confirmation is recorded.
 */
export const COUNTRIES_ALLOWED_BY_DEFAULT = ["US"] as const;

export type RegionAssessment =
  | { outcome: "ok"; country: string | null }
  | { outcome: "review"; country: string; message: string };

export function assessRecipientRegion(country: string | null | undefined, acknowledgedCountries: readonly string[]): RegionAssessment {
  // Unknown location: nothing to check against. The footer, opt-out and every
  // other safeguard still apply.
  if (!country) return { outcome: "ok", country: null };
  if ((COUNTRIES_ALLOWED_BY_DEFAULT as readonly string[]).includes(country)) return { outcome: "ok", country };
  if (acknowledgedCountries.includes(country)) return { outcome: "ok", country };
  const name = countryName(country) ?? country;
  return {
    outcome: "review",
    country,
    message: `This lead is in ${name}. Cold email there often needs prior consent or a documented lawful basis, and the rules can depend on whether the recipient is a company or an individual. Confirm yours for ${name} in Settings → Sending to allow it.`,
  };
}
