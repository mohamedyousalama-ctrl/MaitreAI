# Feature Flag Registry

> **Owner:** Engineering · **Status:** Active · **Last reviewed:** 2026-07-12

The single index of every feature flag in the codebase. Generated from and verified
against `lib/feature-flags.ts` (deploy/env flags) and `lib/tenant/tier.ts` (per-tenant
`feature_flags`). When you add, rename, remove, or change the default of a flag, update
this file in the same PR (see the PR checklist).

Two kinds of flag exist:

- **Deploy flags** live in `lib/feature-flags.ts`, read a `NEXT_PUBLIC_*` env var, and
  gate a surface for the WHOLE deployment. Flipping one is an **Engineering** action:
  set the env var in Vercel and redeploy. No secrets live here.
- **Per-tenant flags** live in `restaurants.feature_flags` (JSONB) and are checked
  through `lib/tenant/tier.ts`. They gate a capability for ONE restaurant. Flipping one
  is a **Kivo Ops** action (settings write on that tenant). Default OFF unless noted.

---

## Deploy flags (`lib/feature-flags.ts`)

| Flag (constant) | Env var | Default | Purpose | Who may flip |
|---|---|---|---|---|
| `ENABLE_ADMIN_CHAT_CONSOLE` | `NEXT_PUBLIC_ENABLE_ADMIN_CHAT_CONSOLE` | **off** | Reveals the operator «الرئيسية» Maître admin-chat console (`/api/agent/admin`) + the in-chat promotion builder. Hidden during the order-engine upgrade. | Engineering (env + redeploy) |
| `CONSOLE_V2` | `NEXT_PUBLIC_CONSOLE_V2` | **off** | Deploy-level kill-switch for the entire new operator console (`app/(console-v2)`, the `/c` route group). Must be on for the per-tenant `console_v2` flag to route anyone into the new UI. | Engineering (env + redeploy) |
| `ENABLE_DELIVERY_TRACKING` | `NEXT_PUBLIC_ENABLE_DELIVERY_TRACKING` | **on** | The delivery dispatch + driver flow + customer tracking module (drivers, deliveries, `/d/<token>`, `/t/<token>`, operator deliveries view). Set the env var to `"false"` to make the whole module inert. | Engineering (env + redeploy) |
| `ENABLE_MIZAN_PANEL` | `NEXT_PUBLIC_ENABLE_MIZAN_PANEL` | **off** | The hosted MIZAN reviewer surface (`/mizan/<token>` + `/api/mizan/*`) where a Saudi reviewer scores Khalid's replies. 404s until on. Does not touch any customer-facing turn. | Engineering (env + redeploy) |

> `HOME_HREF` in the same file is a **derived constant**, not a flag: it resolves the
> post-login landing route from `ENABLE_ADMIN_CHAT_CONSOLE` (`/dashboard` when on, else
> `/conversations`). Listed here so it isn't mistaken for an independent switch.

---

## Per-tenant flags (`lib/tenant/tier.ts` → `restaurants.feature_flags`)

**Tier:** a tenant is `standard` (default) or `pro` (`isProTenant`). `isFeatureEnabled`
treats `tier='pro'` as implying every capability below; `isFeatureExplicitlyEnabled`
requires the flag to be set on the tenant **even for a Pro tenant** (a deliberate,
separately-verified switch — e.g. `customer_memory`). All default **off** for a standard
tenant. Who may flip: **Kivo Ops** (per-tenant `feature_flags` write).

