const FALLBACK_SITE_URL = "https://vranceflex.online";

function resolveSiteOrigin() {
  const configuredUrl = process.env.APP_BASE_URL?.trim();

  try {
    return new URL(configuredUrl || FALLBACK_SITE_URL).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export const SITE_NAME = "VranceFlex";
export const SITE_ORIGIN = resolveSiteOrigin();

export function absoluteSiteUrl(path = "/") {
  return new URL(path, `${SITE_ORIGIN}/`).toString();
}
