export type PublicPageSection = {
  eyebrow?: string;
  title: string;
  body: string;
  points?: string[];
};

export type PublicPageLink = {
  href: string;
  label: string;
  description: string;
};

export type PublicPageRecord = {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  intro: string;
  answerTitle?: string;
  answer?: string;
  sources?: PublicPageLink[];
  sections: PublicPageSection[];
  related: PublicPageLink[];
};

export const productPages: PublicPageRecord[] = [
  {
    slug: "market-research",
    title: "Market and ICP research grounded in real evidence",
    eyebrow: "Product · Market research",
    description: "Turn a product URL or idea into an evidence-backed B2B market brief and ideal-customer profile with VranceFlex.",
    intro: "VranceFlex starts with the market, not a purchased list. It studies the offer, identifies plausible buying contexts, and turns that research into criteria the discovery workflow can actually use.",
    sections: [
      { title: "A useful brief before a single lead is selected", body: "Eve organizes the product, buyer, problem, geography, and buying-signal context into a durable campaign brief. That brief becomes the checkpoint for later discovery, verification, personalization, and review.", points: ["Start with a website or a clear product description", "Review the audience hypothesis before external work continues", "Keep the market brief attached to the campaign for later decisions"] },
      { title: "ICP criteria that can be tested", body: "An ICP is valuable only when it can separate a plausible buyer from a weak match. VranceFlex translates research into observable company and role criteria so candidates can be evaluated consistently.", points: ["Company profile and commercial context", "Relevant roles and decision-making responsibility", "Evidence and exclusions that explain why a lead fits"] },
      { title: "A resumable research workflow", body: "Campaign progress is persisted by stage. If a provider or model call stops, the user can resume from the last durable checkpoint instead of starting research from the beginning." },
    ],
    related: [
      { href: "/resources/guides/b2b-icp", label: "Build a practical B2B ICP", description: "Use the same evidence-first method before discovery begins." },
      { href: "/product/lead-verification", label: "Move from criteria to verified leads", description: "See how candidates become usable prospects." },
      { href: "/demo", label: "Walk through a sample campaign", description: "Explore the workflow without calling external providers." },
    ],
  },
  {
    slug: "lead-verification",
    title: "Verify B2B leads before outreach begins",
    eyebrow: "Product · Lead verification",
    description: "Discover and verify B2B prospects with usable contact information, source context, and transparent credit rules.",
    intro: "Discovery produces candidates. Verification determines whether they are usable. VranceFlex keeps those stages visible so a long list is never confused with a qualified outreach audience.",
    answerTitle: "What is B2B lead verification in VranceFlex?",
    answer: "B2B lead verification in VranceFlex is the stage that turns a discovered candidate into a prospect a team can responsibly review for outreach. Discovery first identifies a person who appears to match the campaign’s company and role criteria. Verification then checks the selected candidate for the usable work contact information required by the chosen channel. The interface keeps candidate, selected, processing, successful, and failed counts separate so list size is never presented as data quality. One verified-prospect credit is consumed only after the required usable contact information is successfully returned. A failed verification releases its credit reservation, and an idempotent candidate record prevents a retry from charging twice. The resulting lead retains role, company, channel, verification state, and available source context, allowing a person to include or exclude it before Eve prepares any outreach sequence.",
    sections: [
      { title: "Candidates first, verified prospects second", body: "The Parallel-powered workflow finds people that match the campaign criteria, then checks the selected candidates for usable work contact details. Users can inspect and choose candidates before deeper verification proceeds.", points: ["Review role, company, and discovery context", "Choose who should enter verification", "Keep unverified and verified counts separate"] },
      { title: "Credits follow successful outcomes", body: "One verified-prospect credit is consumed only when verification returns the required usable contact information. Failed verification attempts do not consume a customer credit, and idempotent reservations prevent retries from charging twice." },
      { title: "Evidence stays attached", body: "The lead workspace preserves verification state and available source context so reviewers can decide whether a prospect belongs in a campaign before approving outreach." },
    ],
    related: [
      { href: "/integrations/parallel", label: "How Parallel powers verification", description: "Review the discovery and enrichment handoff." },
      { href: "/resources/guides/lead-verification", label: "Lead-verification field guide", description: "Define usable data and review standards." },
      { href: "/pricing", label: "Understand verified-prospect credits", description: "Compare included balances and top-ups." },
    ],
  },
  {
    slug: "eve-personalization",
    title: "Personalized outreach prepared by Eve",
    eyebrow: "Product · Eve personalization",
    description: "Use durable campaign context and verified lead evidence to prepare relevant email and SMS drafts for human review.",
    intro: "Eve connects the campaign brief to each approved lead. It prepares channel-appropriate drafts from the information the workflow has actually gathered, while keeping generation separate from delivery.",
    sections: [
      { title: "Context travels with the campaign", body: "The market brief, ICP, verified contact record, and campaign controls become the inputs for personalization. Reviewers can judge a draft against the same source context used to create it." },
      { title: "Channel-aware, not channel-blind", body: "Email drafts are prepared only for verified email contacts, and SMS drafts only where a usable phone number and configured channel are available. A missing channel is not silently replaced by another." },
      { title: "Generation is never a send event", body: "A generated draft remains a draft. The sequence moves through review and explicit approval before any delivery job can use a connected provider.", points: ["Edit the message before approval", "Preview the planned cadence", "Keep approval history attached to the sequence"] },
    ],
    related: [
      { href: "/product/human-approval", label: "Review the approval boundary", description: "See what must happen before delivery." },
      { href: "/resources/guides/human-approved-outreach", label: "Design a reviewable workflow", description: "A practical guide to approvals and ownership." },
      { href: "/demo", label: "See Eve in the guided demo", description: "Follow a sample sequence from research to review." },
    ],
  },
  {
    slug: "human-approval",
    title: "Human approval remains the delivery boundary",
    eyebrow: "Product · Human approval",
    description: "Review, edit, approve, pause, or stop outreach while VranceFlex keeps automated preparation separate from external delivery.",
    intro: "VranceFlex automates preparation without removing accountability. Nothing is labeled sent until a permitted user approves it and a real connected provider confirms the delivery event.",
    answerTitle: "How does human approval work in VranceFlex?",
    answer: "Human approval in VranceFlex is a durable control between generated outreach and external delivery. Eve may research a market, organize verified leads, and prepare email or SMS drafts, but generation never creates permission to send. The campaign workspace keeps researching, enriching, drafting, awaiting approval, scheduled, and sent as separate states. A permitted workspace user can inspect the audience, edit or reject a sequence, approve eligible work, stop active processing, retry a failed stage, or resume from the last completed checkpoint. When approved work becomes due, the delivery worker still checks the recipient, suppression state, usable channel, workspace-owned provider connection, and organization daily cap. VranceFlex records sent state only after Resend or Twilio returns a real provider result. This makes the human decision, internal job state, and provider side effect independently visible instead of collapsing them into an ambiguous automation status.",
    sections: [
      { title: "A clear state between draft and sent", body: "Researching, enriching, drafting, awaiting approval, scheduled, and sent are separate durable states. The workspace shows the current stage, recent activity, and the action that can move work forward." },
      { title: "Controls for real operators", body: "Users can stop an active campaign, resume from its last checkpoint, retry a failed step, or pause a recurring schedule. Destructive and external actions require explicit confirmation.", points: ["Stop work without deleting campaign evidence", "Resume without repeating completed stages", "Pause schedules without losing approved sequences"] },
      { title: "Provider truth wins", body: "VranceFlex does not infer delivery from a model response or internal transition. A sequence is sent only when Resend or Twilio returns a real provider result." },
    ],
    related: [
      { href: "/trust/responsible-outreach", label: "Responsible outreach controls", description: "Read the operating principles behind suppression and approval." },
      { href: "/security", label: "Review the security model", description: "Understand workspace isolation and credential handling." },
      { href: "/resources/guides/human-approved-outreach", label: "Human-approved outreach guide", description: "Build a practical review policy for your team." },
    ],
  },
  {
    slug: "recurring-schedules",
    title: "Recurring outreach schedules without duplicate sends",
    eyebrow: "Product · Scheduling",
    description: "Run one-shot or recurring outreach on a real cadence with pause, resume, suppression, daily-cap, and idempotency safeguards.",
    intro: "Approved outreach can run once or repeat on a defined cadence. Eve dispatches due work every minute while the delivery layer protects external side effects from at-least-once scheduling retries.",
    answerTitle: "How do recurring outreach schedules avoid duplicate sends?",
    answer: "Recurring outreach scheduling in VranceFlex lets an approved campaign or sequence run on a defined minute- or day-based cadence while preserving the same controls used for one-shot delivery. Eve’s native dispatcher checks for due work every minute and may deliver a due signal more than once because the scheduling contract is at least once. VranceFlex therefore does not treat the dispatch signal itself as permission to call a provider. Each intended recipient, channel, and sequence step has a durable delivery-job identity. The delivery worker atomically claims that job before calling Resend or Twilio and stores the real provider result afterward, preventing a repeated dispatch from producing another external send. Every run also rechecks workspace credentials, suppression state, usable contact data, and the organization’s daily cap. Users can inspect the next run and pause or resume recurrence without deleting the approved sequence or changing existing one-shot behavior.",
    sections: [
      { title: "Cadence is an explicit campaign setting", body: "Keep a campaign one-shot, repeat it every configured number of minutes, or schedule a day-based interval such as weekly. The workspace shows the next run and lets users pause or resume the schedule." },
      { title: "At-least-once dispatch, exactly-once side effects", body: "A dispatcher may deliver the same due signal more than once. VranceFlex uses durable job identity and an atomic claim before calling Resend or Twilio so a retry cannot produce a second external send." },
      { title: "The same safety rules apply every time", body: "Recurring jobs pass through the existing delivery worker, so BYOK credentials, suppression checks, usable-channel requirements, and per-organization daily caps continue to apply." },
    ],
    related: [
      { href: "/resources/guides/recurring-outreach", label: "Plan a recurring campaign", description: "Choose a cadence and define safe operating controls." },
      { href: "/integrations/resend", label: "Connect email delivery", description: "Understand Resend sender requirements." },
      { href: "/integrations/twilio", label: "Connect SMS delivery", description: "Understand Twilio sender and segment behavior." },
    ],
  },
];

