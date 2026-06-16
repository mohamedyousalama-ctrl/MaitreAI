# MaitreAI — موظف واتساب الذكي للمطاعم

**WhatsApp-first AI ordering + operations assistant for restaurants.** Egypt-first
(Egyptian Arabic primary, Saudi supported per-tenant). A customer chats on WhatsApp
with a per-tenant host agent that takes the order end-to-end; restaurant staff run
everything from an Arabic RTL operator web app.

> **AI coding tools:** read [`AGENTS.md`](./AGENTS.md) first — it's the contract
> (rules, how to run, architecture, file map).

## Stack (real integrations — not mocks)

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind** (Arabic RTL).
- **Supabase** — Postgres + Auth (email/phone OTP) + Row-Level Security; the
  service-role client is used server-side for the webhook and seeding.
- **Claude (Anthropic)** — the customer agent (`claude-sonnet-4-6`) runs a
  tool-calling loop; the operator/admin NL parser uses `claude-opus-4-8`. Both are
  env-overridable. A deterministic **mock adapter** runs when no key is set.
- **WhatsApp Cloud API** — real inbound webhook + outbound send (text, interactive
  buttons/lists, image receipts, templates), 24h-window aware.
- **Speech-to-text seam** — `mock | openai | groq` adapters for WhatsApp voice notes.
- **Receipt/ticket PNGs** — `@resvg/resvg-js` over hand-built SVG (correct Arabic shaping).
- **Zustand** stores back the operator UI; **demo mode** (no keys) uses localStorage.

> The app degrades gracefully: with no Supabase/Claude/WhatsApp keys it runs in
> **demo/mock mode** (localStorage data, deterministic replies, nothing sent over
> the network) so the UI is fully explorable without secrets.

## Quick start

```bash
npm install
cp .env.example .env.local      # fill in what you need (all optional for demo mode)
npm run dev                     # http://localhost:3000
```

Build & checks (must pass before committing):

```bash
npm run build
npx tsc --noEmit
npm run lint
```

## How it works (customer flow)

```
WhatsApp message
  → POST /api/whatsapp/webhook   (signature-verified; normalized; persisted idempotently)
  → respondAndSendWhatsApp       (skips if a human owns the thread)
      • TAP (button/list)  → tap router acts on the stable ID — no LLM call
      • free text          → Claude tool-calling agent
  → persistent order session     (the order survives across messages)
  → order tools                  (validate items/zones; COMPUTE all money)
  → reply sent over WhatsApp; on finalize → real order row + auto receipt
  → operator sees it live in المحادثات
```

The operator app (`app/(main)/*`) covers conversations, orders, menu & memory,
and settings. Roles: **manager** (full) vs **operation** (reduced nav, no revenue).

## Project structure

```
app/
  (main)/            operator web app: conversations, orders, menu, settings, dashboard
  api/
    whatsapp/webhook customer WhatsApp webhook (canonical path)
    agent/respond    secret-guarded Brain entry (used by the eval harness)
    agent/admin      operator/admin NL agent (session-auth, manager-gated writes)
    ...              settings, orders, payments, channels endpoints
  checkout/          payment checkout pages
  login/ onboarding/ auth
lib/
  ai/                respond loop, tools (money), tap-router, prompt, customer-turn
    llm/ stt/        LLM + speech adapter seams (claude/mock, openai/groq/mock)
  db/                brain, order-session, orders, messages, restaurants, tenant
  messaging/         WhatsApp adapters, outbound send, inbound→Brain bridge, voice, receipts
  render/            receipt/ticket/promo PNG rendering
  feature-flags.ts   ENABLE_ADMIN_CHAT_CONSOLE (+ HOME_HREF)
supabase/migrations/ additive SQL migrations (apply via scripts/db-apply.mjs)
scripts/             db-apply, eval-scenarios, proof-* and test-* harnesses
docs/                ARCHITECTURE.md, CONVENTIONS.md, WHATSAPP_GO_LIVE.md
reports/             eval reports + acceptance notes
```

## Environment

See [`.env.example`](./.env.example) for every variable the app reads (names +
one-line descriptions; **no secret values are ever committed**). Key groups:
Supabase, Claude/`ANTHROPIC_API_KEY`, WhatsApp Cloud API, STT, the
`AGENT_ROUTE_SECRET`, and feature flags.

## Migrations & eval

- **Migrations:** `node scripts/db-apply.mjs supabase/migrations/00NN_name.sql`
  (Management API; needs `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`).
- **Conformance/safety eval:** `BASE_URL=http://127.0.0.1:3000 node scripts/eval-scenarios.mjs`
  → writes `reports/eval-<date>.md`. The **Egyptian T1 safety scenarios must stay
  green** before merging changes to prices/money/menu/agent behavior. Restore the
  pilot `dialect` to `egyptian` after any run.

## Branch & deploy

`main` is production (**maitre.chat**, on Vercel). Develop on a feature branch and
open a **draft PR**; never push to `main`. WhatsApp go-live steps are in
[`docs/WHATSAPP_GO_LIVE.md`](./docs/WHATSAPP_GO_LIVE.md).
