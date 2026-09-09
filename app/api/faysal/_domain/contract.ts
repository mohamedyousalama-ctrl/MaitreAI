// ============================================================================
// فيصل / Faysal — THE DOMAIN CONTRACT, as agreed with the domain agent.
//
// This file declares ONLY the shapes and the function signatures. It contains no
// clinic facts, no hours, no prices and no lexicon. It exists so that the demo
// surface (app/faysal/*, app/api/faysal/*) can be written against the contract
// while `lib/health/*` is still being built, and so that the swap in
// `_domain/index.ts` is a one-line edit rather than a refactor.
//
// The contract, as handed down:
//
//   openStateAt(siteId, when)          · bookableWindows(siteId, dateISO)
//   recommendBranch(need, opts)        → { siteId, reasonAr }
//   searchSlots(q) · holdSlot(slotId, who) · confirmBooking(holdId, patient)
//   cancelBooking(ref)
//   priceFor(serviceId, siteId)        → { amount, currency, basis, demoLabel }
//   insuranceAnswer(carrier, siteId)   → { accepted, classKnown, sentenceAr }
//   detectRedFlag(text)                → { fired, class, tier, termAr } | null
//
// Two notes on shapes that are wider than the one-line contract, and why:
//
// 1. `detectRedFlag` is declared here with BOTH the caller-facing field names
//    (`class`, `termAr`) and SPEC-4 §1.1's field names (`cls`, `ruleId`, `label`)
//    optional, because SPEC-4 owns the real module and specifies `cls`/`ruleId`/
//    `label`. `normalizeRedFlag()` in `_domain/index.ts` accepts either and the
//    scene machine only ever reads the normalized value. A safety rail that
//    silently reads `undefined` because two specs named one field differently is
//    the exact class of defect SPEC-4 §1.5 R3 exists to catch — so the reader is
//    total and treats a non-conforming return as `emergency`.
//
// 2. `Slot`, `Hold` and `Booking` carry the fields SPEC-1 §4.6, §7.5 and Rule
//    DEMO-1(c) require the RENDERER to see — `isFriday` (Rule FRI-1),
//    `pendingBranchConfirmation` (Rule C4-1) and `demoBasis` (Rule DEMO-1(c)(4)).
//    The disclaimer is a function of the data's provenance, so the provenance has
//    to travel with the booking; a renderer that has to be *told* to disclaim is a
//    renderer that will one day not be told.
// ============================================================================

export type SiteId =
  | "wattan-1"
  | "wattan-2"
  | "wattan-3"
  | "wattan-4"
  | "shoaa-wurud"
  | "shoaa-rawdah";

/** SPEC-2 §2.3 — branch status is a THREE-state field, never a boolean. */
export type OpenState = "OPEN" | "CLOSED" | "UNVERIFIED";

export interface OpenStateResult {
  state: OpenState;
  /** Patient-renderable opening time («1:00 م»), or null when the state is UNVERIFIED. */
  opensAtAr: string | null;
  /** True when `when` falls on a Friday in Riyadh — drives Rule FRI-1 at the renderer. */
  isFriday: boolean;
  /** SPEC-1 §3.4.1 — `operational_contested`. Drives Rule C4-1 / C4-2. */
  contested: boolean;
}

export interface BookableWindow {
  /** ISO instant, Riyadh wall-clock rendered with the +03:00 offset. */
  startISO: string;
  endISO: string;
  /** «4:00 م – 10:00 م», Western digits, 12-hour. */
  labelAr: string;
}

export type NeedKey =
  | "laser"
  | "dermatology"
  | "dental"
  | "orthodontics"
  | "endodontics"
  | "paediatrics"
  | "obgyn"
  | "ent"
  | "orthopaedics"
  | "internal"
  | "general"
  | "employment_medical"
  | "neurology"
  | "after_hours";

export interface RecommendOpts {
  /** The patient's own district, in their words. Never inferred from anything else. */
  districtAr?: string | null;
  /** The patient explicitly asked for the NEAREST branch (§6.2 geography fork). */
  preferNearest?: boolean;
}

export interface BranchRecommendation {
  siteId: SiteId;
  /** SPEC-2 §4.1 #2 — a loaded specific, never an adjective. */
  reasonAr: string;
  /** Set when the nearest branch is not the best clinical answer (§6.2 fork). */
  nearest?: {
    siteId: SiteId;
    /** What the near branch genuinely has — never "less than" the best branch. */
    capabilityAr: string;
  } | null;
}

