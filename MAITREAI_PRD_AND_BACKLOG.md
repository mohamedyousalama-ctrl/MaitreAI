# MaitreAI — Product Requirements Document & Sprint Backlog (Sprints 7–12)

> **Purpose of this file:** This is the single source of truth for taking MaitreAI from the
> current Sprint 6 state (UI complete, everything intelligent mocked) to a launch-ready,
> Brain-managed product for MENA restaurants. It lives in the repo root and is fed to
> Claude Code one sprint at a time. Each sprint section is self-contained: goal, scope,
> tasks, acceptance criteria, and explicit non-goals.
>
> **How to use with Claude Code:** start a session with:
> *"Read MAITREAI_PRD_AND_BACKLOG.md. We are executing Sprint N. Follow its scope and
> acceptance criteria exactly. Do not start work from later sprints."*

---

## 1. Product Vision

MaitreAI (موظف واتساب الذكي للمطاعم) is an **AI employee** for restaurants and hospitality
businesses in MENA. It is not a dashboard with an AI feature — **the Brain IS the product**.

Three jobs:

1. **Customer service agent** — converses with customers on WhatsApp (later Facebook,
   Instagram, website) in natural Arabic (dialect-aware) and English, exactly like a
   skilled human employee.
2. **Order receiver & manager** — takes orders in chat, builds them against the real menu,
   collects payment (COD or link), and drives them through kitchen → delivery.
3. **Restaurant CRM arm** — customer profiles, history, segments, and owner-facing
   insights, all queryable in natural language.

### Core principle: Brain-first, forms-second

Every input — from the **owner** and from **customers** — is understood by the LLM.
UI controls (dropdowns, pickers, toggles) exist only to *guide* and to *confirm*;
natural language is always an equal or primary path.

Canonical example: the owner types
`اعمل عرض: برجر كلاسيك + بطاطس + كولا بـ 45 ريال نهاية الأسبوع`
→ the Brain resolves the three real menu items, builds a combo promotion (items, bundle
price 45 SAR, validity Thu–Sat), shows a **preview diff**, and the owner taps **تأكيد**.
The same pattern applies to delivery zones, policies, menu edits, branch hours, FAQ.

### Hard product rules (apply to every sprint)

- **Self-serve only.** A restaurant in Riyadh, Cairo, Dubai, or Amman onboards alone,
  with zero onsite visits and zero support calls. The wizard + Brain must cover 100%.
- **The agent never invents.** No hallucinated menu items, prices, hours, or zones.
  Every customer-facing fact comes from a Brain tool call against tenant data.
- **Confirm before commit.** Orders, promotions, and destructive edits always show a
  structured preview that a human (customer or owner) confirms.
- **Escalate gracefully.** Complaints, allergen uncertainty, payment disputes, and low
  confidence hand over to a human, with full context. The existing takeover UX stays.
- **Arabic-first, fully RTL,** bilingual capable. Dialect handled per market.
- **Multi-tenant from day one** (Sprint 7). Every row is scoped to a `restaurant_id`
  and protected by RLS.

---

## 2. Current State (end of Sprint 6) — what exists and what is mock

**Real and kept:**
- Next.js 14 App Router, TypeScript, Tailwind, Zustand, full RTL Arabic UI.
- All pages: dashboard, conversations (3-pane), orders, kitchen board, menu, branches,
  promotions, restaurant-brain, customers, settings, messaging-test, checkout.
- Domain types in `lib/types.ts` (orders, payments, kitchen, brain, intents).
- Messaging adapter layer (`lib/messaging/`): channel-agnostic types, mock adapter,
  WhatsApp Cloud API adapter (Graph v19.0), webhook route with Meta GET handshake and
  HMAC X-Hub-Signature-256 verification, env-driven test/connected modes.
- Order/payment/conversation state machines and event timelines.
- Deployed on Vercel (`maitre-ai.vercel.app`), repo `mohamedyousalama-ctrl/MaitreAI`.

**Mocked / missing (the work of Sprints 7–12):**
- AI = local rule engine (`lib/ai/engine.ts`) — no LLM.
- Persistence = browser localStorage — no database, no server truth, single device.
- No auth, no tenants.
- WhatsApp in test mode — no live send/receive.
- Payments simulated — no provider.
- Onboarding does not exist (app boots into seeded demo data).

