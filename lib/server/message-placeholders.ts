// Drafted copy sometimes contains template slots the model never filled in
// ("[LINK]", "[First Name]", "{{company}}"). Sending one makes the whole
// sequence look automated, so they block approval and delivery.
const PLACEHOLDER_PATTERN = /\[(?:\s*(?:link|url|website|calendar|calendly|booking link|meeting link|name|first ?name|last ?name|company|company name|title|your name|sender|signature|insert[^\]]*))\s*\]|\{\{[^}]{1,40}\}\}|<(?:first_?name|company|link)>/gi;

export function findUnresolvedPlaceholders(...texts: Array<string | null | undefined>) {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) found.add(match[0]);
  }
  return [...found];
}