export const solutionPages: PublicPageRecord[] = [
  {
    slug: "founders",
    title: "Build an outbound motion before building a sales department",
    eyebrow: "Solutions · Founders",
    description: "VranceFlex helps founders and small teams research a market, verify prospects, and prepare outreach with full human control.",
    intro: "Founders need market feedback, not another complex sales stack. Start with the offer, produce a focused audience, and review real outreach without surrendering provider ownership or the send decision.",
    sections: [
      { title: "From product idea to testable audience", body: "Use a website or concise product description to create the first campaign brief and buyer hypothesis. The research is saved, so a failed or interrupted step does not erase what has already been learned." },
      { title: "Spend credits on usable prospects", body: "Review candidates before verification and consume credits only when the required usable contact information is successfully returned." },
      { title: "Stay close to the message", body: "Edit every generated sequence, approve only the prospects you want, and deliver through provider accounts your team owns." },
    ],
    related: [
      { href: "/product/market-research", label: "Research the market first", description: "Turn a product description into observable buyer criteria." },
      { href: "/pricing", label: "Compare Launch and Growth", description: "Choose a verified-prospect allowance for your stage." },
      { href: "/demo", label: "Try the guided product demo", description: "Explore the workflow with sample data." },
    ],
  },
  {
    slug: "agencies",
    title: "A controlled prospecting workspace for agency teams",
    eyebrow: "Solutions · Agencies",
    description: "Prepare verified outreach for client campaigns with review controls, provider ownership, and workspace separation.",
    intro: "Agencies need repeatable operations without mixing client credentials, approvals, or campaign context. VranceFlex keeps work scoped to the active workspace and makes the approval boundary visible.",
    sections: [
      { title: "Separate context and providers", body: "Each workspace owns its campaign data and connected Resend or Twilio credentials. Delivery does not fall back to a shared VranceFlex account." },
      { title: "A repeatable client review loop", body: "Research, candidates, verified contacts, generated sequences, and approval history remain attached to the campaign so the team can explain what happened and what needs a decision." },
      { title: "Recurring work without hidden automation", body: "Create a defined recurrence, inspect the next run, and pause or resume it without deleting approved sequences. Daily caps and suppression checks remain active for each run." },
    ],
    related: [
      { href: "/product/recurring-schedules", label: "Review recurring scheduling", description: "See how cadence and delivery idempotency work." },
      { href: "/integrations", label: "Understand provider ownership", description: "Review the BYOK integration model." },
      { href: "/contact", label: "Discuss an Agency workspace", description: "Choose a sales-assisted evaluation path." },
    ],
  },
  {
    slug: "revenue-operations",
    title: "Give revenue operations a visible, governable outreach pipeline",
    eyebrow: "Solutions · Revenue operations",
    description: "Coordinate research, verification, approvals, recurring schedules, and provider delivery in one durable workflow.",
    intro: "Revenue operations teams need consistency across people and campaigns. VranceFlex separates workflow stages, preserves activity history, and applies organizational controls before external delivery.",
    sections: [
      { title: "One operational vocabulary", body: "Campaigns move through explicit research, enrichment, drafting, approval, scheduling, and delivery states. The current stage and possible recovery action are visible to operators." },
      { title: "Controls at the organization boundary", body: "Workspace membership, plan entitlements, credit balances, suppression state, and daily delivery caps are checked in the server-side workflow rather than trusted from the browser." },
      { title: "Recover without repeating cost", body: "Durable checkpoints let a user resume unfinished work. Credit reservations and delivery claims are idempotent so retries do not double-charge or double-send." },
    ],
    related: [
      { href: "/product/human-approval", label: "Inspect approval controls", description: "See how preparation and delivery remain separate." },
      { href: "/security", label: "Review security and isolation", description: "Understand workspace-scoped operations." },
      { href: "/contact", label: "Plan a governed rollout", description: "Discuss team requirements and support." },
    ],
  },
];