---

## 3. Target Architecture

```
Customer (WhatsApp) ──► Meta Cloud API ──► /api/channels/whatsapp/webhook
                                               │  verify HMAC, idempotency
                                               ▼
                                        Message Ingest (server)
                                               │ persist inbound (Supabase)
                                               ▼
                                        Brain Agent Service (server)
                                          Claude API + tool use
                                          tools → tenant data (Supabase)
                                               │ persist outbound + decisions
                                               ▼
                                        Channel Adapter (whatsapp) ──► Graph API send
                                               ▼
Owner (Next.js app) ◄── Supabase Realtime ── DB (orders, conversations, ...)
```

- **Database:** Supabase Postgres + Auth + Realtime + Storage (menu images/PDFs).
- **AI:** Anthropic Claude API, server-side only. One agent service used by BOTH the
  customer channel and the owner's admin NL commands (different system prompts/tools).
- **State:** Zustand stores remain the UI layer but become thin caches over Supabase
  queries + realtime subscriptions. localStorage persistence is removed.
- **Secrets:** server env only. The existing "booleans only to client" status pattern
  is the rule for all providers.

### Data model (Supabase schema, mirrors `lib/types.ts`)

| Table | Key columns (besides id, restaurant_id, timestamps) |
|---|---|
| `restaurants` | name, logo_url, phone, email, currency, country, default_language, dialect, timezone, business_type, ai_tone (jsonb), brain_score |
| `members` | user_id (auth), role (`owner`/`manager`/`staff`), branch_id? |
| `branches` | name, address, lat/lng, phone, hours (jsonb, supports prayer-time pauses), active |
| `menu_categories` | name, sort |
| `menu_items` | category_id, name, name_en?, description, price, image_url, available, ingredients text[], allergens text[] |
| `modifiers` | name, price_impact, category, active |
| `menu_item_modifiers` | item_id, modifier_id |
| `delivery_zones` | branch_id, name, fee, min_order, eta_minutes, polygon? (geojson), active |
| `policies` | key (refund/cancel/delivery/...), text |
| `faqs` | question, answer, active |
| `promotions` | name, type (`combo`/`discount`/`bogo`), items jsonb, bundle_price?, discount_pct?, starts_at, ends_at, days_of_week int[], active, created_from_text? |
| `customers` | phone (unique per restaurant), name, language, tags text[], notes, ltv, orders_count, last_seen_at |
| `conversations` | customer_id, channel, status, owner (`ai`/`human`), assigned_member_id?, last_intent, confidence, escalation_reason? |
| `messages` | conversation_id, direction, sender (`customer`/`ai`/`human`/`system`), text, channel_message_id (unique → idempotency), status (sent/delivered/read/failed), meta jsonb |
| `orders` | conversation_id?, customer_id, branch_id, fulfillment, items jsonb, subtotal, delivery_fee, total, currency, order_status, payment_status, kitchen_status, address?, zone_id?, notes |
| `order_events` | order_id, type, label, actor, meta jsonb |
| `payment_sessions` | order_id, provider, amount, status, link, expires_at, provider_ref |
| `agent_runs` | conversation_id?, trigger, input, tools_used jsonb, output, confidence, latency_ms, tokens, error? — feeds the AI Debug panel & AI Review Center |
| `onboarding_state` | step, completed_steps jsonb, menu_ingest_status |

**RLS:** every table policy = `restaurant_id IN (select restaurant_id from members where user_id = auth.uid())`. Server routes use the service role key only inside trusted server code.

---

## 4. Sprint Backlog

> Order is dependency-driven: 7 (DB/auth) → 8 (Brain) → 9 (WhatsApp live) →
> 10 (Onboarding) → 11 (NL admin) → 12 (Payments + hardening).
> **Start Meta Business Verification immediately, in parallel with Sprint 7** — it is
> the longest external lead time (days to weeks) and blocks Sprint 9 go-live.

---

### Sprint 7 — Real Foundation: Supabase, Auth, Multi-tenant

