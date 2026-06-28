// ============================================================================
// MaitreAI — LIVE0 Phase L3 — COD realtime subscription (CLIENT-SAFE).
// Separate from lib/db/cod.ts (which is `server-only`): this runs in the browser
// to keep the COD ledger/close-shift screens live across managers. It only
// SIGNALS that something changed; the store re-pulls the authoritative aggregated
// ledger from /api/cod/ledger (member client, RLS) — we never re-derive money here.
//
// Reuses the L1/L2 Phase-0 guardrail convention:
//   (a) filter by restaurant_id, (b) the store DEBOUNCES the reload,
//   (c) returns a cleanup fn, (d) FAILS QUIETLY on a dropped channel,
//   (e) RECONNECT-RELOADs (onChange on SUBSCRIBED — initial AND after reconnect).
//
// Security: postgres_changes respects the COD tables' member SELECT policy
// (<table>_read USING is_member_of(restaurant_id)) — a member receives only its
// own tenant's rows. Writes remain service-role-only (M1.7); this is read-only.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

// cod_collections + cod_settlements fire on every ledger-visible change
// (capture/collect/settle). cod_cash_events (audit) is intentionally not watched.
const COD_REALTIME_TABLES = ["cod_collections", "cod_settlements"] as const;

export function subscribeCOD(
  s: SupabaseClient,
  restaurantId: string,
  onChange: () => void
): () => void {
  const filter = `restaurant_id=eq.${restaurantId}`;
  let ch = s.channel(`cod-${restaurantId}`);
  for (const table of COD_REALTIME_TABLES) {
    ch = ch.on("postgres_changes", { event: "*", schema: "public", table, filter }, onChange);
  }
  ch.subscribe((status) => {
    // (e) reconnect-reload — catch settles missed while disconnected.
    if (status === "SUBSCRIBED") {
      onChange();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      // (d) fail quietly — Supabase retries; never throw into the UI.
      console.warn("[realtime:cod] channel status:", status);
    }
  });
  return () => {
    void s.removeChannel(ch);
  };
}
