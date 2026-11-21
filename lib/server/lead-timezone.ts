/**
 * Best-effort IANA time zone for a free-text location such as "Austin, TX",
 * "Ontario", "Germany" or "London, UK".
 *
 * Returns a zone only when the place sits in ONE zone (or has a clear
 * dominant one, as with a city). A multi-zone country such as "United States"
 * returns null: guessing wrong would send mail at the wrong hour, so callers
 * fall back to the workspace's own zone instead.
 */

const CITIES: Record<string, string> = {
  "new york": "America/New_York", nyc: "America/New_York", boston: "America/New_York", miami: "America/New_York",
  atlanta: "America/New_York", philadelphia: "America/New_York", charlotte: "America/New_York",
  chicago: "America/Chicago", houston: "America/Chicago", dallas: "America/Chicago", austin: "America/Chicago",
  "san antonio": "America/Chicago", minneapolis: "America/Chicago", "st. louis": "America/Chicago", nashville: "America/Chicago",
  denver: "America/Denver", "salt lake city": "America/Denver", boulder: "America/Denver",
  phoenix: "America/Phoenix",
  "los angeles": "America/Los_Angeles", "san francisco": "America/Los_Angeles", "san diego": "America/Los_Angeles",
  seattle: "America/Los_Angeles", portland: "America/Los_Angeles", "san jose": "America/Los_Angeles", "las vegas": "America/Los_Angeles",
  toronto: "America/Toronto", ottawa: "America/Toronto", montreal: "America/Toronto", vancouver: "America/Vancouver",
  calgary: "America/Edmonton", edmonton: "America/Edmonton",
  london: "Europe/London", manchester: "Europe/London", edinburgh: "Europe/London", dublin: "Europe/Dublin",
  paris: "Europe/Paris", berlin: "Europe/Berlin", munich: "Europe/Berlin", amsterdam: "Europe/Amsterdam",
  madrid: "Europe/Madrid", barcelona: "Europe/Madrid", rome: "Europe/Rome", milan: "Europe/Rome",
  stockholm: "Europe/Stockholm", zurich: "Europe/Zurich", lisbon: "Europe/Lisbon", warsaw: "Europe/Warsaw",
  sydney: "Australia/Sydney", melbourne: "Australia/Melbourne", brisbane: "Australia/Brisbane", perth: "Australia/Perth",
  adelaide: "Australia/Adelaide", auckland: "Pacific/Auckland",
  singapore: "Asia/Singapore", tokyo: "Asia/Tokyo", seoul: "Asia/Seoul", mumbai: "Asia/Kolkata", bangalore: "Asia/Kolkata",
  bengaluru: "Asia/Kolkata", delhi: "Asia/Kolkata", "new delhi": "Asia/Kolkata", dubai: "Asia/Dubai", "tel aviv": "Asia/Jerusalem",
  "hong kong": "Asia/Hong_Kong", lagos: "Africa/Lagos", nairobi: "Africa/Nairobi", cairo: "Africa/Cairo",
  johannesburg: "Africa/Johannesburg", "cape town": "Africa/Johannesburg", "sao paulo": "America/Sao_Paulo", "são paulo": "America/Sao_Paulo",
  "mexico city": "America/Mexico_City",
};

// The zone most of each US state's population lives in.
const US_STATES: Record<string, string> = {
  alabama: "America/Chicago", alaska: "America/Anchorage", arizona: "America/Phoenix", arkansas: "America/Chicago",
  california: "America/Los_Angeles", colorado: "America/Denver", connecticut: "America/New_York", delaware: "America/New_York",
  florida: "America/New_York", georgia: "America/New_York", hawaii: "Pacific/Honolulu", idaho: "America/Boise",
  illinois: "America/Chicago", indiana: "America/Indiana/Indianapolis", iowa: "America/Chicago", kansas: "America/Chicago",
  kentucky: "America/New_York", louisiana: "America/Chicago", maine: "America/New_York", maryland: "America/New_York",
  massachusetts: "America/New_York", michigan: "America/Detroit", minnesota: "America/Chicago", mississippi: "America/Chicago",
  missouri: "America/Chicago", montana: "America/Denver", nebraska: "America/Chicago", nevada: "America/Los_Angeles",
  "new hampshire": "America/New_York", "new jersey": "America/New_York", "new mexico": "America/Denver", "new york state": "America/New_York",
  "north carolina": "America/New_York", "north dakota": "America/Chicago", ohio: "America/New_York", oklahoma: "America/Chicago",
  oregon: "America/Los_Angeles", pennsylvania: "America/New_York", "rhode island": "America/New_York", "south carolina": "America/New_York",
  "south dakota": "America/Chicago", tennessee: "America/Chicago", texas: "America/Chicago", utah: "America/Denver",
  vermont: "America/New_York", virginia: "America/New_York", "west virginia": "America/New_York", wisconsin: "America/Chicago",
  wyoming: "America/Denver",
};

