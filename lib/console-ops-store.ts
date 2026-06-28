// ============================================================================
// MaitreAI — LIVE0 Phase L1 — shared console ops store (live).
// One reactive source of truth for Karim active (agent_mode → assistantOn),
// open/closed (is_open), and the storefront slug — so the sidebar toggle, the
// dashboard banner, and the settings toggle all read the SAME value and update
// together (same-page), and another operator's change reflects live (realtime).
//
// Mirrors the order-store reference pattern: initFromDb loads + subscribes with a
// debounced reload; setAssistant is optimistic + server POST + revert on failure
// (the manager gate stays server-side on /api/settings/ops). NOT persisted —
// this is live DB truth, not a cached toggle (a stale persisted value could lie).
//
// Note: lib/ops-store.ts is a separate legacy localStorage stub used only by the
// old (main) marketing layout; it is intentionally left untouched here.
// ============================================================================

"use client";

import { create } from "zustand";
import { createClient } from "./supabase/client";
import { loadOps, subscribeRestaurants } from "./db/restaurant-settings";
import type { SupabaseClient } from "@supabase/supabase-js";

interface ConsoleOpsState {
  assistantOn: boolean;
  isOpen: boolean;
  slug: string | null;
  /** True once an initial DB load has completed (lets consumers show a loading
   *  state and avoid acting on the optimistic default before truth arrives). */
  loaded: boolean;

  _sb: SupabaseClient | null;
  _rid: string | null;

  initFromDb: (restaurantId: string) => Promise<(() => void) | undefined>;
  reload: () => Promise<void>;
  /** Manager action: flip Karim on/off. Optimistic + server POST + revert on
   *  failure. Returns the server result so callers can surface an error. */
  setAssistant: (on: boolean) => Promise<{ ok: boolean }>;
}

const fire = (p: PromiseLike<unknown>) =>
  void Promise.resolve(p).then(undefined, (e) => console.error("[ops:db]", e));

let reloadTimer: ReturnType<typeof setTimeout> | undefined;

export const useConsoleOps = create<ConsoleOpsState>((set, get) => ({
  // Optimistic defaults (demo / pre-load) — `loaded` gates acting on them.
  assistantOn: true,
  isOpen: true,
  slug: null,
  loaded: false,

  _sb: null,
  _rid: null,

  initFromDb: async (restaurantId) => {
    const sb = createClient();
    if (!sb) return undefined;
    set({ _sb: sb, _rid: restaurantId });
    const snap = await loadOps(sb, restaurantId);
    set({ ...snap, loaded: true });
    // Debounced reload on any change OR reconnect (guardrails live in
    // subscribeRestaurants). 200ms mirrors the order-store cadence.
    return subscribeRestaurants(sb, restaurantId, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => fire(get().reload()), 200);
    });
  },

  reload: async () => {
    const { _sb, _rid } = get();
    if (!_sb || !_rid) return;
    const snap = await loadOps(_sb, _rid);
    set({ ...snap, loaded: true });
  },

  setAssistant: async (on) => {
    const prev = get().assistantOn;
    set({ assistantOn: on }); // optimistic
    try {
      const r = await fetch("/api/settings/ops", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantOn: on }),
      });
      if (!r.ok) {
        set({ assistantOn: prev }); // revert — never lie about state
        return { ok: false };
      }
      // The realtime subscription will also fire (this device + others) and reload
      // to DB truth — converging all surfaces.
      return { ok: true };
    } catch {
      set({ assistantOn: prev });
      return { ok: false };
    }
  },
}));
