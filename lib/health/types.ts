// ============================================================================
// فيصل / Faysal — Al Wattan Medical Group domain types.
// SPEC-1-DOMAIN.md §2, §4.1, §5.1, §6.1, §6.3, §7, §9.2, §10.1.
//
// PURE TYPES. No imports, no I/O, no clock. This file is the vocabulary the
// whole engine speaks; every other module in lib/health imports from here.
//
// TWO LAWS ARE ENCODED IN THE TYPES THEMSELVES, not in comments:
//   • H6 / Rule HRS-CONFIRM — a `client_confirmed` DayHours or ServicePrice
//     without a populated ClientConfirmation DOES NOT COMPILE (§4.10).
//   • Rule S-1 — provenance is a field, never prose. `source`, `capturedAt`,
//     `confidence` travel with the value or the record does not typecheck.
//
// ZERO imports from lib/order*, lib/*menu*, or any restaurant module. That is
// a hard architectural seam and it is asserted by scripts/proof-faysal-domain.
// ============================================================================

// ── Identity ────────────────────────────────────────────────────────────────

export type SiteId =
  | "wattan-1"
  | "wattan-2"
  | "wattan-3"
  | "wattan-4"
  | "shoaa-wurud"
  | "shoaa-rawdah";

export type Brand = "wattan" | "shoaa";

/** Tri-state everywhere a fact may simply be missing. NEVER a bare boolean (§2). */
export type Tri = "yes" | "no" | "unknown";

/**
 * §2. The provenance ladder.
 *
 * `demo_seeded` is NOT a rung — it is an explicitly invented value (Rule
 * HRS-DEMO). It sorts BELOW `unknown` for every purpose except
 * bookability-under-DEMO_MODE, and it may never be spoken as a fact.
 */
export type Confidence =
  | "client_confirmed"
  | "high"
  | "medium"
  | "low"
  | "conflicted"
  | "demo_seeded"
  | "unknown";

export type SourceKind =
  | "official_site"
  | "official_social"
  | "google_maps"
  | "insurer_pdf"
  | "directory"
  | "marketplace"
  | "legacy_site"
  | "review"
  | "dossier_only"
  | "invented_for_demo";

export interface SourceRef {
  kind: SourceKind;
  note: string;
  /** REQUIRED — an auditor must be able to jump. e.g. "§3.4 L171". */
  dossierRef: string;
  /** ISO date the underlying source was observed, per the dossier. */
  capturedAt: string;
}

/**
 * §4.10 Rule HRS-CONFIRM. The attribution that makes `client_confirmed`
 * representable. Every field is required: an unattributed client confirmation
 * is unrepresentable by construction, which is the whole point.
 */
export interface ClientConfirmation {
  /** The NAMED person at the client. Never "ops", never "the client". */
  confirmedBy: string;
  role: string;
  channel: "phone" | "whatsapp" | "email" | "meeting";
  /** ISO datetime. This is the capturedAt for the record it attaches to. */
  confirmedAt: string;
  /** What they actually said, in their words. */
  verbatim: string;
  /** Exactly what it covers: which site, which layer, which days. */
  scope: string;
}

// ── Phones (Rule PHONE-1) ───────────────────────────────────────────────────

export type PhoneKind = "primary" | "alt" | "fax" | "unified_920" | "whatsapp";

export interface Phone {
  e164OrNational: string;
  kind: PhoneKind;
  confidence: Confidence;
  source: SourceRef;
  /** True when this number is documented but must NOT be given to a patient. */
  suppressed: boolean;
  suppressionReason?: string;
}

// ── Operating status (§3.4.1) ───────────────────────────────────────────────

export type OperatingState =
  | "operational"
  | "operational_contested"
  | "closed"
  | "unknown";

export interface OperatingStatus {
  state: OperatingState;
  since: string | null;
  evidenceFor: SourceRef[];
  evidenceAgainst: SourceRef[];
  dossierGuidance: string | null;
  requiresLiveConfirmation: boolean;
}

// ── Hours (§4.1) ────────────────────────────────────────────────────────────

/** Operating week starts Saturday. Friday is the compressed day at this group. */
export type DayKey = "sat" | "sun" | "mon" | "tue" | "wed" | "thu" | "fri";

/**
 * WHICH CLOCK (§4.1). A facility open 24 hours does not mean the orthodontist
 * is at the chair at 03:00. Layers are separate records and are NEVER
 * substituted for one another — Invariant H4.
 */
export type HoursLayer = "facility" | "er" | "clinic" | "pharmacy" | "phone";

