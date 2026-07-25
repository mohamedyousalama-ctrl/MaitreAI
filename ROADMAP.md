# Kivo — Product Roadmap

> **HISTORICAL.** This file is historical. Current Kivo Agent execution authority is
> [`docs/KIVO_AGENT_ROADMAP.md`](docs/KIVO_AGENT_ROADMAP.md).

> **Single source of truth.** This file is updated on EVERY merge: the shipping work-order's final step
> moves the shipped item to DONE and adjusts status. Do not maintain a parallel copy elsewhere.
> Last updated: 2026-06-24 (Kivo brand + landing + login scenes shipped; cleanup pass merged; getkivo.io live; Sweet Shop demo tenant set up).

## North Star

V1 = a sellable, plug-and-play product. A new restaurant can self-onboard — connect its OWN WhatsApp number, load its menu, set hours/zones/delivery — and Karim works, with NO manual database or Meta setup by us. The agent core (order accuracy, honesty, never-stuck, warmth) is proven; V1 ships the product shell that makes it sellable to many clients without us in the loop. BLaban/Wesaya are test tenants, not the goal.

## Sovereign principles (never violated)
- Menu/promos = external source-of-truth DATA; code follows the menu, never the reverse.
- Honesty: DB-only money, real menu only, recap-before-commit. Allergy = hard-escalate, never assert "safe."
- Order accuracy is sovereign. Customization = tenant DATA + packs + adapters, never per-client code.
- Routing/governance = deterministic state, never a supervisor agent.
- Truth-driven UI: no invented metrics (live / gathering-data / coming-soon states only).
- One central code-writer (one Claude Code window); other windows read-only.
- Run live proof BEFORE merge on customer-facing changes.
- Onboarding model = each client connects their OWN WhatsApp number via Meta Embedded Signup (no manual provisioning).

---

