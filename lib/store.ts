// ============================================================================
// MaitreAI — Restaurant configuration store (Zustand + localStorage persist)
// Single source of truth for all OWNER-EDITABLE restaurant configuration.
// No backend: state is persisted to localStorage and rehydrated on load.
// ============================================================================

"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AiToneConfig,
  Branch,
  DeliveryArea,
  FaqItem,
  MenuItem,
  Modifier,
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

// Lightweight unique id generator (no external dep).
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface RestaurantState {
  profile: RestaurantProfile;
  branches: Branch[];
  menuItems: MenuItem[];
  modifiers: Modifier[];
  deliveryAreas: DeliveryArea[];
  faqs: FaqItem[];
  policies: Policies;
  aiTone: AiToneConfig;

  // Profile
  updateProfile: (patch: Partial<RestaurantProfile>) => void;

  // Branches
  addBranch: (b: Omit<Branch, "id">) => void;
  updateBranch: (id: string, patch: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;

  // Menu items
  addMenuItem: (m: Omit<MenuItem, "id">) => void;
  updateMenuItem: (id: string, patch: Partial<MenuItem>) => void;
  deleteMenuItem: (id: string) => void;

  // Modifiers
  addModifier: (m: Omit<Modifier, "id">) => void;
  updateModifier: (id: string, patch: Partial<Modifier>) => void;
  deleteModifier: (id: string) => void;

  // Delivery areas
  addDeliveryArea: (d: Omit<DeliveryArea, "id">) => void;
  updateDeliveryArea: (id: string, patch: Partial<DeliveryArea>) => void;
  deleteDeliveryArea: (id: string) => void;

  // FAQ
  addFaq: (f: Omit<FaqItem, "id">) => void;
  updateFaq: (id: string, patch: Partial<FaqItem>) => void;
  deleteFaq: (id: string) => void;

  // Policies & AI tone
  updatePolicies: (patch: Partial<Policies>) => void;
  updateAiTone: (patch: Partial<AiToneConfig>) => void;

  // Maintenance
  resetAll: () => void;
}

export const useRestaurantStore = create<RestaurantState>()(
  persist(
    (set) => ({
      profile: seedProfile,
      branches: seedBranches,
      menuItems: seedMenuItems,
      modifiers: seedModifiers,
      deliveryAreas: seedDeliveryAreas,
      faqs: seedFaqs,
      policies: seedPolicies,
      aiTone: seedAiTone,

      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),

      addBranch: (b) =>
        set((s) => ({
          branches: [
            ...s.branches,
            { ...b, id: newId("b"), whatsappConnected: !!b.whatsappNumber },
          ],
        })),
      updateBranch: (id, patch) =>
        set((s) => ({
          branches: s.branches.map((b) =>
            b.id === id
              ? { ...b, ...patch, whatsappConnected: !!(patch.whatsappNumber ?? b.whatsappNumber) }
              : b
          ),
        })),
      deleteBranch: (id) => set((s) => ({ branches: s.branches.filter((b) => b.id !== id) })),

      addMenuItem: (m) => set((s) => ({ menuItems: [...s.menuItems, { ...m, id: newId("m") }] })),
      updateMenuItem: (id, patch) =>
        set((s) => ({ menuItems: s.menuItems.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      deleteMenuItem: (id) => set((s) => ({ menuItems: s.menuItems.filter((m) => m.id !== id) })),

      addModifier: (m) => set((s) => ({ modifiers: [...s.modifiers, { ...m, id: newId("mod") }] })),
      updateModifier: (id, patch) =>
        set((s) => ({ modifiers: s.modifiers.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      deleteModifier: (id) =>
        set((s) => ({
          // Also detach the deleted modifier from any menu item that references it.
          modifiers: s.modifiers.filter((m) => m.id !== id),
          menuItems: s.menuItems.map((m) => ({
            ...m,
            modifierIds: m.modifierIds.filter((mid) => mid !== id),
          })),
        })),

      addDeliveryArea: (d) =>
        set((s) => ({ deliveryAreas: [...s.deliveryAreas, { ...d, id: newId("d") }] })),
      updateDeliveryArea: (id, patch) =>
        set((s) => ({
          deliveryAreas: s.deliveryAreas.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
      deleteDeliveryArea: (id) =>
        set((s) => ({ deliveryAreas: s.deliveryAreas.filter((d) => d.id !== id) })),

      addFaq: (f) => set((s) => ({ faqs: [...s.faqs, { ...f, id: newId("f") }] })),
      updateFaq: (id, patch) =>
        set((s) => ({ faqs: s.faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      deleteFaq: (id) => set((s) => ({ faqs: s.faqs.filter((f) => f.id !== id) })),

      updatePolicies: (patch) => set((s) => ({ policies: { ...s.policies, ...patch } })),
      updateAiTone: (patch) => set((s) => ({ aiTone: { ...s.aiTone, ...patch } })),

      resetAll: () =>
        set({
          profile: seedProfile,
          branches: seedBranches,
          menuItems: seedMenuItems,
          modifiers: seedModifiers,
          deliveryAreas: seedDeliveryAreas,
          faqs: seedFaqs,
          policies: seedPolicies,
          aiTone: seedAiTone,
        }),
    }),
    {
      name: "maitreai-restaurant-config",
      version: 1,
    }
  )
);

/**
 * Returns true once the persisted store has rehydrated on the client.
 * Use this to gate rendering of store-dependent UI and avoid SSR/CSR
 * hydration mismatches.
 */
export function useHasHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