export interface TimeWindow {
  /** "HH:MM", local, 24h. */
  open: string;
  /** "HH:MM"; "24:00" means end of THIS local day. */
  close: string;
  /** True when close < open; the tail belongs to the NEXT day (§4.8). */
  crossesMidnight: boolean;
}

export type DayStatus = "open_24h" | "windows" | "closed" | "unknown";

export interface HoursConflict {
  /** Verbatim, as the dossier renders it. */
  claimA: string;
  claimB: string;
  dossierRefA: string;
  dossierRefB: string;
  /** The ONLY permitted value in Wave 1. We do not pick. */
  resolution: "unresolved";
  /** What Faysal does about it, in one sentence. */
  agentBehaviour: string;
}

interface DayHoursCore {
  status: DayStatus;
  /** Empty unless status === "windows". */
  windows: TimeWindow[];
  sources: SourceRef[];
  conflicts: HoursConflict[];
  /**
   * DERIVED, never authored. bookableWindows() computes bookability; a seed
   * file that sets this by hand does not compile. Same law as order-pricing.ts:
   * the fee is copied off the zone row, never typed into the order.
   */
  bookable?: never;
}

/**
 * H6 / Rule HRS-CONFIRM, in the type system: `client_confirmed` REQUIRES a
 * populated ClientConfirmation; every other rung forbids one. §14 criterion 29.
 */
export type DayHours =
  | (DayHoursCore & {
      confidence: Exclude<Confidence, "client_confirmed" | "demo_seeded">;
      /** ISO — when the underlying source was observed. */
      capturedAt: string;
      clientConfirmation?: never;
    })
  | (DayHoursCore & {
      confidence: "client_confirmed";
      /** capturedAt === clientConfirmation.confirmedAt (§4.10). */
      capturedAt: string;
      clientConfirmation: ClientConfirmation;
    })
  | (DayHoursCore & {
      confidence: "demo_seeded";
      /**
       * `demo_seeded` was never captured from anything, so it has no capturedAt
       * to be stale. It expires when DEMO_MODE goes off, and only then (§4.2).
       */
      capturedAt: null;
      /** Rule HRS-DEMO — the invention is named in-band, not in a comment. */
      demoNote: string;
      clientConfirmation?: never;
    });

export interface DateOverride {
  /** ISO date, Riyadh-local. */
  dateISO: string;
  reason: string;
  day: DayHours;
}

export interface LayerHours {
  layer: HoursLayer;
  /** Provenance in-band (Rule S-1) — why this layer looks the way it does. */
  note?: string;
  /**
   * A MISSING day is `unknown`, never inherited from a sibling day — Invariant
   * H3, generalised. `dayHoursFor()` is the only reader and it never falls back.
   */
  week: Partial<Record<DayKey, DayHours>>;
  /** Ramadan / Eid / national-day overrides. Empty in Wave 1 — [OPEN-04]. */
  overrides: DateOverride[];
}

export interface SiteHours {
  siteId: SiteId;
  timezone: "Asia/Riyadh";
  layers: LayerHours[];
  /** Rule HRS-FRESH. 30. */
  staleAfterDays: number;
}

// ── Sites (§2) ──────────────────────────────────────────────────────────────

export interface Site {
  id: SiteId;
  brand: Brand;
  nameAr: string;
  nameEn: string;
  akaAr?: string[];
  akaEn?: string[];
  mapsCategory: "Hospital" | "Medical Center" | "Polyclinic" | "unknown";
  district: { ar: string; en: string };
  addressEn: string;
  /** null where the dossier gives no Arabic form. Never back-filled. */
  addressAr: string | null;
  postalCode: string | null;
  landmarks: string[];
  plusCode: string | null;
  phones: Phone[];
  established: { year: number; kind: "established" | "acquired" | "joined_group" };
  operatingStatus: OperatingStatus;
  insurance: {
    facilityCode: string | null;
    codeKind: "cchi_style_network_code" | "legacy_map_id" | null;
    codeConfidence: Confidence;
    codeSource: SourceRef | null;
  };
  accreditation: {
    cbahi: "accredited" | "not_accredited_claimed_in_progress" | "unknown";
    cbahiDate: string | null;
    source: SourceRef | null;
  };
  rating: {
    value: number | null;
    reviewCountMin: number | null;
    reviewCountMax: number | null;
    scale: "google_5" | "aggregator_5" | "marketplace_5" | "none";
    caveat: string | null;
    /** HARD (Rule RATE-1): routing signal only. Never rendered to a patient. */
    internalOnly: true;
  };
  amenities: {
    onSitePharmacy: Tri;
    pharmacyName: string | null;
    parking: Tri;
    parking24h: Tri;
    wheelchairAccess: Tri;
    /** What the Tri is actually based on — Rule ACC-1. */
    accessEvidence: string | null;
  };
}

