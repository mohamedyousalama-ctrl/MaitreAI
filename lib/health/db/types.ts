// ============================================================================
// فيصل / Faysal — data-layer types for the `health_*` schema (migration 0123).
//
// These are ROW types and JSONB DOCUMENT types. They describe what is stored,
// not what it means: `bookableWindows()`, routing, pricing and every safety
// rule live in the domain layer (`lib/health/*`), which owns the reasoning.
// This file owns the shape.
//
// Two things here are deliberately awkward, and both are load-bearing:
//
//   1. `Confidence` has SEVEN values, not two. `unknown` means the dossier is
//      silent; `conflicted` means two sources disagree and nothing resolved
//      them; `demo_seeded` means we invented it for the demo and said so.
//      Collapsing any of them into a boolean is how a booking agent sends a
//      patient to a locked door (SPEC-1 §2, §4.1, §4.10).
//
//   2. `Tri` exists so amenities can be `"unknown"`. A boolean forces unknown
//      to become false, and `wheelchairAccess: false` at a site where we simply
//      have no data is a lie that a wheelchair user acts on (SPEC-1 §2).
//
// Fields the specification marks DERIVED (`bookable`, `acceptanceConfirmed`)
// are absent by design. A derived value that can be authored is a derived value
// that will be authored wrongly.
// ============================================================================

/** SPEC-1 §2. Riyadh is UTC+03:00, no DST. Pinned, never derived from a clock. */
export const CLINIC_TZ = "Asia/Riyadh";

export type SiteKey =
  | "wattan-1"
  | "wattan-2"
  | "wattan-3"
  | "wattan-4"
  | "shoaa-wurud"
  | "shoaa-rawdah";

export type Brand = "wattan" | "shoaa";

/** Tri-state everywhere a fact may simply be missing. NEVER a bare boolean. */
export type Tri = "yes" | "no" | "unknown";

/**
 * SPEC-1 §2 + §4.10. Ordered high to low for every purpose EXCEPT
 * `demo_seeded`, which is not a provenance rung at all: it sorts below
 * `unknown` and is accepted only under DEMO_MODE, at the one function that
 * mints slots.
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
  | "dossier_only";

export interface SourceRef {
  kind: SourceKind;
  note: string;
  /** REQUIRED. e.g. "§3.4 L171" — an auditor must be able to jump. */
  dossierRef: string;
  /** ISO date the underlying source was observed, per the dossier. */
  capturedAt: string;
}

export type PhoneKind = "primary" | "alt" | "fax" | "unified_920" | "whatsapp";

export interface Phone {
  e164OrNational: string;
  kind: PhoneKind;
  confidence: Confidence;
  source: SourceRef;
  /** True when the number is documented but must NOT be given to a patient. */
  suppressed: boolean;
  suppressionReason?: string;
}

/** SPEC-1 §4.10. The only way a record reaches `client_confirmed`. */
export interface ClientConfirmation {
  /** The NAMED person at the client. Never "ops", never "the client". */
  confirmedBy: string;
  role: string;
  channel: "phone" | "whatsapp" | "email" | "meeting";
  /** ISO datetime. This is the capturedAt for this record. */
  confirmedAt: string;
  /** What they actually said, in their words. */
  verbatim: string;
  /** Exactly what it covers: which site, which layer, which days. */
  scope: string;
}

// --- Hours (SPEC-1 §4.1) ----------------------------------------------------

export type DayKey = "sat" | "sun" | "mon" | "tue" | "wed" | "thu" | "fri";

/** The operating week starts Saturday. Friday is the compressed day. */
export const DAY_KEYS: readonly DayKey[] = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];

/**
 * A facility open 24 hours does not mean the orthodontist is at the chair at
 * 03:00. Layers are separate records and are NEVER substituted for one another
 * (Invariant H4). Only `clinic` can mint a slot.
 */
export type HoursLayer = "facility" | "er" | "clinic" | "pharmacy" | "phone";