export const integrationPages: PublicPageRecord[] = [
  {
    slug: "parallel",
    title: "Parallel-powered lead discovery and verification",
    eyebrow: "Integrations · Parallel",
    description: "Use Parallel entity search and enrichment inside a reviewable VranceFlex lead workflow.",
    intro: "VranceFlex uses Parallel for live candidate discovery and selected-contact verification. The interface keeps discovery results, verification progress, and usable outcomes distinct.",
    sources: [
      { href: "https://docs.parallel.ai/", label: "Parallel documentation", description: "Official provider documentation for entity search and enrichment." },
    ],
    sections: [
      { title: "How the handoff works", body: "The campaign brief becomes the discovery objective. Parallel returns candidate people, users choose who to verify, and enrichment proceeds in the background while successful results appear incrementally.", points: ["Discovery objective comes from the approved campaign context", "Candidate selection happens before deeper verification", "Progress persists while enrichment continues"] },
      { title: "Billing follows usable verification", body: "VranceFlex reserves credit capacity before external work and consumes one credit only for a successful usable verification. A failed result releases its reservation, and the same candidate cannot be charged twice." },
      { title: "Operational limits", body: "Discovery is subject to plan entitlements and fair-use controls. Provider availability and returned public information vary, so a discovery match is not represented as a guaranteed email address or phone number." },
    ],
    related: [
      { href: "/product/lead-verification", label: "Lead verification in VranceFlex", description: "See how usable results enter campaign review." },
      { href: "/resources/guides/lead-verification", label: "Define a verification standard", description: "Decide what your team considers usable." },
      { href: "/pricing", label: "Review credit allowances", description: "Compare included verified prospects and top-ups." },
    ],
  },
  {
    slug: "resend",
    title: "Send approved email through your own Resend account",
    eyebrow: "Integrations · Resend",
    description: "Connect Resend per workspace, verify your sender identity, and deliver only approved VranceFlex email jobs.",
    intro: "Email delivery remains in infrastructure you own. VranceFlex stores the workspace connection securely, validates it when configured, and calls Resend only after approval and delivery-worker checks pass.",
    sources: [
      { href: "https://resend.com/docs", label: "Resend documentation", description: "Official guidance for API keys, domains, senders, and email delivery." },
    ],
    sections: [
      { title: "Setup requirements", body: "Create a Resend API key, verify the domain or sender identity used for outreach, and connect both values in workspace settings. A test connection should succeed before any email job becomes eligible." },
      { title: "What happens at send time", body: "The delivery worker re-checks the recipient, suppression state, organizational daily cap, and connected credential before making the provider call. The resulting provider identifier is persisted with the job." },
      { title: "Limitations and ownership", body: "Resend subscription charges, domain configuration, reputation, bounces, and provider limits belong to the connected account. VranceFlex does not silently substitute a shared provider if the connection is missing or degraded." },
    ],
    related: [
      { href: "/resources/guides/byok-delivery", label: "BYOK delivery guide", description: "Prepare provider accounts and operating responsibilities." },
      { href: "/trust/provider-ownership", label: "Why provider ownership matters", description: "Understand the boundary between orchestration and delivery." },
      { href: "/product/recurring-schedules", label: "Schedule approved email safely", description: "Review recurring dispatch and duplicate protection." },
    ],
  },
  {
    slug: "twilio",
    title: "Deliver approved SMS through your own Twilio account",
    eyebrow: "Integrations · Twilio",
    description: "Connect Twilio per workspace and keep sender configuration, messaging charges, compliance, and delivery ownership in your account.",
    intro: "VranceFlex prepares SMS only when the lead has a usable phone number and the workspace has an eligible Twilio connection. Delivery still passes through approval, suppression, and cap checks.",
    sources: [
      { href: "https://www.twilio.com/docs/messaging", label: "Twilio Messaging documentation", description: "Official guidance for senders, messaging, delivery, and regional requirements." },
    ],
    sections: [
      { title: "Setup requirements", body: "Connect the Twilio account credentials and an eligible sender in workspace settings. Sender type, registration, geographic reach, and regulatory requirements depend on the countries and message traffic involved." },
      { title: "Message and recipient checks", body: "Before the provider call, VranceFlex confirms the approved job, usable phone number, suppression state, organization cap, and durable delivery claim. A missing SMS channel is not replaced with email." },
      { title: "Costs and limitations", body: "Twilio usage, carrier fees, message segments, sender registration, opt-out obligations, and account limits remain the customer's responsibility. Provider responses are recorded so the workspace reflects real delivery state." },
    ],
    related: [
      { href: "/resources/guides/byok-delivery", label: "Prepare BYOK delivery", description: "Review email and SMS ownership before launch." },
      { href: "/trust/responsible-outreach", label: "Operate SMS responsibly", description: "Use suppression and approval controls consistently." },
      { href: "/product/human-approval", label: "See the approval boundary", description: "Understand what must happen before an SMS job runs." },
    ],
  },
];