**Goal:** the app's truth moves from localStorage to Postgres; users sign in; every
record belongs to a restaurant; the WhatsApp webhook can persist.

**Tasks**
1. Add Supabase project + `@supabase/supabase-js` + `@supabase/ssr`. Env:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (server only). Update `.env.example` + DEPLOYMENT.md.
2. SQL migrations for the full schema above (in `supabase/migrations/`), with RLS
   policies and seed script that reproduces مطعم الذواقة demo data for dev.
3. Auth: email OTP + phone OTP (phone preferred for MENA). `/login` page (RTL),
   middleware protecting `(main)` routes, sign-out in topbar. New signups with no
   restaurant → redirected to `/onboarding` (stub page this sprint).
4. Replace Zustand `persist`/localStorage in `store.ts`, `conversation-store.ts`,
   `order-store.ts`, `payment-store.ts`, `message-log-store.ts` with Supabase-backed
   data layer (`lib/db/*.ts`): typed queries + mutations + realtime subscriptions.
   Keep store APIs as stable as possible so pages change minimally.
5. Webhook route: persist normalized inbound messages + upsert customer + conversation
   using service role (idempotent on `channel_message_id`).
6. Migration of "استعادة الافتراضي" → re-seeds the tenant's data server-side.

**Acceptance criteria**
- Two different accounts see fully isolated data (verified via RLS tests).
- Refresh/another device shows identical data; localStorage no longer used for domain data.
- Creating an order in conversations appears in Orders/Kitchen on another browser within
  ~1s (realtime).
- `POST /api/channels/whatsapp/webhook` with a sample Meta payload creates customer,
  conversation, and message rows; replaying the same payload creates nothing (idempotent).
- `npm run build` clean; deployed to Vercel with env vars.

**Non-goals:** no LLM, no live WhatsApp send, onboarding is a stub.

---

### Sprint 8 — The Real Brain: Claude Agent with Tool Use

**Goal:** replace the rule engine with a server-side Claude agent grounded in tenant
data, keeping every existing UX (confidence, escalation, insights, debug, takeover).

**Tasks**
1. `lib/brain/` server module:
   - `agent.ts` — runs a conversation turn: build system prompt (tenant profile,
     tone config, dialect, policies summary, guardrails) → Claude with tools →
     execute tool calls → final reply + structured `IntentResult`-compatible output.
   - `tools.ts` — tool definitions hitting Supabase:
     `get_menu(filter?)`, `get_item_details(name)`, `check_delivery_zone(area_text)`,
     `get_branches()`, `get_working_hours(branch?)`, `get_policies(key?)`, `get_faqs()`,
     `create_draft_order(items, fulfillment, address?)`, `update_draft_order(...)`,
     `confirm_order(draft_id)`, `get_order_status(order_ref|phone)`,
     `get_active_promotions()`, `apply_promotion(order_id, promo_id)`,
     `escalate_to_human(reason)`, `get_customer_profile(phone)`.
   - `prompts.ts` — system prompt templates per personality (رسمي/ودود/راقٍ/فاخر/وجبات سريعة),
     response length, emoji usage, language (ar/en/bilingual), dialect hints
     (Gulf/Egyptian/Levantine/Maghrebi) driven by `restaurants.dialect`.
2. **Guardrails (non-negotiable, enforced in prompt + code):**
   - Prices/items/hours/zones ONLY from tool results; if a tool returns nothing, say so
     and offer alternatives — never guess.
   - Order creation requires an explicit customer confirmation turn (show itemized
     summary + total first).
   - Auto-escalate: complaints, allergen questions where item data lacks allergen info,
     payment disputes, abusive content, anything medical/legal, low confidence (<0.55),
     or explicit "أبغى موظف". On escalation the AI stops replying (existing owner flag).
   - Output is constrained JSON (reply, intent, confidence, entities, draft_order?,
     escalate?, sources) — validated server-side; on parse failure → safe fallback +
     escalation.
3. `app/api/brain/turn/route.ts` — server endpoint used by the conversations simulator
   and (Sprint 9) the WhatsApp pipeline. Log every run to `agent_runs`.
