// ============================================================================
// MaitreAI — Payment helpers: Arabic labels, status colors, methods.
// Local mock only — no real provider.
// ============================================================================

import type { PaymentMethodKey, PaymentSessionStatus } from "./types";

export const PAYMENT_SESSION_LABELS: Record<PaymentSessionStatus, string> = {
  created: "تم الإنشاء",
  link_sent: "تم إرسال الرابط",
  opened: "تم فتح الرابط",
  paid: "مدفوع",
  failed: "فشل الدفع",
  expired: "منتهي الصلاحية",
  cancelled: "ملغي",
  refunded: "مسترجع",
};

export const PAYMENT_SESSION_STYLES: Record<PaymentSessionStatus, string> = {
  created: "bg-slate-50 text-slate-600 ring-slate-200",
  link_sent: "bg-blue-50 text-blue-700 ring-blue-200",
  opened: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  paid: "bg-purple-50 text-purple-700 ring-purple-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  expired: "bg-amber-50 text-amber-700 ring-amber-200",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
  refunded: "bg-red-50 text-red-700 ring-red-200",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  mada: "مدى",
  applepay: "آبل باي",
  card: "بطاقة ائتمانية",
};

export const DEFAULT_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

// When reusing an active session, top its expiry back up if it has less than
// this much time left — so a reused link isn't handed back about to expire.
export const EXPIRY_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// SINGLE SOURCE of the "active / unresolved" session statuses. The idempotency
// partial unique index (0059) is keyed on exactly this set, and a unit test
// asserts the migration's WHERE-predicate set === this constant, so the two can
// never drift. Any code that means "session still open for payment" MUST derive
// from here (see isSessionActive) rather than re-listing statuses.
export const ACTIVE_STATUSES: readonly PaymentSessionStatus[] = ["created", "link_sent", "opened"] as const;

/** A session is open for payment (link active, not yet resolved). */
export function isSessionActive(status: PaymentSessionStatus): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/** Terminal = resolved: paid | failed | expired | cancelled | refunded. */
export function isTerminalStatus(status: PaymentSessionStatus): boolean {
  return !isSessionActive(status);
}

// ── Idempotency decision core (pure — unit-tested; no DB, no I/O) ────────────
export interface SessionRowLike {
  status: PaymentSessionStatus;
  /** expires_at as epoch ms, or null when unset (treated as no-expiry). */
  expiresAtMs: number | null;
}

export type SessionAction<T> =
  | { action: "reuse"; session: T; refreshExpiry: boolean }
  | { action: "already_paid"; session: T }
  | { action: "create" };

/**
 * Decide what a create-session request should do given the order's EXISTING
 * sessions (already scoped by restaurant_id + order_id — cross-tenant rows must
 * never be passed in, which is how same-order-id stays independent per tenant):
 *  • an ACTIVE session exists → reuse it (refresh its expiry if it's nearly up);
 *  • else a PAID session exists → the order is already paid, do NOT create;
 *  • else (none, or only expired/failed/cancelled/refunded) → create a new one.
 * The DB partial-unique index is what makes the reuse race-safe under
 * concurrency; this function is the single-request decision.
 */
export function decideSessionAction<T extends SessionRowLike>(
  existing: readonly T[],
  nowMs: number
): SessionAction<T> {
  const active = existing.find((s) => isSessionActive(s.status));
  if (active) {
    const remaining = active.expiresAtMs == null ? Infinity : active.expiresAtMs - nowMs;
    return { action: "reuse", session: active, refreshExpiry: remaining < EXPIRY_REFRESH_THRESHOLD_MS };
  }
  const paid = existing.find((s) => s.status === "paid");
  if (paid) return { action: "already_paid", session: paid };
  return { action: "create" };
}

/** Idempotent paid transition: only change if not already 'paid'. */
export function decidePaidTransition(currentStatus: PaymentSessionStatus): { changed: boolean } {
  return { changed: currentStatus !== "paid" };
}
