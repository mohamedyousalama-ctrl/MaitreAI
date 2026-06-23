"use client";

// Console shell ↔ page coupling (SPEC 02 §2b). The topbar's search pill and
// date chip live in the reusable <ConsoleLayout>, but they filter the page's
// loaded data. This tiny store carries that shared UI state so the shell and the
// page stay in sync without prop-drilling through the layout boundary.

import { create } from "zustand";

export type DateScope = "today" | "all";

interface ConsoleUiState {
  query: string;
  dateScope: DateScope;
  setQuery: (q: string) => void;
  setDateScope: (d: DateScope) => void;
}

export const useConsoleUi = create<ConsoleUiState>((set) => ({
  query: "",
  dateScope: "today",
  setQuery: (q) => set({ query: q }),
  setDateScope: (d) => set({ dateScope: d }),
}));