4. Rewire `useConversationEngine` to call the endpoint; keep optimistic UI + typing
   indicator. Repurpose `lib/ai/engine.ts` normalization as preprocessing only; keep
   the old engine behind `BRAIN_PROVIDER=mock` env flag for offline dev/tests.
5. Feed the existing AI Insights panel + AI Debug from `agent_runs`. Make AI Review
   Center list low-confidence/escalated runs (read-only this sprint).
6. Cost/latency controls: model selection by task (fast model for routine turns),
   conversation context window = last N messages + summary, per-tenant daily token
   budget with graceful degradation to escalation.

**Acceptance criteria**
- In the simulator, a full Arabic ordering flow works end-to-end with REAL menu data:
  greeting → item question (with allergen answer from data) → order with modifiers →
  itemized confirmation → confirmed order appears in Orders.
- Asking for a non-existent dish never fabricates; agent offers real alternatives.
- Complaint message → instant human escalation with reason; AI stays silent after.
- Tone change in Settings visibly changes reply style without redeploy.
- Every turn visible in AI Debug with tools used, latency, tokens.
- Mock provider flag still passes the old simulator flows (CI-friendly).

**Non-goals:** live WhatsApp, owner NL commands (Sprint 11), vision/menu OCR (Sprint 10).

---

### Sprint 9 — WhatsApp Live

**Goal:** real customers message the restaurant's WhatsApp number and the Brain answers.

**Tasks**
1. Wire pipeline: webhook (already persisting) → enqueue/trigger brain turn → send via
   existing WhatsApp adapter → persist outbound with `channel_message_id` + status.
2. Idempotency & retries: Meta redelivers — dedupe on message id; outbound send retried
   with backoff; failures logged + surfaced in conversation as system note.
3. **24-hour customer window:** free-form replies only within window; outside it, send
   only approved **template messages** (order confirmed / preparing / out for delivery /
   payment link). Create + register the template set (ar + en). Store template names in
   config; kitchen/order status changes trigger templates automatically.
4. Message status webhooks (sent/delivered/read/failed) → update `messages.status` →
   show ticks in ChatWindow.
5. Embedded Signup investigation: implement Meta Embedded Signup flow if feasible for
   our app review status; otherwise build a guided manual credentials screen
   (Settings → WhatsApp) that validates token + phone id live and flips mode to
   `connected`. Either path feeds Sprint 10 wizard step 6.
6. Operational safety: per-customer rate limiting, max AI turns before suggesting human,
   "service paused" master switch per restaurant (agent replies with closed message),
   and webhook 200-fast pattern (process async) to respect Meta timeouts.
7. Update DEPLOYMENT.md: full go-live runbook (Meta app review, webhook URL, verify
   token, templates, test number checklist).

**Acceptance criteria**
- A real phone messages the test number → AI reply arrives in WhatsApp < 8s; the
  exchange appears live in the app's Conversations.
- Full order placed from a real phone reaches Kitchen; advancing kitchen status sends
  the corresponding template/notification back to the customer.
- Replayed webhook deliveries produce no duplicate messages/orders.
- Killing the AI token budget or toggling "paused" produces the graceful fallback, never silence.
- Status ticks update in the UI.

**Non-goals:** Facebook/Instagram/website channels (adapter slots exist; not wired).

---

### Sprint 10 — Self-Serve Onboarding Wizard

**Goal:** a brand-new owner goes from signup → live AI employee in ONE session, alone.
This sprint is the differentiator; polish matters.

**Route:** `/onboarding` (full-screen, RTL, progress rail, resumable via
`onboarding_state`, skippable steps marked, Arabic with English toggle).

**Steps**
1. **Restaurant profile** — name, country (sets currency + dialect default), business
   type, language(s). Brain uses business type to pre-fill smart defaults everywhere after.
2. **Menu ingestion (AI):** owner uploads menu **photos or PDF** (Supabase Storage) or
   pastes text — Claude vision extracts categories, items, prices, descriptions,
   modifiers, likely allergens → **review grid** (editable, confidence-highlighted) →
   approve to insert. Manual add and CSV remain as fallbacks. Multi-page menus and
   mixed ar/en supported.
3. **Branches** — name, address (map pin), phone, hours; hours editor supports split
   shifts + optional prayer-time pauses (KSA default on). "Same hours all branches" shortcut.
