// ============================================================================
// R0 — Order-status ACCEPTANCE CONTRACT. Characterization only (WO-R0).
//
// This module DOCUMENTS and CENTRALISES what the code already does at the frozen
// remediation source f7882c1. It changes NO behaviour. It is a PURE module — no
// database imports, no server-only imports (its only import is type-only and
// erased at runtime) — so it is safe to import from BOTH the client shift model
// and the server acceptance route (app/api/orders/[id]/pos/route.ts). In R0 only
// the shift model is wired to consume it; R1 will wire the route and will change
// the predicate below (R1 is currently blocked — do not pre-empt it here).
//
// WHY THIS EXISTS — the audit finding this makes fixable, not fixed:
// a confirmed WhatsApp/web order is WRITTEN with order_status "pending_confirmation"
// (lib/db/orders-create.ts:242, app/api/storefront/orders/route.ts:278), while
// acceptance eligibility begins at "paid". So 126/127 pilot orders are invisible to
// the acceptance queue and «قبول» / the POS route return 409. The meaning of
// "pending_confirmation" is spelled twelve different ways across the codebase; this
// module gives the ONE eligibility decision a single home so R1 can change one thing
// instead of twelve. R0 reproduces the CURRENT decision exactly — including the bug.
// ============================================================================

import type { OrderStatusKey } from "@/lib/types";

// ---------------------------------------------------------------------------
// The status vocabulary — EXACTLY the values the code uses today (mirrors
// lib/orders/transitions.ts ORDER_STATUSES; not renamed, not normalised). Beside
// each: what causes an order to ENTER it, and what the codebase INFERS from it —
// recorded as observed. Where consumers disagree on a status's meaning it is
// reported here, NOT reconciled (that is the whole point of R0).
// ---------------------------------------------------------------------------
export const ORDER_STATUS_VOCABULARY = [
  // draft — an order skeleton before the customer has confirmed. Rarely persisted
  // (real orders are born at pending_confirmation); transitions.ts still lists it.
  "draft",
  // pending_confirmation — the audit's crux. WRITTEN when a customer confirms a
  // WhatsApp order (orders-create.ts:242) or a web/storefront order
  // (storefront/orders:278; also the allergen-review branch :200). It is the
  // "customer confirmed, restaurant not yet accepted" state — yet acceptance treats
  // it as NOT acceptable. Consumers infer DIFFERENT meanings (see the R0 inventory):
  //   • shift model + POS route → NOT acceptance-eligible (excluded).
  //   • display-state           → "incoming" (blue; "just arrived, needs a look").
  //   • orders.ts trackingReply → grouped with pending_payment/draft → tells the
  //                               CUSTOMER "بانتظار الدفع" (awaiting payment).
  //   • customer-turn.ts        → tells the CUSTOMER "بانتظار تأكيد المطعم".
  //   • insights/order-kpis     → «قيد التأكيد», reported apart from revenue.
  //   • cod ledger / legacy list→ label "جديد" (new).
  "pending_confirmation",
  // pending_payment — awaiting the customer's payment (a link was/was to be sent).
  "pending_payment",
  // paid — money captured/confirmed. The FIRST acceptance-eligible status today.
  "paid",
  // preparing — kitchen started (legacy fulfilment lifecycle; out of the new
  // intake+acceptance boundary, but still acceptance-eligible today).
  "preparing",
  // ready — ready for pickup/handoff (legacy).
  "ready",
  // out_for_delivery — dispatched (legacy; deliveries out of V1 scope).
  "out_for_delivery",
  // delivered — completed (legacy).
  "delivered",
  // cancelled — terminal; never acceptance-eligible.
  "cancelled",
] as const satisfies readonly OrderStatusKey[];

// ---------------------------------------------------------------------------
// Acceptance eligibility — the decision AS MADE TODAY. Reproduces current
// behaviour EXACTLY, including the audit-found bug (pending_confirmation is NOT
// acceptable). This is the single mirror of the two encodings that exist today,
// which are byte-for-byte the same set:
//   • components/console-v2/shift/shift-model.ts  ACCEPTABLE_ORDER_STATUSES
//   • app/api/orders/[id]/pos/route.ts            POS_ELIGIBLE_STATUS
// both = {paid, preparing, ready, out_for_delivery, delivered}, plus the shared
// is-test exclusion. R1 will change THIS predicate; R0 only gives it one home.
// ---------------------------------------------------------------------------
export const ACCEPTANCE_ELIGIBLE_STATUSES = [
  "paid",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
] as const satisfies readonly OrderStatusKey[];

const ACCEPTANCE_ELIGIBLE_SET: ReadonlySet<string> = new Set(ACCEPTANCE_ELIGIBLE_STATUSES);

/** The facts the acceptance decision reads today: the status + the test flag. */
export interface AcceptanceOrderFacts {
  orderStatus: OrderStatusKey;
  isTest?: boolean | null;
}

/**
 * THE acceptance-eligibility predicate — one home for the decision the shift model
 * and the POS route each make privately today. Returns exactly what the system
 * decides now: a NON-test order whose status is in ACCEPTANCE_ELIGIBLE_STATUSES.
 *
 * ⚠ CHARACTERIZATION — DO NOT "FIX" IN R0: today an order in `pending_confirmation`
 * returns FALSE here. The audit found that wrong (126/127 pilot orders are stuck
 * there and «قبول» 409s). R1 owns inverting this decision; R0 must reproduce it.
 * Adding `pending_confirmation` here would be a behaviour change and is forbidden.
 */
export function isAcceptanceEligible(o: AcceptanceOrderFacts): boolean {
  if (o.isTest) return false;
  return ACCEPTANCE_ELIGIBLE_SET.has(o.orderStatus);
}

// ---------------------------------------------------------------------------
// Deliverable A.4 — NAMES / TYPES ONLY for the explicit facts R1 will introduce.
// These columns DO NOT EXIST in the database yet. They are declared here so R1 has
// one place to build on; NOTHING in R0 reads them and NO decision uses them. This
// is preparation, not use — `isAcceptanceEligible` above deliberately ignores them.
// ---------------------------------------------------------------------------
export const FUTURE_ACCEPTANCE_FACT_NAMES = [
  "customer_confirmed_at", // when the CUSTOMER confirmed the order (Karim's checkpoint)
  "restaurant_accepted_at", // when a HUMAN at the restaurant accepted it (leaves Kivo)
  "restaurant_accepted_by", // which member accepted it
] as const;
export type FutureAcceptanceFactName = (typeof FUTURE_ACCEPTANCE_FACT_NAMES)[number];

/** The shape R1 will add. NOT read anywhere in R0 (declared for preparation only). */
export interface FutureAcceptanceFacts {
  customer_confirmed_at: string | null;
  restaurant_accepted_at: string | null;
  restaurant_accepted_by: string | null;
}
