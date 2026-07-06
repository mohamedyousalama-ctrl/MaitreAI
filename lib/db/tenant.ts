// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — tenant resolution (browser + shared)
// Resolves the signed-in user's restaurant_id + role. Browser-safe: does NOT
// import next/headers. The server variant lives in tenant-server.ts.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRole } from "./types";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { hostMapping } from "@/lib/domains";

export interface Tenant {
  userId: string;
  restaurantId: string;
  role: MemberRole;
}

// Cookie name for explicit restaurant selection (written by the UI switcher).
export const ACTIVE_RESTAURANT_COOKIE = "maitreai_active_rid";

/**
 * Write the active-restaurant selection cookie (client only). Non-httpOnly so the
 * browser tenant resolver (getBrowserTenant) can read it; 30-day, path=/, SameSite=Lax
 * so it also rides the next top-level navigation and the SERVER resolver
 * (getServerTenant) sees it. This is the ONLY thing a picker/switcher needs to do —
 * resolveTenant already re-validates membership, so a tampered id is rejected. A host
 * pin (hostMapping) still takes precedence over this cookie, so a branded operator
 * subdomain (e.g. console.wesayachicken.com) is never overridden by a stale selection.
 */
export function setActiveRestaurantCookie(rid: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ACTIVE_RESTAURANT_COOKIE}=${encodeURIComponent(rid)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

/**
 * Resolve the signed-in user's active restaurant membership.
 *
 * Resolution order:
 *   1. If activeRestaurantId is supplied, verify the user IS a member of that
 *      restaurant and return it — never fall through to guessing.
 *   2. If the user has exactly one membership, return it.
 *   3. If the user has multiple memberships and none is explicitly selected,
 *      return null so the caller can prompt for a choice — never guess.
 */
export async function resolveTenant(
  supabase: SupabaseClient | null,
  activeRestaurantId?: string | null,
): Promise<Tenant | null> {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  if (activeRestaurantId) {
    // Verify membership for the explicitly selected restaurant.
    const { data } = await supabase
      .from("members")
      .select("role")
      .eq("user_id", user.id)
      .eq("restaurant_id", activeRestaurantId)
      .maybeSingle();
    if (!data) return null;
    return { userId: user.id, restaurantId: activeRestaurantId, role: data.role as MemberRole };
  }

  // No explicit selection — fetch all memberships (no limit, no arbitrary ordering).
  const { data: memberships } = await supabase
    .from("members")
    .select("restaurant_id, role")
    .eq("user_id", user.id);
  if (!memberships || memberships.length === 0) return null;
  if (memberships.length === 1) {
    return {
      userId: user.id,
      restaurantId: memberships[0].restaurant_id as string,
      role: memberships[0].role as MemberRole,
    };
  }
  // Multiple memberships, no selection — return null so the UI can prompt.
  return null;
}

/** Client components. */
export async function getBrowserTenant(): Promise<Tenant | null> {
  // Host-pinned tenant takes precedence over the cookie so that a branded
  // console subdomain (e.g. console.wesayachicken.com) always resolves to its
  // configured restaurant regardless of any previously-set cookie.
  // resolveTenant() still verifies membership — a non-member gets null.
  const hostRid =
    typeof window !== "undefined"
      ? (() => { const m = hostMapping(window.location.hostname); return m?.kind === "operator" ? (m.restaurantId ?? null) : null; })()
      : null;
  const cookieRid =
    typeof document !== "undefined"
      ? (document.cookie.match(new RegExp(`(?:^|;\\s*)${ACTIVE_RESTAURANT_COOKIE}=([^;]+)`)) ?? [])[1] ?? null
      : null;
  return resolveTenant(createBrowserClient(), hostRid ?? cookieRid);
}
