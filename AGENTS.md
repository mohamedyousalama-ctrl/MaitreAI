# AGENTS.md — orientation for AI coding tools

**Read this first.** It is the contract any AI tool (Claude Code, Codex, Cursor,
…) must follow when working in this repo. It is kept accurate to the code; if you
find it stale, fix it in the same PR.

> No setup makes an AI error-free. The goal here is fast, correct orientation and
> guardrails you can't miss.

---

## What MaitreAI is

MaitreAI is a **WhatsApp-first AI ordering + operations assistant for
restaurants**, Egypt-first (Egyptian Arabic primary; Saudi supported per-tenant).
A customer chats on WhatsApp with a per-tenant host agent (e.g. «كريم») that takes
orders end-to-end; the restaurant's staff run everything from an Arabic RTL
operator web app (conversations, orders, menu, settings). Stack: **Next.js 14
(App Router) + TypeScript + Supabase (Postgres/Auth/RLS) + Claude (Anthropic) +
Tailwind**. Money and order facts are computed by code from the menu/DB — never by
the model.

---

## NON-NEGOTIABLE RULES (do not break these)

1. **Money/facts come from tools/DB, never the model.** All prices, line totals,
   delivery fees, VAT and order totals are computed by the executor in
   `lib/ai/tools.ts` (and the order-session/order-create helpers). The LLM may
   *decide what to do* but must never *author a number*. Unknown item/zone → ask
   or escalate; never invent.
2. **Keep the Egyptian T1 safety eval green** before merging anything that touches
   prices/money/menu/agent behavior/prompt. Run it (see below) and confirm the
   safety-critical scenarios pass (no off-menu invention, escalation on
   complaints/refunds/discounts, Arabic-only, no prompt-injection leak, closed-mode
   held). After any eval run, **restore the pilot tenant's `dialect` to
   `egyptian`** (the harness leaves it `saudi`).
3. **Never push to `main`.** `main` is production (maitre.chat). Work on a feature
   branch, open a **draft PR**, never force-push `main`.
4. **Secrets live in env / Vercel — never in code, docs, or commits.** `.env.local`
   is gitignored. Docs may name env vars, never their values.
5. **Confirm-before-write** for agent actions that change tenant data (the admin
   agent shows a preview/diff and only writes on an explicit confirm; manager-only
   writes are enforced server-side).

---

## Run / build / test

```bash
npm install
npm run dev            # local dev server (Next.js)  → http://localhost:3000
npm run build          # production build (must pass before commit)
npx tsc --noEmit       # type-check (must pass before commit)
npm run lint           # eslint
```

- **Env:** copy `.env.example` → `.env.local` and fill in. With no Supabase/Claude
  keys the app runs in **demo/mock mode** (localStorage data, deterministic mock
  LLM) — safe to develop UI without secrets.
