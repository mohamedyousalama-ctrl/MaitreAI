// ============================================================================
// MaitreAI — LIVE0 Phase L4 — shared dispatch store (deliveries + drivers, live).
// One reactive source for the التوصيل console so a driver assignment / status /
// roster change reflects on every dispatch console instantly — REPLACING the old
// 6s poll. Mirrors the order-store pattern: loaders wrap the existing
// /api/deliveries + /api/drivers (server reads, RLS, self-heal preserved); a
// realtime subscription debounce-reloads on any deliveries/drivers change.
//
// Read-reactive only: assign / driver CRUD still go through the existing gated
// routes; this store just makes the reads live. Not persisted.
// ============================================================================

"use client";

import { create } from "zustand";
import { createClient } from "./supabase/client";
import { subscribeDispatch } from "./db/dispatch-realtime";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DispatchDriver {
  id: string;
  name: string;
  phone: string;
  vehicle: string | null;
  active: boolean;
}
/** Latest shared driver point + server-computed freshness (see locationFreshness). */
export interface DispatchLocation {
  lat: number;
  lng: number;
  recorded_at: string;
  ageMs: number;
  fresh: boolean;
}
export interface DispatchDelivery {
  id: string;
  status: string;
  driver_id: string | null;
  drivers: { name: string; phone: string } | null;
  orders: { order_number: string | null; total: number | null; currency: string | null; address: string | null; lat: number | null; lng: number | null; notes: string | null } | null;
  /** Present for in-progress deliveries only; null when the driver never shared. */
  latestLocation?: DispatchLocation | null;
}

interface DispatchState {
  deliveries: DispatchDelivery[];
  drivers: DispatchDriver[];
  loaded: boolean;

  _sb: SupabaseClient | null;
  _rid: string | null;

  initFromDb: (restaurantId: string) => Promise<(() => void) | undefined>;
  /** Re-pull /api/deliveries (server self-heal runs on every GET). */
  loadDeliveries: () => Promise<void>;
  /** Re-pull /api/drivers. */
  loadDrivers: () => Promise<void>;
  /** Both — used by the realtime subscription. */
  reload: () => Promise<void>;
}

const fire = (p: PromiseLike<unknown>) =>
  void Promise.resolve(p).then(undefined, (e) => console.error("[dispatch:db]", e));

let reloadTimer: ReturnType<typeof setTimeout> | undefined;

export const useDispatchStore = create<DispatchState>((set, get) => ({
  deliveries: [],
  drivers: [],
  loaded: false,

  _sb: null,
  _rid: null,

  initFromDb: async (restaurantId) => {
    const sb = createClient();
    if (!sb) return undefined;
    set({ _sb: sb, _rid: restaurantId });
    await Promise.all([get().loadDrivers(), get().loadDeliveries()]);
    // Debounced reload on any deliveries/drivers change OR reconnect.
    return subscribeDispatch(sb, restaurantId, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => fire(get().reload()), 200);
    });
  },

  loadDeliveries: async () => {
    try {
      const r = await fetch("/api/deliveries", { cache: "no-store" });
      if (r.ok) set({ deliveries: ((await r.json()).deliveries ?? []) as DispatchDelivery[] });
    } finally {
      set({ loaded: true });
    }
  },

  loadDrivers: async () => {
    const r = await fetch("/api/drivers", { cache: "no-store" });
    if (r.ok) set({ drivers: ((await r.json()).drivers ?? []) as DispatchDriver[] });
  },

  reload: async () => {
    await Promise.all([get().loadDrivers(), get().loadDeliveries()]);
  },
}));
