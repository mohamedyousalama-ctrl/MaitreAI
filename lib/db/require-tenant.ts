// ============================================================================
// MaitreAI — R1 Tenant Gate wrapper (server only)
// The single server-side authorization primitive every console API route uses
// to reject an absent, mismatched, or under-privileged tenant. There is NO
// default tenant, ever: a session must resolve to an explicit active restaurant
// (host-pin or the ACTIVE_RESTAURANT_COOKIE) via getServerTenant(). This layers
// on TOP of RLS (which already scopes reads/writes) so a route fails CLOSED at
// the door with a clear status, rather than silently returning empty data.
//
// The DECISION lives in the pure, DB-free `tenantGate` (lib/db/tenant-gate.ts,
// exhaustively unit-testable). `requireTenant` is the thin async wrapper that
// resolves the session and turns a deny into a ready-to-return NextResponse.
// ============================================================================

import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { tenantGate, type TenantGateOptions } from "@/lib/db/tenant-gate";
import { sameOriginGate } from "@/lib/http/same-origin";
import type { Tenant } from "@/lib/db/tenant";

export type { TenantGateOptions, TenantGateResult } from "@/lib/db/tenant-gate";
export { tenantGate } from "@/lib/db/tenant-gate";

export type RequireTenantResult =
  | { ok: true; tenant: Tenant }
  | { ok: false; response: NextResponse };

/**
 * Resolve the session tenant and apply the gate. On deny, `response` is a
 * ready-to-return NextResponse with the correct status; on allow, `tenant` is
 * the verified session tenant. Usage:
 *
 *   const gate = await requireTenant();
 *   if (!gate.ok) return gate.response;
 *   const { restaurantId, role } = gate.tenant;
 */
export async function requireTenant(opts: TenantGateOptions = {}): Promise<RequireTenantResult> {
  const supabase = createClient();
  if (!supabase) return { ok: false, response: NextResponse.json({ error: "not_configured" }, { status: 503 }) };

  // CSRF-1: cookie auth is ambient, so a mutating (POST/PUT/PATCH/DELETE) request
  // must be same-origin. This is the SINGLE insertion point — the #303 sweep put
  // every console route behind requireTenant, so the check covers all of them,
  // and the exclusions (signature-authed webhooks, bearer cron, public health,
  // public storefront) are already OUTSIDE requireTenant, so they're untouched.
  // The method is stamped by the middleware as `x-kivo-method`; safe methods pass.
  const h = headers();
  const csrf = sameOriginGate({
    method: h.get("x-kivo-method"),
    origin: h.get("origin"),
    referer: h.get("referer"),
    host: h.get("x-forwarded-host") ?? h.get("host"),
  });
  if (!csrf.ok) return { ok: false, response: NextResponse.json({ error: "csrf" }, { status: 403 }) };

  // Identity is separate from tenant resolution so we can distinguish a 401
  // (not signed in) from a 403 (signed in, no active restaurant). getServerTenant
  // returns null for BOTH, which would otherwise collapse the two cases.
  const { data: { user } } = await supabase.auth.getUser();
  const tenant = user ? await getServerTenant() : null;

  const gate = tenantGate({ signedIn: !!user, tenant }, opts);
  if (!gate.ok) return { ok: false, response: NextResponse.json({ error: gate.error }, { status: gate.status }) };
  return { ok: true, tenant: gate.tenant };
}

/** Manager-only convenience wrapper. */
export function requireManager(opts: Omit<TenantGateOptions, "requireManager"> = {}): Promise<RequireTenantResult> {
  return requireTenant({ ...opts, requireManager: true });
}
