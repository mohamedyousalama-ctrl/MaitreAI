// ============================================================================
// MaitreAI — LIVE0 Phase L5a — shared members store (team roster, live).
// One reactive source for the team roster so a role change / invite by one manager
// reflects on other managers' Team screens, and conversation assignee-name labels
// stay current. Mirrors the order-store pattern: loadMembers wraps /api/members
// (which resolves display names server-side); a realtime subscription debounce-
// reloads on any members change.
//
// NAME-RESOLUTION COST: /api/members resolves each member's name via an auth
// lookup (admin.auth.admin.getUserById) — N lookups per call. We re-pull on each
// members change (approach (b): simplest + correct). Members changes are RARE
// (invite / role toggle), so the re-resolve is infrequent; at the current roster
// (≤ a handful) the cost is negligible. TRADEOFF: at a large roster (~30) each
// change event triggers ~30 auth lookups — still acceptable given how rarely the
// roster changes, but if it ever grows hot, resolve only changed rows / cache
// names. Not worth that complexity now.
// ============================================================================

"use client";

import { create } from "zustand";
import { createClient } from "./supabase/client";
import { subscribeMembers } from "./db/members-realtime";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: "manager" | "operation";
  createdAt: string;
}

interface MembersState {
  members: TeamMember[];
  loaded: boolean;

  _sb: SupabaseClient | null;
  _rid: string | null;

  initFromDb: (restaurantId: string) => Promise<(() => void) | undefined>;
  /** Re-pull /api/members (resolves names server-side). */
  loadMembers: () => Promise<void>;
}

const fire = (p: PromiseLike<unknown>) =>
  void Promise.resolve(p).then(undefined, (e) => console.error("[members:db]", e));

let reloadTimer: ReturnType<typeof setTimeout> | undefined;

export const useMembersStore = create<MembersState>((set, get) => ({
  members: [],
  loaded: false,

  _sb: null,
  _rid: null,

  initFromDb: async (restaurantId) => {
    const sb = createClient();
    if (!sb) return undefined;
    set({ _sb: sb, _rid: restaurantId });
    await get().loadMembers();
    // Debounced reload on any members change OR reconnect (guardrails in subscribeMembers).
    return subscribeMembers(sb, restaurantId, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => fire(get().loadMembers()), 200);
    });
  },

  loadMembers: async () => {
    try {
      const r = await fetch("/api/members", { cache: "no-store" });
      if (r.ok) set({ members: ((await r.json()).members ?? []) as TeamMember[] });
    } finally {
      set({ loaded: true });
    }
  },
}));

/** Selector helper: id → display-name map for assignee labels. */
export function membersNameMap(members: TeamMember[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const x of members) m[x.id] = x.name;
  return m;
}
