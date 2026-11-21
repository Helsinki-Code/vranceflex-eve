/** ISO 3166-1 alpha-2 codes and display names for the countries VranceFlex can recognise. */
export const countryNames: Record<string, string> = {
  US: "United States", CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina", CL: "Chile", CO: "Colombia",
  GB: "United Kingdom", IE: "Ireland", FR: "France", DE: "Germany", AT: "Austria", CH: "Switzerland", NL: "Netherlands",
  BE: "Belgium", LU: "Luxembourg", ES: "Spain", PT: "Portugal", IT: "Italy", SE: "Sweden", NO: "Norway", DK: "Denmark",
  FI: "Finland", PL: "Poland", CZ: "Czechia", GR: "Greece", TR: "Türkiye", IL: "Israel", AE: "United Arab Emirates",
  SA: "Saudi Arabia", QA: "Qatar", EG: "Egypt", ZA: "South Africa", NG: "Nigeria", KE: "Kenya", IN: "India",
  SG: "Singapore", HK: "Hong Kong", CN: "China", JP: "Japan", KR: "South Korea", PH: "Philippines", AU: "Australia",
  NZ: "New Zealand",
};

/** Country-code top-level domains that map to a single country. ".uk" is "GB". */
export const ccTldCountries: Record<string, string> = {
  us: "US", ca: "CA", mx: "MX", br: "BR", ar: "AR", cl: "CL", co: "CO", uk: "GB", ie: "IE", fr: "FR", de: "DE", at: "AT",
  ch: "CH", nl: "NL", be: "BE", lu: "LU", es: "ES", pt: "PT", it: "IT", se: "SE", no: "NO", dk: "DK", fi: "FI", pl: "PL",
  cz: "CZ", gr: "GR", tr: "TR", il: "IL", ae: "AE", sa: "SA", qa: "QA", eg: "EG", za: "ZA", ng: "NG", ke: "KE", in: "IN",
  sg: "SG", hk: "HK", cn: "CN", jp: "JP", kr: "KR", ph: "PH", au: "AU", nz: "NZ",
};

/** Alternative spellings people use for countries in free text. */
export const countryAliases: Record<string, string> = {
  usa: "US", "u.s.": "US", "u.s.a.": "US", "united states": "US", "united states of america": "US", america: "US",
  uk: "GB", "u.k.": "GB", "united kingdom": "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB",
  "northern ireland": "GB", uae: "AE", "united arab emirates": "AE", turkey: "TR", turkiye: "TR", "czech republic": "CZ",
  holland: "NL", "south korea": "KR", korea: "KR",
};

export function countryName(code: string | null | undefined) {
  return code ? (countryNames[code] ?? code) : null;
}
