import { createHash } from "node:crypto";

// Wesaya production feature_flags snapshot, read from the tenant row on 2026-07-23.
// Tenant: 5acbc72f-def3-46cd-ad6c-bf0ff4a23642
// Capture timestamp: 2026-07-23T15:17:44.000Z (recorded with the original fixture commit).
// Hash algorithm: SHA-256 over UTF-8 compact JSON after lexicographically sorting keys.
//
// Keep this fixture COMPLETE. Safety proofs must start from this vector and change
// only the one flag named by a contrast case; simplified flag bags are exactly how
// WO-PROOF-3 says the production-only interactions escaped earlier coverage.
export const WESAYA_PRODUCTION_FEATURE_FLAGS_CAPTURED_AT =
  "2026-07-23T15:17:44.000Z";
export const WESAYA_PRODUCTION_FEATURE_FLAGS_HASH_ALGORITHM = "SHA-256";

export const WESAYA_PRODUCTION_FEATURE_FLAGS = Object.freeze({
  cadence: true,
  console_v2: true,
  goal_logic: true,
  perception: true,
  finish_line: true,
  media_guard: true,
  answer_first: true,
  photo_thread: true,
  delivery_runs: false,
  safety_bridge: true,
  allergy_simple: true,
  reply_dampener: true,
  address_flow_v2: true,
  handoff_timeout: true,
  stateful_orders: true,
  perception_async: true,
  allergy_calm_hold: true,
  price_truth_guard: true,
  action_claim_guard: true,
  inbound_coalescing: true,
  media_turn_trigger: true,
  voice_garble_guard: true,
  dup_order_awareness: true,
  memory_allergy_gate: true,
  typed_quantity_fill: true,
  delivery_geo_routing: true,
  allergy_companion_mode: true,
  persist_outbound_media: true,
  call_count_observability: true,
  conversation_intelligence: true,
  typed_interactive_actions: true,
  allergen_symptom_detection: true,
  deterministic_allergen_safety: true,
  goal_logic_rule6_annotation_pivot: true,
} satisfies Record<string, boolean>);

export type WesayaProductionFeatureFlags = typeof WESAYA_PRODUCTION_FEATURE_FLAGS;

/** Stable serialization used by the captured-vector integrity hash. */
export function canonicalizeWesayaProductionFeatureFlags(
  flags: Readonly<Record<string, boolean>> = WESAYA_PRODUCTION_FEATURE_FLAGS
): string {
  const entries = Object.entries(flags).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  return JSON.stringify(Object.fromEntries(entries));
}

/** SHA-256 of the frozen captured vector's stable serialization. */
export function hashWesayaProductionFeatureFlags(
  flags: Readonly<Record<string, boolean>> = WESAYA_PRODUCTION_FEATURE_FLAGS
): string {
  return createHash("sha256")
    .update(canonicalizeWesayaProductionFeatureFlags(flags), "utf8")
    .digest("hex");
}

export const WESAYA_PRODUCTION_FEATURE_FLAGS_SHA256 =
  "d46a986932499c21b00ec6718d93e1d1e255c905344b0e2291ed8e4ae7ab2a0f";

/** Clone the complete production vector and override only the explicitly named case flags. */
export function wesayaProductionFlags(
  overrides: Partial<Record<keyof WesayaProductionFeatureFlags, boolean>> = {}
): Record<keyof WesayaProductionFeatureFlags, boolean> {
  return { ...WESAYA_PRODUCTION_FEATURE_FLAGS, ...overrides };
}