- **Eval harness** (live Claude path, both dialects, writes `reports/eval-<date>.md`):
  ```bash
  BASE_URL=http://127.0.0.1:3000 node scripts/eval-scenarios.mjs
  ```
  Needs a running server plus `AGENT_ROUTE_SECRET`, `ANTHROPIC_API_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Exit 0 = all executed
  cases passed. (S6/S8 are known soft-heuristic flakies, not safety regressions —
  see the report notes.)
- **Migrations** are plain SQL in `supabase/migrations/NNNN_*.sql`, applied via the
  Supabase Management API (direct Postgres pooler is blocked by network policy):
  ```bash
  node scripts/db-apply.mjs supabase/migrations/00NN_name.sql
  ```
  Needs `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`. Make migrations
  **additive** (e.g. `create table if not exists`, `add column if not exists`);
  end DDL with `notify pgrst, 'reload schema';`.

---

## Architecture in 10 lines (customer flow)

1. Customer message → Meta delivers `POST /api/whatsapp/webhook`.
2. Signature verified (`WHATSAPP_APP_SECRET`); body normalized
   (`lib/messaging/adapters/whatsapp.ts`) — text and, for taps, a stable
   `interactiveId`.
3. Persisted idempotently (`lib/db/messages.ts`, dedupe on `channel_message_id`;
   `interactiveId` stored in `messages.meta`); phone→customer→conversation→tenant.
4. `respondAndSendWhatsApp` (`lib/messaging/respond-and-send.ts`) runs — unless a
   human owns the thread (takeover), then the agent stays out.
5. **Tap?** → `runTapTurn` (`lib/ai/tap-router.ts`) acts on the stable ID
   deterministically (no LLM). **Free text?** → `runCustomerTurn`
   (`lib/ai/customer-turn.ts`) → `respond()` tool loop (`lib/ai/respond.ts`).
6. The turn loads the **persistent order session** (`lib/db/order-session.ts`) so
   the order survives across messages; the tool executor (`lib/ai/tools.ts`)
   validates items/zones and computes all money.
7. The session is persisted back; the AI reply + cost are logged to `agent_runs`.
8. On finalize → `persistOrderFromDraft` (`lib/db/orders-create.ts`, idempotent)
   writes the real `orders` row; the receipt PNG auto-sends.
9. Reply goes out via `lib/messaging/outbound.ts` (interactive buttons/list, or
   text), 24h-window aware; failures surface on the conversation timeline.
10. The operator sees it live in the **المحادثات** app and works orders/menu/etc.

The same Brain path is reachable for tests via `POST /api/agent/respond`
(secret-guarded). The **operator app** lives under `app/(main)/*`.

---

## Where things live (map, not exhaustive)

| Area | Path |
|---|---|
| WhatsApp webhook (canonical) | `app/api/whatsapp/webhook/route.ts` |
| Inbound → Brain → send bridge | `lib/messaging/respond-and-send.ts` |
| Customer-turn orchestrator | `lib/ai/customer-turn.ts` |
| Brain turn loop (tool calls) | `lib/ai/respond.ts` |
| Order tools (money is computed here) | `lib/ai/tools.ts` |
| Deterministic tap router (Step 2) | `lib/ai/tap-router.ts` |
| Persistent order session (Step 1) | `lib/db/order-session.ts` |
| Restaurant Brain (shared memory) | `lib/db/restaurant-brain.ts`, `app/api/brain/route.ts` |
| Conversation analysis job (Piece 2) | `lib/ai/analysis.ts`, `app/api/brain/analyze/route.ts` |
| Owner insight loop (Piece 3) | `app/api/brain/insights/route.ts`, `app/(main)/dashboard/MaitreConsole.tsx` |
| Customer memory (Piece 4) | `lib/db/customer-memory.ts` (read in `customer-turn`, written on finalize) |
| Order persistence (idempotent) | `lib/db/orders-create.ts` |
| Brain context loader | `lib/db/brain.ts` |
| LLM adapter seam | `lib/ai/llm/` (`index.ts`, `claude.ts`, `mock.ts`, `models.ts`) |
| STT adapter seam | `lib/ai/stt/` |
| System prompt | `lib/ai/prompt.ts` |
| Admin (operator) agent | `app/api/agent/admin/route.ts` |
| Operator web app | `app/(main)/*` (conversations, orders, menu, settings) |
| Feature flags | `lib/feature-flags.ts` |
| Migrations | `supabase/migrations/*.sql` (apply via `scripts/db-apply.mjs`) |
| Eval harness | `scripts/eval-scenarios.mjs` → `reports/eval-*.md` |
| Architecture / conventions | `docs/ARCHITECTURE.md`, `docs/CONVENTIONS.md` |

---

## Current state pointer

This branch (`upgrade/order-engine`) is the upgrade stack:

- **Step 1 — persistent order session:** the draft survives across turns
  (`order_sessions` / `order_session_lines` / `order_session_events`).
- **Step 2 — deterministic tap-routing:** WhatsApp button/list taps are acted on
  by stable ID before the LLM; free text still goes to the Brain.
- **Learning System Piece 1 — the Restaurant Brain:** a shared, tenant-scoped
  MEMORY of learned KNOWLEDGE facts (`brain_facts` / `brain_insights` /
  `brain_owner_qa`, `lib/db/restaurant-brain.ts`). Both agents READ it into their
  context (`loadRestaurantBrain`); the owner agent writes it (`/api/brain`,
  manager or server-to-server secret). **It is knowledge only — never a source of
  prices or availability** (those stay in the menu/tools).
- **Learning System Piece 2 — the analysis job:** `runConversationAnalysis`
  (`lib/ai/analysis.ts`, triggered via `POST /api/brain/analyze` with the secret)
  reads recent customer conversations in a bounded batch and writes GROUNDED
  insights to `brain_insights` (`status=pending`; evidence = counts + real
  conversation ids; deduped/merged on re-run; empty when nothing is notable;
  efficient `conversation_analysis` model). It proposes INSIGHTS only — never
  writes `brain_facts` (only the owner makes facts).
- **Learning System Piece 3 — the owner loop:** the owner console surfaces a
  pending insight as a grounded question; the owner answers (or dismisses) via
  `/api/brain/insights`; the answer is recorded in `brain_owner_qa` and stored as
  a `brain_fact` (`source=owner_answer`), and the insight is marked
  `answered`/`dismissed` (never re-surfaced). Both agents then read the new fact.
  **Suggest-only:** it stores KNOWLEDGE — it never changes menu/price/policy (real
  changes still go through the normal confirm-before-write ops path). The loop is
  whole: conversations → analysis → insight → owner asked → answer → fact.
- **Learning System Piece 4 — customer memory:** per-customer, tenant-scoped recall
  so the agent recognizes a returning diner (`lib/db/customer-memory.ts`). REUSES
  the `customers` table (+ `last_order_at`/`usual_address`) and a small
  `customer_preferences` table; order history derives from `orders` (no
  duplication). Finalizing an order updates the profile; `loadCustomerProfile`
  injects a compact recall block into «كريم» **only for returning customers** (new
  → prompt unchanged). Privacy-first: tenant-isolated, no unprompted PII dumps,
  allergies respected but **verified from menu data not memory**, money still from
  tools. (Piece 5 — active recommendations — is next / not built.)
- **Owner/admin console is shown by default** — `ENABLE_ADMIN_CHAT_CONSOLE`
  (`NEXT_PUBLIC_ENABLE_ADMIN_CHAT_CONSOLE`) now defaults ON, still toggleable (set
  `"false"` to hide). Code in `app/(main)/dashboard/MaitreConsole.tsx`; its agent
  (`/api/agent/admin`) reads the Restaurant Brain.
- **Delivery module** (drivers, dispatch, driver/customer tracking pages) is built
  in the **stacked PR (`upgrade/delivery`)** behind `ENABLE_DELIVERY_TRACKING`
  (default off). Not on this branch's code yet — it lands when that PR merges.

For what's built vs in-progress, see the open **draft PRs** and the latest
`reports/eval-*.md`. Keep this file honest as the stack evolves.
