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
 *  restaurants.feature_flags, without flipping the whole tier to 'pro'. */
export type ProFeature = "conversation_intelligence";

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
