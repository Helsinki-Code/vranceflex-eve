# VranceFlex

VranceFlex is a multi-agent B2B outreach platform: give it a product website or
idea, and it researches the market, builds ideal-customer profiles, finds and
verifies leads, drafts a multi-channel outreach sequence, and — once a human
approves it — schedules and delivers real email (and, when configured, SMS)
outreach with reply handling and suppression built in.

Stack: Next.js 15 (App Router) + the [eve](https://eve.dev/docs) agent
framework, Drizzle ORM on PostgreSQL, [Resend](https://resend.com) for email,
[Twilio](https://www.twilio.com) for SMS, [Stripe](https://stripe.com) for
billing, deployed on Vercel.

**Outreach sending is BYOK (bring-your-own-key), strict, per workspace.** Every
client organization connects its *own* Resend account (for email) and Twilio
account (for SMS) from Settings → Integrations before it can schedule anything
on that channel — there is no shared/platform fallback for outreach, and
scheduling is blocked with a clear error until a workspace connects. The
platform's own `RESEND_API_KEY` is used **only** for auth OTPs and team-invite
email, never for a client's outreach.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the values described below
npm run db:generate          # only needed after changing lib/server/database/schema.ts
npm run db:migrate           # applies drizzle/*.sql against DATABASE_URL
npm run dev
```

`npm run typecheck` and `npm test` should both pass before opening a PR.

## Environment variables

`.env.example` is the source of truth for what to set, with inline comments.
`lib/server/integration-status.ts` is the runtime source of truth for what the
app considers *required* vs *optional* — check it if `.env.example` and this
table ever disagree.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection for all durable persistence. |
| `AUTH_SECRET` | Yes | ≥32 chars. Signs session tokens and OTP hashes. Rotating it invalidates outstanding OTPs. |
| `CREDENTIALS_ENCRYPTION_KEY` | Yes | 32-byte, base64url-encoded AES-256-GCM key. Encrypts each client workspace's connected Resend/Twilio credentials at rest (`lib/server/credential-crypto.ts`). **Never reuse `AUTH_SECRET`** — a different secret class, should rotate independently. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Yes | **Platform account only** — signup/reset OTP delivery and team-invite email. Never used for a client's outreach. |
| `CRON_SECRET` | Yes (prod) | Bearer token Vercel Cron sends to `/api/cron/delivery`. |
| `APP_BASE_URL` | Yes for unsubscribe/billing links | Public base URL used to build outreach unsubscribe links, Stripe checkout redirects, and team-invite links. |
| `COMPANY_MAILING_ADDRESS` | Recommended | Physical address included in outreach email footers (CAN-SPAM). |
| `PARALLEL_API_KEY` | Yes | Lead research/enrichment via Parallel, used by the `lead-researcher` subagent. |
| `AI_GATEWAY_API_KEY` | Yes (or Vercel OIDC) | Model access for the eve agent. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO` | Optional | Billing scaffolding — see below. Unrelated to outreach BYOK; this is the platform's own Stripe account for charging clients. |
| `VRANCEFLEX_DEMO_MODE` | Optional | Forces the in-memory demo/auth-bypass mode even outside local dev. Never set `true` in a real deployment. |

Each client workspace's own Resend and Twilio credentials are **not** environment
variables — they're connected per-organization from `/settings/integrations`,
validated against the provider's API on save, and stored encrypted in the
`organization_channel_credentials` table (see `lib/server/channel-credentials.ts`).

## Scripts

- `npm run dev` — start the Next.js dev server.
- `npm run build` — `eve build && next build`, the production build used by Vercel.
- `npm run typecheck` — `tsc`, no emit.
- `npm test` / `npm run test:watch` — Vitest. Pure-logic suites (e.g.
  `lib/server/reply-classifier.test.ts`) always run. DB-backed suites
  (`auth-store.test.ts`, `delivery-worker.test.ts`, and the `app/api/**/route.test.ts`
  files) are skipped automatically unless `TEST_DATABASE_URL` is set — see
  `.env.test.example` for how to point them at a disposable Postgres database.
  **Never point `TEST_DATABASE_URL` at this app's real dev/production database** —
  the suites truncate tables between tests.
- `npm run db:generate` — generate a new Drizzle migration from schema changes.
- `npm run db:migrate` — apply pending migrations.

## Architecture pointers

- **Agent orchestration**: `agent/instructions.md` describes the root orchestrator
  and its five subagents (`lead-researcher`, `outreach-sequence`, `email-outreach`,
  `sms-outreach`, `reply-monitor`). `AGENTS.md` points at the installed eve
  package docs for framework reference.
- **Database schema**: `lib/server/database/schema.ts` is the single source of
  truth for every table; migrations in `drizzle/` are generated from it, never
  hand-written.
- **Campaign pipeline**: campaign creation and agent-driven research/drafting
  is durable and idempotent — see `lib/server/campaign-execution.ts` and
  `lib/server/pipeline-store.ts`.
- **Scheduling and delivery**: `lib/server/scheduling-store.ts` converts an
  approved sequence into `delivery_jobs` — but only after confirming the
  workspace has connected the relevant channel (`lib/server/channel-credentials.ts`).
  `lib/server/delivery-worker.ts` is the worker (driven by Vercel Cron via
  `app/api/cron/delivery`) that claims jobs, enforces per-org daily send caps
  and suppression, resolves that org's own connected credentials, and dispatches
  through `lib/server/outreach-email.ts` (Resend) or `lib/server/outreach-sms.ts`
  (Twilio).
- **Client-connected channels (BYOK)**: `lib/server/channel-credentials.ts`
  validates a client's Resend/Twilio credentials against the provider's API,
  encrypts them (`lib/server/credential-crypto.ts`), and stores one row per
  `(organization, provider)` in `organization_channel_credentials`. The connect
  UI lives on `/settings/integrations` (`components/channel-connections-panel.tsx`).
- **Inbound replies**: since each client has their own Resend account, each
  workspace gets its own webhook URL —
  `app/api/webhooks/resend/[organizationId]/route.ts` looks up that org's
  stored webhook secret, verifies the signature, and hands off to
  `lib/server/reply-store.ts`, which classifies the reply
  (`lib/server/reply-classifier.ts`) and pauses/suppresses as needed.
- **Auth**: `lib/server/auth-store.ts` implements signup/OTP/sign-in/reset
  (always via the platform Resend account); `lib/server/team-store.ts`
  implements org invites on top of the same organization/membership tables.

## What's scaffolded vs. production-ready

- **Email delivery, scheduling, replies, suppression**: production-ready —
  real per-workspace Resend integration, retries, daily caps, CAN-SPAM
  unsubscribe headers/links. Requires the workspace to connect its own Resend
  account first (strict BYOK, no shared fallback).
- **SMS delivery**: production-ready once a workspace connects its own Twilio
  account from `/settings/integrations`. Until then, SMS sequences can be
  drafted but scheduling is blocked with a clear error.
- **Team invites**: production-ready — email invite, accept flow, role
  management, admin-gated in the UI and API.
- **Billing**: scaffolding only. Checkout, the billing portal, and webhook
  handling are fully wired against Stripe's API, but `STRIPE_PRICE_ID_PRO` is a
  placeholder — replace it with a real Stripe Price ID (and set
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`) before accepting real payments.
  Until configured, the billing page shows "setup mode" and disables checkout.
