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
// It declares NO new database facts (see the Blocker-2 note at the foot of the file):
// R1 introduces those alongside the migration that creates them.
// ============================================================================

import type { OrderStatusKey } from "@/lib/types";
// R0 rev3 / Item 1 (Option A): the status vocabulary is DERIVED from the existing
// canonical runtime source — lib/orders/transitions.ts ORDER_STATUSES — not restated
// here. The contract owns NO independent status list, so it has nothing to drift from
// (a parity test detects drift after the fact; deriving eliminates the duplicate).
// Relative import so the bare-Node characterization runner resolves it.
import { ORDER_STATUSES } from "./transitions";

// ---------------------------------------------------------------------------
// The status vocabulary — the canonical ORDER_STATUSES, re-exported so consumers
// have one name. Not a second copy: `ORDER_STATUS_VOCABULARY === ORDER_STATUSES`.
// ---------------------------------------------------------------------------
export const ORDER_STATUS_VOCABULARY = ORDER_STATUSES;

// ---------------------------------------------------------------------------
// Per-status MEANING — documentation only, as a map KEYED BY the status values (not
// a second runtime list to iterate). Being `Record<OrderStatusKey, string>` binds it
// to the type union: add a status to the union and TypeScript forces an entry here,
// so the docs cannot silently fall out of sync. Beside each: what causes an order to
// ENTER it, and what the codebase INFERS from it — where consumers disagree it is
// reported, NOT reconciled (that is the whole point of R0).
// ---------------------------------------------------------------------------
export const ORDER_STATUS_MEANING: Record<OrderStatusKey, string> = {
  draft:
    "An order skeleton before the customer has confirmed. Rarely persisted (real " +
    "orders are born at pending_confirmation); transitions.ts still lists it.",
  pending_confirmation:
    "The audit's crux. WRITTEN when a customer confirms a WhatsApp order " +
    "(orders-create.ts:242) or a web/storefront order (storefront:278; allergen-review " +
    "branch :200). The 'customer confirmed, restaurant not yet accepted' state — yet " +
    "acceptance treats it as NOT acceptable. Consumers infer DIFFERENT meanings: shift " +
    "model + POS route → not eligible; display-state → 'incoming'; orders.ts " +
    "trackingReply → customer «بانتظار الدفع»; customer-turn → «بانتظار تأكيد المطعم»; " +
    "insights → «قيد التأكيد» (apart from revenue); cod-ledger / legacy list → «جديد».",
  pending_payment: "Awaiting the customer's payment (a link was / was to be sent).",
  paid: "Money captured/confirmed. The FIRST acceptance-eligible status today.",
  preparing:
    "Kitchen started (legacy fulfilment lifecycle; out of the new intake+acceptance " +
    "boundary, but still acceptance-eligible today).",
  ready: "Ready for pickup/handoff (legacy).",
  out_for_delivery: "Dispatched (legacy; deliveries out of V1 scope).",
  delivered: "Completed (legacy).",
  cancelled: "Terminal; never acceptance-eligible.",
};

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

// NOTE (WO-R0 rev2 / Blocker 2): R0 declares NO new database facts. The explicit
// acceptance facts (a customer-confirmed timestamp and a restaurant-accepted
// timestamp/actor) do not exist in the database — the migration that would create
// them is not approved — so a characterization module must not pre-commit their
// schema by naming them here. R1 introduces them alongside that migration.
