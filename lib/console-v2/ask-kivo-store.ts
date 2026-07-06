// ============================================================================
// console_v2 — Ask Kivo palette open-state (item 14). A tiny global store so the
// ⌘K/Ctrl+K listener, the rail's Ask-Kivo row, and the header trigger can all open
// the ONE global overlay (the palette is not a route — it floats above every /c
// screen). State only; the command brain lives server-side (one command brain,
// two doors), reached via /api/console/command.
// ============================================================================

"use client";

import { create } from "zustand";

interface AskKivoState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useAskKivoStore = create<AskKivoState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
