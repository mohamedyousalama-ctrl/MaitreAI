# Kivo — Product Roadmap

> **Single source of truth.** This file is updated on EVERY merge: the shipping work-order's final step
> moves the shipped item to DONE and adjusts status. Do not maintain a parallel copy elsewhere.
> Last updated: 2026-06-22 (delivery dispatch + driver flow re-port, flag-off/inert).

## North Star
Not "launch restaurants," not unbounded "best agent." **The agent («كريم») that is unbeatable on 4 pillars,
proven on real traffic:** (1) order accuracy, (2) honesty, (3) never stuck, (4) human warmth. Restaurants
(Wesaya, BLaban) are real-traffic proving grounds, not business goals. Kivo = the platform; كريم = the agent.

## Sovereign principles (never violated)
- Menu/promos = external source-of-truth DATA; code follows the menu, never the reverse.
- Honesty: DB-only money, real menu only, recap-before-commit. Allergy = hard-escalate, never assert "safe."
- Order accuracy is sovereign. Customization = tenant DATA + packs + adapters, never per-client code.
- Routing/governance = deterministic state, never a supervisor agent.
- Truth-driven UI: no invented metrics (live / gathering-data / coming-soon states only).
- One central code-writer (one Claude Code window); other windows read-only.
- Run live proof BEFORE merge on customer-facing changes.

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

