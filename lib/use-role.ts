"use client";

// Client-side member role (Amendment 04 K2/A5; hardened M1.2). Operation sees a
// reduced nav (المحادثات · الطلبات · التوصيل) and no revenue/settings; manager
// sees everything.
//
// SECURITY (M1.2): in CONFIGURED/production mode this NEVER defaults or falls
// back to "manager". It starts in "loading" and resolves to manager/operation,
// or to "unresolved" on any missing-tenant/error — so a failed lookup can never
// silently grant the manager surface. Callers must treat anything other than
// "manager" as non-manager, and treat "loading" as "not yet known" (render a
// stable/neutral state, never a manager flash).
//
// DEMO/UNCONFIGURED mode (no Supabase env) stays permissive ("manager") so the
// full app is explorable locally — a SEPARATE path, gated on isSupabaseConfigured().
import { useEffect, useState } from "react";
import { getBrowserTenant } from "@/lib/db/tenant";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** The two real member roles. */
export type AppRole = "manager" | "operation";
/** The resolved client-side role state. */
export type RoleState = "loading" | "manager" | "operation" | "unresolved";

export function useRole(): RoleState {
  // Demo/unconfigured → permissive "manager"; configured → "loading" until resolved.
  const [role, setRole] = useState<RoleState>(() => (isSupabaseConfigured() ? "loading" : "manager"));
  useEffect(() => {
    if (!isSupabaseConfigured()) return; // demo mode: stay permissive, no lookup
    let alive = true;
    getBrowserTenant()
      .then((t) => {
        if (!alive) return;
        if (t?.role === "manager") setRole("manager");
        else if (t?.role === "operation") setRole("operation");
        else setRole("unresolved"); // no tenant / unknown role → NEVER manager
      })
      .catch(() => alive && setRole("unresolved"));
    return () => {
      alive = false;
    };
  }, []);
  return role;
}

/** Tabs an operation-role member may use (A5/K2): conversations, orders, and
 * delivery dispatch (when the delivery flag is on). */
export const OPERATION_HREFS = new Set(["/conversations", "/orders", "/deliveries"]);
