# Kivo — Restaurant Direct Commerce OS

> **WhatsApp-first AI ordering for restaurants — own your customers, not just your channel.**

Kivo gives restaurants a delivery-app-quality ordering experience inside their own WhatsApp number, without giving away margin on every order.

**Production domain:** [getkivo.io](https://getkivo.io)  
**Status:** Pre-pilot — real backend, real agent/safety infrastructure, first commercial milestone in progress  
**First milestone:** Launch Wesaya Fried Chicken with V1 Kivo

---

## What Kivo is

Restaurants lose margin and customer ownership to delivery platforms. Kivo is the alternative:

```
Delivery apps = customer acquisition channel
Kivo          = customer ownership + repeat order + direct delivery control layer
```

The product starts with WhatsApp AI ordering (the wedge) and grows into a full Restaurant Direct Commerce OS: ordering, delivery, customer retention, and intelligence in one system.

---

## What is real now ✅

| Feature | Status |
|---|---|
| Supabase multi-tenant backend | Real (RLS + migrations) |
| WhatsApp Cloud API webhook (receive/send) | Real (per-tenant, signature-verified) |
| AI ordering agent (كريم / Karim) | Real (Claude claude-sonnet-4-6, tool-grounded) |
| Deterministic allergen safety gate | Real (code gate, not prompt-luck; flag-gated on/off) |
| Allergen symptom detection (v4) | Real (merged, UNCONDITIONAL — no flag; lexicon still pending human review) |
| Money guard (no invented prices/totals) | Real |
| Human takeover + return-to-AI | Real (ownership state machine) |
| COD cash ledger + settlement | Real (manager-gated routes) |
| Order engine (cart → confirm → persist) | Real |
| Delivery dispatch + driver token link | Real (flag-gated: `NEXT_PUBLIC_ENABLE_DELIVERY_TRACKING`, **ON** by default) |
| Customer tracking page | Real (flag-gated) |
| Operator console (7 pages) | Real — Login, Dashboard, Orders, Conversations, Insights, Customers, Settings |
| Self-serve onboarding backend | Real — WhatsApp Embedded Signup, menu ingestion, go-live gate |
| Per-conversation serialization lock | Real (prevents race conditions) |
| Stuck detection + operator alert | Real |
| Conversation spine (ownership states) | Real (AI_ACTIVE/HUMAN_ACTIVE/HUMAN_IDLE/SYSTEM_HOLD/CLOSED) |
| CI eval gate (tsc + build + unit tests) | Real (101 unit-test cases) |
| Security hardening (this sprint) | Real — webhook forged-request protection, cross-tenant guard, COD manager gate, per-tenant agent scope, deterministic tenant resolution |

---

## What is behind a feature flag 🚩

> **Env flag names are exact.** Every environment flag below is prefixed
> `NEXT_PUBLIC_`. Setting the unprefixed name has **no effect** — the code reads
> only the prefixed variable (`lib/feature-flags.ts`). All env flags require a
> redeploy to take effect.

| Feature | Flag | Default | Enable / disable |
|---|---|---|---|
| Allergen symptom detection | *(no flag — unconditional)* | always on | safety gates are not features; the flag was removed because its OFF position produced a self-contradicting turn |
| Deterministic allergen safety | `deterministic_allergen_safety` (per-tenant) | OFF | per-tenant record |
| Handoff timeout / auto-return | `handoff_timeout` (per-tenant) | OFF | per-tenant record |
| Delivery tracking + dispatch | `NEXT_PUBLIC_ENABLE_DELIVERY_TRACKING` (env) | **ON** | set to exactly `"false"` to disable |
| Operator console v2 | `NEXT_PUBLIC_CONSOLE_V2` (env) | OFF | set to exactly `"true"` to enable |
| MIZAN reviewer surface | `NEXT_PUBLIC_ENABLE_MIZAN_PANEL` (env) | OFF | set to exactly `"true"` to enable |
| In-app admin chat console | `NEXT_PUBLIC_ENABLE_ADMIN_CHAT_CONSOLE` (env) | OFF | set to exactly `"true"` to enable |

---

## What is mocked or incomplete ⚠️

| Item | Real state |
|---|---|
| Meta Embedded Signup (frontend) | Backend route exists; frontend SDK init incomplete |
| `escalation_timeout_minutes` | Column/migration NOT shipped; stuck-detection uses hardcoded 10 min |
| `/api/settings/plan` (tier endpoint) | Does NOT exist yet |
| Billing model | Placeholder; not defined |
| Delivery dispatch UI polish | Foundation exists behind flag; not production-ready |
| Driver mobile flow | Basic driver token link; not polished |
| Commission savings dashboard | Planned (V1.5) |
| Customer retention / CRM | Planned (V3) |

---

## First milestone — Wesaya V1 launch

Prove that Kivo can operate a real restaurant-owned WhatsApp ordering flow safely end-to-end:

```
Customer messages Wesaya WhatsApp
  → Karim replies in Egyptian Arabic
  → Karim uses only real Wesaya menu/prices
  → Allergen/safety situations escalate to human
  → Confirmed order appears in Kivo console
  → Operator can take over and release
  → Customer receives receipt
```

See `docs/WESAYA_V1_LAUNCH_CHECKLIST.md` for the full acceptance checklist.

**#1 blocker to live WhatsApp:** Meta Tech Provider setup (env vars in Vercel + App Review for `whatsapp_business_management`). See `docs/META_SETUP_GUIDE.md`.

---

## Architecture overview

```
Customer WhatsApp
  → Meta → POST /api/whatsapp/webhook (signature-verified, per-tenant)
  → respondAndSendWhatsApp() — serialized per-conversation
      → runCustomerTurn() — allergen gate → LLM → money guard → output guard
      → persists reply, logs cost, flips ownership on escalation
  → reply sent via WhatsApp Cloud API

Operator
  → getkivo.io/dashboard (session-auth, per-tenant RLS)
  → can see conversations, orders, take over, release, manage menu
```

Key libraries:
- `lib/ai/` — agent core (allergen gate, money guard, ownership, respond, customer-turn)
- `lib/db/` — Supabase helpers (tenant, orders, COD, delivery, ownership)
- `lib/messaging/` — WhatsApp Cloud API send/receive, retry policy
- `app/api/` — Next.js route handlers (webhook, agent, COD, settings, onboarding)

---

## Local setup

```bash
cp .env.example .env.local
# Fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#          SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
#          (WhatsApp vars optional for local dev — agent runs in mock mode)

npm install
npm run dev          # http://localhost:3000
```

For WhatsApp live mode, set all `WHATSAPP_*` env vars. See `docs/WHATSAPP_GO_LIVE.md`.

---

## Tests + build

```bash
npm run test:unit    # 114 test files — runs ALL of them and reports a real tally
npx tsc --noEmit     # type check
npm run lint         # eslint + the local RTL/Supabase rules
npm run build        # production build (offline-safe — uses local fonts)
```

**What CI actually enforces** (measured 2026-08-26 — the previous wording here
claimed all of the above gated every merge, which was not true):

| Check | When it runs | Blocking |
|---|---|---|
| `tsc --noEmit` | every PR (`core-gate.yml`) | yes |
| `npm run lint` | every PR (`core-gate.yml`) | yes |
| `npm run test:unit` | every PR (`core-gate.yml`) | **not yet** — 2 of 114 files fail, both reporting a real console-v2 gap (not drifted assertions). See that workflow's header. |
| 27 agent-path tests + `next build` | only PRs touching `lib/ai`, `lib/messaging`, `lib/db`, the WhatsApp/agent routes (`agent-eval.yml` path filter) | yes, when it fires |
| 2 Playwright specs | every PR (`ui-stacking.yml`) | yes |

`npm run test:unit` runs `scripts/run-unit-suite.mjs` over the hand-maintained
manifest in `scripts/unit-suite.json` — **not** a glob. A new `*.test.ts` file is
not picked up until it is added there. The repository contains **198** test files;
**84** are named by no runner at all.

It used to be a single `&&` chain, which stopped at the first failure and left
most of the suite unexecuted. The runner executes every entry regardless, prints
a per-file result and a true tally, and exits non-zero if any failed.

---

## Safety principles (non-negotiable)

1. **Allergen gate is deterministic** — euphemism detection is a CODE gate, not model trust.
2. **Money is DB-only** — totals come from the order engine, never from the LLM.
3. **Human takeover is real** — when a human owns a conversation, the AI stays out.
4. **Safety holds require deliberate human release** — never auto-return.
5. **No fake metrics** — the console shows live/gathering/coming-soon states only.

---

## Roadmap pointer

See [`MASTER_ROADMAP.md`](./MASTER_ROADMAP.md) for the full strategic direction (V1→V6).  
See [`ROADMAP.md`](./ROADMAP.md) for the sprint-by-sprint engineering log.

---

## Legal

- Privacy Policy: [getkivo.io/privacy](https://getkivo.io/privacy)
- Terms of Service: [getkivo.io/terms](https://getkivo.io/terms)
- Data Deletion: [getkivo.io/data-deletion](https://getkivo.io/data-deletion)
- Contact: info@getkivo.io
- Kivo is a product of مؤسسة عمر حجاب المطيري للتجارة — الرقم الوطني الموحد 7055031913 —
  Riyadh, Saudi Arabia. (Entity change recorded in `docs/KIVO_AGENT_ROADMAP.md` §3.1.)
