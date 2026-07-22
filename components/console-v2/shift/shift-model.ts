// ============================================================================
// KIVO-SHIFT — «الوردية» shift-control PURE model (WO-SHIFT-1).
//
// The one place the shift screen's logic lives as pure, total functions: the
// product-boundary two-state derivation, the Section-A urgency law, elapsed-time
// escalation, the server-confirmed claim/accept outcome resolvers, and the
// action-availability reasons. PURE — no React, no i18n lookup, no DB, no
// `Date.now()` inside (callers pass `nowMs`) — so every rule is unit-testable
// with `node --experimental-strip-types --test` exactly like
// lib/console-v2/display-state.test.ts. Its only imports are `import type`
// (erased at runtime), so the test can import it under raw node.
//
// LAWS honored here (mirrors of server truth, never a second source):
//  • THE PRODUCT BOUNDARY — exactly TWO order states on this screen:
//    `needs_acceptance` (Karim confirmed with the customer; no human has accepted
//    yet) and `accepted` (a human accepted → it left Kivo). Kitchen / ready /
//    dispatched / delivered / POS-vocabulary are NOT states here.
//  • Acceptance == the server's audited POS-entry stamp (pos_status not_entered →
//    entered), the ONLY existing server-confirmed "a human took this order"
//    primitive. It stamps who/when and its conditional UPDATE makes a two-operator
//    race yield exactly one winner (the loser is told, never clobbers). We surface
//    it as «قبول» / «مقبول واتسلّم للمطعم» and NEVER show the POS vocabulary.
//  • Money is DISPLAYED, never derived — `serverTotal` is a pass-through, no math.
//  • Safety sorts FIRST and is the only red; operational waits escalate but never
//    become a permanent red badge staff learn to ignore.
//  • Ownership is server-confirmed — the outcome resolvers below turn the server's
//    real response (win / already-claimed / stale-epoch) into a view; nothing here
//    invents optimistic ownership, and a stale epoch resolves to REFRESH, not force.
// ============================================================================

