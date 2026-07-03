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
export type ProFeature = "conversation_intelligence" | "customer_memory" | "conversation_outcomes" | "perception" | "cadence" | "stateful_orders" | "deterministic_allergen_safety" | "allergen_symptom_detection" | "psp_payments";

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