export interface TimeWindow {
  /** "HH:MM", local, 24h. */
  open: string;
  /** "HH:MM"; "24:00" means end of THIS local day. */
  close: string;
  /** True when close < open; the tail belongs to the NEXT day. */
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

export interface DayHours {
  status: DayStatus;
  /** Empty unless status === "windows". */
  windows: TimeWindow[];
  confidence: Confidence;
  sources: SourceRef[];
  conflicts: HoursConflict[];
  capturedAt: string;
  clientConfirmation?: ClientConfirmation;
}

export interface LayerHours {
  layer: HoursLayer;
  week: Record<DayKey, DayHours>;
  /** Ramadan / Eid / national-day overrides. Empty in Wave 1 ([OPEN-04]). */
  overrides: DateOverride[];
}

export interface DateOverride {
  dateISO: string;
  reason: string;
  day: DayHours;
}

export interface SiteHours {
  siteKey: SiteKey;
  timezone: typeof CLINIC_TZ;
  layers: LayerHours[];
  /** Rule HRS-FRESH. Hours records rot. */
  staleAfterDays: number;
}

// --- Operating status (SPEC-1 §3.4.1) ---------------------------------------

export type OperatingState = "operational" | "operational_contested" | "closed" | "unknown";

export interface OperatingEvidence {
  since?: string;
  evidenceFor: Array<{ date: string; source: string; says: string; dossierRef: string }>;
  evidenceAgainst: Array<{ date: string; source: string; says: string; dossierRef: string }>;
  /** The dossier's own guidance, quoted. We do not paraphrase it away. */
  dossierGuidance?: string;
  /** Group history the site record cannot otherwise carry (joined, renovated). */
  history?: Array<{ year: string; note: string; dossierRef: string }>;
}

// --- Rating (SPEC-1 §2, Rule RATE-1) ----------------------------------------

export interface SiteRating {
  value: number | null;
  reviewCountMin: number | null;
  reviewCountMax: number | null;
  scale: "google_5" | "aggregator_5" | "marketplace_5" | "none";
  caveat: string | null;
  confidence: Confidence;
  /** HARD: routing signal only. Never rendered to a patient. */
  internalOnly: true;
}

export interface SiteAmenities {
  onSitePharmacy: Tri;
  pharmacyName: string | null;
  parking: Tri;
  parking24h: Tri;
  wheelchairAccess: Tri;
  /** What the Tri is actually based on. Matters — see Rule ACC-1. */
  accessEvidence: string | null;
  pharmacyEvidence?: string | null;
}

// --- Rows -------------------------------------------------------------------

export interface HealthClinicRow {
  id: string;
  name: string;
  name_ar: string;
  brand: string;
  district: string | null;
  phone: string | null;
  unified_phone: string | null;
  timezone: string;
  country: string;
  dialect: string;
  hours: Record<string, unknown>;
  cchi_code: string | null;
  agent_mode: "setup" | "test" | "live";
  feature_flags: Record<string, unknown>;
  wa_phone_number_id: string | null;
  wa_verify_token: string | null;
  wa_access_token_enc: string | null;
  demo_mode: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HealthMemberRow {
  id: string;
  clinic_id: string;
  user_id: string;
  role: "manager" | "operation";
  created_at: string;
}

export interface HealthSiteRow {
  id: string;
  clinic_id: string;
  site_key: SiteKey;
  brand: Brand;
  name_ar: string;
  name_en: string;
  aka_ar: string[];
  aka_en: string[];
  maps_category: "Hospital" | "Medical Center" | "Polyclinic" | "unknown";
  district_ar: string;
  district_en: string;
  address_en: string;
  /** null where the dossier gives no Arabic form. Never back-filled. */
  address_ar: string | null;
  postal_code: string | null;
  landmarks: string[];
  plus_code: string | null;
  phones: Phone[];
  established_year: number | null;
  established_kind: "established" | "acquired" | "joined_group" | null;
  operating_state: OperatingState;
  operating_evidence: OperatingEvidence;
  requires_live_confirmation: boolean;
  insurance_facility_code: string | null;
  insurance_code_kind: "cchi_style_network_code" | "legacy_map_id" | null;
  insurance_code_confidence: Confidence;
  insurance_code_source: SourceRef | null;
  accreditation_cbahi: "accredited" | "not_accredited_claimed_in_progress" | "unknown";
  accreditation_date: string | null;
  accreditation_source: SourceRef | null;
  rating: SiteRating;
  amenities: SiteAmenities;
  hours: SiteHours;
  timezone: string;
  stale_after_days: number;
  client_confirmed_stale_after_days: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HealthSpecialtyRow {
  id: string;
  clinic_id: string;
  specialty_key: string;
  name_ar: string;
  name_en: string;
  sort: number;
  created_at: string;
}

/** SPEC-1 §6.1. Only `named_at_site` is bookable (Rule SPEC-1). */
export type SpecialtyEvidence = "named_at_site" | "group_only" | "inferred" | "absent";

export interface HealthSiteSpecialtyRow {
  id: string;
  clinic_id: string;
  site_id: string;
  specialty_id: string;
  evidence: SpecialtyEvidence;
  dossier_ref: string | null;
  note: string | null;
  created_at: string;
}

export interface HealthDoctorRow {
  id: string;
  clinic_id: string;
  doctor_key: string;
  name_ar: string;
  name_en: string;
  gender: "female" | "male";
  specialty_id: string | null;
  sub_specialties: string[];
  languages: Array<"ar" | "en" | "ur" | "fr">;
  seniority: "consultant" | "specialist" | "general_practitioner";
  default_service_key: string | null;
  /** SPEC-1 §6.3. CHECKed true in the database. A false value does not insert. */
  fictional: true;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HealthDoctorSiteRow {
  id: string;
  clinic_id: string;
  doctor_id: string;
  site_id: string;
  created_at: string;
}

/** SPEC-1 §9.2. Nothing carries `client_confirmed` in Wave 1 — that is the point. */
export type PriceBasis = "demo_invented_anchored" | "demo_invented_unanchored" | "client_confirmed";

export interface HealthServiceRow {
  id: string;
  clinic_id: string;
  service_key: string;
  name_ar: string;
  name_en: string;
  category: string;
  specialty_id: string | null;
  amount_sar: number;
  price_basis: PriceBasis;
  anchor_note: string | null;
  /** Marker 2 (message layer). True for every invented price, by CHECK. */
  requires_demo_label: boolean;
  vat_note: "excluded_unknown";
  duration_minutes: number;
  /** Rule BUF-1: blocks the resource, is never offered, is never billed. */
  buffer_minutes: number;
  package_sessions: number | null;
  base_service_id: string | null;
  client_confirmation: ClientConfirmation | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HealthPayerRow {
  id: string;
  clinic_id: string;
  payer_key: string;
  name_en: string;
  name_ar: string;
  /** A discount card is NOT insurance. The distinction is load-bearing. */
  kind: "insurer" | "tpa_discount_card" | "directory_source";
  site_evidence: Array<{ siteKey: SiteKey; dossierRef: string; note: string }>;
  network_class: "A" | "B" | "C" | "MPN" | "OCN" | "OHN" | "unknown";
  /** Rule INS-1: pinned false in the database. Faysal never promises coverage. */
  acceptance_confirmed: false;
  created_at: string;
}

export interface HealthResourceRow {
  id: string;
  clinic_id: string;
  site_id: string;
  resource_key: string;
  kind: "room" | "device" | "chair";
  capacity: number;
  service_keys: string[];
  created_at: string;
}

/** SPEC-1 §7.1. `offered` is inventory shown but NOT reserved — it costs nothing. */
export type SlotState =
  | "offered"
  | "held"
  | "confirmed"
  | "expired"
  | "cancelled"
  | "checked_in"
  | "no_show";

export interface HealthSlotRow {
  id: string;
  clinic_id: string;
  site_id: string;
  doctor_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  /** start + duration + buffer. What the resource is blocked for (Rule BUF-1). */
  blocked_until: string;
  duration_minutes: number;
  buffer_minutes: number;
  local_date: string;
  local_start_minute: number;
  day_key: DayKey;
  state: SlotState;
  hold_id: string | null;
  held_until: string | null;
  /** The confidence of the clinic-layer window that minted this slot. */
  window_confidence: Confidence;
  generator: string;
  seed_salt: string;
  source: string;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export type HoldState = "active" | "confirmed" | "released" | "expired";

export interface HealthHoldRow {
  id: string;
  clinic_id: string;
  hold_token: string;
  patient_ref: string;
  family_group_id: string | null;
  state: HoldState;
  expires_at: string;
  released_at: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export type AppointmentKind = "slot" | "callback_request";
export type AppointmentState = "requested" | "confirmed" | "cancelled" | "checked_in" | "no_show";

export interface HealthAppointmentRow {
  id: string;
  clinic_id: string;
  site_id: string;
  doctor_id: string | null;
  service_id: string | null;
  slot_id: string | null;
  kind: AppointmentKind;
  state: AppointmentState;
  patient_name: string | null;
  patient_ref: string;
  preferred_window: string | null;
  note: string | null;
  starts_at: string | null;
  ends_at: string | null;
  /** Rule C4-1: never a bare "confirmed" at a contested site. */
  pending_branch_confirmation: boolean;
  hold_token: string | null;
  family_group_id: string | null;
  consent: Record<string, unknown>;
  source: string;
  is_test: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthConversationRow {
  id: string;
  clinic_id: string;
  site_id: string | null;
  channel: "whatsapp" | "web" | "demo" | "voice";
  patient_ref: string;
  display_name: string | null;
  locale: string;
  state: "open" | "closed";
  owner: "AI" | "HUMAN";
  safety: Record<string, unknown>;
  consent: Record<string, unknown>;
  last_message_at: string | null;
  source: string;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export interface HealthMessageRow {
  id: string;
  clinic_id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender: "patient" | "agent" | "staff" | "system";
  body: string;
  wa_message_id: string | null;
  status: "sending" | "sent" | "delivered" | "read" | "failed" | null;
  meta: Record<string, unknown>;
  created_at: string;
}

/** Every table this layer touches. Nothing outside `health_*` belongs here. */
export const HEALTH_TABLES = {
  clinics: "health_clinics",
  members: "health_members",
  sites: "health_sites",
  specialties: "health_specialties",
  siteSpecialties: "health_site_specialties",
  doctors: "health_doctors",
  doctorSites: "health_doctor_sites",
  services: "health_services",
  payers: "health_payers",
  resources: "health_resources",
  holds: "health_holds",
  slots: "health_slots",
  appointments: "health_appointments",
  conversations: "health_conversations",
  messages: "health_messages",
} as const;

export type HealthTableName = (typeof HEALTH_TABLES)[keyof typeof HEALTH_TABLES];
