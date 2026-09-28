// In-memory replies for demo mode (no DATABASE_URL). Mirrors the shape of
// listInboundReplies so the inbox renders without a database.
const now = Date.now();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000);

function reply(input: { id: string; minutes: number; subject: string; text: string; intent: "HOT" | "WARM" | "OBJECTION" | "OUT_OF_OFFICE" | "UNSUBSCRIBE"; confidence: string; reasoning: string; nextAction: string; actionDetail: string; suggestedResponse: string | null; flag: boolean; flagReason?: string; status?: "classified" | "reviewed" }) {
  return {
    id: input.id,
    organizationId: "demo-organization",
    campaignId: "demo-campaign",
    leadId: `lead-${input.id}`,
    messageId: null,
    providerEventId: null,
    providerReplyId: input.id,
    fromEmail: "demo@example.com",
    subject: input.subject,
    text: input.text,
    intent: input.intent,
    sentimentScore: null,
    confidence: input.confidence,
    reasoning: input.reasoning,
    nextAction: input.nextAction,
    actionDetail: input.actionDetail,
    suggestedResponse: input.suggestedResponse,
    flagForHuman: input.flag,
    flagReason: input.flagReason ?? null,
    status: (input.status ?? "classified") as "classified" | "reviewed" | "archived",
    receivedAt: minutesAgo(input.minutes),
    createdAt: minutesAgo(input.minutes),
    updatedAt: minutesAgo(input.minutes),
  };
}

export const demoReplies = [
  { reply: reply({ id: "demo-reply-1", minutes: 14, subject: "Re: Cutting month-end close for Northstar", text: "This is timely — we're re-evaluating our reconciliation tooling before Q4. Could you do Thursday at 10:00 CET? Loop in Pieter from finance ops as well.", intent: "HOT", confidence: "high", reasoning: "Asks for a specific meeting time and adds a second stakeholder.", nextAction: "book_meeting", actionDetail: "Confirm Thursday 10:00 CET and invite Pieter.", suggestedResponse: "Thursday at 10:00 CET works. I'll send an invite to you and Pieter with a 25-minute agenda covering your current close timeline.", flag: true, flagReason: "Meeting request" }), leadName: "Elena Visser", companyName: "Northstar Cloud", campaignName: "Finance ops automation · EU" },
  { reply: reply({ id: "demo-reply-2", minutes: 95, subject: "Re: Orbit Ledger + usage-based billing", text: "Interesting, but we signed a two-year contract with our current vendor in March. Maybe revisit early next year?", intent: "OBJECTION", confidence: "medium", reasoning: "Timing objection tied to an existing contract, with an opening for later.", nextAction: "nurture", actionDetail: "Set a reminder for January and stop the current sequence.", suggestedResponse: "Understood — thanks for the context. I'll check back in January before your renewal planning starts.", flag: true, flagReason: "Objection" }), leadName: "Marcus Reed", companyName: "Orbit Ledger", campaignName: "Fintech RevOps · UK" },
  { reply: reply({ id: "demo-reply-3", minutes: 260, subject: "Re: Kiteframe demand-gen pipeline", text: "Send over a short deck and pricing for a 5-seat team and I'll share it internally.", intent: "WARM", confidence: "high", reasoning: "Requests materials and pricing for an internal review.", nextAction: "send_info", actionDetail: "Share the deck and Growth pricing for 5 seats.", suggestedResponse: null, flag: false }), leadName: "Sofia Klein", companyName: "Kiteframe", campaignName: "Developer tools · DACH" },
  { reply: reply({ id: "demo-reply-4", minutes: 1500, subject: "Automatic reply: Out of office", text: "I'm away until 6 October with limited access to email.", intent: "OUT_OF_OFFICE", confidence: "high", reasoning: "Auto-responder with a return date.", nextAction: "wait", actionDetail: "Resume the sequence after 6 October.", suggestedResponse: null, flag: false, status: "reviewed" }), leadName: "Jonas Lind", companyName: "Cedar Metrics", campaignName: "Analytics founders · Nordics" },
  { reply: reply({ id: "demo-reply-5", minutes: 3000, subject: "Re: Harbor Stack", text: "Please remove me from your list.", intent: "UNSUBSCRIBE", confidence: "high", reasoning: "Explicit removal request.", nextAction: "suppress", actionDetail: "Lead suppressed automatically.", suggestedResponse: null, flag: false, status: "reviewed" }), leadName: "Miguel Costa", companyName: "Harbor Stack", campaignName: "Developer tools · Iberia" },
];
