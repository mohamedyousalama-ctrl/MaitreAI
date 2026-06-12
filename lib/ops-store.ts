// ============================================================================
// MaitreAI — Operations toggles (Amendment 04 §M2 Pulse strip)
// The owner-controlled open/closed + agent on/off switches. Persisted locally so
// the strip reflects the operator's actual setting (truth-driven, F3). When a
// backend is wired these will sync to restaurants.is_open / agent_mode; until
// then they faithfully represent what the operator toggled.
// ============================================================================

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OpsState {
  isOpen: boolean;
  agentEnabled: boolean;
  setOpen: (v: boolean) => void;
  setAgentEnabled: (v: boolean) => void;
}

export const useOpsStore = create<OpsState>()(
  persist(
    (set) => ({
      isOpen: true,
      agentEnabled: true,
      setOpen: (v) => set({ isOpen: v }),
      setAgentEnabled: (v) => set({ agentEnabled: v }),
    }),
    { name: "maitreai-ops", version: 1 }
  )
);
