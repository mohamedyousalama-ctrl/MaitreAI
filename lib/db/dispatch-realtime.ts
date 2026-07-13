// ============================================================================
// MaitreAI — LIVE0 Phase L4 — dispatch realtime subscription (CLIENT-SAFE).
// Kept separate from lib/db/delivery.ts (server reads) so it's safe in the
// browser. Keeps the التوصيل console live across operators: an assignment /
// delivery status change / roster change SIGNALS here; the store re-pulls the
// authoritative /api/deliveries + /api/drivers (preserving the self-heal).
//
// Reuses the L1-L3 Phase-0 guardrail convention:
//   (a) filter by restaurant_id, (b) the store DEBOUNCES the reload,
//   (c) returns a cleanup fn, (d) FAILS QUIETLY on a dropped channel,
//   (e) RECONNECT-RELOADs (onChange on SUBSCRIBED — initial AND after reconnect).
//
// ⚠️ delivery_locations (high-churn GPS) is deliberately NOT watched here — live
// driver location stays on the existing throttled poll for open tracking maps.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeWithReload } from "@/lib/realtime/resubscribe";

const DISPATCH_REALTIME_TABLES = ["deliveries", "drivers"] as const;

export function subscribeDispatch(
  s: SupabaseClient,
  restaurantId: string,
  onChange: () => void
): () => void {
  const filter = `restaurant_id=eq.${restaurantId}`;
  // WO-REALTIME-AUTH-REFRESH: (e) reconnect-reload + active resubscribe-with-backoff
  // (flag-ON) across the dispatch tables. Flag-OFF = prior fail-quietly, byte-identical.
  return subscribeWithReload(s, {
    channelName: `dispatch-${restaurantId}`,
    bind: (ch) => {
      let out = ch;
      for (const table of DISPATCH_REALTIME_TABLES) {
        out = out.on("postgres_changes", { event: "*", schema: "public", table, filter }, onChange);
      }
      return out;
    },
    onChange,
    label: "dispatch",
  });
}
