# KIVO / KARIM — AI API COST-REDUCTION PLAN
**Grounded in the actual codebase. Safety-first. Target: 50%+ reduction, 70%+ achievable.**
*Owner: core-code (build) · Reviewed against real files: `lib/ai/llm/models.ts`, `lib/ai/respond.ts`, `lib/ai/prompt.ts`, `lib/ai/customer-turn.ts`*

---

## 0. WHAT YOU ALREADY HAVE (so we don't re-build it)

A generic "cut your AI costs" plan would tell you to switch to a cheaper model, add prompt caching, and stop letting the model compute prices. **You already do all three.** Verified in the code:

- **Customer agent is already Sonnet, not a flagship** (`customer_agent: claude-sonnet-4-6`, maxTokens 1024, thinking disabled). Input $3 / output $15 per 1M. So "switch to a cheaper model" is largely already done — the remaining lever is *not calling the model at all* when we don't need to.
- **Prompt caching is already live** (`lib/ai/llm/claude.ts` reads `cache_read_input_tokens`; the system prompt is assembled as a cacheable block).
- **Pricing is already tool-only** — the model never computes totals (money-truth guard).
- **A confirmation fast-path already exists** (`isExplicitOrderConfirmation` + `atConfirmationPoint` → `finalize_draft` with NO model call).
- **A model registry already exists** with Haiku tiers wired (`conversation_intel`, `perception` on Haiku) — so the multi-model ladder is half-built.
- **Cost is already logged per turn** to `agent_runs` (input_tokens, output_tokens, cache_read_tokens, cost_usd).

**So the real cost driver is exactly one thing:** every customer turn that reaches the model sends a **large system prompt** (full menu + extensive rules/guardrails — the prompt.ts file is huge) **× chat history × a tool loop up to 6 steps**, on Sonnet. The win is **(a) handle more turns with zero model calls, and (b) shrink what the model receives when it IS called.** Not switching models.

---

## 1. THE GUIDING RULE

> The LLM should handle ambiguity, warmth, persuasion, and genuinely unusual cases. Everything deterministic — menu browsing, exact-item add, order totals, confirmation, payment-method questions, hours, allergy escalation, receipt resend, simple status checks — should not call the expensive model.
>
> **Karim becomes a deterministic restaurant operating system with an LLM personality layer — not an LLM pretending to be an operating system.**

**Safety carve-out (non-negotiable):** cost optimization NEVER touches the allergen path. The allergen gate and the new symptom detector stay exactly as they are. "Make safety LLM-independent" is the goal — making it *cheaper* is a side effect, never a design target. No cost layer may suppress, delay, or downgrade an escalation.

---

## 2. THE PLAN — FIVE LAYERS, BUILT ON WHAT EXISTS

### Layer 0 — Expand the zero-LLM fast paths (biggest, safest win)
You already short-circuit allergen + confirmation. Extend the same pattern (a deterministic handler that returns approved copy + real data, no model call) to the other high-frequency, low-ambiguity turns:

1. Restaurant-closed reply (you have `isOpen` already — answer directly)
2. "فين الأوردر؟" / order status / receipt resend
3. Payment-method question (answer from tenant config)
4. Delivery areas / branch / hours question (answer from brain data)
5. Greeting / "المنيو" / category browse → `present_menu` directly (already a tool — call it without a reasoning loop)
6. Exact item price query (menu matcher → direct answer)
7. Exact item availability query
8. Fulfillment choice ("توصيل"/"استلام") when state is awaiting it
9. Simple quantity change on an exact known item