export interface Slot {
  slotId: string;
  siteId: SiteId;
  clinicKey: string;
  clinicAr: string;
  /** ISO instant with the Riyadh offset. */
  startISO: string;
  /** «السبت 11:00 ص» — Western digits, 12-hour, day named in Arabic. */
  labelAr: string;
  /** Rule FRI-1: the renderer appends the branch phone whenever this is true. */
  isFriday: boolean;
  doctorId: string | null;
  doctorAr: string | null;
}

export interface SlotQuery {
  siteId: SiteId;
  clinicKey: string;
  /** Search from this instant forward. */
  fromISO: string;
  limit?: number;
}

export interface Hold {
  holdId: string;
  slotId: string;
  expiresAtISO: string;
  /** Minutes the hold survives — SPEC-1 §7.5. */
  holdMinutes: number;
}

export type BookingKind = "slot" | "callback_request";

export interface Patient {
  nameAr: string;
  /** Carrier the patient named, verbatim. Never used to compute coverage. */
  carrierAr?: string | null;
  /** For a callback_request: the coarse window in the PATIENT's own words. */
  preferredWindowAr?: string | null;
}

export interface Booking {
  ref: string;
  kind: BookingKind;
  siteId: SiteId;
  clinicAr: string;
  /** Null for a callback_request — SPEC-1 §4.6 never renders a time for one. */
  slotLabelAr: string | null;
  preferredWindowAr: string | null;
  patientNameAr: string;
  carrierAr: string | null;
  /** Rule C4-1 — a contested site is booked out loud, never silently. */
  pendingBranchConfirmation: boolean;
  /** Rule DEMO-1(c)(4): the disclaimer ships while ANY of the data is demo-basis. */
  demoBasis: boolean;
  isFriday: boolean;
}

/** SPEC-1 §9.2 — two markers, read by different things. */
export type PriceBasis =
  | "demo_invented_anchored"
  | "demo_invented_unanchored"
  | "client_confirmed";

export interface PriceQuote {
  serviceId: string;
  serviceAr: string;
  amount: number;
  currency: "SAR";
  basis: PriceBasis;
  /**
   * Rule PRICE-1's frozen label, SPEC-2 §5.2's wording. Emitted by this renderer,
   * NEVER composed by the model. Empty string when `basis === "client_confirmed"`.
   */
  demoLabel: string;
}

export interface InsuranceAnswer {
  /** The building appears on the carrier's network list. NOT eligibility. */
  accepted: boolean;
  /** Always false in this product — Faysal never knows the class (Rule INS-1). */
  classKnown: boolean;
  /** SPEC-2 §5.2 `insurance.class_honesty`, carrier interpolated. */
  sentenceAr: string;
}

// ── Safety ──────────────────────────────────────────────────────────────────

export type RedFlagClass =
  | "cardiac"
  | "stroke"
  | "hemorrhage"
  | "airway"
  | "obstetric"
  | "infant_fever"
  | "poisoning"
  | "trauma"
  | "self_harm";

export type RedFlagTier = "emergency" | "urgent";

/**
 * Accepts BOTH the caller-facing contract shape (`class`, `termAr`) and SPEC-4
 * §1.1's shape (`cls`, `ruleId`, `label`). `normalizeRedFlag()` reads whichever is
 * present. See the header note.
 */
export interface RedFlagHit {
  fired: boolean;
  class?: RedFlagClass | null;
  cls?: RedFlagClass | null;
  tier: RedFlagTier | null;
  termAr?: string | null;
  ruleId?: string | null;
  label?: string | null;
}

/** The normalized verdict every surface in this app reads. Never `undefined`. */
export interface RedFlagVerdict {
  fired: boolean;
  cls: RedFlagClass | null;
  tier: RedFlagTier | null;
  ruleId: string;
  label: string | null;
}

// ── The functions ───────────────────────────────────────────────────────────

export interface HealthDomain {
  openStateAt(siteId: SiteId, when: Date): OpenStateResult;
  bookableWindows(siteId: SiteId, dateISO: string): BookableWindow[];
  recommendBranch(need: NeedKey, opts?: RecommendOpts): BranchRecommendation;
  searchSlots(q: SlotQuery): Slot[];
  holdSlot(slotId: string, who: string): Hold | null;
  confirmBooking(holdId: string, patient: Patient): Booking | null;
  cancelBooking(ref: string): boolean;
  priceFor(serviceId: string, siteId: SiteId): PriceQuote | null;
  insuranceAnswer(carrier: string, siteId: SiteId): InsuranceAnswer;
}
