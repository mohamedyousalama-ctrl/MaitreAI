// ============================================================================
// MaitreAI — Karim Pro P0: per-tenant tier flag (helper)
// A tenant is either "standard" (every existing tenant, the default) or "pro".
// isProTenant() is the single gate later Pro features check. Plumbing only —
// nothing reads this yet, so behavior is unchanged for standard tenants.
// ============================================================================

export type Tier = "standard" | "pro";

/** True only for an explicitly Pro tenant. Tolerant of raw/null DB values so a
 *  missing or unexpected tier never accidentally enables Pro behavior. */
export function isProTenant(tier: Tier | string | null | undefined): boolean {
  return tier === "pro";
}

/** Narrow Pro capabilities a STANDARD tenant can be granted one-at-a-time via
 *  restaurants.feature_flags, without flipping the whole tier to 'pro'. Each is a
 *  deliberate, separate switch — enabling one NEVER implies another.
 *  - conversation_intelligence (P1): emit terminal conversation reports.
 *  - customer_memory (P2): build per-customer memory + operator card from those
 *    reports. Operator-read DATA only; customer-facing surfacing is a later,
 *    separately-gated step. NOT implied by tier='pro' or by P1. */
// kitchen_ticket: the operator-facing money-stripped kitchen print view
// (/(console)/orders/[id]/ticket). Default-OFF, opt-in per tenant — the route
// 404s and the audit endpoint 410s unless this flag is explicitly enabled.
// console_v2: the new operator console (the /c route group). TWO-LAYER gate — the
// NEXT_PUBLIC_CONSOLE_V2 env var is the deploy-level kill-switch (whole group dark
// unless the deployment opts in); THIS per-tenant flag is what actually routes an
// individual restaurant to the new UI. Plumbing-only here — enforcement is wired
// in the console_v2 layout once tenant resolution lands (kickoff item 4 / R1).
// delivery_geo_routing (WO-DELIVERY-D1): geography-aware delivery — WhatsApp
// location-pin parsing, pin→zone point-in-radius matching, and branch routing in
// the ordering conversation. STRICT per-tenant switch (isFeatureExplicitlyEnabled),
// DEFAULT OFF, and deliberately NOT implied by tier='pro' — flag-off keeps the
// ordering conversation byte-identical to today (Wesaya untouched until Mohamed
// flips it). Gates ONLY the agent-conversation changes; zone geometry data + the
// console zone editor are visible regardless.
// allergy_companion_mode (WO-COMPANION-W1): Allergy-Companion Mode — swaps the legacy
// always-escalate allergy path for the companion contract (acknowledge + keep talking,
// two-axis data truth, §6 checkpoint, §1e recovery). STRICT per-tenant switch, DEFAULT
// OFF, NOT implied by tier='pro' — flag-off keeps the Wesaya-live engine byte-identical.
// delivery_runs (WO-DELIVERY-D2): multi-order delivery runs — a driver carries up
// to 3 deliveries as one run (grouping over existing rows), the /d run stop-list,
// KIVO grouping suggestions, and /t active-leg gating. STRICT per-tenant switch,
// DEFAULT OFF, never implied by tier='pro'. Flag-off keeps every single-delivery
// flow (assign, /d/<token>, /t/<token>, COD) byte-identical.
// media_turn_trigger (WO-MEDIA-INBOUND): an inbound WhatsApp image triggers a normal
// customer turn (caption/📷 = turn text + allergen-gate input; a one-shot vision read
// is stored provenance-marked as context only). Fixes the image → 45-min-silence drop.
// STRICT per-tenant switch, DEFAULT OFF, NOT implied by tier='pro' — flag-off drops
// images exactly as today (the main normalizer discards them), byte-identical.
// canonical_payment_methods (WO-T1-PAYMENTS): route ALL payment-method truth through
// the single lib/payments/resolve resolver, backed by the 0084 restaurant_payment_methods
// table, with the never-all-off guard and per-order selection snapshot. STRICT per-tenant
// switch, DEFAULT OFF, NEVER implied by tier='pro' — flag-off returns exactly the
// legacy normalized payment_config at every surface, so the ordering conversation,
// storefront, and settings stay byte-identical for existing tenants (Wesaya) until flipped.
// inbound_coalescing (WO-LIVE4-F2): merge a rapid burst of inbound messages (each its own
// Meta webhook) into ONE Brain turn via the 0085 last_answered_inbound_at watermark — kills
// the double reply and pulls every burst message's text through the allergen INPUT gate.
// STRICT per-tenant switch, DEFAULT OFF, NOT implied by tier='pro'; the watermark read is
// deploy-safe → flag-off (and pre-0085) tenants keep the single-message path, byte-identical.
// answer_first (WO-LIVE5-ANSWER-FIRST): when the customer explicitly asks to SEE a photo
// or the menu, a per-turn directive forces Karim to serve that request (send_item_photos /
// present_menu / honest no-photo) BEFORE advancing checkout. STRICT per-tenant switch,
// DEFAULT OFF, NOT implied by tier='pro'. The directive is appended only on a see-request
// turn, so flag-off (and every non-see-request turn) is byte-identical; the base prompt and
// the Khalid snapshot are unchanged.
// dup_order_awareness (WO-LIVE6-DUP-ORDER-AWARENESS): after an order is registered in a
// conversation, a reference to «طلبي القديم/اللي فات» resolves to THAT order (deterministic
// recap, no re-finalize) instead of re-building a duplicate (live #1009→#1010, past the 120s
// double-tap window). STRICT per-tenant switch, DEFAULT OFF, NOT implied by tier='pro'. The
// intercept sits after every safety branch and only when a registered order actually exists,
// so flag-off — and any turn without an explicit old-order reference — is byte-identical.
export type ProFeature = "conversation_intelligence" | "customer_memory" | "conversation_outcomes" | "perception" | "cadence" | "stateful_orders" | "deterministic_allergen_safety" | "allergen_symptom_detection" | "psp_payments" | "staff_command_channel" | "standing_instructions" | "kitchen_ticket" | "console_v2" | "media_guard" | "khalid_persona" | "ksa_encyclopedia" | "callback_requests" | "qz_print" | "voice_notes" | "photo_thread" | "manager_command_recognition" | "delivery_geo_routing" | "allergy_companion_mode" | "delivery_runs" | "media_turn_trigger" | "canonical_payment_methods" | "inbound_coalescing" | "answer_first" | "persist_outbound_media" | "voice_garble_guard" | "dup_order_awareness";

/** A feature is ON when the tenant explicitly enabled THAT feature (narrow,
 *  default-off opt-in) OR the tenant is full 'pro' (gets everything). Keeping a
 *  tenant 'standard' + one flag means future Pro features gated on isProTenant
 *  stay OFF for them — the safe, least-privilege default. */
export function isFeatureEnabled(
  feature: ProFeature,
  ctx: { tier?: Tier | string | null; features?: Record<string, unknown> | null | undefined }
): boolean {
  if (ctx.features && ctx.features[feature] === true) return true;
  return isProTenant(ctx.tier);
}

/** STRICT per-feature gate: ON only when the tenant EXPLICITLY set this flag in
 *  feature_flags — deliberately NOT implied by tier='pro'. Use this for a
 *  capability that must be a separate, conscious switch even on a Pro tenant, so
 *  it can be enabled and verified on its own (e.g. P2 customer_memory: a Pro
 *  tenant does NOT get it until it is explicitly turned on). Compare to
 *  isFeatureEnabled, where full 'pro' implies every feature. */
export function isFeatureExplicitlyEnabled(
  feature: ProFeature,
  features: Record<string, unknown> | null | undefined
): boolean {
  return !!features && features[feature] === true;
}