// ── Routing (§5.1) ──────────────────────────────────────────────────────────

export type NeedKey =
  | "derm_laser"
  | "dental_ortho"
  | "endodontics"
  | "accredited_care"
  | "day_case_surgery"
  | "employment_medical"
  | "app_booking"
  | "after_hours_er"
  | "neurology"
  | "onsite_pharmacy"
  | "south_riyadh"
  | "orthodontics_shifa"
  | "east_riyadh"
  | "paediatrics"
  | "obgyn"
  | "ent"
  | "urgent_tonight"
  | "general_practice"
  | "internal_medicine";

export interface SiteStrength {
  siteId: SiteId;
  need: NeedKey;
  /** 1 = the group's own emphasis, 3 = geographic fallback. */
  rank: 1 | 2 | 3;
  basis:
    | "group_marketing"
    | "accreditation"
    | "geography"
    | "hours"
    | "named_capability";
  /** ONE LINE, said to the patient. */
  reasonAr: string;
  reasonEn: string;
  /** REQUIRED — Rule STR-1. A strength with no citation cannot be authored. */
  dossierRef: string;
  gated?: "requires_status_confirmation" | "requires_hours_confirmation";
}

export interface BranchRecommendation {
  siteId: SiteId;
  /** ONE LINE, always present. Rule STR-2: capability, never comparison. */
  reasonAr: string;
  reasonEn: string;
  basis: SiteStrength["basis"];
  rank: 1 | 2 | 3;
  dossierRef: string;
  gated: SiteStrength["gated"] | null;
  /** Rule C4-2 — a contested site is NEVER the only option offered. */
  mustNameAlternate: boolean;
  alternates: SiteId[];
  /** Rule PHONE-1: primary / unified / whatsapp only, never a fax. */
  phone: string;
  /** §4.6 — a gated site yields a callback request, never a slot. */
  appointmentKind: AppointmentKind;
  /** Rule STR-3 — set when the primary was displaced, with the reason why. */
  fallbackFromSiteId?: SiteId;
  fallbackReasonAr?: string;
  /**
   * SPEC-2 §6.2's geography fork. The branch in the district the patient named —
   * REPORTED, never substituted for the clinical answer, and null when they
   * named no district or named one we have no branch in.
   */
  nearestSiteId: SiteId | null;
  /**
   * WHETHER THE NEAREST BRANCH CAN ACTUALLY DO THIS. The fork copy said «بس
   * أصارحك: كشف الجلدية نسويه في الروابي» to a patient in Al Wurud — and Shoaa Al
   * Wurud carries an AUTHORED derm_laser strength (§3.5 L194), so the sentence was
   * false. Same for a general checkup: the same message said Al Wurud runs family
   * medicine and then that general checkups are done at Ar Rawabi, in consecutive
   * lines. `nearestSiteId !== siteId` was being read as "the nearest one cannot",
   * when all it means is "the nearest one is not the chain head". This is the
   * distinction the copy actually needs: it is true exactly when the nearest site
   * carries a strength for this need.
   */
  nearestServesNeed: boolean;
  /** That strength's own line, so the caller never has to invent one. */
  nearestStrengthAr: string | null;
  nearestStrengthEn: string | null;
  /** The EVIDENCE behind that strength. `named_capability` means the dossier records
   *  the clinic at that site; `group_marketing` means the group advertises the
   *  service there without naming the clinic. The copy must not treat the two the
   *  same — the first is "book here", the second is "they advertise it, the focus is
   *  at the other branch". */
  nearestStrengthBasis: SiteStrength["basis"] | null;
  nearestReasonAr: string | null;
  /**
   * MED-2 — for an urgent/tonight need the red-flag rail outranks this answer
   * entirely. The flag is here so a caller cannot claim it did not know.
   */
  safetyRailOutranks: boolean;
}

// ── Specialties and clinicians (§6) ─────────────────────────────────────────

export type SpecialtyKey =
  | "general_family"
  | "internal_medicine"
  | "paediatrics"
  | "obgyn"
  | "ent"
  | "ophthalmology"
  | "dermatology"
  | "laser_aesthetics"
  | "dentistry"
  | "orthodontics"
  | "endodontics"
  | "orthopaedics"
  | "neurology"
  | "urology"
  | "general_surgery"
  | "emergency"
  | "lab_radiology"
  | "employment_medicals";

