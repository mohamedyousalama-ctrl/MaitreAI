// ============================================================================
// MaitreAI — LIVE0 Phase L3 — shared COD ledger store (live).
// One reactive source for the COD ledger + close-shift screens so a settle by one
// manager reflects on another's screen instantly. Mirrors the order-store pattern:
// loadCodLedger pulls the authoritative aggregated ledger from /api/cod/ledger
// (server, member-client, RLS — money is never recomputed client-side); a realtime
// subscription debounce-reloads it on any COD change.
//
// Read-only w.r.t. money: settle/collect still go through the existing gated POST
// routes; this store just makes the READS reactive. M1.7 write-lockdown unchanged.
// Not persisted — live financial truth, never a cached figure.
// ============================================================================

"use client";

import { create } from "zustand";
import { createClient } from "./supabase/client";
import { subscribeCOD } from "./db/cod-realtime";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shapes mirror the /api/cod/ledger response (server-computed).
export interface CodDriverRow {
  driverId: string | null;
  driverName: string;
  expected: number;
  collected: number;
  outstanding: number;
  discrepancy: number;
  unsettledCount: number;
}
export interface CodSummary {
  date: string;
  expectedToday: number;
  collectedToday: number;
  outstanding: number;
  driversWithUnsettled: number;
}
export interface CodHeldItem {
  driverId: string | null;
  orderId: string;
  orderNumber: string | null;
  expected: number;
  collected: number;
  status: string | null;
  collectedAt: string | null;
  customer: string | null;
}
export interface CodSettlementRow {
  id: string;
  driverName: string | null;
  totalAmount: number;
  orderCount: number;
  settledByRole?: string | null;
  note: string | null;
  createdAt: string;
}

interface CodState {
  drivers: CodDriverRow[];
  summary: CodSummary | null;
  items: CodHeldItem[];
  settlements: CodSettlementRow[];
  loaded: boolean;

  _sb: SupabaseClient | null;
  _rid: string | null;

  initFromDb: (restaurantId: string) => Promise<(() => void) | undefined>;
  /** Re-pull the authoritative ledger from /api/cod/ledger. */
  reload: () => Promise<void>;
}

const fire = (p: PromiseLike<unknown>) =>
  void Promise.resolve(p).then(undefined, (e) => console.error("[cod:db]", e));

let reloadTimer: ReturnType<typeof setTimeout> | undefined;

export const useCodStore = create<CodState>((set, get) => ({
  drivers: [],
  summary: null,
  items: [],
  settlements: [],
  loaded: false,

  _sb: null,
  _rid: null,

  initFromDb: async (restaurantId) => {
    const sb = createClient();
    if (!sb) return undefined;
    set({ _sb: sb, _rid: restaurantId });
    await get().reload();
    // Debounced reload on any COD change OR reconnect (guardrails in subscribeCOD).
    return subscribeCOD(sb, restaurantId, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => fire(get().reload()), 200);
    });
  },

  reload: async () => {
    try {
      const res = await fetch("/api/cod/ledger", { cache: "no-store" });
      if (!res.ok) {
        set({ loaded: true });
        return;
      }
      const j = await res.json();
      set({
        drivers: (j.drivers ?? []) as CodDriverRow[],
        summary: (j.summary ?? null) as CodSummary | null,
        items: (j.items ?? []) as CodHeldItem[],
        settlements: (j.settlements ?? []) as CodSettlementRow[],
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
}));
