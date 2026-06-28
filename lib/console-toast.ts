"use client";

// ============================================================================
// MaitreAI — operator action-result feedback primitive (Phase R1).
//
// THE keystone of Phase R: console mutations were optimistic/fire-and-forget with
// no visible success/error state, so staff believed an action worked when the
// server write actually failed. This is one reusable mechanism that reflects the
// REAL server result: pending → success → failed (with optional retry).
//
// In-memory only (no browser storage). Dependency-free (plain Zustand + React,
// the stack already in use). Mounted once via <ActionToastHost/> in the console
// shell; call sites use runAction(...).
//
// USAGE (wiring lands in follow-up PRs — this PR ships the primitive only):
//
//   import { runAction } from "@/lib/console-toast";
//
//   await runAction(
//     { pending: "جارٍ الحفظ…", success: "تم الحفظ", error: "تعذّر الحفظ", retry: true },
//     () => fetch(`/api/orders/${id}/status`, { method: "POST", headers: {...}, body }),
//   );
//
//   // The action's resolved value decides success/failure from the REAL result:
//   //   • Response  → res.ok (HTTP status, not "the click happened")
//   //   • boolean   → the value
//   //   • void      → success (no throw)
//   //   • throws    → failed
//   // With retry:true a failed toast shows «إعادة المحاولة» that re-runs the action.
// ============================================================================

import { create } from "zustand";

// "info" = a neutral terminal outcome (e.g. a receipt "skipped" — NOT a success,
// NOT a failure). Added for R2 so neutral results aren't shown as false success.
export type ToastState = "pending" | "success" | "failed" | "info";

export interface ActionToast {
  id: number;
  state: ToastState;
  message: string;
  /** Present only on a failed toast when a retry is available. */
  retry?: () => void;
}

interface ToastStore {
  toasts: ActionToast[];
  push: (t: Omit<ActionToast, "id">) => number;
  update: (id: number, patch: Partial<ActionToast>) => void;
  dismiss: (id: number) => void;
}

let seq = 0; // in-memory id counter (no storage, no persistence)

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    return id;
  },
  update: (id, patch) => set((s) => ({ toasts: s.toasts.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export interface RunActionOpts {
  pending: string;
  success: string;
  error: string;
  /** When true, a failed toast shows a retry button that re-runs the action. */
  retry?: boolean;
  /** ms before a success toast auto-dismisses (default 3500). Failures persist. */
  successTtlMs?: number;
}

/** What an action may resolve to. Success is read from the REAL result, never from
 *  "the call was made": a Response uses res.ok; a boolean is taken as-is; void is
 *  success; a throw is failure. */
export type ActionOutcome = Response | boolean | void;

/**
 * Run an async action with pending → success/failed feedback. Returns whether it
 * succeeded. Never throws (a thrown action becomes a failed toast).
 */
export async function runAction(opts: RunActionOpts, fn: () => Promise<ActionOutcome>): Promise<boolean> {
  const id = useToastStore.getState().push({ state: "pending", message: opts.pending });
  let ok = false;
  try {
    const r = await fn();
    ok = r instanceof Response ? r.ok : r === undefined ? true : !!r;
  } catch {
    ok = false;
  }

  const store = useToastStore.getState();
  if (ok) {
    store.update(id, { state: "success", message: opts.success, retry: undefined });
    const ttl = opts.successTtlMs ?? 3500;
    setTimeout(() => useToastStore.getState().dismiss(id), ttl);
  } else {
    store.update(id, {
      state: "failed",
      message: opts.error,
      retry: opts.retry
        ? () => {
            useToastStore.getState().dismiss(id);
            void runAction(opts, fn);
          }
        : undefined,
    });
  }
  return ok;
}

/** A terminal outcome for runActionOutcome: success | failed | info (neutral). */
export interface ActionResultOutcome {
  state: "success" | "failed" | "info";
  message: string;
  /** Only honored for a "failed" outcome — shows a retry that re-runs the action. */
  retry?: boolean;
  successTtlMs?: number;
}

/**
 * Like runAction, but the action resolves to an EXPLICIT terminal outcome
 * (success | failed | info) — for flows with a neutral case that must not read as
 * success (e.g. receipt "skipped"). Shows pending, then the chosen state.
 */
export async function runActionOutcome(pending: string, fn: () => Promise<ActionResultOutcome>): Promise<void> {
  const id = useToastStore.getState().push({ state: "pending", message: pending });
  let outcome: ActionResultOutcome;
  try {
    outcome = await fn();
  } catch {
    outcome = { state: "failed", message: "حدث خطأ غير متوقع" };
  }
  const store = useToastStore.getState();
  store.update(id, {
    state: outcome.state,
    message: outcome.message,
    retry:
      outcome.state === "failed" && outcome.retry
        ? () => {
            useToastStore.getState().dismiss(id);
            void runActionOutcome(pending, fn);
          }
        : undefined,
  });
  if (outcome.state !== "failed") {
    setTimeout(() => useToastStore.getState().dismiss(id), outcome.successTtlMs ?? 3500);
  }
}
