const replyAddressPattern =
  /^reply\+([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})@/i;

export function getReplyToAddress(messageId: string, replyDomain: string | null | undefined) {
  const domain = replyDomain?.trim().toLowerCase();
  if (!domain || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
    return undefined;
  }
  return `reply+${messageId}@${domain}`;
}

export function messageIdFromRecipients(recipients: string[]) {
  for (const recipient of recipients) {
    const address = recipient.match(/<([^>]+)>/)?.[1] ?? recipient;
    const match = address.trim().match(replyAddressPattern);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

export function normalizeEmailAddress(value: string) {
  const address = value.match(/<([^>]+)>/)?.[1] ?? value;
  return address.trim().toLowerCase();
}
