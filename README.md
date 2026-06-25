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
| Allergen symptom detection (v4) | Real (merged, flag OFF pending human review) |
| Money guard (no invented prices/totals) | Real |
| Human takeover + return-to-AI | Real (ownership state machine) |
| COD cash ledger + settlement | Real (manager-gated routes) |
| Order engine (cart → confirm → persist) | Real |
| Delivery dispatch + driver token link | Real (flag-gated: `ENABLE_DELIVERY_TRACKING=false`) |
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

| Feature | Flag | Default |
|---|---|---|
| Allergen symptom detection | `allergen_symptom_detection` (per-tenant) | OFF |
| Deterministic allergen safety | `deterministic_allergen_safety` (per-tenant) | OFF |
| Delivery tracking + dispatch | `ENABLE_DELIVERY_TRACKING` (env) | OFF |
| Handoff timeout / auto-return | `handoff_timeout` (per-tenant) | OFF |

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
npm run test:unit    # 101 unit-test cases (allergen, ownership, phone, stuck, retry)
npx tsc --noEmit     # type check
npm run build        # production build (offline-safe — uses local fonts)
```

All three must pass before any merge to main. See `.github/workflows/agent-eval.yml`.

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
- Kivo is a product of City Baker LLC — CR No. 216565 — Cairo, Egypt
