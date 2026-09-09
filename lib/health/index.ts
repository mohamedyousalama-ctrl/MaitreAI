// ============================================================================
// فيصل / Faysal — the domain engine's public surface.
// Al Wattan Medical Group (مجموعة الوطن الطبية) · six Riyadh sites.
// Specified by docs/faysal/SPEC-1-DOMAIN.md.
//
// THE CONTRACT other modules import — and the only functions they should:
//
//   openStateAt(siteId, when)            → "open" | "closed" | "unknown"
//   bookableWindows(siteId, dateISO)     → Window[]   ([] is the SAFE answer)
//   recommendBranch(need, opts)          → { siteId, reasonAr, … }
//   searchSlots(q)                       → Slot[]
//   holdSlot(slotId, who)                → { holdId, expiresAt }   (10 min)
//   confirmBooking(holdId, patient)      → Appointment  (idempotent, revalidates)
//   cancelBooking(ref)                   → void
//   priceFor(serviceId, siteId)          → { amount, currency, basis, demoLabel }
//   insuranceAnswer(carrier, siteId)     → { accepted, classKnown, sentenceAr }
//
// Every one is PURE and DETERMINISTIC given an explicit `now` / `demoMode`. The
// clock is read in exactly two places — the default value of `now`, and
// bookableWindows()'s DEMO_MODE read — and both can be passed in by the caller.
//
// ARCHITECTURAL SEAM: this package imports NOTHING from lib/order*, lib/*menu*,
// or any other restaurant module. The discipline of lib/order-pricing.ts is
// borrowed (one calculator, pure, fail loud, two markers, bounded by named
// constants); the code is not. scripts/proof-faysal-domain.test.ts asserts it.
//
// NOT EXPORTED HERE, ON PURPOSE:
//   • lib/health/db/     — persistence and queries (owned separately)
//   • lib/health/safety/ — the red-flag rail (owned separately; MED-2 outranks
//     every function in this file, and no function here may be called once the
//     rail has fired).
// ============================================================================

// ── Hours (§4) — the tri-state answer, the one gate that mints, the sentence ─
export {
  SITE_HOURS,
  UNKNOWN_DAY,
  bookableMinutes,
  bookableWindows,
  dayHoursFor,
  effectiveConfidence,
  hoursDisclosure,
  layerHoursFor,
  needsReconfirmation,
  openStateAt,
  volatilityWindowFor,
  type HoursDisclosure,
  type HoursOpts,
  type HoursTable,
} from "./hours";

// ── Sites (§3) ──────────────────────────────────────────────────────────────
export {
  SITES,
  SITE_IDS,
  canMintSlots,
  formatPhoneAr,
  isContested,
  isSiteId,
  patientPhoneDisplay,
  patientPhoneFor,
  patientPhonesFor,
  siteById,
  siteInDistrict,
} from "./sites";

// ── Routing (§5) ────────────────────────────────────────────────────────────
export {
  STRENGTHS,
  fallbackChain,
  isNeedKey,
  needFromText,
  recommendBranch,
  strengthsForSite,
  type RecommendOpts,
} from "./routing";

// ── Clinicians and capability (§6) ──────────────────────────────────────────
export {
  CLINICIANS,
  DENYLIST_MONONYMS,
  REAL_CLINICIAN_DENYLIST,
  clinicianById,
  cliniciansFor,
  isBookableSpecialty,
  isDemoSeededCapability,
  siteSpecialty,
  specialtyEvidence,
} from "./clinicians";

// ── Slots (§7.2–§7.4) ───────────────────────────────────────────────────────
export {
  RESOURCES,
  busyProbability,
  clinicBookableAt,
  fnv1a32,
  generateDaySlots,
  meetsLeadTime,
  parseSlotId,
  searchSlots,
  slotFromId,
  slotIdOf,
  slotIsStillBookable,
  xorshift32,
  type GenerateOpts,
  type SlotRef,
} from "./slots";

// ── Hold → confirm → cancel (§7.5, §7.6, §4.6) ──────────────────────────────
export {
  appointmentByRef,
  assertConfirmationMarkers,
  getBooking,
  cancelBooking,
  confirmBooking,
  holdFamilyBlock,
  holdSlot,
  releaseHold,
  renderConfirmationBlock,
  requestCallback,
  type BookingOpts,
  type FamilyLeg,
  type HoldResult,
} from "./booking";

// ── The store (§7.5, §8) ────────────────────────────────────────────────────
export { createStore, defaultStore, expireStaleHolds, type FaysalStore } from "./store";

// ── Money (§9) ──────────────────────────────────────────────────────────────
export {
  LASER_AREAS,
  SERVICES,
  assertCatalogueInvariants,
  packageFor,
  priceFor,
  quote,
  serviceById,
  servicesForSpecialty,
} from "./catalogue";

// ── Insurance (§10) ─────────────────────────────────────────────────────────
export {
  PAYERS,
  aestheticInsuranceNoteAr,
  carrierNameAr,
  assertNoCoveragePromise,
  assertNoFacilityCode,
  insuranceAnswer,
  payerByName,
} from "./insurance";

// ── Constants and frozen strings (§0.2, §7.2, §9.2, §11) ────────────────────
export {
  CLINIC_TZ,
  CLIENT_CONFIRMED_REALERT_DAYS,
  CLIENT_CONFIRMED_SECOND_STALE_AFTER_DAYS,
  CLIENT_CONFIRMED_STALE_AFTER_DAYS,
  DEMO_BOOKING_SUFFIX_AR,
  DEMO_SYSTEM_LINE_AR,
  FAYSAL_BOOKING_HORIZON_DAYS,
  FAYSAL_HOLD_TTL_MS,
  FAYSAL_MAX_ACTIVE_HOLDS_PER_PATIENT,
  FAYSAL_MAX_SLOTS_PER_REPLY,
  FAYSAL_MIN_LEAD_MINUTES,
  FAYSAL_SLOT_GRID_MINUTES,
  FAYSAL_SLOT_SALT,
  GROUP_UNIFIED_920_SHOAA,
  GROUP_UNIFIED_920_WATTAN,
  GROUP_WHATSAPP,
  HOURS_STALE_AFTER_DAYS,
  PRICE_LABEL_AR,
  VOLATILITY_WINDOWS,
  demoModeFromEnv,
} from "./config";

// ── Time (pure Riyadh-local arithmetic) ─────────────────────────────────────
export {
  addDays,
  dayKeyOf,
  daysBetween,
  hhmmOf,
  isDateISO,
  isFriday,
  localDateOf,
  /** The demo surface names it `riyadhDateISO`; it is the same pinned +03:00 read. */
  localDateOf as riyadhDateISO,
  minutesOf,
  toLocalInstant,
} from "./time";

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  Appointment,
  AppointmentKind,
  Brand,
  BranchRecommendation,
  CatalogueService,
  Clinician,
  ClientConfirmation,
  Confidence,
  DayHours,
  DayKey,
  DayStatus,
  Hold,
  HoursConflict,
  HoursLayer,
  InsuranceAnswer,
  LayerHours,
  NeedKey,
  NetworkClass,
  PatientRef,
  Payer,
  PayerKind,
  Phone,
  PriceAnswer,
  PriceBasis,
  Resource,
  ServicePrice,
  Site,
  SiteHours,
  SiteId,
  SiteSpecialty,
  SiteStrength,
  Slot,
  SlotQuery,
  SlotState,
  SourceRef,
  SpecialtyEvidence,
  SpecialtyKey,
  TimeWindow,
  Tri,
  Window,
} from "./types";