export type SpecialtyEvidence = "named_at_site" | "group_only" | "inferred" | "absent";

export interface SiteSpecialty {
  siteId: SiteId;
  specialty: SpecialtyKey;
  evidence: SpecialtyEvidence;
  dossierRef: string | null;
  /** DERIVED: only `named_at_site` + bookable clinic hours is bookable. */
  bookable?: never;
}

export interface Clinician {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Patients frequently request a female clinician — first-class (Rule DOC-1). */
  gender: "female" | "male";
  specialty: SpecialtyKey;
  subSpecialties: SpecialtyKey[];
  languages: Array<"ar" | "en" | "ur" | "fr">;
  siteIds: SiteId[];
  seniority: "consultant" | "specialist" | "general_practitioner";
  /** Literal type. A false value does not compile (§14 criterion 13). */
  fictional: true;
}

// ── Catalogue and money (§9.2) ──────────────────────────────────────────────

export type PriceBasis =
  | "demo_invented_anchored"
  | "demo_invented_unanchored"
  | "client_confirmed";

interface ServicePriceCore {
  amountSar: number;
  /** What the anchor was, if any. */
  anchorNote: string | null;
  /** §9.5 — we have no VAT ruling, so we state none. [OPEN-06] */
  vatNote: "excluded_unknown";
}

/**
 * The same H6 shape as DayHours: `client_confirmed` requires the named
 * attribution and drops the demo label; every other basis carries the label as
 * a LITERAL true, so it cannot be forgotten (§14 criterion 29).
 */
export type ServicePrice =
  | (ServicePriceCore & {
      basis: "demo_invented_anchored" | "demo_invented_unanchored";
      requiresDemoLabel: true;
      clientConfirmation?: never;
    })
  | (ServicePriceCore & {
      basis: "client_confirmed";
      requiresDemoLabel: false;
      clientConfirmation: ClientConfirmation;
    });

export interface CatalogueService {
  id: string;
  nameAr: string;
  nameEn: string;
  specialty: SpecialtyKey;
  /** Minutes. [DEMO-02] */
  durationMinutes: number;
  /** Minutes. Blocks the resource, is never offered, is never billed (BUF-1). */
  bufferMinutes: number;
  /**
   * ABSENT where the dossier gives us nothing and §9.4 forbids inventing one
   * (lab/radiology, ER, day-case surgery, a dental extraction). priceFor()
   * throws rather than guessing — the order-pricing.ts posture exactly.
   */
  price?: ServicePrice;
  /** Quotable but not directly bookable (a treatment plan, a take-home kit). */
  priceOnly?: boolean;
  /** Laser sessions consume a device (§7.4). */
  resourceKind?: ResourceKind;
  /** Terms Faysal must state whenever it quotes this line (§9.3 packages). */
  termsAr?: string;
}

export interface PriceAnswer {
  amount: number;
  currency: "SAR";
  basis: PriceBasis;
  /**
   * Rule PRICE-1 — the frozen label, emitted by the calculator's renderer and
   * never composed by the model. `null` ONLY when basis is client_confirmed.
   */
  demoLabel: string | null;
  serviceId: string;
  siteId: SiteId;
  /** The full line as it may be spoken, label already appended. */
  renderedAr: string;
  /** Terms that must be stated with this figure (packages). */
  termsAr: string | null;
  vatNote: "excluded_unknown";
}

// ── Insurance (§10) ─────────────────────────────────────────────────────────

export type PayerKind = "insurer" | "tpa_discount_card" | "directory_source";

export type NetworkClass = "A" | "B" | "C" | "MPN" | "OCN" | "OHN" | "unknown";

export interface Payer {
  id: string;
  nameEn: string;
  nameAr: string;
  kind: PayerKind;
  siteEvidence: Array<{ siteId: SiteId | "group"; dossierRef: string; note: string }>;
  /** DERIVED and always false in Wave 1 — Rule INS-1. */
  acceptanceConfirmed?: never;
}

export interface InsuranceAnswer {
  /**
   * TRI-STATE, and it means LISTED — never COVERED. "yes" says the building
   * appears on that payer's network evidence. Rule INS-1 forbids any coverage
   * claim, so `listedNotCovered` is a literal true you cannot switch off.
   */
  accepted: Tri;
  listedNotCovered: true;
  /** Always false in Wave 1: we were told to verify it on the card (§10.3). */
  classKnown: boolean;
  networkClass: NetworkClass;
  payerKind: PayerKind | null;
  /** The sentence Faysal is allowed to say. Renderer-emitted (INS-1 shapes). */
  sentenceAr: string;
  /** Rule INS-5 — insurance never gates the booking. */
  blocksBooking: false;
}