## ✅ DONE (shipped + proven)
- P0 tier flag · P1 conversation-intelligence · per-feature flags (`isFeatureExplicitlyEnabled`) · P2 customer-memory (dormant)
- Bug #1 (family-meal dead-end) · #77 escalation philosophy · ستربس١٥ menu fix · Bug #2 (WhatsApp 400 dropped-send)
- P3 perception (#80) · P4 cadence (#81) · Quick-wins (#82: «دبل» ambiguity gate · «هات» affirmation · «تاكيد» · deflection)
- B1 surface order-state (#83) — confirmed live on Wesaya
- Handoff-hardening (#84) — silent-death closed · safety carve-out · barge race closed — enabled both tenants
- Per-tenant WhatsApp webhook (#86) — GET verify token + POST X-Hub-Signature resolve per-tenant (global path
  unchanged for Wesaya); early arrival of the V2-A/E "each restaurant brings its own Meta app" model
- Deterministic allergen safety (#87) — euphemism→escalation is now a CODE gate, not model-luck (live case
  10/10 vs prior 7/8 stochastic; «بيتعب من البندق» fires WITHOUT «حساسية») · structured `is_safety_hold` flag
  → a safety hold never wrongly auto-returns · never-say-safe OUTPUT guard. Flag-gated
  (`deterministic_allergen_safety`), Wesaya byte-identical when off. Data+code-backed, not prompt-alone.
- BLaban onboarding-readiness — validated loads-as-data (product thesis proven)
- Brand: Kivo locked (teal/emerald · motion-✓ logo · "Keep Every Order Moving") · UI design brief issued
- COD cash ledger (#91) — re-ported from stale PR #8 onto current main (operator-only; agent byte-identical) ·
  per-driver expected-vs-collected · settle · daily summary · append-only audit · money from `orders.total`.
  Migration renumbered `0029` (schema already in prod = parity no-op). Auto capture-on-delivered hook deferred
  until #6 (delivery) re-ports. First of the 4-PR re-port effort (audit order: #8 → #7 → #6 → reconcile #5).
- Real-time 86ing (#92) — re-ported from stale PR #7 onto current main; agent edits re-applied MANUALLY onto
  the #87–90 respond.ts/tools.ts (not pasted). Operator one-tap toggle (`/api/menu/availability`, membership-
  gated, tenant-scoped) + `setItemAvailabilityDb` shared flip+audit (also audits the admin-agent path) +
  `menu_availability_events` audit trail + optional timed window (`unavailable_until`, auto-returns, no cron).
  «كريم» honors it live: 86'd items aren't offered (present_menu/add_to_order already gate on `available`), a
  saved-cart item 86'd mid-order is surfaced per turn (inform+swap), and finalize_draft HARD-BLOCKS any order
  still containing an unavailable item — #90 fulfillment gate + #87–89 allergen + money guards untouched.
  Migration `0030` (renumbered from 0019; schema already in prod = parity no-op). Proof 9/9 incl. LIVE BLaban
  (86 → agent refuses the real item; re-enable → confirms). Second of the 4-PR re-port effort (next: #6 delivery).
- Delivery dispatch + driver flow + live tracking (#6) — re-ported from stale PR #6 onto current main.
  Flag-gated (`ENABLE_DELIVERY_TRACKING`, default OFF): every surface + the finalize→deliveries hook check the
  flag, so with it off the module is fully inert and existing flows are unchanged. Migration `0031_delivery`
  (additive: drivers, deliveries, delivery_locations, delivery_events; parity no-op — tables already in prod).
  Finalize→delivery hook re-pointed to `persistOrderFromDraft`'s `orderId` (current draft model, not #5's
  order_sessions). COD capture-on-delivered wired: the `delivered` transition calls `captureCodOnDelivered`
  (closes the #91 ledger loop). Agent path (#87–90 + #92) untouched. `tsc` + `next build` clean flag-off and
  flag-on. Flag-ON delivery happy-path deferred to post-merge live test on BLaban. Third of the 4-PR re-port
  effort. **⁠Follow-up fix:** the `captureCodOnDelivered` call was missing from the original #93 merge;
  added in delivery.ts `updateDeliveryStatusByToken` on the `delivered` transition, guarded by
  `payment_status != "paid"` (COD/unpaid orders only; idempotent; errors logged, never block the transition).
  `tsc` and `next build` clean.
- **COD capture — order-status path** (follow-up to #91/#93): operator marking a delivery order
  delivered via the order screen now also fires COD capture. New API route
  `POST /api/cod/capture-delivered` (server-only, session-auth) — guards `fulfillment=delivery` +
  `payment_status!=paid`, calls `captureCodOnDelivered`. Client wired in `order-store.ts`
  `updateOrderStatus` (fetch on `status=delivered + fulfillmentType=delivery + paymentStatus!=paid`).
  Idempotency keyed on `order_id` — both the dispatch path and order-screen path converge to one
  `cod_collections` row. Proof: DB-level idempotency asserted (seed → capture × 2 → 1 row → cleanup).
  `tsc` + `next build` clean. `ENABLE_DELIVERY_TRACKING` not required for COD capture (flag gates
  the dispatch UI only).
- **Fix silent order-drop on same-content reorder (WO-6)**: `persistOrderFromDraft` fingerprint
  now includes `agentRunId` (the `agent_runs` row for the turn). Two turns → two distinct UUIDs →
  two order rows; same-turn retry → same `agentRunId` → same UUID → safe no-op (unchanged).
  Webhook deduplicates on `channel_message_id` before `respondAndSendWhatsApp`, so each new
  customer message gets exactly one `agentRunId`. Gate added in `respond-and-send.ts`: if the
  draft was finalized but the persist returned `created=false`, the customer-facing "order placed"
  WhatsApp send is skipped — never tells the customer an order was placed when no row was created.
  Proof: `scripts/proof-reorder-fingerprint.mjs`. `tsc` + `next build` clean.
  **Double-tap window guard (follow-up, Codex PR #95):** the `agentRunId` key reopened a narrow
  hole — two confirm messages with different `channel_message_id`s in separate, concurrently-processed
  webhook POSTs would mint two ids for the SAME basket (the old content-only key deduped these at the
  DB PK; the run id removed that net). `persistOrderFromDraft` now runs a pre-insert guard: a
  same-conversation order with a matching content-only fingerprint (`basketContentKey`: lines +
  fulfillment + total, no conv/run id) created in the last 120s → returns `created:false` with the
  existing orderId (no new row, no duplicate confirmation). Real reorders happen outside the window
  (they need a multi-message basket rebuild) so they still save. Proof covers double-tap-within-window
  (one order) and reorder-outside-window (two orders).
  **Future hardening:** the SELECT→INSERT guard is not fully atomic (two sub-second-simultaneous
  inserts could both pass). Make it airtight with a partial-unique index on
  `(conversation_id, content_hash, floor(epoch/120))` — store the content-only hash + coarse time
  bucket as columns so the DB enforces single-row-per-basket-per-window the way the old PK used to.
- **Fix 3 Karim comprehension bugs (WO-7):**
  - **Bug A — stale cart after finalize:** `customer-turn.ts` draft scan now stops at the most
    recent message that has ANY draft data; if that draft is `finalized: true`, `initialDraft` is
    set to `null` (fresh empty slate). Previously `isOpenDraft` skipped the finalized message and
    matched an earlier build-phase message, so Karim opened the next turn with the old items already
    in his "cart." Mid-build drafts (finalized: false, lines > 0) are still loaded with the 45-min
    freshness window unchanged (#90 guard intact).
  - **Bug B — new-order / reorder intent:** Two prompt rules added in the Building orders section
    (after START OVER): NEW-ORDER INTENT («عاوز اعمل اوردر جديد» etc.) → `clear_order` immediately,
    never «بالفعل عندك X في السلة». REORDER / «نفس الطلب» → `clear_order` + re-add items from most
    recently confirmed order in chat history, then confirm before finalizing.
  - **Bug C — receipt escalation hallucination:** New `resend_receipt` tool wired end-to-end:
    `tools.ts` (tool def + `ToolContext.resendReceipt` flag + `executeTool` case) → `respond.ts`
    (`RespondResult.resendReceipt`) → `customer-turn.ts` (`CustomerTurnOutcome.resendReceipt`) →
    `respond-and-send.ts` (queries latest order in conversation, calls `sendReceiptToCustomer`).
    Prompt rule in §G5: receipt requests call `resend_receipt` immediately — NEVER `escalate_to_human`.
    `tsc` + `next build` clean.
- **Conversation spine — ownership axis (Step 1, #97):** explicit `conversations.ownership_state`
  (AI_ACTIVE/HUMAN_ACTIVE/HUMAN_IDLE/SYSTEM_HOLD/CLOSED) replaces scattered `owner`/free-text `status`/
  `is_safety_hold` as the source of truth, with a legal-transition map enforced in one helper
  (`lib/db/ownership.ts` · `setOwnershipState`). Additive migration `0032`. DUAL-WRITES legacy fields.
  24/24 transition-map unit tests.
- **Conversation spine — stuck detection + operator notify (Step 2, #100):** detector fires
  when a conversation has no path forward. Three conditions (SYSTEM_HOLD idle ≥ 30 min · confirmed+unpaid
  order stale ≥ 30 min · HUMAN_ACTIVE/IDLE with no reply ≥ 10 min). Pure `detectStuck` (20/20 unit tests).
  `checkAndNotifyStuck` deduped to ≤1 alert per 30-min window. Migration `0033` (`stuck_reason` column).
- **Conversation spine — enforcement + stuck live (Step 3, #101):** `setOwnershipState` now throws
  on illegal transitions (row not written). Three live call-sites audited and fixed. `checkAndNotifyStuck`
  wired on every human-owned inbound turn. SYSTEM_HOLD structurally bails to realert (never auto-returns).
  27/27 ownership unit tests. `scripts/proof-spine-live.mjs` passing.
- **SYSTEM_HOLD+owner=ai canonicalization (#102):** `respondAndSendWhatsApp` detects the mismatch
  (browser `fire()` updated `owner` but `setOwnershipState` failed silently) and corrects to AI_ACTIVE
  before the Brain turn — prevents the enforcement throw on finalize. #87 preserved: only fires when
  owner is already 'ai' (operator already released); never auto-releases a live human-held hold.
- **`is_safety_hold` reset on Return-to-AI (#103):** `returnToAi()` in `conversation-store.ts` now
  resets `is_safety_hold=false` in the same write that flips ownership to AI_ACTIVE. Prevents stale
  `is_safety_hold=true` after deliberate operator clearance. #87 intact: only on deliberate operator
  action, never automatically.
- **Per-conversation Brain-turn serialization / Pillar 3 (#104):** `withConversationLock` distributed
  mutex via `INSERT ON CONFLICT DO NOTHING` on `conversation_locks` table (pgBouncer-safe; 60 s TTL
  stale-lock expiry; 8 retries; graceful fallthrough). Wraps `respondAndSendWhatsApp` in the webhook.
  Same-conversation rapid messages process strictly one-after-another; different conversations fully
  parallel. Migration `0034`. `scripts/proof-conversation-lock.mjs`.
- **Idempotent returnToAi + takeoverToHuman (#105):** `returnToAi()` and `takeoverToHuman()` in
  `conversation-store.ts` now read current local store state via `get()` before any mutation; if the
  conversation is already in the target owner state (e.g. operator double-click), they return early —
  no duplicate "تمت إعادة"/"تم تحويل" system message, no second DB write. Gate/escalation/output guard
  byte-identical.
- **CI eval gate (#106):** `.github/workflows/agent-eval.yml` — triggers on PRs touching `lib/ai/**`,
  `lib/messaging/**`, `lib/db/**`, `app/api/whatsapp/**`, `app/api/agent/**`, and proof/test scripts.
  Blocking: `tsc --noEmit`, `next build`, 101 pure unit-test cases (allergen gate 34 · ownership
  transitions 27 · phone normalise 20 · stuck detection 20 · retry policy). DB-backed integration
  proofs documented as required manual pre-merge steps in `docs/MANUAL_EVAL_CHECKLIST.md`.
- **Operator console — 7 pages (#123/#125/#126/#127):** Login · Home/Dashboard · Orders · Conversations · Insights · Customers · Settings — all wired to real per-tenant data, truth-states enforced (live/gathering/coming-soon), no invented metrics. Kivo brand applied throughout (teal/emerald, KivoLogo component, hero animation on login page). getkivo.io is the live production domain.
- **Self-serve onboarding — full backend stack:** WhatsApp Embedded Signup (per-tenant WABA + token stored encrypted); menu ingestion + draft/publish RPC; config APIs (hours, delivery zones, persona/tone); go-live gate (readiness checklist — WA ✓ / menu ✓ / hours ✓ / zones advisory — enforced server-side before flipping `active=true, agent_mode=live`); E2E proof script covering all stages + tenant isolation. `docs/META_SETUP_GUIDE.md` written for partner handoff.
- **Settings backend gaps:** WhatsApp GET now returns `lastInboundAt`/`lastOutboundAt` from `messages` table. *(Note: `escalation_timeout_minutes` column/migration and `/api/settings/plan` route are NOT yet shipped — see Deferred below.)*
- **Kivo brand fully implemented:** `KivoLogo`/`KivoWordmark` components; self-drawing animated check-arrow mark; first-load site intro reveal.
- **Kivo landing page live:** hero animation, value/proof sections, truth-system disclaimer.
- **Login page — 3 cycling Karim sales-scene animations:** objection handling · order change mid-flow · indecisive customer — showcases Karim capabilities as marketing content on the pre-auth page.
- **getkivo.io is LIVE as the production domain:** Cloudflare DNS → Vercel, all on one project, no split-project complexity.
- **Comprehensive cleanup pass merged (#131):** Kivo Home re-landed at `/dashboard` inside `(console)` (old terracotta dashboard deleted; `/dashboard` is now the correct post-login landing for both OTP and magic-link flows); all legacy `(main)` pages 307-redirect to Kivo equivalents (`/deliveries→/orders`, `/cod→/settings`, `/menu /maitre /promotions /branches /ai-review /restaurant-brain→/dashboard`); MaitreAI→Kivo user-facing rebrand (tab title, contact, footer, checkout, tracking, old-shell topbar); `/settings/messaging-test` gated dev-only; FLAG-2 login CTA fixed (`/settings→/onboarding`).
- **Sweet Shop demo tenant set up:** renamed from بلبن → "Sweet Shop / سويت شوب" (display name only; restaurant_id, phone config, menu, and all functional data unchanged). Partner-access SQL procedure documented (paste partner email → links user_id to Sweet Shop as manager or operation role).
- **Meta setup guide updated:** `docs/META_SETUP_GUIDE.md` updated with real production domain (`https://getkivo.io`), correct webhook URL (`https://getkivo.io/api/whatsapp/webhook`), JS SDK allowed domain, OAuth redirect URI, and missing `WHATSAPP_APP_ID` env var.

---

## 🟦 V1 — SELLABLE PLUG-AND-PLAY PRODUCT (release goal)

**Agent core — DONE (see DONE log):** order loop, deterministic allergen safety, COD ledger+capture,
86ing, delivery dispatch, reorder/double-tap integrity, Karim comprehension (draft-clear/reorder/receipt);
never-stuck spine (ownership state machine, stuck detection, enforcement, conversation-lock serialization,
handoff de-dup); CI eval gate on agent-path PRs.

**Operator console — DONE:** Login · Home/Dashboard · Orders · Conversations · Insights · Customers · Settings — all 7 pages shipped, wired to real per-tenant data, truth-states enforced. Kivo brand applied (logo, hero animation). getkivo.io live as the production domain.

**Self-serve onboarding backend — DONE:** WhatsApp Embedded Signup (per-tenant WABA + encrypted token); menu ingestion + draft/publish; config APIs (hours, zones, persona/tone); go-live gate (server-side readiness check before activating tenant); E2E proof script (zero manual DB/Meta work). Settings backend gaps filled (WA timestamps, escalation timeout column, tier endpoint). See `docs/META_SETUP_GUIDE.md` for Meta setup.

> ⚠️ **#1 blocker to live WhatsApp:** Meta Tech Provider setup (env vars in Vercel + App Review for `whatsapp_business_management`). See `docs/META_SETUP_GUIDE.md` for the full step-by-step guide. Without this, Embedded Signup errors for every new client.

### In progress
- [ ] **Console profile menu + logout** — the topbar avatar currently has no logout button; being added now.

### Next (V1 completion)
- [ ] **Sweet Shop demo-data seed** — date-spread orders + more conversations so the console looks alive for partner demos. Tenant and partner-access SQL procedure are done; data volume is thin. **Pending review** before seeding.
- [ ] **One real end-to-end onboarding test** — a real client or internal tester goes through the full self-serve flow on getkivo.io: Embedded Signup with their own WhatsApp number → menu ingestion → go-live gate → Karim replies to a real WhatsApp message. Proves the product works outside the lab.
- [ ] **Meta Tech Provider setup (env vars + App Review)** — #1 blocker to live WhatsApp for new clients. Set `WHATSAPP_APP_ID` + submit for `whatsapp_business_management` scope. See `docs/META_SETUP_GUIDE.md` for the full step-by-step guide. Without this, Embedded Signup errors for every new client.

### Deferred / logged (not forgotten)
- [ ] **`escalation_timeout_minutes` — column + route + stuck-detection wiring:** not yet shipped. No migration adds this column (migration 0037 is `allergen_flag_default`). No `/api/settings/plan` route exists. `checkAndNotifyStuck` uses hardcoded `STUCK_THRESHOLDS.humanNoResponseMinutes = 10`. Full implementation (migration + ops route + stuck-detection wiring) requires touching the inbound spine — spine-risk, deferred until V2. Timeout stays hardcoded at 10 min for V1.
- [ ] **Public legal page for Meta verification** — a publicly accessible privacy-policy / terms-of-service URL is required for Meta App Review (Step 3c in META_SETUP_GUIDE.md). Needs a hosted page; currently blocking full App Review submission.
- [ ] **Insights commission/margin formula** — the Insights page shows revenue data but the commission/margin calculation logic is not yet defined. Deferred until billing model is confirmed.
- [ ] **Kivo billing model** — how clients pay us (per-seat, per-order, monthly flat). Define before V1.5 launch. Currently a placeholder in the Settings plan view.
- [ ] **Once-per-session gate for site intro reveal** — the first-load Kivo mark reveal animation currently fires on every cold load; should fire only once per browser session (sessionStorage gate). Low-priority UX polish.

### Per-tenant integrity (must clear before selling)
- [ ] R1 — reconcile `0024_restaurant_feature_flags.sql` vs reality (flags live on `restaurants.feature_flags` jsonb). MUST fix before onboarding ships, or new tenants break.
- [ ] Per-tenant isolation audit: every Karim read (menu/hours/zones/persona/flags) is tenant-scoped

---

## 🟩 V2 — DEPTH (after V1 sells)
Configure-by-chat (one menu engine, two doors) · duration/auto-revert 86ing reminders · promotion engine
(deterministic eligibility) · menu ingestion via photo/PDF/URL (multimodal) · structured allergens
(coverage/evidence/confidence) · Insights leakage→action depth · Paymob/mada payments · e-invoicing
(ZATCA/ETA) · Foodics POS · web-chat channel · customer timeline/depth · capability-based RBAC ·
production hardening (rate limits, X-Hub-Sig).
- **COD / Deliveries operations page** — dedicated Kivo-designed UI with driver assignment, cash/money reconciliation calculation, and an embedded Google Map showing live driver locations. Requires a driver-GPS/location source (driver app or device tracking) as a prerequisite. Currently `/cod` and `/deliveries` 307-redirect to existing console pages; this is the proper V2 rebuild.
- **Kivo Menu management page** — a proper menu management UI inside the Kivo console. Currently `/menu` 307-redirects to `/dashboard`; the menu editor UI is V2 scope.

## 🟪 V3 — OPERATING-SYSTEM VISION
Interactive campaigns/quizzes (promo-engine-backed) · cockpit UI rebuild (object drawers) · CRM
segments/LTV/predictive · multi-agent orchestration · prompt versioning + A/B · simulation/QA suite ·
multi-restaurant console · white-label.

## ❌ REJECTED (don't re-propose)
- pgvector/hybrid search · ingredient_manifest middleware · temperature-0 agent rewrite
- Negation-guard on allergen gate (would create allergy bypass — a child-safety failure mode)
- Time-window allergy suppression (same risk: swallows genuinely new allergen within the window)
- Merging #5 wholesale (competing order engine)

---

## Key identifiers
- Repo `mohamedyousalama-ctrl/MaitreAI` · Supabase ref `zlighrbsjexrozrmuwpw` · Vercel `maitre-ai` · **Production domain: getkivo.io**
- Wesaya tenant `5acbc72f-def3-46cd-ad6c-bf0ff4a23642` · phone_number_id `1204305262760496`
- demo-pro tenant `0de3c0de-0001-4a00-8a00-000000000001`
- Sweet Shop tenant (formerly بلبن) `9244d8ef-66b1-417a-a012-41a389ab1abf` · phone_number_id `1141332049069236` · WABA `1738425377597624`
