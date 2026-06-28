"use client";

// Console shell ↔ page coupling (SPEC 02 §2b). The topbar's search pill and
// date chip live in the reusable <ConsoleLayout>, but they filter the page's
// loaded data. This tiny store carries that shared UI state so the shell and the
// page stay in sync without prop-drilling through the layout boundary.

import { create } from "zustand";

export type DateScope = "today" | "all";

// SR1 — global-search "navigate to this result" signal. The topbar sets it on a
// result click (alongside the URL deep-link); the target page reacts to it to
// select/open the item — reactive on same-page clicks too (unlike a one-shot URL
// read), and with no useSearchParams prerender constraint. A fresh object each
// time so repeated clicks on the same id still re-trigger.
export interface FocusTarget {
  kind: "order" | "customer" | "conversation";
  id: string;
}

interface ConsoleUiState {
  query: string;
  dateScope: DateScope;
  focus: FocusTarget | null;
  setQuery: (q: string) => void;
  setDateScope: (d: DateScope) => void;
  setFocus: (kind: FocusTarget["kind"], id: string) => void;
  clearFocus: () => void;
}

export const useConsoleUi = create<ConsoleUiState>((set) => ({
  query: "",
  dateScope: "today",
  focus: null,
  setQuery: (q) => set({ query: q }),
  setDateScope: (d) => set({ dateScope: d }),
  setFocus: (kind, id) => set({ focus: { kind, id } }),
  clearFocus: () => set({ focus: null }),
}));