Each returns from server code using **approved Egyptian-Arabic copy** + real menu/brain data. **Expected: 25–45% of turns become zero-cost.** Quality *improves* (deterministic answers are faster and can't hallucinate).

> Implementation note: these must respect the same truth-system as the prompt (no fabricated numbers) and the same dialect. Reuse the dialect pack already in `prompt.ts`.

### Layer 1 — A cheap intent router before `respond()`
Add `classifyCustomerTurn()` that runs BEFORE the expensive turn. Mostly **deterministic** (regex + the menu matcher + current conversation state). Only when confidence is low does it fall to a **Haiku** classifier (you already have Haiku wired for `perception`).

Returns: `{ path: "zero_llm" | "cheap_llm" | "strong_llm" | "human", intent, confidence, reason }`.

**Hard rule:** `if safety_or_money_sensitive && confidence < threshold → strong_llm or human`. Never optimize a safety/money turn for cost. Allergen detection still runs first regardless of the router.

**Expected: 15–25% additional reduction.**

### Layer 2 — Menu retrieval instead of full-menu-in-prompt (biggest token win)
Today `menuBlock()` injects the menu into every prompt. For a 63-item menu (Sweet Shop) that's large input on *every* turn. Replace "whole menu in prompt" with a **hybrid**:
- Keep the **top ~10 signature/popular items** in the prompt (so Karim still feels like he "knows the food").
- Move the rest behind tools the model already pattern-matches: `search_menu(query)`, `get_category_items(category)`, `get_item_details(id)`, `get_active_offers()`.
- Most turns only need the exact item mentioned + the basket + top items — not all 63.

**Expected: 30–70% input-token reduction on large menus.** Quality often *improves* (the model stops drowning in a giant catalog). Caching already helps the stable parts; this shrinks the variable part too.

> Caution: keep the menu-version hash in the cacheable prefix so a menu edit correctly busts the cache.

### Layer 3 — Prompt caching, measured and tuned (you have it; instrument it)
You already cache. Make it a **monitored** feature:
- You log `cache_read_tokens` — also log `cache_creation_tokens` and `uncached_input_tokens`, then compute `cache_hit_rate = cache_read / (cache_read + creation + input)`.
- Restructure the prompt so ALL stable content sits in the cacheable prefix (Karim rules, dialect policy, safety policy, tool defs, restaurant static data, menu-version hash) and only the truly dynamic suffix varies (current message, draft, safety hold, last few messages, availability alert). The more that's in the stable prefix, the higher the hit rate.
- **Target: cache_hit_rate ≥ 60%.**

**Expected: 20–50% on input cost, traffic-pattern dependent.**

### Layer 4 — Finish the model-routing ladder (you have the registry)
You already have a per-use-case registry with Sonnet + Haiku tiers. Convert it from use-case-based to **risk/intent-based** routing for the customer turn:
- **Tier A — zero model:** exact operational turns (Layer 0 list).
- **Tier B — Haiku (cheap):** warmly rewriting a deterministic reply, simple FAQ, simple recommendation from provided candidates, low-risk messy-intent parsing.
- **Tier C — Sonnet (strong):** angry/confused customer, complex multi-item order with references, persuasion/upsell, hospitality moments, repeated failure.
- **Tier D — human:** allergy/medical, payment dispute, refund, repeated misunderstanding.

**Expected: 20–40% on the remaining LLM traffic.**

### Layer 5 (optional polish) — "AI only for the last 10%"
For a deterministic reply that needs warmth, send a **Haiku** a tiny prompt: *"Rewrite this server-generated Arabic reply in Karim's voice. Do NOT add or change any fact, price, item, discount, or safety claim."* Input is the facts + a draft; output is the warm version. Cheap model, tiny prompt, no hallucination risk (it can't add facts).

---

## 3. OUT-OF-THE-BOX MULTIPLIERS (from the attached analysis, kept where they fit)

- **Karim Reply Compiler** — a library of Egyptian-Arabic "reply moves" (`ack()`, `confirmAdd()`, `askFulfillment()`, `readbackOrder()`, `softUpsellOnce()`, `handoffSafety()`), each with 5–10 dialect variants chosen by context. Composes human-feeling replies for many turns with **no LLM**. This is the engine behind Layer 0.
- **Conversation state machine** — explicit states (BROWSING / BUILDING_ORDER / NEEDS_FULFILLMENT / AWAITING_CONFIRMATION / AWAITING_PAYMENT / PLACED / HUMAN_HOLD / SAFETY_HOLD). Each state has deterministic handlers; e.g. AWAITING_CONFIRMATION + "تمام/أكد/yes" → finalize, no LLM. (You already partially have this via `atConfirmationPoint`.)
- **Per-tenant menu alias dictionary learned from real chats** — `customer_phrase → menu_item_id` (confidence, source: human_confirmed / repeated_success / admin_added). After 1–2 weeks, "دبل"، "الميجا"، "العرض"، misspellings, Arabizi resolve deterministically → cheaper AND more accurate.
- **WhatsApp tap-first** — buttons/lists turn replies into structured IDs (`item_123`, `qty_2`, `pay_cod`, `confirm_order`) → zero LLM. UI design IS cost engineering.
- **Cost-aware escalation** — if Karim spends 2 model calls in one turn with no resolved action, stop and offer a human ("معلش، هحوّلك لفريق المطعم يظبطها معاك بسرعة 🙏"). Caps the worst-case expensive loop AND improves reliability. (Your loop is capped at ~6 steps; this caps it much earlier when it's clearly stuck.)

---

## 4. WHAT NOT TO DO

- **Don't blanket-switch to a cheap model.** It can hurt Arabic quality, order understanding, edge-cases, and brand feel. Use Haiku only *after* routing + guardrails decide a turn is low-risk.
- **Don't touch the allergen/safety path to save cost.** Make safety LLM-independent, never cheaper-at-the-cost-of-recall. No cost layer runs before or instead of the allergen gate + symptom detector.
- **Don't let the model compute prices to save a tool call.** A fabricated price is far worse than a few tokens. (You already enforce this — keep it.)
- **Don't remove WhatsApp buttons/lists** to save the occasional extra send — they reduce ambiguity and LLM turns and lift conversion.

---

## 5. ROLLOUT — SAFE ORDER, GATED PER-TENANT

Everything new is **flag-gated per tenant** (via `isFeatureExplicitlyEnabled`, default OFF), proven on **Sweet Shop**, and only enabled on **Wesaya** deliberately — same discipline as every other change. Because main serves Wesaya, an un-gated change to the turn path is a production change to Wesaya.

| Phase | Work | Days | Expected |
|---|---|---|---|
| **1 — Measure first** | Add full cost observability to `agent_runs` + a dashboard: cost/conversation, cost/completed-order, model-calls/turn, zero-LLM-turn %, cache-hit-rate, expensive-loop rate, cost-by-intent, cost-by-menu-size. **Targets:** zero-LLM ≥ 40%, avg model calls/turn ≤ 0.6, strong-model share ≤ 25%, cache hit ≥ 60%. | 1–2 | (baseline) |
| **2 — Zero-LLM fast paths** (Layer 0) | Deterministic handlers for the 9 turn types. Flag `zero_llm_fastpaths`. | 3–5 | 100 → 60 |
| **3 — Intent router** (Layer 1) | `classifyCustomerTurn()`, deterministic-first, Haiku fallback. Flag `intent_router`. Safety/money never cost-optimized. | 4–7 | 60 → 45 |
| **4 — Caching tune + restructure** (Layer 3) | Instrument cache metrics, move all stable content to the cacheable prefix. | 2–3 | 45 → 35 |
| **5 — Menu retrieval** (Layer 2) | Hybrid: top-10 in prompt + retrieval tools for the rest. Flag `menu_retrieval`. | 1–2 wk | 35 → 22–28 |
| **6 — Risk-based model routing** (Layer 4) | Convert the registry to intent/risk routing; Haiku for low-risk language. Flag `model_routing`. | 1 wk | 22–28 → 15–20 |

**Net: 50% is conservative; 70–80% is realistic** — and most of it comes from *not calling the model* and *sending it less*, with quality flat or better.

**Measure before you change anything (Phase 1 first).** Without the baseline you can't tell a real saving from a guess, and you can't catch a quality regression. Every phase ships behind a flag, proven on Sweet Shop, with the cost dashboard watched before enabling on Wesaya.

---

## 6. RELATIONSHIP TO THE WESAYA LAUNCH

This is a **post-launch optimization**, not a launch blocker. Wesaya goes live first (with the safety fixes + Meta provisioning); the cost work runs in parallel/after, on Sweet Shop, gated. The one thing worth doing *before* heavy traffic is **Phase 1 (measurement)** — so you have a real cost baseline from Wesaya's first orders to optimize against. Build the observability early; sequence the behavioral layers after launch.
