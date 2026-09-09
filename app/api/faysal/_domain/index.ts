// ============================================================================
// فيصل / Faysal — THE DOMAIN SWAP POINT. This file is the ONLY place the demo
// surface names a domain implementation. Everything else in app/faysal/* and
// app/api/faysal/* imports from `@/app/api/faysal/_domain`.
//
// ── WHEN `lib/health` LANDS, THIS IS THE WHOLE EDIT ─────────────────────────
//
//   1. Replace the two `export … from "./bridge"` blocks below with:
//
//        export {
//          openStateAt, bookableWindows, recommendBranch, searchSlots,
//          holdSlot, confirmBooking, cancelBooking, priceFor, insuranceAnswer,
//        } from "@/lib/health";
//        export { detectRedFlag } from "@/lib/health/safety";
//
//   2. Point `readRedFlag`'s inner call at that `detectRedFlag` (it already
//      normalizes BOTH the `{ fired, class, tier, termAr }` contract shape and
//      SPEC-4 §1.1's `{ fired, cls, tier, ruleId, label }` shape, and it already
//      degrades a throw to `emergency` per §1.5 R3 — so nothing above it changes).
//
//   3. Delete `bridge.ts`, `seed.ts` and `safety.ts`, and keep `contract.ts`
//      only if `lib/health` does not export equivalent types.
//
// Nothing else in the app moves. The scene machine, the frozen strings and the
// renderer were written against `contract.ts`, never against the bridge.
// ============================================================================

export type {
  BookableWindow,
  Booking,
  BookingKind,
  BranchRecommendation,
  HealthDomain,
  Hold,
  InsuranceAnswer,
  NeedKey,
  OpenState,
  OpenStateResult,
  Patient,
  PriceBasis,
  PriceQuote,
  RecommendOpts,
  RedFlagClass,
  RedFlagHit,
  RedFlagTier,
  RedFlagVerdict,
  SiteId,
  Slot,
  SlotQuery,
} from "./contract";

// ── the contract ────────────────────────────────────────────────────────────
export {
  openStateAt,
  bookableWindows,
  recommendBranch,
  searchSlots,
  holdSlot,
  confirmBooking,
  cancelBooking,
  priceFor,
  insuranceAnswer,
} from "./bridge";

// ── the safety rail (SPEC-4) ────────────────────────────────────────────────
export { detectRedFlag, readRedFlag, emergencyRail, RAIL_STOP_REASON } from "./safety";

// ── renderer-facing helpers the contract implies but does not name ──────────
// These exist because Rules FRI-1, C4-1, PRICE-1 and DEMO-1(c) are RENDERER
// rules: the phone number, the callback shape and the two disclaimers are
// appended by the code path that renders the fact, never by the model. When
// `lib/health` lands it will own the first four; the strings stay in `_engine`.
export {
  PRICE_LABEL_AR,
  carrierNameAr,
  clinicBookableAt,
  getBooking,
  packageFor,
  requestCallback,
  riyadhDateISO,
  riyadhParts,
  slotLabelAr,
  timeAr,
} from "./bridge";

export { CARRIERS, CLINICIANS, OPS, PRICES, REAL_CONTACTS, ROUTES, SITES, SITE_IDS } from "./seed";
export type { SeedSite } from "./seed";