export const trustPages: PublicPageRecord[] = [
  {
    slug: "responsible-outreach",
    title: "Responsible outreach is a workflow requirement",
    eyebrow: "Trust · Responsible outreach",
    description: "Use human approval, suppression, channel validation, daily caps, and clear ownership to operate B2B outreach responsibly.",
    intro: "Good outreach is relevant, reviewable, and stoppable. VranceFlex builds those expectations into the campaign workflow instead of treating them as an optional checklist after messages are generated.",
    sections: [
      { title: "Approve the audience and the message", body: "A candidate can be excluded before verification, a verified lead can be excluded before generation, and a generated sequence can be edited or rejected before delivery." },
      { title: "Respect suppression and limits", body: "Suppressed recipients are checked by the delivery worker. Per-organization daily caps bound eligible delivery, including work produced by recurring schedules." },
      { title: "Keep a real stop control", body: "Operators can stop active campaign processing and pause recurring schedules. A stopped workflow retains durable evidence and can resume from its last safe checkpoint when appropriate." },
    ],
    related: [
      { href: "/product/human-approval", label: "Human approval controls", description: "Review the campaign decision points." },
      { href: "/product/recurring-schedules", label: "Safe recurring schedules", description: "See how controls persist across scheduled runs." },
      { href: "/security", label: "Security model", description: "Review workspace and credential boundaries." },
    ],
  },
  {
    slug: "provider-ownership",
    title: "Your delivery providers stay yours",
    eyebrow: "Trust · Provider ownership",
    description: "Understand VranceFlex's bring-your-own-key model for Resend email and Twilio SMS delivery.",
    intro: "VranceFlex coordinates approved work; it does not hide delivery behind a shared sending pool. Each workspace connects the provider account, sender identity, and commercial relationship it intends to use.",
    sections: [
      { title: "A clean responsibility boundary", body: "VranceFlex owns orchestration, approval state, scheduling, suppression checks, and delivery-job records. The customer owns the provider account, sender configuration, domain or phone reputation, usage charges, and applicable messaging obligations." },
      { title: "No silent fallback", body: "If a workspace has no valid provider connection, the job cannot be sent through a VranceFlex account instead. The workspace receives an actionable configuration or provider error." },
      { title: "Truthful delivery state", body: "A draft is not a send, and a scheduled job is not a send. VranceFlex records sent state only after a real Resend or Twilio response is available." },
    ],
    related: [
      { href: "/integrations/resend", label: "Connect Resend", description: "Review email setup and limitations." },
      { href: "/integrations/twilio", label: "Connect Twilio", description: "Review SMS setup and responsibilities." },
      { href: "/resources/guides/byok-delivery", label: "BYOK readiness guide", description: "Prepare both providers for controlled delivery." },
    ],
  },
];

