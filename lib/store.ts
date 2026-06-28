// ============================================================================
// MaitreAI — Restaurant configuration store (Sprint 7 Pass 2)
// UI-facing source of truth for owner-editable config. When Supabase is
// configured the store is DB-backed (hydrate from the tenant via RLS, mutations
// write through, ids come from Postgres). In demo mode it keeps the original
// seed + localStorage behavior so the app still runs with no backend.
// ============================================================================

"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiToneConfig,
  Branch,
  DeliveryArea,
  FaqItem,
  MenuItem,
  Modifier,
  OperatorPromotion,
  Policies,
  RestaurantProfile,
} from "./types";
import {
  seedAiTone,
  seedBranches,
  seedDeliveryAreas,
  seedFaqs,
  seedMenuItems,
  seedModifiers,
  seedPolicies,
  seedProfile,
} from "./seed-data";
import { createClient } from "./supabase/client";
import {
  loadBrain,
  updateProfileDb,
  updateAiToneDb,
  addBranchDb,
  updateBranchDb,
  deleteBranchDb,
  addMenuItemDb,
  updateMenuItemDb,
  deleteMenuItemDb,
  addModifierDb,
  updateModifierDb,
  deleteModifierDb,
  addDeliveryAreaDb,
  updateDeliveryAreaDb,
  deleteDeliveryAreaDb,
  addFaqDb,
  updateFaqDb,
  deleteFaqDb,
  updatePoliciesDb,
  updatePromotionStateDb,
  deletePromotionDb,
  createPromotionDb,
} from "./db/brain";

// Lightweight unique id generator (no external dep) — demo mode only.
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const fire = (p: PromiseLike<unknown>) =>
  void Promise.resolve(p).then(undefined, (e) => console.error("[brain:db]", e));

interface RestaurantState {
  profile: RestaurantProfile;
  branches: Branch[];
  menuItems: MenuItem[];
  modifiers: Modifier[];
  deliveryAreas: DeliveryArea[];
  faqs: FaqItem[];
  promotions: OperatorPromotion[];
  policies: Policies;
  aiTone: AiToneConfig;

  // DB-backing (Pass 2)
  _sb: SupabaseClient | null;
  _rid: string | null;
  dbReady: boolean;
  initFromDb: (restaurantId: string) => Promise<void>;
  refreshBrain: () => Promise<void>;

  updateProfile: (patch: Partial<RestaurantProfile>) => void;

