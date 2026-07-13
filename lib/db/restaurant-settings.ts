// ============================================================================
// MaitreAI — LIVE0 Phase L1 — restaurant ops/settings data layer (live).
// Mirrors the orders reference pattern (lib/db/orders.ts): a loader + a realtime
// subscription the shared store wires up. Reads the SAME columns the
// /api/settings/ops GET returns (agent_mode → assistantOn, is_open, slug) so the
// console reflects DB truth and can never disagree with the API.
//
// PHASE-0 REALTIME GUARDRAILS (every L-phase subscribeX reuses this convention):
//   (a) filter by the tenant key (here restaurants.id),
//   (b) the store debounces reloads (~200ms) — see console-ops-store,
//   (c) returns a cleanup function,
//   (d) FAIL QUIETLY — a dropped channel logs a warning, never crashes the UI,
//   (e) RECONNECT-RELOAD — on (re)subscribe (incl. after a wifi blip) trigger a
//       reload so state missed while disconnected is caught, not left stale.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeWithReload } from "@/lib/realtime/resubscribe";

export interface OpsSnapshot {
  /** Karim answering customers? restaurants.agent_mode !== "paused". */
  assistantOn: boolean;
  /** Restaurant accepting orders? restaurants.is_open !== false (default open). */
  isOpen: boolean;
  /** Public storefront slug (e.g. for console links). */
  slug: string | null;
}

/** Read the current ops snapshot for a tenant (same shape as /api/settings/ops GET). */
export async function loadOps(s: SupabaseClient, restaurantId: string): Promise<OpsSnapshot> {
  const { data } = await s
    .from("restaurants")
    .select("is_open, agent_mode, slug")
    .eq("id", restaurantId)
    .maybeSingle();
  return {
    assistantOn: ((data?.agent_mode as string | null) ?? "live") !== "paused",
    isOpen: (data as { is_open?: boolean } | null)?.is_open !== false,
    slug: ((data as { slug?: string | null } | null)?.slug as string | null) ?? null,
  };
}

/**
 * Subscribe to this tenant's restaurants row. `onChange` fires on any DB change
 * AND on every (re)subscribe (reconnect-reload guardrail). RLS-respecting: the
 * member client only receives rows it may read. Returns a cleanup function.
 */
export function subscribeRestaurants(
  s: SupabaseClient,
  restaurantId: string,
  onChange: () => void
): () => void {
  // WO-REALTIME-AUTH-REFRESH: (e) reconnect-reload on every (re)SUBSCRIBED — now with
  // active resubscribe-with-backoff (flag-ON) instead of relying on supabase-js's
  // internal retry, which stalls once the socket's JWT goes stale. Flag-OFF is the
  // prior fail-quietly behavior, byte-identical. The store debounces, so the
  // first-load double is a no-op in practice.
  return subscribeWithReload(s, {
    channelName: `restaurants-${restaurantId}`,
    bind: (ch) =>
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurants", filter: `id=eq.${restaurantId}` },
        onChange
      ),
    onChange,
    label: "restaurants",
  });
}
