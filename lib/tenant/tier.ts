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