4. **Delivery zones** — two equal paths: draw/select on map, OR type a sentence
   ("نوصل للياسمين والنرجس، رسوم ١٠، الحد الأدنى ٣٠") → Brain parses to structured zones
   → confirm. Pickup-only is a valid choice.
5. **Policies & FAQ interview** — Brain proposes defaults from business type as a short
   chat-style interview (refunds? cancellation window? COD? cutlery?); owner accepts/edits.
6. **AI persona** — personality, length, emoji, language(s), greeting — with a **live
   preview pane** showing 3 sample replies that re-render on every change.
7. **WhatsApp connect** — Embedded Signup or guided manual flow from Sprint 9; ends with
   sending a REAL test message to the owner's own phone ("إذا وصلتك هذه الرسالة فموظفك جاهز ✅").
8. **Test drive** — embedded simulator: "اطلب من مطعمك الآن وجرّب موظفك" with suggested
   test prompts; owner must complete one test order.
9. **Go-live checklist** — Brain completeness score with per-area links to fix gaps;
   "تشغيل الموظف" button activates the agent (master switch on).

**Tasks (engineering)**
- Wizard shell + state machine + resume; mobile-friendly (owners onboard from phones).
- `app/api/brain/ingest-menu/route.ts` (vision extraction, chunked, returns review payload).
- Zone-sentence parser as a Brain tool reused by Sprint 11.
- Dashboard empty-states for new tenants pointing back to incomplete steps.
- Telemetry: step completion/drop-off events (simple table) — we must see where owners get stuck.

**Acceptance criteria**
- Fresh account → live WhatsApp agent in ≤ 30 minutes without leaving the product, on
  desktop AND mobile web.
- A 2–3 page photographed Arabic menu ingests with ≥90% of items needing no edits in
  the review grid (measured on 3 real sample menus).
- Closing the tab mid-wizard and returning resumes the same step.
- Skipping optional steps still yields a working (if minimal) agent; checklist reflects gaps.

---

### Sprint 11 — NL-Everywhere Admin (Brain-managed app)

**Goal:** the owner manages the restaurant by talking to it. Forms remain as guides.

**Tasks**
1. **Global command bar** (⌘K / persistent "اكتب أمرك..." input in topbar): owner types
   anything — "وقف التوصيل لحي العليا اليوم", "ارفع سعر البرجر ريالين", "خلّص برجر الدجاج",
   "كم بعنا أمس؟" — Brain (admin agent: same service, admin toolset with WRITE tools)
   interprets → **preview diff card** (before/after, affected records) → confirm/cancel.
   Read-only questions answer inline with data.
2. **Promotion-from-a-sentence** (flagship): on Promotions page, a single text box.
   "اعمل عرض كومبو: برجر كلاسيك + بطاطس كبيرة + كولا بـ 45 نهاية الأسبوع" →
   resolved items (fuzzy-matched against menu, with disambiguation chips if ambiguous),
   computed combo, validity (understands نهاية الأسبوع per country weekend, رمضان,
   Hijri dates), preview, confirm → active promo the customer agent can apply.
3. NL affordances on each CRUD page ("صف العنصر بجملة" on Menu, zone sentence on
   Branches/zones, policy rewrite on Brain page) reusing the same admin agent.
4. Safety: write tools require preview-confirm token; bulk/destructive ops require typed
   confirmation; all admin runs logged to `agent_runs` with actor = owner; per-role
   permissions (staff = read-only commands).
5. AI Review Center v1: list escalations + low-confidence customer runs, owner can rate
   reply (👍/👎 + note) — stored for future tuning.

**Acceptance criteria**
- The canonical promo sentence produces a correct active combo in ≤ 2 confirmations.
- Ambiguity ("برجر" with 3 burger items) triggers disambiguation, never a wrong pick.
- "كم مبيعات اليوم؟" answers with real numbers matching the dashboard.
- No write ever lands without an explicit confirm; audit trail visible.
- Customer agent immediately respects promos/price/availability changes (no cache staleness).

---

### Sprint 12 — MENA Payments + Launch Hardening

**Goal:** real money, real reliability.