import type { OrderStatusKey, PosStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// The product boundary — the two order states, derived from real order fields.
// ACCEPTABLE mirrors the server's POS_ELIGIBLE_STATUS (app/api/orders/[id]/pos):
// only a genuinely-confirmed (money-in), non-test order can be accepted. An
// allowlist, not a denylist, so a new status never silently becomes acceptable.
// ---------------------------------------------------------------------------
export const ACCEPTABLE_ORDER_STATUSES: readonly OrderStatusKey[] = [
  "paid",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
];

/** The two — and only two — order states this screen speaks. */
export type ShiftOrderState = "needs_acceptance" | "accepted";

/** Minimal order shape the model needs (the page maps LocalOrder → this). */
export interface ShiftOrder {
  id: string;
  orderStatus: OrderStatusKey;
  posStatus: PosStatus;
  isTest?: boolean;
  paymentStatus?: string;
  fulfillmentType?: "delivery" | "pickup";
  deliveryAddress?: string | null;
  posEnteredAt?: number | null;
  createdAt: number;
}

/** True once a human has accepted the order (POS-entry stamp present). */
export function isAccepted(o: Pick<ShiftOrder, "posStatus">): boolean {
  return o.posStatus === "entered" || o.posStatus === "sent_to_kitchen";
}

/** True when an order is confirmed-and-not-test → eligible to be accepted. */
export function isAcceptable(o: Pick<ShiftOrder, "orderStatus" | "isTest">): boolean {
  return !o.isTest && ACCEPTABLE_ORDER_STATUSES.includes(o.orderStatus);
}

/**
 * The screen's two-state derivation. Returns:
 *  • "accepted"         — a human accepted it (POS-entry stamped).
 *  • "needs_acceptance" — confirmed, non-test, not yet accepted.
 *  • null               — NOT on this screen (draft / pending_confirmation /
 *                         pending_payment / cancelled / test). pending_payment is
 *                         a payment BLOCKER (Section A), not an acceptance card.
 */
export function shiftOrderState(o: ShiftOrder): ShiftOrderState | null {
  if (isAccepted(o)) return "accepted";
  if (isAcceptable(o)) return "needs_acceptance";
  return null;
}

/** True when the order is a payment blocker (confirmed by Karim, money not in). */
export function isPaymentBlocked(o: Pick<ShiftOrder, "orderStatus" | "isTest">): boolean {
  return !o.isTest && o.orderStatus === "pending_payment";
}

/** True when a delivery order is missing an address (an address blocker). */
export function isAddressBlocked(o: Pick<ShiftOrder, "fulfillmentType" | "deliveryAddress" | "isTest">): boolean {
  return !o.isTest && o.fulfillmentType === "delivery" && !(o.deliveryAddress && o.deliveryAddress.trim());
}

/** Accepted-today filter for Section C (accepted, stamped today). */
export function isAcceptedToday(o: ShiftOrder, startOfDayMs: number): boolean {
  return isAccepted(o) && typeof o.posEnteredAt === "number" && o.posEnteredAt >= startOfDayMs;
}

// ---------------------------------------------------------------------------
// MONEY — displayed, never derived. This pass-through exists so the "no
// arithmetic in the UI" law is a call, not a convention: the screen shows
// serverTotal(order), and the model has no code that adds/derives an amount.
// ---------------------------------------------------------------------------
export function serverTotal(o: { total: number }): number {
  return o.total;
}

// ---------------------------------------------------------------------------
// Section A — «لازم تتصرف الآن» — the andon. The urgency LAW, exactly as WO-SHIFT-1
// specifies. Lower rank = more urgent; a safety hold is rank 1 and therefore always
// first. Within a rank, the longest-waiting rises (elapsed desc), so a permanent
// badge never forms — the queue re-sorts as waits grow.
// ---------------------------------------------------------------------------
export type ActNowKind =
  | "safety_hold" // 1 — active allergy/safety hold (the only red)
  | "needs_acceptance" // 2 — confirmed order not accepted yet
  | "complaint" // 3
  | "human_request" // 4 — explicit human request
  | "payment_or_address" // 5 — payment or address blocker
  | "confusion" // 6 — repeated customer confusion
  | "time_limit"; // 7 — order approaching its time limit

export const ACT_NOW_RANK: Record<ActNowKind, number> = {
  safety_hold: 1,
  needs_acceptance: 2,
  complaint: 3,
  human_request: 4,
  payment_or_address: 5,
  confusion: 6,
  time_limit: 7,
};

export interface ActNowItem {
  id: string;
  kind: ActNowKind;
  /** ms the item has been waiting (from an order's createdAt or a conversation's
   *  last customer message). null when Kivo can't verify a start time — the UI then
   *  shows the reason WITHOUT a fabricated elapsed (the data-honesty law). */
  waitingMs: number | null;
}

/**
 * The Section-A sort. Stable and total: by urgency rank (safety first), then by
 * longest wait first (null waits sort last within a rank), then by id so the order
 * is deterministic. Does NOT mutate the input.
 */
export function sortActNow<T extends ActNowItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const r = ACT_NOW_RANK[a.kind] - ACT_NOW_RANK[b.kind];
    if (r !== 0) return r;
    const aw = a.waitingMs == null ? -1 : a.waitingMs;
    const bw = b.waitingMs == null ? -1 : b.waitingMs;
    if (aw !== bw) return bw - aw; // longest wait first
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Elapsed time — live + escalating. `formatElapsed` returns a Western-digit value
// + a unit token (the caller renders «منذ <Num/> <unit>» via the dictionary, so no
// number is interpolated INTO an Arabic string — the no-interpolation rule). Returns
// null for an unverifiable start time (render nothing, never a fake number).
// ---------------------------------------------------------------------------
export type ElapsedUnit = "sec" | "min" | "hr";

export function formatElapsed(waitingMs: number | null): { value: number; unit: ElapsedUnit } | null {
  if (waitingMs == null || !Number.isFinite(waitingMs) || waitingMs < 0) return null;
  const sec = Math.floor(waitingMs / 1000);
  if (sec < 60) return { value: sec, unit: "sec" };
  const min = Math.floor(sec / 60);
  if (min < 60) return { value: min, unit: "min" };
  return { value: Math.floor(min / 60), unit: "hr" };
}

/**
 * Escalation tier for a waiting item — rises with the wait so the UI can raise
 * visual weight (calm → rising → urgent) instead of a permanent red badge. Safety
 * is handled separately (it is the only red); this is for operational waits.
 * Thresholds: < 60s calm, < 180s rising, ≥ 180s urgent.
 */
export type ElapsedTier = "calm" | "rising" | "urgent";

export function elapsedTier(waitingMs: number | null): ElapsedTier {
  if (waitingMs == null || waitingMs < 60_000) return "calm";
  if (waitingMs < 180_000) return "rising";
  return "urgent";
}

/** An unaccepted order past this wait escalates into Section A as `time_limit`. */
export const TIME_LIMIT_MS = 180_000; // 3 minutes

export function isPastTimeLimit(waitingMs: number | null): boolean {
  return waitingMs != null && waitingMs >= TIME_LIMIT_MS;
}

// ---------------------------------------------------------------------------
// Server-confirmed outcome resolvers. Ownership/acceptance is what the SERVER
// says — these turn a real response into a view. Nothing here is optimistic.
// ---------------------------------------------------------------------------

/** Claim (استلم المحادثة) — /c/conversations/claim. Mirrors the route's contract. */
export type ClaimOutcome =
  | { kind: "won"; epoch: number | null }
  | { kind: "view_only"; ownerName: string | null } // already_claimed — the loser
  | { kind: "stale" } // stale_epoch — the view is out of date → REFRESH, never force
  | { kind: "not_claimable" } // state no longer accepts a claim
  | { kind: "failed"; code: string | null };

export function resolveClaimResponse(status: number, body: unknown): ClaimOutcome {
  const b = (body ?? {}) as Record<string, unknown>;
  if (status >= 200 && status < 300 && b.ok === true) {
    const epoch = typeof b.controlEpoch === "number" ? b.controlEpoch : null;
    return { kind: "won", epoch };
  }
  const error = typeof b.error === "string" ? b.error : null;
  if (status === 409 && error === "stale_epoch") return { kind: "stale" };
  if (status === 409 && error === "already_claimed") {
    return { kind: "view_only", ownerName: typeof b.ownerName === "string" ? b.ownerName : null };
  }
  if (error === "not_claimable") return { kind: "not_claimable" };
  return { kind: "failed", code: error };
}

/**
 * Accept (قبول) — /api/orders/[id]/pos. The conditional UPDATE guarantees a
 * single winner of a two-operator race; the loser gets pos_conflict /
 * invalid_transition and is TOLD, never overriding the first accepter's stamp.
 * A stale/ineligible state resolves to "refresh", not a forced retry.
 */
export type AcceptOutcome =
  | { kind: "accepted" }
  | { kind: "taken" } // someone else accepted first (pos_conflict / invalid_transition)
  | { kind: "ineligible" } // order not in an acceptable state → refresh the view
  | { kind: "failed"; code: string | null };

export function resolveAcceptResponse(status: number, body: unknown): AcceptOutcome {
  const b = (body ?? {}) as Record<string, unknown>;
  if (status >= 200 && status < 300 && b.ok === true) return { kind: "accepted" };
  const error = typeof b.error === "string" ? b.error : null;
  if (status === 409 && (error === "pos_conflict" || error === "invalid_transition")) return { kind: "taken" };
  if (status === 409 && error === "order_not_eligible") return { kind: "ineligible" };
  return { kind: "failed", code: error };
}

// ---------------------------------------------------------------------------
// Action availability — every disabled action must expose a REASON (offline,
// data not ready, actor unresolved, wrong role). Returns a reason KEY the page
// maps to a dictionary string (the pure module holds no i18n text).
// ---------------------------------------------------------------------------
export interface ActionContext {
  online: boolean;
  /** ConsoleDataState — "DEMO" | "DB_LOADING" | "DB_READY" | "NO_TENANT" | "DB_FAILED". */
  dataState: string;
  /** Resolved member role — "manager" | "operation" | "loading" | "unresolved". */
  role: string;
  /** Whether the claim actor (member id) has resolved from /c/conversations/actor. */
  actorReady: boolean;
}

export interface Availability {
  enabled: boolean;
  reasonKey?: string;
}

function dataPresentable(dataState: string): boolean {
  return dataState === "DB_READY" || dataState === "DEMO";
}

/** قبول — any member may accept (running the shift). Blocked offline / not-ready. */
export function acceptAvailability(ctx: ActionContext): Availability {
  if (!ctx.online) return { enabled: false, reasonKey: "shift.reason.offline" };
  if (!dataPresentable(ctx.dataState)) return { enabled: false, reasonKey: "shift.reason.notReady" };
  return { enabled: true };
}

/** استلم المحادثة — needs a resolved actor membership. */
export function claimAvailability(ctx: ActionContext): Availability {
  if (!ctx.online) return { enabled: false, reasonKey: "shift.reason.offline" };
  if (!dataPresentable(ctx.dataState)) return { enabled: false, reasonKey: "shift.reason.notReady" };
  if (!ctx.actorReady) return { enabled: false, reasonKey: "shift.reason.actor" };
  return { enabled: true };
}

/** وقف كريم — the wired stop is manager-only (mirrors the settings/ops gate). */
export function stopKarimAvailability(ctx: ActionContext): Availability {
  if (!ctx.online) return { enabled: false, reasonKey: "shift.reason.offline" };
  if (!dataPresentable(ctx.dataState)) return { enabled: false, reasonKey: "shift.reason.notReady" };
  if (ctx.role !== "manager") return { enabled: false, reasonKey: "shift.reason.manager" };
  return { enabled: true };
}

// ---------------------------------------------------------------------------
// Connection state — explicit TEXT, never a bare green dot. Derived from the
// browser online flag + the console data state.
// ---------------------------------------------------------------------------
export type ConnectionState =
  | "connected" // شغّال
  | "degraded" // يعمل بوضع محدود (data still loading / demo)
  | "weak" // الاتصال ضعيف (loaded but a store load failed)
  | "offline"; // واتساب/الشبكة غير متصلة

export function connectionState(online: boolean, dataState: string): ConnectionState {
  if (!online) return "offline";
  if (dataState === "DB_FAILED" || dataState === "NO_TENANT") return "weak";
  if (dataState === "DB_LOADING") return "degraded";
  return "connected"; // DB_READY | DEMO
}

/** Whether mutating actions are allowed at all (reading always works). */
export function actionsEnabled(online: boolean, dataState: string): boolean {
  return online && dataPresentable(dataState);
}

// ---------------------------------------------------------------------------
// Verifiable counts — ONLY things Kivo can prove: how many need acceptance and
// how many were accepted today. Never a delivered/completed count.
// ---------------------------------------------------------------------------
export interface ShiftCounts {
  needsAcceptance: number;
  acceptedToday: number;
}

export function shiftCounts(orders: readonly ShiftOrder[], startOfDayMs: number): ShiftCounts {
  let needsAcceptance = 0;
  let acceptedToday = 0;
  for (const o of orders) {
    const state = shiftOrderState(o);
    if (state === "needs_acceptance") needsAcceptance += 1;
    else if (state === "accepted" && isAcceptedToday(o, startOfDayMs)) acceptedToday += 1;
  }
  return { needsAcceptance, acceptedToday };
}