// ── Slots, holds, appointments (§7) ─────────────────────────────────────────

export type AppointmentKind = "slot" | "callback_request";

export type SlotState =
  | "offered"
  | "held"
  | "confirmed"
  | "expired"
  | "cancelled"
  | "checked_in"
  | "no_show";

export type ResourceKind = "room" | "device" | "chair";

export interface Resource {
  id: string;
  siteId: SiteId;
  kind: ResourceKind;
  capacity: number;
}

/**
 * A bookable window, as returned by bookableWindows(). It is a TimeWindow plus
 * the provenance that authorised it — Rule S-1: the qualifier travels with the
 * value or it gets separated from it and lies.
 */
export interface Window extends TimeWindow {
  siteId: SiteId;
  dateISO: string;
  dayKey: DayKey;
  /** ALWAYS "clinic". H4: no other layer can authorise a slot. */
  layer: "clinic";
  /** The confidence AFTER Rule HRS-FRESH decay, not as authored. */
  confidence: Confidence;
  /** True when this window exists only because DEMO_MODE is on (HRS-DEMO). */
  demoSeeded: boolean;
  /** Rule C4-1 — set for `operational_contested` sites. */
  pendingBranchConfirmation: boolean;
  /** Rule FRI-1 — every Friday answer carries the branch phone. */
  isFriday: boolean;
  branchPhone: string;
}

export interface Slot {
  /** Deterministic and self-describing: site|clinician|service|date|start. */
  slotId: string;
  siteId: SiteId;
  clinicianId: string;
  serviceId: string;
  dateISO: string;
  dayKey: DayKey;
  /** "HH:MM" local. */
  start: string;
  /** "HH:MM" — start + duration. What the patient is told. */
  end: string;
  /** "HH:MM" — start + duration + buffer. What the resource is blocked for. */
  blockEnd: string;
  durationMinutes: number;
  bufferMinutes: number;
  state: SlotState;
  demoSeeded: boolean;
  pendingBranchConfirmation: boolean;
  /** Rule FRI-1 — a Friday offer always ships with the branch number. */
  isFriday: boolean;
  branchPhone: string;
}

export interface SlotQuery {
  serviceId: string;
  siteId?: SiteId;
  siteIds?: SiteId[];
  clinicianId?: string;
  /** Single day. Omit to sweep dateFromISO..dateToISO. */
  dateISO?: string;
  dateFromISO?: string;
  dateToISO?: string;
  gender?: "female" | "male";
  language?: "ar" | "en" | "ur" | "fr";
  /** Defaults to FAYSAL_MAX_SLOTS_PER_REPLY (3) — Rule SLOT-1. */
  limit?: number;
  /** ISO instant. Supplied → the call is PURE. Omitted → the clock is read. */
  now?: string;
  /** Overrides the DEMO_MODE environment read. Tests always pass it. */
  demoMode?: boolean;
}

export interface PatientRef {
  /** WhatsApp number — the patient identity for HOLD-2. */
  waNumber: string;
  displayName: string;
}

export interface Hold {
  holdId: string;
  slotId: string;
  patient: PatientRef;
  createdAt: string;
  /** ISO. TTL 10 minutes (FAYSAL_HOLD_TTL_MS). */
  expiresAt: string;
  state: "active" | "released" | "confirmed" | "expired";
  /** FAM-6 — a family block is ONE hold covering all legs. */
  slotIds: string[];
}

export interface Appointment {
  appointmentId: string;
  /** The patient-facing reference used by cancelBooking(). */
  ref: string;
  kind: AppointmentKind;
  state: SlotState;
  siteId: SiteId;
  clinicianId: string | null;
  serviceId: string;
  /** null for a callback_request — §4.6 never renders a time (criterion 10). */
  dateISO: string | null;
  start: string | null;
  end: string | null;
  /** What the PATIENT asked for, in their words. Callback requests only. */
  preferredWindowAr: string | null;
  patient: PatientRef;
  /** Rule C4-1 / HOLD-6. */
  pendingBranchConfirmation: boolean;
  branchPhone: string;
  createdAt: string;
  /** POL-04 — two markers, because they are read by different things. */
  source: "faysal_demo";
  isTest: true;
  /** True while any of this booking's data carries a demo basis (DEMO-1c). */
  demoSeeded: boolean;
  slotIds: string[];
}