**Tasks**
1. **COD first-class:** fulfillment + payment flow supports cash on delivery end-to-end
   (still the dominant MENA method); agent offers it by default where enabled.
2. **Gateway integration** behind a provider interface (mirroring the messaging adapter
   pattern): launch market KSA → **Moyasar or Tap** (mada, Apple Pay, STC Pay, cards);
   keep the existing checkout UI, swap the mock session for real sessions + provider
   webhooks (signature-verified) updating `payment_sessions`/orders. Mock provider kept
   for dev. Egypt/UAE providers (Paymob/Tap) staged as follow-up configs.
3. Refund flow (owner-initiated from order panel) + policy-aware agent answers.
4. **Hardening:** Sentry (or equivalent) error tracking, structured logs for
   webhook/brain/send pipelines, rate limits on public routes, security pass
   (no secret leakage, RLS audit, webhook signatures mandatory in prod), Supabase backups
   verified, load sanity test (50 concurrent conversations).
5. **Launch package:** pricing/plan flags per tenant (trial → paid), basic usage metering
   (conversations + AI tokens per month), legal pages (privacy/terms ar+en), status of
   data residency documented, marketing site landing on root for logged-out users.
6. Bilingual QA sweep: full agent + UI test matrix in Gulf Arabic, Egyptian Arabic, and
   English; fix dialect misses found.

**Acceptance criteria**
- Real test transaction (provider sandbox→live) flips order to paid and notifies the
  customer on WhatsApp; failure and expiry paths behave like the current mock.
- COD order completes the full journey with correct settlement state.
- Error in the brain pipeline alerts the team and degrades to escalation, never silence.
- A pilot restaurant (friendly tester) runs 1 full day of real orders with zero data
  loss and no manual intervention.

---

## 5. Cross-cutting MENA Requirements (all sprints)

- **Weekends/dates:** weekend = Fri–Sat (KSA/most Gulf), Sat–Sun toggle per country;
  promotions and hours understand Hijri references (رمضان, عيد) → resolved to Gregorian
  ranges at creation time with the owner confirming.
- **Prayer-time pauses:** optional per-branch hour pauses; agent answers "متى تفتحون؟"
  correctly around them.
- **Dialect:** `restaurants.dialect` seeds prompt hints; normalization layer (existing
  `normalize()`) handles orthographic variance; QA scripts per dialect live in
  `/qa/dialects/`.
- **Numbers/currency:** Arabic-Indic digit input accepted everywhere; currency per
  country (ر.س، د.إ، ج.م، د.ك ...).
- **COD culture:** never assume online payment; agent always states accepted methods
  from tenant config.

## 6. Engineering Conventions

- Keep the adapter pattern for every external system (channels, payments, AI provider).
- Server-only secrets; client receives booleans/status only (existing pattern).
- All Brain behavior changes are config/prompt data, not redeploys, wherever possible.
- Every sprint ends with: updated README sprint log, updated DEPLOYMENT.md, green
  `npm run build`, deployed preview, and the sprint's acceptance list checked in the PR
  description.
- Branch naming: `claude/sprint-7-foundation`, etc.; one PR per sprint, merged to main.

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Meta business verification delays | Started in parallel with Sprint 7; manual-credentials fallback ships in Sprint 9 |
| LLM cost blowups | Per-tenant token budgets, small-model routing, context summarization (Sprint 8) |
| Menu OCR accuracy on poor photos | Review grid is mandatory; confidence highlighting; manual/CSV fallback |
| Hallucinated prices/items | Tool-grounding + constrained JSON + code-side validation + escalation fallback |
| Owner trust in NL writes | Preview-diff + explicit confirm on every write; full audit log |
| Single-dev bus factor | This document + sprint PRs keep Claude Code sessions reproducible |

## 8. Definition of "Launch Ready" (exit of Sprint 12)

- A stranger restaurant can sign up, onboard fully self-serve, connect WhatsApp, and
  serve real customers with COD and online payment — with the team only watching dashboards.
- 1 pilot restaurant completed a full real day (orders received, kitchen flow, payments,
  zero data loss).
- Monitoring, backups, RLS audit, and the go-live runbook are all in place.
