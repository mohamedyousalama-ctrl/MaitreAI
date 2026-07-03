// ============================================================================
// MaitreAI — R1 Tenant Gate decision (pure; browser+server safe)
// The PURE authorization decision every console route ultimately applies. No
// DB, no next/server, no server-only — so it is exhaustively unit-testable and
// importable from anywhere. `requireTenant` (server) resolves the session and
// feeds this; the route turns a deny into a NextResponse.
//
// There is NO default tenant, ever: an unresolved active restaurant is a hard
// 403, never a guess.
//
//   401 unauthorized     — no signed-in user
//   403 no_active_tenant — signed in, but no explicit active restaurant resolved
//   403 tenant_mismatch  — a route-supplied restaurant_id ≠ the session tenant
//   403 forbidden_role   — manager-only route reached by a non-manager
// ============================================================================

import type { Tenant } from "@/lib/db/tenant";

export interface TenantGateOptions {
  /** When set, the session tenant MUST match this restaurant_id or → 403 tenant_mismatch. */
  expectedRid?: string | null;
  /** When true, a non-manager role → 403 forbidden_role. */
  requireManager?: boolean;
}

export type TenantGateResult =
  | { ok: true; tenant: Tenant }
  | { ok: false; status: 401 | 403; error: "unauthorized" | "no_active_tenant" | "tenant_mismatch" | "forbidden_role" };

/**
 * Pure gate decision. `signedIn` and `tenant` are resolved by the caller so this
 * stays DB-free. Order matters: identity → active tenant → tenant match → role.
 */
export function tenantGate(
  input: { signedIn: boolean; tenant: Tenant | null },
  opts: TenantGateOptions = {},
): TenantGateResult {
  if (!input.signedIn) return { ok: false, status: 401, error: "unauthorized" };
  // No default tenant ever: an unresolved active restaurant is a hard 403.
  if (!input.tenant) return { ok: false, status: 403, error: "no_active_tenant" };
  if (opts.expectedRid && input.tenant.restaurantId !== opts.expectedRid)
    return { ok: false, status: 403, error: "tenant_mismatch" };
  if (opts.requireManager && input.tenant.role !== "manager")
    return { ok: false, status: 403, error: "forbidden_role" };
  return { ok: true, tenant: input.tenant };
}
