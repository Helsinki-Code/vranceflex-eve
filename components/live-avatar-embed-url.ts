export function normalizeLiveAvatarEmbedUrl(value?: string): string | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "embed.liveavatar.com" ||
      !url.pathname.startsWith("/v1/")
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