export const guidePages: PublicPageRecord[] = [
  {
    slug: "b2b-icp",
    title: "How to build an evidence-backed B2B ICP",
    eyebrow: "Guide · Market strategy",
    description: "Build a B2B ideal-customer profile from buying context, observable criteria, evidence, and exclusions—not a vague persona.",
    intro: "A useful ICP helps a research system decide who belongs in a campaign. It describes conditions you can observe and defend, not personality traits you cannot verify.",
    sections: [
      { title: "1. Start with the buying problem", body: "Write the operational problem, its cost, the moment it becomes urgent, and the outcome your product can credibly create. Keep this separate from demographic assumptions." },
      { title: "2. Define observable company criteria", body: "Choose company type, operating model, size or complexity signals, technology context, geography, and exclusions that can be checked during discovery." },
      { title: "3. Map roles to the decision", body: "Separate the person who feels the problem, the person who evaluates a solution, and the person who controls budget or risk. One title rarely covers every buying role." },
      { title: "4. Test the profile against real candidates", body: "Review discovery evidence, remove criteria that do not improve fit, and record why promising candidates were excluded. A durable campaign brief should improve with evidence." },
    ],
    related: [
      { href: "/product/market-research", label: "Market and ICP research", description: "See how VranceFlex turns the brief into campaign context." },
      { href: "/resources/guides/lead-verification", label: "Verify the resulting audience", description: "Define what makes a discovered person usable." },
      { href: "/demo", label: "Explore a sample workflow", description: "See research and approval with sample data." },
    ],
  },
  {
    slug: "lead-verification",
    title: "How to verify B2B leads before outreach",
    eyebrow: "Guide · Data quality",
    description: "Create a practical B2B lead-verification standard for identity, role, company fit, and usable contact channels.",
    intro: "Verification is not a single green check. It is a decision about whether the evidence is strong enough for the next action your campaign intends to take.",
    sections: [
      { title: "Separate discovery from verification", body: "A discovery match may fit the ICP while lacking a usable contact channel. Keep candidate count, selected count, verification progress, and verified count distinct." },
      { title: "Define usable by channel", body: "For email, require an appropriate work address and sender policy. For SMS, require a usable phone number plus a lawful and operational basis for the message. Do not infer one from the other." },
      { title: "Preserve source and confidence context", body: "Keep the role, company, source notes, and missing fields available to reviewers. A reviewer should be able to understand why a lead was included." },
      { title: "Make retries idempotent", body: "Reserve capacity before external verification, consume the credit once on success, and release the reservation on failure. Replaying the same candidate must not create another charge." },
    ],
    related: [
      { href: "/product/lead-verification", label: "VranceFlex lead verification", description: "Review the product workflow and credit behavior." },
      { href: "/integrations/parallel", label: "Parallel integration", description: "Understand the discovery and enrichment handoff." },
      { href: "/pricing", label: "Verified-prospect pricing", description: "Compare included credits and top-ups." },
    ],
  },
  {
    slug: "human-approved-outreach",
    title: "How to design a human-approved outreach workflow",
    eyebrow: "Guide · Governance",
    description: "Define campaign roles, approval gates, editing rules, stop controls, and provider confirmation for responsible outreach.",
    intro: "Human approval is meaningful only when the system makes the decision explicit, records it durably, and prevents every alternate path from bypassing it.",
    sections: [
      { title: "Define who may decide", body: "Separate people who can prepare campaigns from people who can approve external delivery. Keep workspace membership and role decisions server-side." },
      { title: "Make draft, approval, and send distinct", body: "Generation should produce reviewable artifacts. Approval should record a decision. Delivery should require both that decision and a real provider connection." },
      { title: "Design rejection and recovery paths", body: "A reviewer needs to edit, reject, retry a failed step, stop active processing, and resume from a safe checkpoint without destroying the audit context." },
      { title: "Let provider confirmation close the loop", body: "Do not label work sent because it entered a queue. Persist the provider result and expose actionable failures when the provider rejects a request." },
    ],
    related: [
      { href: "/product/human-approval", label: "Human approval in VranceFlex", description: "Review the product controls and states." },
      { href: "/trust/responsible-outreach", label: "Responsible outreach principles", description: "Connect approval to suppression and limits." },
      { href: "/security", label: "Workspace security", description: "Understand how permissions and credentials are bounded." },
    ],
  },
  {
    slug: "recurring-outreach",
    title: "How to run recurring outreach without losing control",
    eyebrow: "Guide · Scheduling",
    description: "Choose a recurring outreach cadence, preserve approval, and protect external delivery from duplicate scheduler dispatches.",
    intro: "Recurring outreach should repeat an approved operating process—not create an invisible autopilot. The cadence, next run, controls, and delivery safeguards should remain visible.",
    sections: [
      { title: "Choose a cadence tied to audience change", body: "Weekly or longer intervals fit many market-refresh workflows. Minute-based recurrence is useful for testing and tightly controlled operations, not a reason to contact the same audience repeatedly." },
      { title: "Define what repeats", body: "Be explicit about whether the run discovers a fresh audience, prepares a new sequence, or schedules already-approved jobs. Preserve campaign and delivery identifiers across retries." },
      { title: "Protect side effects", body: "At-least-once dispatch means a due event can reappear. Atomically claim each delivery job and store the provider result so repeated dispatch cannot call Resend or Twilio twice." },
      { title: "Keep pause, resume, and limits visible", body: "Show the next run, allow the schedule to pause without deletion, and apply suppression and daily-cap checks on every execution." },
    ],
    related: [
      { href: "/product/recurring-schedules", label: "Recurring schedules in VranceFlex", description: "See how Eve dispatch and delivery safeguards work." },
      { href: "/resources/guides/human-approved-outreach", label: "Preserve human approval", description: "Build the decision boundary first." },
      { href: "/pricing", label: "Plan recurring capacity", description: "Estimate verified-prospect usage before launch." },
    ],
  },
  {
    slug: "byok-delivery",
    title: "A practical guide to BYOK email and SMS delivery",
    eyebrow: "Guide · Integrations",
    description: "Prepare Resend and Twilio for controlled outreach while keeping credentials, senders, charges, and reputation in accounts you own.",
    intro: "Bring-your-own-key delivery gives the customer a clean provider relationship and gives the orchestration layer a clear boundary. It also means setup, reputation, and provider obligations cannot be ignored.",
    sections: [
      { title: "Prepare the provider account", body: "For email, verify the sending domain or identity and protect the API key. For SMS, configure an eligible sender and complete any required registration for the traffic and destination." },
      { title: "Connect at the workspace boundary", body: "Store credentials for the intended workspace, validate them when saved, and avoid sharing keys across unrelated clients or operating teams." },
      { title: "Test before campaign approval", body: "Confirm connection health, sender identity, channel availability, and provider limits before scheduling work. A connection test is not the same as an outreach send." },
      { title: "Own the ongoing signals", body: "Monitor provider usage, bounces, complaints, opt-outs, carrier fees, message segments, and reputation. VranceFlex can enforce campaign controls, but the customer remains the provider account owner." },
    ],
    related: [
      { href: "/integrations/resend", label: "Resend email integration", description: "Review setup, delivery checks, and limitations." },
      { href: "/integrations/twilio", label: "Twilio SMS integration", description: "Review sender, segment, and compliance responsibilities." },
      { href: "/trust/provider-ownership", label: "Provider ownership model", description: "Understand why VranceFlex has no shared fallback." },
    ],
  },
];

export function findPublicPage(collection: PublicPageRecord[], slug: string) {
  return collection.find((page) => page.slug === slug);
}