## 🔵 IN FLIGHT (≤2 parallel tracks)
- Kivo UI — Claude Design building 7 purpose-built pages (Insights · Conversations · Orders · Customers · Settings · Login · Landing)
- BLaban go-live — seeded (data-only) · prod domain confirmed (`maitre-ai.vercel.app`) · webhook now per-tenant (#86) ·
  remaining: store BLaban app secret via dashboard (`POST /api/settings/whatsapp`) + complete Meta verify/subscribe · then live test

---

## V1 — STRONGEST AGENT (4 pillars to market-beating)

### Pillar 2 — Honesty / Safety
- ✅ Deterministic allergen escalation + never-say-safe (#87) — euphemism-aware code gate (not keyword «حساسية»
  only) · structured `is_safety_hold` (no wrong auto-return) · never-say-safe output guard. Flag-gated; live on
  BLaban + demo-pro. Refinements: boundary-aware allergen naming (#88, «البندق»→«بندق» not «لبن»); output guard
  decoupled block-vs-escalate (#89 — a benign «من غير بندق» filter is answered honestly, no false handoff;
  claim still always blocked; escalates only on a real avoidance signal / active safety hold).
- ⬜ Remaining allergen-posture polish (→ folds into V2-C structured allergen layer): "contains"-only phrasing ·
  coverage-honesty (operator-verified vs unknown) · one-time nut notice (dessert). Needs the structured
  allergen profile (V2-C), not just prompt/gate.

### Pillar 1 — Order Accuracy (main strength push)
- ✅ Order-confirm loop fixed (#90) — confirm with no fulfillment surfaced the ACTIONABLE «استلام ولا توصيل؟»
  (was masked by a generic deferral → verbatim loop) · present_order_actions gated on fulfillment · fulfillment-
  before-confirm prompt rule · loop-breaker. Shared path → both tenants. Happy path completes (finalize→orders).
- ⬜ B2 — `order_drafts` table · committed-vs-draft separation · serial multi-order (kills «أمسحه» contradiction)
- ⬜ B3 — deterministic qty-collision confirm guard (code backstop to «هات»)
- ⬜ Deterministic allergy-gate (code-enforced hard-fire vs prompt-stochastic 7/8) · tighten allergy-refusal phrasing · single-item «عادي دبل» gate

### Pillar 3 — Never Stuck (conversation spine)
- ⬜ Conversation spine — ownership axis (AI_ACTIVE/HUMAN_ACTIVE/HUMAN_IDLE/SYSTEM_HOLD/CLOSED) + order-lifecycle
  axis (consumes B2) + guarded send-gateway + explicit human-return + timeout→idle · risk-flags + missing-fields as data
- ⬜ "Suggest a reply" operator copilot (human-in-the-loop; distinct from a supervisor agent)

### Pillar 4 — Human Warmth (human P-series)
- ⬜ P6 initiative (repair: acknowledge→correct→show-state · active in-order memory · state-visibility · micro-contracts)
- ⬜ P5 texture (tone/warmth depth)
- ⬜ P7 learning loop
- ⬜ P8 agent console UI (manager cockpit · Bug #3 order-status interleaving · allergy-hold release via verified console action)

### V1 proving + housekeeping
- ⬜ Every pillar proven on Wesaya AND BLaban (different menu/dialect/shape)
- ⬜ Confirm real prod URL / Vercel domain (currently blocking BLaban webhook)

---

## V2 — "CONVERSATIONAL OPERATIONS CONTROL" (captured; nothing built yet)
Reframe: customers' chat → orders; operators' chat → configuration; all compiled into safe, versioned,
audited operational truth. The governed-knowledge-system moat.

### V2-A — Customization layer (product-defining)
- ⬜ Tenant data model + knowledge/persona packs + reusable integration adapters (never per-client code)
- ⬜ Self-serve onboarding (fill structured data, no code — the "client #10" test)
- ⬜ Per-branch availability model (`branch_id` on menu_items — the BLaban 14-branch gap)

### V2-B — Configure-by-chat (operator change-compiler)
- ⬜ Operator chat = parser, never DB writer · propose → confirm → apply pipeline
- ⬜ Change-proposal object · deterministic tenant-scoped writer (tenant_id from auth, never message)
- ⬜ Risk tiers: price/availability/photo (confirm+apply) · new-item/promo (preview) · allergens/deletions = dashboard-only, never chat
- ⬜ Menu versioning (draft/published/archived) · Karim reads published snapshot only
- ⬜ Audit log + rollback (undo last change) · in-order price-snapshot (no mid-order price break)
- ⬜ Risky-change re-verification (OTP / elevated role)

### V2-C — Structured allergen intelligence layer
- ⬜ Allergen profile per item: `coverage_status` (unknown/parsed/operator-verified) + evidence + confidence
- ⬜ Onboarding allergen-review queue (human-verified, never auto-trust) · Karim wording gated by coverage
- ⬜ Cross-contact policy field · runtime contract (Karim's allowed claims set by data, not prompt)

### V2-D — Menu ingestion (uploads → structured data)
- ⬜ Photo/PDF/URL ingestion via multimodal LLM (Gemini/Mistral/Qari-OCR for Arabic menus)
- ⬜ Ingestion confidence pipeline → diff/preview → human review → publish (never auto-publish)
- ⬜ (Later) Qari-OCR fine-tune on Egyptian dessert menus + synthetic-data pipeline

### V2-E — Commerce & channels
- ⬜ Multi-order/multi-address (parallel) · WhatsApp Catalog · POS→catalog sync · Foodics integration
- ⬜ Fawry + Paymob/mada · WALLET/INSTAPAY/card in agent flow · e-invoicing (ZATCA/ETA)
- ⬜ Out-of-window message templates (24h-window-aware) · COD ledger · KDS-lite · CRM
- ⬜ Web-chat channel (no-Meta plug-and-play) · white-label web ordering
- ⬜ Customer-facing memory ("the usual?", own gate) · multi-tenant hardening

### V2-F — Production hardening (at paying volume)
- ⬜ Webhook X-Hub-Signature validation · rate-limits / anomaly detection · capability-based RBAC per role
- ⬜ Menu integrity tests (publish = deploy) · race-condition price locking · escalation tier system (restaurant → Kivo support SLA)

---

## Milestones
- M1 (now): BLaban live on real traffic + allergen-safety active → Pillar 2 proven
- M2: B2 + B3 + spine → Pillars 1 + 3 proven on both restaurants
- M3: P5–P8 → Pillar 4 + operator console → V1 = market-beating agent
- M4: V2-A/B/C → self-serve onboarding + configure-by-chat → product, not project
- M5: V2-D/E/F → scale toward ~100 restaurants

## Key identifiers
- Repo `mohamedyousalama-ctrl/MaitreAI` · Supabase ref `zlighrbsjexrozrmuwpw` · Vercel `maitre-ai`
- Wesaya tenant `5acbc72f-def3-46cd-ad6c-bf0ff4a23642` · phone_number_id `1204305262760496`
- demo-pro tenant `0de3c0de-0001-4a00-8a00-000000000001`
- BLaban tenant (to seed) · phone_number_id `1141332049069236` · WABA `1738425377597624`
