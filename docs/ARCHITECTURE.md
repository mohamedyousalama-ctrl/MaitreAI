# Architecture

One-page map of MaitreAI. Accurate to the code on `upgrade/order-engine`
(Steps 0–2). See `AGENTS.md` for rules and the file map.

## System flow (customer side)

```
 Customer (WhatsApp)
      │  message / voice note / button-or-list TAP
      ▼
 POST /api/whatsapp/webhook            app/api/whatsapp/webhook/route.ts
   • verify X-Hub-Signature-256 (WHATSAPP_APP_SECRET; sk\:WHATSAPP_SKIP_SIGNATURE)
   • normalizeWhatsAppInbound          lib/messaging/adapters/whatsapp.ts
       → text + (taps) stable interactiveId; voice → STT (lib/ai/stt)
   • persistInboundMessage (idempotent on channel_message_id)   lib/db/messages.ts
       → upsert customer → find/create conversation → store msg (+ meta.interactiveId)
   • resolve tenant (WHATSAPP_RESTAURANT_ID → restaurants row)
      │
      ▼
 respondAndSendWhatsApp                lib/messaging/respond-and-send.ts
   • takeover guard: if conversation.owner = 'human' → agent stays out
   • DISPATCH:
       TAP  → runTapTurn   (deterministic, NO LLM)   lib/ai/tap-router.ts
       text → runCustomerTurn (LLM)                  lib/ai/customer-turn.ts
      │
      ▼
 The turn
   • loadBrain (menu, modifiers, zones, policies, faqs, persona, tax, dialect)  lib/db/brain.ts
   • loadOrCreateOrderSession (resume the order across messages)   lib/db/order-session.ts
   • respond(): Claude tool-calling loop          lib/ai/respond.ts + lib/ai/llm/*
       tools: add/remove item, set fulfillment, summary, finalize, escalate,
              present menu/quantity/actions/payment   lib/ai/tools.ts
       ↳ the EXECUTOR computes every price/total/fee/VAT (model never authors money)
   • persistOrderSession (lines + money snapshot + event)          lib/db/order-session.ts
   • persist AI reply + log usage/cost to agent_runs
      │
      ▼
 Send + finalize
   • outbound: interactive buttons/list or text (24h-window aware)  lib/messaging/outbound.ts
   • on finalize → persistOrderFromDraft (idempotent order row)     lib/db/orders-create.ts
       → finalizeOrderSession links session↔order; receipt PNG auto-sends (lib/render)
      │
      ▼
 Operator app (المحادثات)  — realtime; staff can take over, manage orders/menu
```

A secret-guarded `POST /api/agent/respond` runs the same Brain path for tests/evals.

## Operator app (`app/(main)/*`)

- **المحادثات / conversations** — live threads, takeover/release, customer context.
- **الطلبات / orders** — order lifecycle, receipts/tickets.
- **المنيو والذاكرة / menu & memory** — menu, modifiers, restaurant brain, AI review.
- **الإعدادات / settings** — profile, AI tone, WhatsApp status, print, tax, branches.
- **الرئيسية / dashboard** — owner/admin chat console (Maître agent + in-chat promo
  builder), shown by default (`ENABLE_ADMIN_CHAT_CONSOLE` defaults ON, toggleable;
  route guards/redirects when off). Free text → `POST /api/agent/admin` (session-
  auth; manager-only writes; preview→confirm). The agent READS the Restaurant Brain
  (`loadRestaurantBrain`) for context.
- **Roles:** `manager` (full) vs `operation` (reduced nav: conversations + orders,
  no revenue). Resolved from the `members` row.

## Adapter seams

- **LLM** — `lib/ai/llm/`: `getAdapter()` returns Claude (`claude.ts`) when
  `ANTHROPIC_API_KEY` set and `AI_ADAPTER != "mock"`, else the deterministic
  `mock.ts`. Per-use-case models + prices in `models.ts`.
- **STT** — `lib/ai/stt/`: `mock | openai | groq` (auto-select by key).
- **Payments** — checkout pages + `lib/db/payments.ts` (provider integration is a
  seam; current checkout is a simulated provider callback).

## Data model (key tables)

| Table | Holds |
|---|---|
| `restaurants` | per-tenant config: `dialect`, `currency`, `agent_mode`, `is_open`, `agent_persona_name`, `tax_mode/tax_rate`, `auto_accept_orders`, `ai_tone`, `handover_note` |
| `members` | user ↔ restaurant + role (`manager`/`operation`); drives RLS |
| `menu_categories`, `menu_items`, `modifiers`, `menu_item_modifiers` | the menu + options (prices live here) |
| `delivery_zones` | zones with `fee`, `min_order`, `eta_minutes` |
| `policies`, `faqs` | refund/cancellation/delivery text; Q&A grounding |
| `customers`, `conversations`, `messages` | inbound/outbound timeline (`messages.meta` holds `interactiveId`, draft, presentation) |
| `orders`, `order_events` | finalized orders (money copied verbatim from the draft) + timeline |
| `order_sessions`, `order_session_lines`, `order_session_events` | **Step 1** persistent per-conversation order draft (one active per conversation) + append-only events |
| `agent_runs` | per-turn observability: model, tokens, `cost_usd`, latency, tools used (taps log `model='deterministic'`, 0 tokens) |
| `brain_facts`, `brain_insights`, `brain_owner_qa` | **Restaurant Brain** (Learning Piece 1): learned KNOWLEDGE facts both agents read (`lib/db/restaurant-brain.ts`); insights/QA tables ready for Pieces 2–3. Never a price/availability source. |
| `conversation_signals` | off-menu/missing-data/escalation signals |
| `payment_sessions` | checkout sessions |

RLS: members read/write only their tenant (`is_member_of` / `is_manager_of`); the
service-role client (server-only) bypasses RLS for the webhook + seeding.
Migrations live in `supabase/migrations/*.sql` (additive; applied via the
Management API — see `docs/CONVENTIONS.md`).
