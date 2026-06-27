"use client";

// ============================================================================
// MaitreAI — console data-readiness state (M1.3 / L1.1)
// A single source of truth for whether the console is showing REAL tenant data.
// DataBootstrap sets this; ConsoleLayout gates the whole shell on it so seed/demo
// data is NEVER rendered as real, and the console never renders with no resolved
// tenant. Composes with useRole()'s RoleState (M1.2): role + data resolve in
// parallel and the shell only renders when data is genuinely ready.
//
//   DEMO        — Supabase not configured (dev): permissive, seed data is fine.
//   DB_LOADING  — configured, resolving tenant + hydrating stores.
//   DB_READY    — real tenant resolved + stores hydrated from the DB.
//   NO_TENANT   — configured but no tenant resolved (multi-membership w/o an
//                 active selection, or a non-member). BLOCK — never show seed.
//   DB_FAILED   — tenant resolved but a store load threw. BLOCK with an error.
// ============================================================================

import { create } from "zustand";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type ConsoleDataState = "DEMO" | "DB_LOADING" | "DB_READY" | "NO_TENANT" | "DB_FAILED";

interface ConsoleDataStore {
  state: ConsoleDataState;
  tenantId: string | null;
  set: (state: ConsoleDataState, tenantId?: string | null) => void;
}

// Initial: DEMO when unconfigured (dev), else DB_LOADING until DataBootstrap resolves.
// isSupabaseConfigured() reads NEXT_PUBLIC_* vars (same value SSR + client → no
// hydration mismatch).
export const useConsoleDataStore = create<ConsoleDataStore>((set) => ({
  state: isSupabaseConfigured() ? "DB_LOADING" : "DEMO",
  tenantId: null,
  set: (state, tenantId) => set({ state, tenantId: tenantId ?? null }),
}));

/** True only when it's safe to render the operating console with store data:
 *  real data is loaded (DB_READY) or we're in the permissive dev path (DEMO). */
export function isConsoleDataPresentable(state: ConsoleDataState): boolean {
  return state === "DB_READY" || state === "DEMO";
}