| Flag | Purpose |
|---|---|
| `conversation_intelligence` | Emit terminal conversation reports (Karim Pro P1). |
| `customer_memory` | Build per-customer memory + the operator card from those reports (P2). Strict opt-in — NOT implied by `tier='pro'`. |
| `conversation_outcomes` | Classify and persist a terminal outcome row per conversation. |
| `perception` | Per-turn perception read (risk/intent) that feeds a directive into the agent. |
| `cadence` | Honest read-receipt + typing indicator fired on each inbound. |
| `stateful_orders` | Persistent multi-turn order draft/basket state across messages. |
| `deterministic_allergen_safety` | The deterministic allergen safety gate + the structured `is_safety_hold` flag. |
| `allergen_symptom_detection` | Symptom-based allergen escalation (companion to the gate). |
| `psp_payments` | PSP (Moyasar) online payment links. |
| `staff_command_channel` | The staff WhatsApp command lane — registered staff numbers routed to deterministic commands, never the customer lane. |
| `standing_instructions` | Per-tenant standing instructions injected into the brain prompt. |
| `kitchen_ticket` | The money-stripped kitchen print view (`/(console)/orders/[id]/ticket`); route 404s / audit 410s unless on. |
| `console_v2` | Routes THIS restaurant into the new console_v2 UI (requires the `CONSOLE_V2` deploy flag on too). |
| `media_guard` | Per-conversation image/media send budget + guard. |
| `media_turn_trigger` | Inbound WhatsApp **images** trigger a normal customer turn (fixes the 45-min silent-drop). The caption (customer's words) is the turn text + allergen-gate input; a one-shot Haiku vision read is stored provenance-marked (`meta.image.description`, `derived:true`) and injected as context only. Default OFF → flag-off tenants drop images exactly as before (byte-identical). |
| `khalid_persona` | The Khalid (KSA) persona for the customer agent. |
| `ksa_encyclopedia` | KSA dish/ingredient encyclopedia knowledge available to the agent. |
| `callback_requests` | Customer callback-request capture flow. |
| `qz_print` | QZ Tray local-printer integration. |
| `voice_notes` | Additive outbound voice-note replies alongside text (WO-VOICE-2). |
| `photo_thread` | Grouped photo-thread captions for menu/item images. |
| `persist_outbound_media` | Persist each successfully-sent outbound dish photo as a message row (`meta.kind:"dish_photo"`, `meta.image.url` = public menu URL) so the console transcript is complete (WO-PHOTO-PERSIST). Default OFF → the send path never inserts, byte-identical. Flip ON for Wesaya in the ceremony lane post-merge. |
| `manager_command_recognition` | Recognize a manager messaging the business number and treat them accordingly. |
| `canonical_payment_methods` | Route ALL payment-method truth through the single `lib/payments/resolve` resolver, backed by the `0084` `restaurant_payment_methods` table, with the never-all-off guard (a tenant can never have zero enabled methods; safe default cash/COD) + the immutable per-order `order_payment_snapshot` (offered + chosen). Manual methods only (`cod`/`vodafone_cash`/`instapay`); the PSP/online-card stack is untouched. Default OFF → flag-off returns exactly the legacy normalized `payment_config` at every surface (agent, storefront, settings), byte-identical. Requires the prepare-only `0084` migration applied first. |
| `delivery_geo_routing` | Geography-aware delivery: a WhatsApp location pin → zone → branch routing + delivery fee, with unmatched pins logged to `zone_misses` (WO-DELIVERY-D1, #402). Requires the prepare-only `0081` migration. Default OFF → pins are ignored exactly as before (byte-identical). **Live-flipped ON for Wesaya** (2 geo zones) per the ceremony records. |
| `delivery_runs` | Multi-order delivery runs: a driver carries up to N active deliveries as one run, with run-level token auth + COD roll-up and customer active-leg tracking on `/t` (WO-DELIVERY-D2, #409). Requires the prepare-only `0082` migration; every runtime read is deploy-safe. Default OFF → byte-identical. **Live-flipped ON for Wesaya** per the ceremony records. |
| `answer_first` | Answer-first doctrine: when the customer explicitly asks to SEE a photo or the menu (`asksToSeeMedia` — a visual noun + a request/receive frame), a per-turn directive forces Karim to serve that request (`send_item_photos` / `present_menu` / an honest no-photo line + the menu) BEFORE advancing checkout (WO-LIVE5-ANSWER-FIRST — live #1005 ignored two «ابعتلي صوره» requests). The directive appends only on a see-request turn, so flag-OFF and every non-see-request turn are byte-identical; base prompt + Khalid snapshot unchanged. Default OFF. |
| `allergy_companion_mode` | Allergy-Companion Mode: swaps the legacy forced-escalation for the companion contract — acknowledge + keep talking, the §6 pre-confirmation checkpoint, the §0 never-assert-safety output guard, and the two-axis (ingredient × preparation) per-dish truth model (WO-COMPANION W1 `160db60`, extended by W2/W3). Requires the prepare-only `0080`/`0083` migrations. Default OFF → legacy path, byte-identical. **Live-flipped ON for Wesaya + the test tenants** per the ceremony records. |
| `inbound_coalescing` | Per-conversation inbound coalescing: Meta delivers each message as its own webhook, so a rapid burst (or a pin-then-text) otherwise becomes N Brain turns = N replies (live #1004 double reply) and only the newest message reaches the gated `userMessage`. ON → the Brain gathers every customer message newer than the `conversations.last_answered_inbound_at` watermark, merges them into ONE gated turn (so a safety word anywhere in the burst reaches the allergen input gate), answers once, then advances the watermark — the burst's second webhook stays silent, a message that lands mid-turn is never dropped (WO-LIVE4-F2). Requires the prepare-only `0085` migration; the watermark read is deploy-safe. Default OFF → single-message path, byte-identical. |
| `goal_logic` | V1.0 goal-logic reasoning layer, Slice 1 (WO-V1.0-GOAL-LOGIC): moves intent-reasoning to the FRONT of the turn so Karim reasons before composing, instead of the reactive post-hoc guards substituting canned strings. ON → (1) **Goal Interpreter** (`classifyGoal`, reuses the `perceiveTurn` read — no new model call) routes every inbound by one RULE: PRICE-request → tool-only (model never states a number) · AMBIGUOUS (bare number «1000», referent-less «العرض/الكبير», bare assent off a confirmation point, a headcount ask Slice-2's planner isn't built for) → ask ONE grounded question (`buildClarifyingQuestion`) · CLEAR → the normal model+tool loop; (2) the **Final Validator** (`validateNumerals`) supersedes `price_truth_guard`/`fabricatesMoney` — every customer-facing numeral must trace to {C customer}∪{M verified-menu}∪{Q quote-engine}∪{D delivery/promo}: a mis-bound item price is repaired to its {M} value (the «عرض كاديا — ١٥٠» when real is ٣٢٠ class), an untraceable stray numeral is stripped, and a deterministic banned-word scrubber (`scrubBannedWords`) rewrites «السيستم/أبني الطلب/…» → waiter language from ANY source (model, a demoted guard's fallback, a legacy string) so a banned word can never reach the customer or seed the anchoring loop. **Bundles `perception` ON.** Basket Planner (headcount/feast composition, §2) is Slice 2 — blocked on founder-verified serving metadata; a headcount ask is answered with an honest clarifying question, never a fabricated plan. Default OFF → the reactive pipeline + legacy guards run unchanged, byte-identical; base prompt + Khalid snapshot unchanged. Founder A/B on Wesaya before cutover. |
| `safety_bridge` | Safety-class handoff bridge (FR-012 residual): when a conversation is HUMAN_ACTIVE (an operator took over) and then goes quiet, a SAFETY-CLASS customer message (allergy/medical — the same deterministic detectors the Brain uses) can sit unacknowledged because the takeover branch bails silently (WO-SAFETY-BRIDGE). ON → if the wait clock (`conversations.updated_at`, reset only by operator replies) is stale past a short window (`SAFETY_BRIDGE_WINDOW_MINUTES` = 3, independent of `handoff_idle_minutes`) and the latest inbound is safety-class, the customer gets a caution ACK (persona-routed, never-assert-safety — «صحتك تهمّنا … نبّهت الفريق … ما تكمّلش الطلب لحد ما حد يتأكد معاك») **and** a LOUD re-alert fires (`recordCriticalAlert` type `safety_unattended_handoff` → banner + WhatsApp-to-admin + email). **Ownership stays human** (no `setOwnershipState`) and the **wait clock is NOT bumped** (an automated ack is not operator activity), so absence stays truthful and the next re-alert isn't suppressed. Deduped to ≤1 per window via a `safety_bridge_ack` system-note marker. Runs before the idle policy, so it covers the `handoff_timeout`-OFF and not-yet-idle cases. Default OFF → never evaluated, byte-identical; base prompt + Khalid snapshot unchanged. |
| `handoff_timeout` | Idle human-handoff timeout policy already read by `lib/tenant/handoff.ts` from `restaurants.feature_flags`: governs the existing idle auto-return / re-alert behavior from tenant handoff settings. Registered here so it is tracked like every other per-tenant flag; default OFF and this docs/type update does not change runtime behavior. |
| `reply_dampener` | Unclear-fragment reply dampener: a burst of non-actionable fragments (single letters «د/سا/ب», punctuation «:(:$», emoji strings) otherwise each draws a «مش فاهم» reply, piling up 4+ in seconds (WO-LIVE6-REPLY-DAMPENER — live conv 68966859, 15:18–15:19). ON → after **2** answered unclear-fragment replies within a **5-minute** window, a 3rd+ unclear fragment gets **silence** (no LLM call, no reply); the streak is DERIVED from the recent messages already loaded (`shouldDampenReply` / `trailingUnclearStreak` — no schema, no migration). **SAFETY-FIRST:** the allergen net (avoidance/symptom/phonetic/emergency) + the human-request detector run FIRST and always win — a safety or human-request message is NEVER dampened; **any meaningful message resets** the streak. `isUnclearFragment` is skip-on-doubt: only the unmistakably non-actionable (empty / emoji-punctuation-symbol-only / a lone character) is unclear — any digit or a 2+ letter residue (incl. real short food words «رز»/«شاي») is meaningful. Default OFF → never evaluated, byte-identical; base prompt + Khalid snapshot unchanged. |
| `price_truth_guard` | Outbound price-truth repair: the model may quote a real menu price for the WRONG item — the number-level money guard only checks "is this a real price somewhere?", so «عرض كاديا — ١٥٠ ج.م» (real price ٣٢٠; ١٥٠ is real for other items) sailed through and a customer ordered ٣× at the fabricated ١٥٠ (WO-LIVE6-PRICE-TRUTH — live conv c016a121, 19:57:57). ON → `repairPriceTruth` extracts each item→price pair the model wrote in free prose, verifies the amount against THAT item's valid-price set (base + variant/size prices), and REPAIRS a mis-attributed figure in place (١٥٠→٣٢٠, same digit script) before send — never blocks, never holds. A multi-price item that matches no valid price is logged, never repaired (a variant quote is likely legitimate); every repair AND every skipped/ambiguous bind emits a `money_mismatch` signal `{item, quoted, real}`. Runs only on model free prose (no money tool ran → engine/tool figures are truth, untouched); the prompt is never gated on the flag. Default OFF → guard never runs, byte-identical; base prompt + Khalid snapshot unchanged. |
| `dup_order_awareness` | Duplicate-order awareness: after an order is registered in a conversation, an explicit reference to it (`refersToRegisteredOrder` — an "old/previous/first" qualifier bound to طلب/طلبي, e.g. «طلبي القديم»، «الطلب السابق»، «طلبي اللي فات»، «نفس طلبي»; bare «طلبي» and reorder intent «تاني/كمان مرة/أعيد/جديد» are excluded) resolves to THAT order — a deterministic recap «طلبك #N مسجّل بالفعل ✅» + an open door for a new order, no re-finalize — instead of re-building a byte-identical duplicate (WO-LIVE6-DUP-ORDER-AWARENESS — live #1009→#1010, same basket 23 min apart, past the 120s double-tap window). The intercept sits AFTER every safety branch (allergen/emergency/human-request never suppressed) and fires only when a non-cancelled registered order exists this conversation, so flag-OFF and every turn without an explicit old-order reference are byte-identical; base prompt + Khalid snapshot unchanged. Default OFF. |

---

_To regenerate: read the `ProFeature` union and the exported constants in the two source
files above and reconcile every entry here against them._
