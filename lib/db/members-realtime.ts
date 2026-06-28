// ============================================================================
// MaitreAI — LIVE0 Phase L5a — members realtime subscription (CLIENT-SAFE).
// Keeps the Team roster + conversation assignee-name labels live: a role change /
// invite SIGNALS here; the store re-pulls /api/members (which resolves names).
//
// Reuses the L1-L4 Phase-0 guardrail convention:
//   (a) filter by restaurant_id, (b) the store DEBOUNCES the reload,
//   (c) returns a cleanup fn, (d) FAILS QUIETLY on a dropped channel,
//   (e) RECONNECT-RELOADs (onChange on SUBSCRIBED — initial AND after reconnect).
//
// RLS scope (members_read): a MANAGER subscriber receives whole-roster events;
// an OPERATION subscriber receives only its own row's events. The store's reload
// re-pulls the full roster via /api/members (admin) regardless.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export function subscribeMembers(
  s: SupabaseClient,
  restaurantId: string,
  onChange: () => void
): () => void {
  const filter = `restaurant_id=eq.${restaurantId}`;
  const ch = s
    .channel(`members-${restaurantId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "members", filter }, onChange)
    .subscribe((status) => {
      // (e) reconnect-reload — catch role/invite changes missed while disconnected.
      if (status === "SUBSCRIBED") {
        onChange();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // (d) fail quietly — Supabase retries; never throw into the UI.
        console.warn("[realtime:members] channel status:", status);
      }
    });
  return () => {
    void s.removeChannel(ch);
  };
}