  addBranch: (b: Omit<Branch, "id">) => void;
  updateBranch: (id: string, patch: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;

  addMenuItem: (m: Omit<MenuItem, "id">) => void;
  updateMenuItem: (id: string, patch: Partial<MenuItem>) => void;
  deleteMenuItem: (id: string) => void;
  /** Real-time 86ing: one-tap mark an item out-of-stock / back in stock. */
  setItemAvailability: (id: string, available: boolean) => Promise<boolean>;

  addModifier: (m: Omit<Modifier, "id">) => void;
  updateModifier: (id: string, patch: Partial<Modifier>) => void;
  deleteModifier: (id: string) => void;

  addDeliveryArea: (d: Omit<DeliveryArea, "id">) => void;
  updateDeliveryArea: (id: string, patch: Partial<DeliveryArea>) => void;
  deleteDeliveryArea: (id: string) => void;

  addFaq: (f: Omit<FaqItem, "id">) => void;
  updateFaq: (id: string, patch: Partial<FaqItem>) => void;
  deleteFaq: (id: string) => void;

  loadPromotions: () => Promise<void>;
  togglePromotionActive: (id: string, active: boolean) => void;
  deletePromotion: (id: string) => void;
  addPromotion: (
    row: { name: string; type: string; config: Record<string, unknown>; schedule: Record<string, unknown> },
    state?: "active" | "paused"
  ) => void;

  updatePolicies: (patch: Partial<Policies>) => void;
  updateAiTone: (patch: Partial<AiToneConfig>) => void;

  resetAll: () => void;
}

export const useRestaurantStore = create<RestaurantState>()(
  persist(
    (set, get) => ({
      profile: seedProfile,
      branches: seedBranches,
      menuItems: seedMenuItems,
      modifiers: seedModifiers,
      deliveryAreas: seedDeliveryAreas,
      faqs: seedFaqs,
      promotions: [],
      policies: seedPolicies,
      aiTone: seedAiTone,

      _sb: null,
      _rid: null,
      dbReady: false,

      initFromDb: async (restaurantId) => {
        const sb = createClient();
        if (!sb) return;
        set({ _sb: sb, _rid: restaurantId });
        await get().refreshBrain();
        set({ dbReady: true });
      },

      refreshBrain: async () => {
        const { _sb, _rid } = get();
        if (!_sb || !_rid) return;
        const data = await loadBrain(_sb, _rid);
        set({
          profile: data.profile,
          branches: data.branches,
          menuItems: data.menuItems,
          modifiers: data.modifiers,
          deliveryAreas: data.deliveryAreas,
          faqs: data.faqs,
          promotions: data.promotions,
          policies: data.policies,
        });
      },

      updateProfile: (patch) => {
        set((s) => ({ profile: { ...s.profile, ...patch } }));
        const { _sb, _rid } = get();
        if (_sb && _rid) fire(updateProfileDb(_sb, _rid, patch));
      },

      addBranch: (b) => {
        const { _sb, _rid } = get();
        if (_sb && _rid) {
          fire(addBranchDb(_sb, _rid, b).then(() => get().refreshBrain()));
          return;
        }
        set((s) => ({ branches: [...s.branches, { ...b, id: newId("b"), whatsappConnected: !!b.whatsappNumber }] }));
      },
      updateBranch: (id, patch) => {
        set((s) => ({
          branches: s.branches.map((b) =>
            b.id === id ? { ...b, ...patch, whatsappConnected: !!(patch.whatsappNumber ?? b.whatsappNumber) } : b
          ),
        }));
        const { _sb } = get();
        if (_sb) fire(updateBranchDb(_sb, id, patch));
      },
      deleteBranch: (id) => {
        set((s) => ({ branches: s.branches.filter((b) => b.id !== id) }));
        const { _sb } = get();
        if (_sb) fire(deleteBranchDb(_sb, id));
      },

      addMenuItem: (m) => {
        const { _sb, _rid } = get();
        if (_sb && _rid) {
          fire(addMenuItemDb(_sb, _rid, m).then(() => get().refreshBrain()));
          return;
        }
        set((s) => ({ menuItems: [...s.menuItems, { ...m, id: newId("m") }] }));
      },
      updateMenuItem: (id, patch) => {
        set((s) => ({ menuItems: s.menuItems.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
        const { _sb, _rid } = get();
        if (_sb && _rid) fire(updateMenuItemDb(_sb, _rid, id, patch));
      },
      deleteMenuItem: (id) => {
        set((s) => ({ menuItems: s.menuItems.filter((m) => m.id !== id) }));
        const { _sb } = get();
        if (_sb) fire(deleteMenuItemDb(_sb, id));
      },
      setItemAvailability: async (id, available) => {
        // Optimistic flip so the toggle feels instant; the server route does the
        // tenant-scoped write + audit and «كريم» picks it up next turn.
        set((s) => ({ menuItems: s.menuItems.map((m) => (m.id === id ? { ...m, available } : m)) }));
        const { _sb, _rid } = get();
        if (!_sb || !_rid) return true; // demo mode: local only
        // R7 — return the REAL save result. On failure still reconcile to the TRUE
        // server state (revert), but no longer SILENTLY — the caller surfaces a
        // failure toast so staff never think an item is 86'd when the save failed.
        try {
          const r = await fetch("/api/menu/availability", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: id, available }),
          });
          if (!r.ok) {
            await get().refreshBrain(); // reconcile from the DB on failure
            return false;
          }
          return true;
        } catch {
          await get().refreshBrain();
          return false;
        }
      },

      addModifier: (m) => {
        const { _sb, _rid } = get();
        if (_sb && _rid) {
          fire(addModifierDb(_sb, _rid, m).then(() => get().refreshBrain()));
          return;
        }
        set((s) => ({ modifiers: [...s.modifiers, { ...m, id: newId("mod") }] }));
      },
      updateModifier: (id, patch) => {
        set((s) => ({ modifiers: s.modifiers.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
        const { _sb } = get();
        if (_sb) fire(updateModifierDb(_sb, id, patch));
      },
      deleteModifier: (id) => {
        set((s) => ({
          modifiers: s.modifiers.filter((m) => m.id !== id),
          menuItems: s.menuItems.map((m) => ({ ...m, modifierIds: m.modifierIds.filter((mid) => mid !== id) })),
        }));
        const { _sb } = get();
        if (_sb) fire(deleteModifierDb(_sb, id)); // FK cascade clears menu_item_modifiers
      },

      addDeliveryArea: (d) => {
        const { _sb, _rid } = get();
        if (_sb && _rid) {
          fire(addDeliveryAreaDb(_sb, _rid, d).then(() => get().refreshBrain()));
          return;
        }
        set((s) => ({ deliveryAreas: [...s.deliveryAreas, { ...d, id: newId("d") }] }));
      },
      updateDeliveryArea: (id, patch) => {
        set((s) => ({ deliveryAreas: s.deliveryAreas.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
        const { _sb } = get();
        // Reconcile from the DB after the write, mirroring addDeliveryArea, so the
        // edited zone reflects the canonical persisted values without a page reload.
        if (_sb) fire(updateDeliveryAreaDb(_sb, id, patch).then(() => get().refreshBrain()));
      },
      deleteDeliveryArea: (id) => {
        set((s) => ({ deliveryAreas: s.deliveryAreas.filter((d) => d.id !== id) }));
        const { _sb } = get();
        if (_sb) fire(deleteDeliveryAreaDb(_sb, id).then(() => get().refreshBrain()));
      },

      addFaq: (f) => {
        const { _sb, _rid } = get();
        if (_sb && _rid) {
          fire(addFaqDb(_sb, _rid, f).then(() => get().refreshBrain()));
          return;
        }
        set((s) => ({ faqs: [...s.faqs, { ...f, id: newId("f") }] }));
      },
      updateFaq: (id, patch) => {
        set((s) => ({ faqs: s.faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
        const { _sb } = get();
        if (_sb) fire(updateFaqDb(_sb, id, patch));
      },
      deleteFaq: (id) => {
        set((s) => ({ faqs: s.faqs.filter((f) => f.id !== id) }));
        const { _sb } = get();
        if (_sb) fire(deleteFaqDb(_sb, id));
      },

      loadPromotions: async () => {
        await get().refreshBrain();
      },
      togglePromotionActive: (id, active) => {
        set((s) => ({
          promotions: s.promotions.map((p) => (p.id === id ? { ...p, state: active ? "active" : "paused" } : p)),
        }));
        const { _sb, _rid } = get();
        if (_sb && _rid) fire(updatePromotionStateDb(_sb, _rid, id, active).then(() => get().refreshBrain()));
      },
      deletePromotion: (id) => {
        set((s) => ({ promotions: s.promotions.filter((p) => p.id !== id) }));
        const { _sb, _rid } = get();
        if (_sb && _rid) fire(deletePromotionDb(_sb, _rid, id));
      },
      addPromotion: (row, state = "active") => {
        const { _sb, _rid } = get();
        if (_sb && _rid) {
          fire(
            createPromotionDb(_sb, _rid, row, state).then((p) => {
              if (p) set((s) => ({ promotions: [p, ...s.promotions] }));
              return get().refreshBrain();
            })
          );
        }
      },

      updatePolicies: (patch) => {
        set((s) => ({ policies: { ...s.policies, ...patch } }));
        const { _sb, _rid } = get();
        if (_sb && _rid) fire(updatePoliciesDb(_sb, _rid, patch));
      },
      updateAiTone: (patch) => {
        const tone = { ...get().aiTone, ...patch };
        set({ aiTone: tone });
        const { _sb, _rid } = get();
        if (_sb && _rid) fire(updateAiToneDb(_sb, _rid, tone));
      },

      resetAll: () => {
        const { _sb, _rid } = get();
        if (_sb && _rid) {
          fire(_sb.rpc("reset_restaurant", { p_restaurant_id: _rid }).then(() => get().refreshBrain()));
          return;
        }
        set({
          profile: seedProfile,
          branches: seedBranches,
          menuItems: seedMenuItems,
          modifiers: seedModifiers,
          deliveryAreas: seedDeliveryAreas,
          faqs: seedFaqs,
          promotions: [],
          policies: seedPolicies,
          aiTone: seedAiTone,
        });
      },
    }),
    {
      name: "maitreai-restaurant-config",
      version: 1,
      // Never persist the supabase client / tenant handle.
      partialize: (s) => ({
        profile: s.profile,
        branches: s.branches,
        menuItems: s.menuItems,
        modifiers: s.modifiers,
        deliveryAreas: s.deliveryAreas,
        faqs: s.faqs,
        policies: s.policies,
        aiTone: s.aiTone,
      }),
    }
  )
);

/**
 * Returns true once the persisted store has rehydrated on the client.
 * Gates store-dependent UI to avoid SSR/CSR hydration mismatches.
 */
export function useHasHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