const US_STATE_CODES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut",
  DE: "delaware", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan",
  MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire",
  NJ: "new jersey", NM: "new mexico", NY: "new york state", NC: "north carolina", ND: "north dakota", OH: "ohio",
  OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WV: "west virginia", WI: "wisconsin", WY: "wyoming",
};

const CANADIAN_PROVINCES: Record<string, string> = {
  ontario: "America/Toronto", quebec: "America/Toronto", "british columbia": "America/Vancouver", alberta: "America/Edmonton",
  manitoba: "America/Winnipeg", "nova scotia": "America/Halifax", "new brunswick": "America/Moncton",
};

// Countries that sit in a single zone.
const COUNTRIES: Record<string, string> = {
  "united kingdom": "Europe/London", uk: "Europe/London", "great britain": "Europe/London", england: "Europe/London",
  scotland: "Europe/London", wales: "Europe/London", ireland: "Europe/Dublin", france: "Europe/Paris", germany: "Europe/Berlin",
  spain: "Europe/Madrid", italy: "Europe/Rome", netherlands: "Europe/Amsterdam", belgium: "Europe/Brussels",
  switzerland: "Europe/Zurich", austria: "Europe/Vienna", sweden: "Europe/Stockholm", norway: "Europe/Oslo",
  denmark: "Europe/Copenhagen", finland: "Europe/Helsinki", poland: "Europe/Warsaw", portugal: "Europe/Lisbon",
  greece: "Europe/Athens", "czech republic": "Europe/Prague", czechia: "Europe/Prague", turkey: "Europe/Istanbul",
  india: "Asia/Kolkata", singapore: "Asia/Singapore", japan: "Asia/Tokyo", "south korea": "Asia/Seoul",
  israel: "Asia/Jerusalem", uae: "Asia/Dubai", "united arab emirates": "Asia/Dubai", qatar: "Asia/Qatar",
  "saudi arabia": "Asia/Riyadh", philippines: "Asia/Manila", "hong kong": "Asia/Hong_Kong", china: "Asia/Shanghai",
  "new zealand": "Pacific/Auckland", "south africa": "Africa/Johannesburg", nigeria: "Africa/Lagos", kenya: "Africa/Nairobi",
  egypt: "Africa/Cairo", colombia: "America/Bogota", chile: "America/Santiago", argentina: "America/Argentina/Buenos_Aires",
};

const WORLDWIDE = /^(global|worldwide|anywhere|international|remote|no preference|europe|emea|apac|north america|latam|asia)$/i;

function tokens(location: string) {
  return location
    .split(/[,;/|()]+|\s-\s/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function timezoneForLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const trimmed = location.trim();
  if (!trimmed || WORLDWIDE.test(trimmed)) return null;

  const parts = tokens(trimmed);
  const lowered = parts.map((part) => part.toLowerCase());

  // Most specific first: a city beats its state, and a state beats its country.
  for (const part of lowered) {
    if (CITIES[part]) return CITIES[part];
  }
  for (const part of lowered) {
    if (CANADIAN_PROVINCES[part]) return CANADIAN_PROVINCES[part];
  }
  // Two-letter US state codes only count when written as capitals after a
  // city ("Austin, TX"), never a bare "in" or "or".
  for (const part of parts.slice(1)) {
    const state = US_STATE_CODES[part];
    if (state) return US_STATES[state];
  }
  for (const part of lowered) {
    if (US_STATES[part]) return US_STATES[part];
  }
  for (const part of lowered) {
    if (COUNTRIES[part]) return COUNTRIES[part];
  }
  return null;
}
