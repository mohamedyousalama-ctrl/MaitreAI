// ============================================================================
// فيصل / Faysal — seed the Al Wattan Medical Group demo tenant.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ THE CLINICIANS IN THIS FILE DO NOT EXIST.                                │
// │                                                                          │
// │ Every name, gender, language set, site assignment and schedule below is  │
// │ INVENTED for demonstration purposes (SPEC-1 §6.3). None corresponds to   │
// │ any real person practising at Al Wattan Medical Group, Shoaa Medical     │
// │ Complex, or anywhere else. Any resemblance to a real clinician is        │
// │ unintended.                                                              │
// │                                                                          │
// │ The dossier names real, identifiable, licensed clinicians harvested from │
// │ public Google reviews and the group's own social pages. Wiring them into │
// │ a fake booking system would attach invented availability, invented       │
// │ languages and invented consultation fees to a real person's professional │
// │ name, and would put a patient in the position of choosing a real doctor  │
// │ on the strength of a fabricated schedule. Their appearance in public     │
// │ reviews makes them public; it does not make them ours to schedule.       │
// │                                                                          │
// │ scripts/proof-faysal-denylist.test.ts fails the build on any of them,    │
// │ matched on normalised full names via normalizeAr. It is registered in    │
// │ scripts/unit-suite.json — a prohibition that lives only in a review      │
// │ comment gets forgotten at 2am by someone adding a doctor.                │
// └──────────────────────────────────────────────────────────────────────────┘
//
// EVERY PRICE HERE IS INVENTED TOO (SPEC-1 §9.1). The dossier contains exactly
// two kinds of price information — a Tebcan marketplace range and TPA
// discount-card percentages — and disclaims both, in bold, in two separate
// sections. Rendering either as "Al Wattan's price" would be a false statement
// about the client's commercial terms, made by an agent wearing the client's
// brand, to the client's patients. So every row carries `price_basis` in the
// `demo_invented_*` family and `requires_demo_label = true`, and the database
// CHECKs that pairing so the marker cannot be dropped.
//
// WHAT IS *NOT* INVENTED: the six sites' addresses, phones, districts, plus
// codes, insurance facility codes, accreditation, established dates and
// published hours. Those are transcribed from the dossier with their dossier
// references attached, and — crucially — with their CONFIDENCE, their SOURCES
// and their CONFLICTS attached. Complex 3's Friday is `unknown` with a stored
// conflict record, not "closed". Complex 4 has no hours at all and a contested
// operating status. Neither is patched to look tidy; the honesty is the demo.
//
// Usage:
//   node --experimental-strip-types scripts/seed-faysal.ts            # write via REST
//   node --experimental-strip-types scripts/seed-faysal.ts --emit-sql --out=faysal.sql
//   node --experimental-strip-types scripts/seed-faysal.ts --from=2026-09-09
//
// Env (REST mode only): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// `--emit-sql` needs no credentials: it prints the exact statements a governed
// apply will run, which is how this seed reaches a database nobody hands a
// service key to.
//
// DETERMINISM. Every id is a UUIDv5 of a stable key, every slot comes from
// fnv1a32 + xorshift32 seeded on (site, clinician, date, pinned salt), and the
// occupancy curve is a fixed table. Re-running with the same `--from` produces
// byte-identical rows, so the salesperson's screen and the client's phone show
// the same day — and so a demo can be rehearsed.
//
// APPLIED to project zlighrbsjexrozrmuwpw on 2026-09-09 with `--from=2026-09-09`
// (migration 0123 first). Row counts after that run, verified in the database:
//   clinics 1 · sites 6 · specialties 20 · site_specialties 120 · doctors 30 ·
//   doctor_sites 32 · services 36 · payers 16 · resources 1 · slots 4004
// `health_members` is EMPTY on purpose — see `--owner-email` at the bottom of
// this file. The bookable 4,004 slots sit at exactly the three Rule HRS-DEMO
// sites; Al Yamamah, Ar Rabwah and Ash Shifa have none, which is the point.
//
// Those counts are the record of THAT run and are left standing. The roster has
// since grown to the 47 people `lib/health/clinicians.ts` answers patients from,
// so the seeded tenant is one apply behind this file; re-running it with the same
// `--from` is what closes the gap.
// ============================================================================

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Confidence,
  DayHours,
  DayKey,
  HoursConflict,
  HoursLayer,
  LayerHours,
  Phone,
  SiteAmenities,
  SiteHours,
  SiteKey,
  SiteRating,
  SourceRef,
  SpecialtyEvidence,
  TimeWindow,
} from "../lib/health/db/types";

// ---------------------------------------------------------------------------
// Pinned constants (SPEC-1 §7.2). None of these is ever read from a request:
// a caller-supplied salt is a caller-supplied schedule.
// ---------------------------------------------------------------------------

const FAYSAL_SLOT_SALT = "faysal-wattan-2026-wave1";
const FAYSAL_BOOKING_HORIZON_DAYS = 14;
const FAYSAL_SLOT_GRID_MINUTES = 15;
const SLOT_GENERATOR = "faysal-slotgen-v1";
const CLINIC_TZ_OFFSET = "+03:00"; // Riyadh, UTC+03:00, no DST. Pinned. [INF-03]

/** Stable UUID namespace for everything this seed writes. */
const FAYSAL_NAMESPACE = "fa75a1ed-0000-4000-8000-000000000001";

const DAY_KEYS: DayKey[] = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
/** JS getUTCDay(): 0=Sun … 6=Sat. */
const DOW_TO_DAY_KEY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ---------------------------------------------------------------------------
// Deterministic ids. UUIDv5 (SHA-1, RFC 4122) over a fixed namespace, so an id
// is a pure function of its key and re-seeding is an upsert, never a duplicate.
// ---------------------------------------------------------------------------

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function uuid5(name: string): string {
  const hash = createHash("sha1").update(uuidBytes(FAYSAL_NAMESPACE)).update(Buffer.from(name, "utf8")).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const CLINIC_ID = uuid5("clinic:al-wattan-medical-group");
const siteId = (key: string) => uuid5(`site:${key}`);
const specialtyId = (key: string) => uuid5(`specialty:${key}`);
const doctorId = (key: string) => uuid5(`doctor:${key}`);
const serviceId = (key: string) => uuid5(`service:${key}`);
const payerId = (key: string) => uuid5(`payer:${key}`);
const resourceId = (key: string) => uuid5(`resource:${key}`);

// ---------------------------------------------------------------------------
// Hours helpers. `crossesMidnight` is DERIVED from the window, never authored:
// close < open means the tail belongs to the next day (SPEC-1 §4.8), and
// "24:00" means end of THIS local day, which sorts after every real time.
// ---------------------------------------------------------------------------

function src(kind: SourceRef["kind"], note: string, dossierRef: string, capturedAt: string): SourceRef {
  return { kind, note, dossierRef, capturedAt };
}

function win(open: string, close: string): TimeWindow {
  return { open, close, crossesMidnight: close !== "24:00" && close < open };
}

function day(
  status: DayHours["status"],
  windows: TimeWindow[],
  confidence: Confidence,
  sources: SourceRef[],
  capturedAt: string,
  conflicts: HoursConflict[] = [],
): DayHours {
  return { status, windows, confidence, sources, conflicts, capturedAt };
}

const UNKNOWN_DAY = (): DayHours => day("unknown", [], "unknown", [], "n/a — the dossier is silent");

function week(base: DayHours, overrides: Partial<Record<DayKey, DayHours>> = {}): Record<DayKey, DayHours> {
  const out = {} as Record<DayKey, DayHours>;
  for (const k of DAY_KEYS) out[k] = overrides[k] ?? base;
  return out;
}

function layer(name: HoursLayer, weekDays: Record<DayKey, DayHours>): LayerHours {
  // DateOverride[] is EMPTY in Wave 1 and that is deliberate: Rule HRS-SEASON
  // makes the Ramadan/Eid guard exist before the data does, in the domain layer.
  return { layer: name, week: weekDays, overrides: [] };
}

function unknownLayer(name: HoursLayer): LayerHours {
  return layer(name, week(UNKNOWN_DAY()));
}

/**
 * Rule HRS-DEMO. The clinic layer at exactly THREE sites — Ar Rawabi, Shoaa Al
 * Wurud and Shoaa Ar Rawdah — is invented so the demo has inventory, stamped
 * `demo_seeded`, accepted by bookableWindows() only under DEMO_MODE, and
 * disclosed in conversation once by Rule DEMO-1. Al Yamamah and Ash Shifa stay
 * on the callback path deliberately: they are the honesty scene, and two of
 * them is a differentiator where six would be a product defect.
 *
 * The invented sessions sit INSIDE each site's own published facility hours, so
 * the demo never implies a clinic running while the building is shut. It is
 * still an invention, and it is labelled as one.
 */
const DEMO_SEEDED_SOURCE = src(
  "dossier_only",
  "NOT OBSERVED — invented for the demo under Rule HRS-DEMO and disclosed by Rule DEMO-1.",
  "§4.10 Rule HRS-DEMO",
  "n/a — never captured",
);

function demoClinicLayer(fridayOpen: string): LayerHours {
  const weekday = day(
    "windows",
    [win("09:00", "13:00"), win("16:00", "21:00")],
    "demo_seeded",
    [DEMO_SEEDED_SOURCE],
    "n/a — never captured",
  );
  const friday = day(
    "windows",
    [win(fridayOpen, "21:00")],
    "demo_seeded",
    [DEMO_SEEDED_SOURCE],
    "n/a — never captured",
  );
  return layer("clinic", week(weekday, { fri: friday }));
}

function siteHours(key: SiteKey, layers: LayerHours[]): SiteHours {
  return { siteKey: key, timezone: "Asia/Riyadh", layers, staleAfterDays: 30 };
}

// ---------------------------------------------------------------------------
// The six sites — SPEC-1 §3, transcribed with sources, and §4, transcribed with
// confidences and conflicts.
// ---------------------------------------------------------------------------

interface SiteSeed {
  site_key: SiteKey;
  brand: "wattan" | "shoaa";
  name_ar: string;
  name_en: string;
  aka_ar: string[];
  aka_en: string[];
  maps_category: "Hospital" | "Medical Center" | "Polyclinic" | "unknown";
  district_ar: string;
  district_en: string;
  address_en: string;
  address_ar: string | null;
  postal_code: string | null;
  landmarks: string[];
  plus_code: string | null;
  phones: Phone[];
  established_year: number | null;
  established_kind: "established" | "acquired" | "joined_group" | null;
  operating_state: "operational" | "operational_contested" | "closed" | "unknown";
  operating_evidence: Record<string, unknown>;
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
}

const GOOGLE_2026 = "2026-09-09"; // the dossier's own date [D L322]

const SITES: SiteSeed[] = [
  {
    site_key: "wattan-1",
    brand: "wattan",
    name_ar: "مجمع الوطن الطبي 1",
    name_en: "Al Wattan Medical Complex 1",
    aka_ar: ["مستوصف الوطن عتيقة"],
    aka_en: ["Al Watan Polyclinic"],
    maps_category: "Hospital",
    district_ar: "اليمامة",
    district_en: "Al Yamamah",
    address_en: "2807 Prince Mohammed bin Abdulrahman Road, Al Yamamah, Riyadh 12671",
    address_ar: "2807 طريق الأمير محمد بن عبدالرحمن، اليمامة، الرياض 12671",
    postal_code: "12671",
    landmarks: [
      "East of Atika market, Manfuha — حي عتيقة",
      "The road is locally «شارع الستين / Street 60»",
    ],
    plus_code: "JP46+5C Al Yamamah, Riyadh",
    phones: [
      {
        e164OrNational: "0114588444",
        kind: "primary",
        confidence: "high",
        suppressed: false,
        source: src("official_site", "Primary switchboard, ext. 250", "§3.1 L104-107", GOOGLE_2026),
      },
      {
        e164OrNational: "0114581913",
        kind: "fax",
        confidence: "medium",
        suppressed: true,
        suppressionReason:
          "Listed as alternate/fax — Rule PHONE-1 (never read a fax to a patient).",
        source: src("directory", "Listed as alternate / fax", "§3.1 L104-107", GOOGLE_2026),
      },
      {
        e164OrNational: "920009303",
        kind: "unified_920",
        confidence: "high",
        suppressed: false,
        source: src("official_site", "Unified 920 number", "§3.1 L104-107", GOOGLE_2026),
      },
      {
        e164OrNational: "0504490460",
        kind: "whatsapp",
        confidence: "high",
        suppressed: false,
        source: src("official_social", "WhatsApp line published for pre-visit confirmation", "§3.1 L104-107", GOOGLE_2026),
      },
    ],
    established_year: 1982,
    established_kind: "established",
    operating_state: "operational",
    operating_evidence: {
      evidenceFor: [
        { date: "2026", source: "dossier, passim", says: "Operating; oldest site in the group", dossierRef: "§3.1 passim" },
      ],
      evidenceAgainst: [],
      history: [{ year: "1982", note: "Oldest site in the group", dossierRef: "§3.1 L102-103, §2 L85-86" }],
    },
    requires_live_confirmation: false,
    insurance_facility_code: "18002",
    insurance_code_kind: "cchi_style_network_code",
    insurance_code_confidence: "medium",
    insurance_code_source: src(
      "insurer_pdf",
      "CCHI-STYLE id in insurer PDFs (MPN/OCN lists). Rule INS-3: an internal key, never read to a patient.",
      "§3.1 L120-121, §2 L84",
      GOOGLE_2026,
    ),
    accreditation_cbahi: "not_accredited_claimed_in_progress",
    accreditation_date: null,
    accreditation_source: src("official_site", "Group claims CBAHI work in progress group-wide", "§2 L84", GOOGLE_2026),
    rating: {
      value: 3.1,
      reviewCountMin: 1447,
      reviewCountMax: 1499,
      scale: "google_5",
      caveat:
        "The dossier gives a RANGE because listing snapshots differ; min and max are stored rather than averaged into a false precision.",
      confidence: "medium",
      internalOnly: true,
    },
    amenities: {
      onSitePharmacy: "yes",
      pharmacyName: "صيدلية الديار 1 / Diyar Pharmacy 1",
      parking: "yes",
      parking24h: "yes",
      wheelchairAccess: "yes",
      accessEvidence:
        "A Google Maps wheelchair icon — ENTRANCE access only by convention. Says nothing about lifts, treatment rooms or restrooms (Rule ACC-1, [INF-02]).",
      pharmacyEvidence: "Named on-site pharmacy [D §3.1 L118-119]",
    },
    hours: siteHours("wattan-1", [
      layer(
        "facility",
        week(
          day("open_24h", [], "high", [src("google_maps", "Sun–Thu and Sat listed open 24 hours; on-call doctor advertised", "§3.1 L112-113", GOOGLE_2026)], GOOGLE_2026),
          {
            fri: day(
              "windows",
              [win("13:00", "24:00")],
              "conflicted",
              [src("google_maps", "Friday commonly listed 13:00–24:00", "§3.1 L113", GOOGLE_2026)],
              GOOGLE_2026,
              [
                {
                  claimA: "Friday 13:00–24:00 (commonly listed)",
                  claimB: "Friday 13:00–07:00 next day (some sources)",
                  dossierRefA: "§3.1 L113",
                  dossierRefB: "§3.1 L113",
                  resolution: "unresolved",
                  agentBehaviour:
                    "Describe only the INTERSECTION (13:00–24:00), which is the narrower claim both sources support; mint no slot; give 011 458 8444 and offer to confirm (Rule FRI-1, [POL-01]).",
                },
              ],
            ),
          },
        ),
      ),
      // Invariant H4 in one record: the building is marketed 24 hours and the
      // outpatient clinics run two shifts. `low` mints nothing, so Complex 1
      // has NO bookable outpatient slots in Wave 1 despite being the group's
      // busiest site. That is uncomfortable and it is correct — the alternative
      // is inventing a clinic timetable for the group's flagship building.
      layer(
        "clinic",
        week(
          day(
            "windows",
            [win("09:00", "12:00"), win("16:00", "21:30")],
            "low",
            [src("directory", "Arabic guide — the dossier calls this the older 'clinic shift' pattern", "§3.1 L126", GOOGLE_2026)],
            GOOGLE_2026,
          ),
          {
            fri: day(
              "windows",
              [win("13:00", "24:00")],
              "low",
              [src("directory", "Arabic guide — Friday clinic from 13:00, duty doctor around the clock", "§3.1 L126", GOOGLE_2026)],
              GOOGLE_2026,
            ),
          },
        ),
      ),
      layer(
        "er",
        week(day("open_24h", [], "medium", [src("dossier_only", "ER services at one or more sites; duty doctor at Complex 1", "§2 L74-75, §3.1 L127", GOOGLE_2026)], GOOGLE_2026)),
      ),
      unknownLayer("pharmacy"),
      unknownLayer("phone"),
    ]),
  },

  {
    site_key: "wattan-2",
    brand: "wattan",
    name_ar: "مجمع الوطن الطبي 2",
    name_en: "Al Wattan Medical Complex 2",
    aka_ar: [],
    aka_en: [],
    maps_category: "Medical Center",
    district_ar: "الروابي",
    district_en: "Ar Rawabi",
    address_en: "7291 Unayzah Street (شارع عنيزة), Ar Rawabi, Riyadh 14216",
    address_ar: null, // the dossier gives no Arabic form. Never back-filled.
    postal_code: "14216",
    landmarks: ["Listing tagged «identifies as women-owned»"],
    plus_code: "MQRP+CR Ar Rawabi",
    phones: [
      {
        e164OrNational: "0114964455",
        kind: "primary",
        confidence: "high",
        suppressed: false,
        source: src("official_site", "Primary switchboard", "§3.2 L134-135", GOOGLE_2026),
      },
      {
        e164OrNational: "0114964439",
        kind: "fax",
        confidence: "medium",
        suppressed: true,
        suppressionReason: "Listed as alternate/fax (Rule PHONE-1).",
        source: src("directory", "Listed as alternate / fax", "§3.2 L134-135", GOOGLE_2026),
      },
    ],
    established_year: 1999,
    established_kind: "established",
    operating_state: "operational",
    operating_evidence: {
      evidenceFor: [
        { date: "2026", source: "official social", says: "Actively marketed (Instagram @alwattanmedical, Facebook)", dossierRef: "§3.2 L142-145" },
      ],
      evidenceAgainst: [],
      history: [{ year: "1999", note: "Established", dossierRef: "§3.2 L132-133, §2 L88" }],
    },
    requires_live_confirmation: false,
    insurance_facility_code: "18003",
    insurance_code_kind: "cchi_style_network_code",
    insurance_code_confidence: "medium",
    insurance_code_source: src("insurer_pdf", "CCHI-style id in insurer PDFs", "§3.2 L140-141, §2 L84", GOOGLE_2026),
    accreditation_cbahi: "not_accredited_claimed_in_progress",
    accreditation_date: null,
    accreditation_source: src("official_site", "Group claims CBAHI work in progress group-wide", "§2 L84", GOOGLE_2026),
    rating: {
      value: 3.4,
      reviewCountMin: 1056,
      reviewCountMax: 1056,
      scale: "google_5",
      caveat: "Approximate count as listed.",
      confidence: "medium",
      internalOnly: true,
    },
    amenities: {
      onSitePharmacy: "unknown",
      pharmacyName: null,
      parking: "unknown",
      parking24h: "unknown",
      wheelchairAccess: "unknown",
      accessEvidence: null,
    },
    hours: siteHours("wattan-2", [
      layer(
        "facility",
        week(
          day("open_24h", [], "medium", [src("directory", "Mostly listed as 24 hours", "§3.2 L138-139", GOOGLE_2026)], GOOGLE_2026),
          {
            fri: day(
              "windows",
              [win("16:00", "24:00")],
              "medium",
              [src("directory", "Friday 16:00–24:00, «often listed» — the dossier's own hedge", "§3.2 L139", GOOGLE_2026)],
              GOOGLE_2026,
            ),
          },
        ),
      ),
      // Rule HRS-DEMO site 1 of 3. Friday opens at 16:00 because that is when
      // this branch's own published Friday starts — H3 forbids inheriting a
      // Friday, so the invented clinic day is bounded by the branch's own.
      demoClinicLayer("16:00"),
      unknownLayer("er"),
      unknownLayer("pharmacy"),
      unknownLayer("phone"),
    ]),
  },

  {
    site_key: "wattan-3",
    brand: "wattan",
    name_ar: "مجمع الوطن الطبي 3",
    name_en: "Al Wattan Medical Complex 3",
    aka_ar: ["مجمع الوطن الطبي الثالث"],
    aka_en: ["Modern Medical Center"],
    maps_category: "Medical Center",
    district_ar: "الربوة",
    district_en: "Ar Rabwah",
    address_en: "Prince Mutaib bin Abdulaziz Road (طريق الأمير متعب بن عبدالعزيز), Ar Rabwah, Riyadh 12835",
    address_ar: null,
    postal_code: "12835",
    landmarks: [],
    plus_code: null,
    phones: [
      {
        e164OrNational: "0114918003",
        kind: "primary",
        confidence: "high",
        suppressed: false,
        source: src("official_site", "Primary switchboard", "§3.3 L153-154", GOOGLE_2026),
      },
      {
        e164OrNational: "0114974111",
        kind: "alt",
        confidence: "medium",
        suppressed: false,
        source: src("directory", "Alternate line", "§3.3 L153-154, §10 L303-305", GOOGLE_2026),
      },
      {
        e164OrNational: "0114974114",
        kind: "alt",
        confidence: "medium",
        suppressed: false,
        source: src("directory", "Alternate line", "§3.3 L153-154, §10 L303-305", GOOGLE_2026),
      },
      {
        e164OrNational: "0114933115",
        kind: "fax",
        confidence: "medium",
        suppressed: true,
        suppressionReason: "Fax (Rule PHONE-1).",
        source: src("directory", "Listed as fax", "§3.3 L153-154", GOOGLE_2026),
      },
    ],
    established_year: 2022,
    established_kind: "acquired",
    operating_state: "operational",
    operating_evidence: {
      evidenceFor: [{ date: "2022", source: "dossier", says: "Acquired; previously an independent centre", dossierRef: "§3.3 L151-152, §2 L90" }],
      evidenceAgainst: [],
      history: [{ year: "2022", note: "Acquired; listed by some insurers as «Modern Medical Center»", dossierRef: "§3.3 L147-148, §2 L90" }],
    },
    requires_live_confirmation: false,
    insurance_facility_code: "17985",
    insurance_code_kind: "cchi_style_network_code",
    insurance_code_confidence: "medium",
    insurance_code_source: src("insurer_pdf", "CCHI-style id in insurer PDFs", "§3.3 L157-158, §2 L84", GOOGLE_2026),
    accreditation_cbahi: "not_accredited_claimed_in_progress",
    accreditation_date: null,
    accreditation_source: src("official_site", "Group claims CBAHI work in progress group-wide", "§2 L84", GOOGLE_2026),
    rating: {
      // The first place the schema earns its keep: the value comes from one
      // source and the count from another, so the record does not pretend.
      value: 4.1,
      reviewCountMin: 460,
      reviewCountMax: 460,
      scale: "aggregator_5",
      caveat: "Rating and review count come from DIFFERENT sources (aggregator rating vs ~460 Google reviews cited elsewhere).",
      confidence: "conflicted",
      internalOnly: true,
    },
    amenities: {
      onSitePharmacy: "unknown",
      pharmacyName: null,
      parking: "unknown",
      parking24h: "unknown",
      wheelchairAccess: "unknown",
      accessEvidence: null,
    },
    hours: siteHours("wattan-3", [
      layer(
        "facility",
        week(
          // capturedAt is 2024, not 2026: a 2024 guide quoted in a 2026
          // document is a 2024 fact (Rule HRS-FRESH).
          day("windows", [win("08:00", "24:00")], "medium", [src("directory", "2024 Arabic branch guide: Sat–Thu 08:00–00:00", "§3.3 L155-156", "2024")], "2024"),
          {
            fri: day(
              "unknown",
              [],
              "conflicted",
              [src("directory", "2024 Arabic branch guide: «Friday closed in one 2024 guide — verify, as other group sites run Friday afternoon»", "§3.3 L155-156", "2024")],
              "2024",
              [
                {
                  claimA: "Friday closed (one 2024 Arabic guide)",
                  claimB:
                    "Other group sites run Friday afternoon (Complex 1 from 13:00, Complex 2 from 16:00, Shoaa Rawdah from 16:00)",
                  dossierRefA: "§3.3 L156",
                  dossierRefB: "§3.1 L113, §3.2 L139, §3.6 L204",
                  resolution: "unresolved",
                  agentBehaviour:
                    "Offer no Friday slot at Ar Rabwah. State that Friday is unconfirmed at this branch, give 011 491 8003, and offer a Friday slot at a branch with a published Friday window or a Saturday slot at Ar Rabwah.",
                },
              ],
            ),
          },
        ),
      ),
      // No clinic layer is authored. §4.10: the dossier contains exactly one
      // clinic record in the whole file, and it is Complex 1's.
      unknownLayer("clinic"),
      unknownLayer("er"),
      unknownLayer("pharmacy"),
      unknownLayer("phone"),
    ]),
  },

  {
    site_key: "wattan-4",
    brand: "wattan",
    name_ar: "مجمع الوطن الطبي 4",
    name_en: "Al Wattan Medical Complex 4",
    aka_ar: ["مجمع الوطن الطبي — الشفا"],
    aka_en: ["Al Wattan Medical Complex – Shifa"],
    maps_category: "Polyclinic",
    district_ar: "الشفا",
    district_en: "Ash Shifa",
    address_en: "7348 Ibn Tulun (ابن طولون), Ash Shifa, Riyadh 14721",
    address_ar: null,
    postal_code: "14721",
    landmarks: ["Corner of Ibn Tulun and Ibn Taymiyyah", "Also given as Shifa, Ibn Taymiyyah Street"],
    plus_code: null,
    phones: [
      {
        e164OrNational: "0114977900",
        kind: "primary",
        confidence: "medium",
        suppressed: false,
        source: src("official_social", "Takaful / Bupa posts", "§3.4 L168-169", GOOGLE_2026),
      },
      {
        // THE PHONE WARNING, ENCODED. Not left in prose.
        e164OrNational: "0114588444",
        kind: "alt",
        confidence: "conflicted",
        suppressed: true,
        suppressionReason:
          "This is Complex 1's primary line (§3.1 L104). Group X posts used it for Shifa offers. Giving it as 'the Shifa number' may route a patient to a different branch.",
        source: src("official_social", "Group X posts used this number for Shifa offers", "§3.4 L168-169", GOOGLE_2026),
      },
    ],
    established_year: 2023,
    established_kind: "acquired",
    // §3.4.1 — three first-party datapoints that do not agree. We do not pick.
    operating_state: "operational_contested",
    operating_evidence: {
      since: "2023",
      evidenceFor: [
        { date: "2024-06-13", source: "Official X post", says: "Bupa Arabia patients are being received at Complex 4", dossierRef: "§3.4 L171, §9 L290" },
        { date: "2026-07-29", source: "Official X post", says: "Orthodontics offer specifically «at Al Wattan Medical Complex – Shifa»", dossierRef: "§3.4 L171, §9 L290" },
      ],
      evidenceAgainst: [
        { date: "2023", source: "Official website pages", says: "«Temporarily Closed»", dossierRef: "§3.4 L170-171, §2 L92" },
      ],
      dossierGuidance:
        "Treat as reopened / operating unless reception says otherwise; call 011 497 7900 before travelling. The open/closed status should be reconfirmed by telephone on the day of a visit.",
      history: [{ year: "2023", note: "Acquired", dossierRef: "§3.4 L166-167, §2 L92" }],
    },
    requires_live_confirmation: true,
    // No code published anywhere in the dossier. Never borrowed from a sibling,
    // for the same reason Friday is never borrowed from Thursday.
    insurance_facility_code: null,
    insurance_code_kind: null,
    insurance_code_confidence: "unknown",
    insurance_code_source: null,
    accreditation_cbahi: "not_accredited_claimed_in_progress",
    accreditation_date: null,
    accreditation_source: src("official_site", "Group claims CBAHI work in progress group-wide", "§2 L84", GOOGLE_2026),
    rating: {
      value: null,
      reviewCountMin: null,
      reviewCountMax: null,
      scale: "none",
      caveat: "Not consistently indexed.",
      confidence: "unknown",
      internalOnly: true,
    },
    amenities: {
      onSitePharmacy: "unknown",
      pharmacyName: null,
      parking: "unknown",
      parking24h: "unknown",
      wheelchairAccess: "unknown",
      accessEvidence: null,
    },
    // §4.6 — silence is not a schedule. Every layer unknown; bookableWindows()
    // returns [] for every day of the week, including days the sibling sites
    // are plainly open. There is no fallback pattern to inherit.
    hours: siteHours("wattan-4", [
      unknownLayer("facility"),
      unknownLayer("clinic"),
      unknownLayer("er"),
      unknownLayer("pharmacy"),
      unknownLayer("phone"),
    ]),
  },

  {
    site_key: "shoaa-wurud",
    brand: "shoaa",
    name_ar: "مجمع شعاع الطبي",
    name_en: "Shoaa Medical Complex",
    aka_ar: [],
    aka_en: [],
    maps_category: "Hospital",
    district_ar: "الورود",
    district_en: "Al Wurud",
    address_en: "King Abdullah Branch Road (طريق الملك عبدالله), Al Wurud, Riyadh 12254",
    address_ar: null,
    postal_code: "12254",
    landmarks: ["«next to Diyar Pharmacy / near Sadhan markets» in older copy — an ADDRESS landmark, not evidence of an on-site pharmacy"],
    plus_code: null,
    phones: [
      {
        e164OrNational: "920002258",
        kind: "unified_920",
        confidence: "high",
        suppressed: false,
        source: src("official_site", "Unified 920 number", "§3.5 L180-181", GOOGLE_2026),
      },
      {
        e164OrNational: "0114563777",
        kind: "primary",
        confidence: "high",
        suppressed: false,
        source: src("official_site", "Direct line", "§3.5 L180-181", GOOGLE_2026),
      },
      {
        e164OrNational: "0504490460",
        kind: "whatsapp",
        confidence: "high",
        suppressed: false,
        source: src("official_social", "WhatsApp line", "§3.5 L180-181", GOOGLE_2026),
      },
      {
        e164OrNational: "0112052613",
        kind: "fax",
        confidence: "medium",
        suppressed: true,
        suppressionReason: "Fax (Rule PHONE-1).",
        source: src("directory", "Listed as fax", "§3.5 L180-181", GOOGLE_2026),
      },
    ],
    established_year: 1992,
    established_kind: "established",
    operating_state: "operational",
    operating_evidence: {
      evidenceFor: [{ date: "2026", source: "official site + app stores", says: "shoaamc.com and a mobile app «مجمع شعاع الطبي» are live", dossierRef: "§3.5 L175" }],
      evidenceAgainst: [],
      history: [
        { year: "1992", note: "Founded", dossierRef: "§3.5 L178-179, §2 L87" },
        { year: "2000", note: "Joined the group; later renovated", dossierRef: "§3.5 L178-179, §2 L89" },
      ],
    },
    requires_live_confirmation: false,
    insurance_facility_code: "18004",
    insurance_code_kind: "cchi_style_network_code",
    insurance_code_confidence: "medium",
    insurance_code_source: src("insurer_pdf", "CCHI-style id in insurer PDFs", "§3.5 L188-189, §2 L84", GOOGLE_2026),
    accreditation_cbahi: "accredited",
    accreditation_date: "2023-03-13",
    accreditation_source: src("official_site", "CBAHI accreditation 13 March 2023 — the only accredited site in the group", "§2 L84, §3.5 L175, §2 L91", GOOGLE_2026),
    rating: {
      value: 3.5,
      reviewCountMin: 2684,
      reviewCountMax: 2684,
      scale: "google_5",
      caveat: "Approximate count as listed.",
      confidence: "medium",
      internalOnly: true,
    },
    amenities: {
      onSitePharmacy: "yes",
      pharmacyName: null,
      parking: "unknown",
      parking24h: "unknown",
      wheelchairAccess: "unknown",
      accessEvidence: null,
      pharmacyEvidence:
        "A first-party MARKETING claim of «an in-house pharmacy» [D §3.5 L194]. «Next to Diyar Pharmacy» is an address landmark, not this evidence.",
    },
    hours: siteHours("shoaa-wurud", [
      layer("facility", week(day("open_24h", [], "medium", [src("official_site", "Advertised 24/7 including ER", "§3.5 L184-185", GOOGLE_2026)], GOOGLE_2026))),
      layer("er", week(day("open_24h", [], "medium", [src("official_site", "Advertised 24/7 including ER", "§3.5 L184-185", GOOGLE_2026)], GOOGLE_2026))),
      // A layer collision, not a contradiction: a 24/7 building whose PHONE
      // DESK may be shut on Friday. Exactly what HoursLayer exists for.
      layer(
        "phone",
        week(
          day("windows", [win("08:00", "21:00")], "medium", [src("official_site", "Call-centre copy lists Sat–Thu 08:00–21:00 for phone inquiries", "§3.5 L184-185", GOOGLE_2026)], GOOGLE_2026),
          { fri: UNKNOWN_DAY() },
        ),
      ),
      // Rule HRS-DEMO site 2 of 3. The building is 24/7, so the invented clinic
      // sessions sit inside it trivially; Friday still opens at 16:00 rather
      // than inheriting the building's 24/7, because a Friday clinic session at
      // 09:00 is a claim nobody made.
      demoClinicLayer("16:00"),
      unknownLayer("pharmacy"),
    ]),
  },

  {
    site_key: "shoaa-rawdah",
    brand: "shoaa",
    name_ar: "مجمع شعاع الطبي 2",
    name_en: "Shoaa Medical Complex 2",
    aka_ar: ["مركز المشفى الطبي"],
    aka_en: ["Mashfa Medical Center"],
    maps_category: "Medical Center",
    district_ar: "الروضة",
    district_en: "Ar Rawdah",
    address_en: "Eastern Ring Branch Road (الطريق الدائري الشرقي الفرعي), Ar Rawdah, Riyadh 13213",
    address_ar: null,
    postal_code: "13213",
    landmarks: ["«next to Modern Machinery Maintenance Co.» (Tebcan)"],
    plus_code: null,
    phones: [
      {
        e164OrNational: "0112088585",
        kind: "primary",
        confidence: "high",
        suppressed: false,
        source: src("official_site", "Primary switchboard", "§3.6 L201-202", GOOGLE_2026),
      },
      {
        e164OrNational: "920002258",
        kind: "unified_920",
        confidence: "high",
        suppressed: false,
        source: src("official_site", "Unified 920 number (shared with Shoaa Al Wurud)", "§3.6 L201-202", GOOGLE_2026),
      },
      {
        e164OrNational: "0114453929",
        kind: "fax",
        confidence: "medium",
        suppressed: true,
        suppressionReason: "Fax (Rule PHONE-1).",
        source: src("directory", "Listed as fax", "§3.6 L201-202", GOOGLE_2026),
      },
    ],
    established_year: 2022,
    established_kind: "acquired",
    operating_state: "operational",
    operating_evidence: {
      evidenceFor: [{ date: "2022", source: "dossier", says: "Acquired into the group", dossierRef: "§3.6 L199-200, §2 L90" }],
      evidenceAgainst: [],
      history: [{ year: "2022", note: "Acquired; almashfa.net still resolves to Shoaa 2 branding in places", dossierRef: "§3.6 L195-196" }],
    },
    requires_live_confirmation: false,
    insurance_facility_code: "17081",
    // Set apart from the other four deliberately: the dossier lists
    // 18002/18003/17985/18004 together as codes in insurer PDFs and calls 17081
    // an older code on «some maps». Treating it as equivalent would overstate it.
    insurance_code_kind: "legacy_map_id",
    insurance_code_confidence: "low",
    insurance_code_source: src("directory", "«older codes such as 17081 in some maps»", "§3.6 L207-208, §2 L84", GOOGLE_2026),
    accreditation_cbahi: "unknown",
    accreditation_date: null,
    accreditation_source: null,
    rating: {
      value: 4.9,
      reviewCountMin: null,
      reviewCountMax: null,
      scale: "marketplace_5",
      caveat: "Tebcan rating from a small sample of BOOKED VISITORS. Explicitly not a Google global rating.",
      confidence: "low",
      internalOnly: true,
    },
    amenities: {
      onSitePharmacy: "unknown",
      pharmacyName: null,
      parking: "unknown",
      parking24h: "unknown",
      wheelchairAccess: "unknown",
      accessEvidence: null,
    },
    hours: siteHours("shoaa-rawdah", [
      layer(
        "facility",
        week(
          // The only source is the LEGACY Mashfa page — hours published by the
          // previous owner before the 2022 acquisition. Plausible, unverified,
          // and it pre-dates the group's ownership. Hence `low`, hence 2022.
          day("windows", [win("08:00", "24:00")], "low", [src("legacy_site", "Legacy Mashfa page (pre-acquisition)", "§3.6 L203-204", "2022")], "2022"),
          { fri: day("windows", [win("16:00", "24:00")], "low", [src("legacy_site", "Legacy Mashfa page (pre-acquisition)", "§3.6 L204", "2022")], "2022") },
        ),
      ),
      layer(
        "er",
        week(
          day("windows", [win("08:00", "24:00")], "low", [src("legacy_site", "«ER until midnight» on the legacy Mashfa page", "§3.6 L204", "2022")], "2022"),
          { fri: day("windows", [win("16:00", "24:00")], "low", [src("legacy_site", "«ER until midnight» on the legacy Mashfa page", "§3.6 L204", "2022")], "2022") },
        ),
      ),
      // Rule HRS-DEMO site 3 of 3.
      demoClinicLayer("16:00"),
      unknownLayer("pharmacy"),
      unknownLayer("phone"),
    ]),
  },
];

// ---------------------------------------------------------------------------
// Specialties and the §6.2 matrix.
// ---------------------------------------------------------------------------

interface SpecialtySeed {
  key: string;
  ar: string;
  en: string;
}

const SPECIALTIES: SpecialtySeed[] = [
  { key: "general_family", ar: "طب عام / طب أسرة", en: "General / family medicine" },
  { key: "internal_medicine", ar: "باطنية", en: "Internal medicine" },
  { key: "paediatrics", ar: "أطفال", en: "Paediatrics" },
  { key: "obgyn", ar: "نساء وولادة", en: "OB-GYN" },
  { key: "ent", ar: "أنف وأذن وحنجرة", en: "ENT" },
  { key: "ophthalmology", ar: "عيون", en: "Ophthalmology" },
  { key: "dermatology_medical", ar: "جلدية", en: "Dermatology (medical)" },
  { key: "laser_aesthetics", ar: "ليزر وتجميل", en: "Laser / aesthetics" },
  { key: "dentistry_general", ar: "أسنان عام", en: "Dentistry (general)" },
  { key: "orthodontics", ar: "تقويم أسنان", en: "Orthodontics" },
  { key: "endodontics", ar: "علاج جذور (حشو عصب)", en: "Endodontics (root canal)" },
  { key: "orthopaedics", ar: "عظام", en: "Orthopaedics" },
  { key: "neurology", ar: "مخ وأعصاب", en: "Neurology" },
  { key: "urology", ar: "مسالك بولية", en: "Urology" },
  { key: "general_surgery_day_case", ar: "جراحة عامة / جراحة اليوم الواحد", en: "General surgery / day-case" },
  { key: "emergency", ar: "طوارئ", en: "Emergency (ER)" },
  { key: "lab_radiology", ar: "مختبر وأشعة", en: "Laboratory + radiology" },
  { key: "employment_medicals", ar: "فحوصات ما قبل التوظيف", en: "Employment medicals" },
  { key: "sterilisation_cssd", ar: "تعقيم مركزي", en: "Sterilisation / CSSD" },
  { key: "pharmacy_on_site", ar: "صيدلية داخل المجمع", en: "Pharmacy (on site)" },
];

/** `N` named_at_site · `G` group_only · `I` inferred · `-` absent (SPEC-1 §6.2). */
const MATRIX_ORDER: SiteKey[] = ["wattan-1", "wattan-2", "wattan-3", "wattan-4", "shoaa-wurud", "shoaa-rawdah"];

const MATRIX: Record<string, string> = {
  //                        W1 W2 W3 W4 SW SR
  general_family: "N N I G N G",
  internal_medicine: "N N G G N G",
  paediatrics: "N N G G N G",
  obgyn: "N N G G N G",
  ent: "G N G G N G",
  ophthalmology: "G N G G G G",
  dermatology_medical: "G N I G N G",
  laser_aesthetics: "G N I G N G",
  dentistry_general: "G N N G N G",
  orthodontics: "G N G N G G",
  endodontics: "- G N - G -",
  orthopaedics: "G G G G G G",
  neurology: "N - - - G -",
  urology: "G G G G G G",
  general_surgery_day_case: "G G G G N G",
  emergency: "N G G - N N",
  lab_radiology: "N G I G G G",
  employment_medicals: "G G G G N G",
  sterilisation_cssd: "N G G G G G",
  pharmacy_on_site: "N - - - N -",
};

/**
 * Per-cell citations. Rule SPEC-1's `named_at_site` and every `inferred` cell
 * must point at the dossier; the CHECK constraint refuses the row otherwise.
 * The `inferred` cells are all [INF-06]: a TPA does not publish a discount for
 * a service the site does not provide, so Complex 3's published discount
 * schedule (consultation, lab/radiology, dental, laser) implies those
 * capabilities. Inferred, therefore NOT bookable.
 */
const CELL_REFS: Record<string, string> = {
  "wattan-1|general_family": "[D §3.1 L127]",
  "wattan-1|internal_medicine": "[D §3.1 L127]",
  "wattan-1|paediatrics": "[D §3.1 L127]",
  "wattan-1|obgyn": "[D §3.1 L127]",
  "wattan-1|neurology": "[D §2 L82], [D §3.1 L127]",
  "wattan-1|emergency": "[D §3.1 L112-113, L127]",
  "wattan-1|lab_radiology": "[D §3.1 L127]",
  "wattan-1|sterilisation_cssd": "[D §3.1 L127]",
  "wattan-1|pharmacy_on_site": "[D §3.1 L118-119]",
  "wattan-2|general_family": "[D §3.2 L146]",
  "wattan-2|internal_medicine": "[D §3.2 L146]",
  "wattan-2|paediatrics": "[D §3.2 L146]",
  "wattan-2|obgyn": "[D §3.2 L146]",
  "wattan-2|ent": "[D §3.2 L146]",
  "wattan-2|ophthalmology": "[D §3.2 L146]",
  "wattan-2|dermatology_medical": "[D §3.2 L144-146], [D §8 L282]",
  "wattan-2|laser_aesthetics": "[D §3.2 L144-146], [D §8 L282]",
  "wattan-2|dentistry_general": "[D §3.2 L145-146]",
  "wattan-2|orthodontics": "[D §3.2 L145-146], [D §8 L282]",
  "wattan-3|general_family": "[INF-06] via [D §3.3 L161]",
  "wattan-3|dermatology_medical": "[INF-06] via [D §3.3 L161]",
  "wattan-3|laser_aesthetics": "[INF-06] via [D §3.3 L161]",
  "wattan-3|lab_radiology": "[INF-06] via [D §3.3 L161]",
  "wattan-3|dentistry_general": "[D §3.3 L159-160]",
  "wattan-3|endodontics": "[D §3.3 L159-160]",
  "wattan-4|orthodontics": "[D §3.4 L171], [D §9 L290]",
  "shoaa-wurud|general_family": "[D §3.5 L194]",
  "shoaa-wurud|internal_medicine": "[D §3.5 L194]",
  "shoaa-wurud|paediatrics": "[D §3.5 L194]",
  "shoaa-wurud|obgyn": "[D §3.5 L194]",
  "shoaa-wurud|ent": "[D §3.5 L194]",
  "shoaa-wurud|dermatology_medical": "[D §3.5 L194]",
  "shoaa-wurud|laser_aesthetics": "[D §3.5 L194]",
  "shoaa-wurud|dentistry_general": "[D §3.5 L194]",
  "shoaa-wurud|general_surgery_day_case": "[D §3.5 L194], [D §2 L76]",
  "shoaa-wurud|emergency": "[D §3.5 L184-185], [D §2 L74-75]",
  "shoaa-wurud|employment_medicals": "[D §3.5 L194], [D §2 L76-77]",
  "shoaa-wurud|pharmacy_on_site": "[D §3.5 L194]",
  "shoaa-rawdah|emergency": "[D §3.6 L204]",
};

const CELL_NOTES: Record<string, string> = {
  "wattan-1|internal_medicine": "From «family-wide specialties» plus the explicit mentions at Complex 1. Named at the CATEGORY level only; the individual clinic still needs the clinic-hours layer, which here is `low`.",
  "wattan-1|paediatrics": "Category-level naming only — see the clinic-hours caveat at this site (§4.7).",
  "wattan-1|obgyn": "Category-level naming only — see the clinic-hours caveat at this site (§4.7).",
  "shoaa-wurud|obgyn": "Evidenced by a patient review referencing an OB-GYN consultant. The CAPABILITY is recorded; the clinician is not (Prohibition A).",
  "wattan-3|endodontics": "From the group's own Facebook announcement of an addition to the Rabwah dental team. The capability is recorded; the named clinician is not.",
  "wattan-4|orthodontics": "From the 29 July 2026 official X offer. `named_at_site` but gated behind a contested operating status and unpublished hours, so unbookable in Wave 1.",
  "shoaa-rawdah|emergency": "«ER until midnight» on the legacy pre-acquisition Mashfa page — named, but `low` confidence.",
  "wattan-3|general_family": "[INF-06] A TPA does not publish a discount for a service the site does not provide.",
  "wattan-3|dermatology_medical": "[INF-06] Inferred from the published TPA discount schedule.",
  "wattan-3|laser_aesthetics": "[INF-06] Inferred from the published TPA discount schedule.",
  "wattan-3|lab_radiology": "[INF-06] Inferred from the published TPA discount schedule.",
};

function evidenceOf(symbol: string): SpecialtyEvidence {
  if (symbol === "N") return "named_at_site";
  if (symbol === "G") return "group_only";
  if (symbol === "I") return "inferred";
  return "absent";
}

// ---------------------------------------------------------------------------
// The service catalogue — SPEC-1 §9.3. EVERY PRICE IS INVENTED.
//   A = demo_invented_anchored   (sanity-checked against the 56–200 SAR band)
//   U = demo_invented_unanchored (no dossier reference point exists at all)
// Durations and buffers are §7.3, all [DEMO-02]; the ones §7.3 does not list
// are marked in `durationNote`.
// ---------------------------------------------------------------------------

interface ServiceSeed {
  key: string;
  ar: string;
  en: string;
  category: string;
  specialty: string | null;
  sar: number;
  basis: "A" | "U";
  anchorNote?: string;
  duration: number;
  buffer: number;
  packageSessions?: number;
  baseServiceKey?: string;
  durationNote?: string;
}

const ANCHOR = "Sanity-checked against the dossier's 56–200 SAR Tebcan band [D §4 L215] — a marketplace listing, NOT the client's tariff. The price is still invented.";

const SERVICES: ServiceSeed[] = [
  // Consultations — anchored.
  { key: "consult_general", ar: "كشف طب عام / طب أسرة", en: "General / family medicine consultation", category: "consultation", specialty: "general_family", sar: 90, basis: "A", anchorNote: ANCHOR, duration: 20, buffer: 0 },
  { key: "consult_paediatric", ar: "كشف أطفال", en: "Paediatric consultation", category: "consultation", specialty: "paediatrics", sar: 120, basis: "A", anchorNote: ANCHOR, duration: 15, buffer: 0 },
  { key: "consult_internal", ar: "كشف باطنية", en: "Internal medicine consultation", category: "consultation", specialty: "internal_medicine", sar: 130, basis: "A", anchorNote: ANCHOR, duration: 20, buffer: 0 },
  { key: "consult_dermatology", ar: "كشف جلدية", en: "Dermatology consultation", category: "consultation", specialty: "dermatology_medical", sar: 150, basis: "A", anchorNote: ANCHOR, duration: 20, buffer: 0 },
  { key: "consult_ent", ar: "كشف أنف وأذن وحنجرة", en: "ENT consultation", category: "consultation", specialty: "ent", sar: 150, basis: "A", anchorNote: ANCHOR, duration: 20, buffer: 0 },
  { key: "consult_ophthalmology", ar: "كشف عيون", en: "Ophthalmology consultation", category: "consultation", specialty: "ophthalmology", sar: 150, basis: "A", anchorNote: ANCHOR, duration: 20, buffer: 0 },
  { key: "consult_obgyn", ar: "كشف نساء وولادة", en: "OB-GYN consultation", category: "consultation", specialty: "obgyn", sar: 170, basis: "A", anchorNote: ANCHOR, duration: 20, buffer: 0 },
  { key: "consult_neurology", ar: "كشف مخ وأعصاب", en: "Neurology consultation", category: "consultation", specialty: "neurology", sar: 200, basis: "A", anchorNote: `Top of the band. ${ANCHOR}`, duration: 20, buffer: 0 },
  { key: "followup_14d_same_clinician", ar: "مراجعة خلال ١٤ يوم مع نفس الطبيب", en: "Follow-up within 14 days, same clinician", category: "consultation", specialty: null, sar: 0, basis: "A", anchorNote: "Included at no charge. [INF-14] a common regional convention, not a dossier fact.", duration: 20, buffer: 0 },

  // Laser hair removal — unanchored. Sessions first, then packages: Rule PKG-1
  // pins every package to exactly 5 x its own session (six sessions, one free),
  // and a unit test asserts the relationship so the spoken sentence and the
  // stored numbers cannot drift apart.
  { key: "laser_small_session", ar: "ليزر — منطقة صغيرة، جلسة (شفة علوية / ذقن)", en: "Laser — small area, one session (upper lip / chin)", category: "laser", specialty: "laser_aesthetics", sar: 150, basis: "U", duration: 30, buffer: 15 },
  { key: "laser_medium_session", ar: "ليزر — منطقة متوسطة، جلسة (إبط / بكيني)", en: "Laser — medium area, one session (underarms / bikini)", category: "laser", specialty: "laser_aesthetics", sar: 300, basis: "U", duration: 30, buffer: 15 },
  { key: "laser_large_session", ar: "ليزر — منطقة كبيرة، جلسة (الساقين كامل / الظهر)", en: "Laser — large area, one session (full legs / back)", category: "laser", specialty: "laser_aesthetics", sar: 700, basis: "U", duration: 30, buffer: 15, durationNote: "§7.3 gives ONE laser duration (30 + 15) for all areas; it is applied uniformly rather than invented per area. [DEMO-02]" },
  { key: "laser_full_body_session", ar: "ليزر — الجسم كامل، جلسة", en: "Laser — full body, one session", category: "laser", specialty: "laser_aesthetics", sar: 1200, basis: "U", duration: 30, buffer: 15, durationNote: "§7.3 gives ONE laser duration (30 + 15) for all areas. [DEMO-02]" },
  { key: "laser_small_package6", ar: "باقة ٦ جلسات ليزر — منطقة صغيرة", en: "Laser package — 6 sessions, small area", category: "laser", specialty: "laser_aesthetics", sar: 750, basis: "U", duration: 30, buffer: 15, packageSessions: 6, baseServiceKey: "laser_small_session" },
  { key: "laser_medium_package6", ar: "باقة ٦ جلسات ليزر — منطقة متوسطة", en: "Laser package — 6 sessions, medium area", category: "laser", specialty: "laser_aesthetics", sar: 1500, basis: "U", duration: 30, buffer: 15, packageSessions: 6, baseServiceKey: "laser_medium_session" },
  { key: "laser_large_package6", ar: "باقة ٦ جلسات ليزر — منطقة كبيرة", en: "Laser package — 6 sessions, large area", category: "laser", specialty: "laser_aesthetics", sar: 3500, basis: "U", duration: 30, buffer: 15, packageSessions: 6, baseServiceKey: "laser_large_session" },
  { key: "laser_full_body_package6", ar: "باقة ٦ جلسات ليزر — الجسم كامل", en: "Laser package — 6 sessions, full body", category: "laser", specialty: "laser_aesthetics", sar: 6000, basis: "U", duration: 30, buffer: 15, packageSessions: 6, baseServiceKey: "laser_full_body_session" },

  // Orthodontics — unanchored.
  { key: "ortho_assessment", ar: "استشارة تقويم مع القياسات والصور", en: "Orthodontic assessment + records", category: "orthodontics", specialty: "orthodontics", sar: 300, basis: "U", duration: 40, buffer: 10 },
  { key: "ortho_fixed_metal", ar: "تقويم معدني ثابت — الفكين، شامل متابعة ١٨ شهر", en: "Fixed metal braces, both arches, incl. 18 months of adjustments", category: "orthodontics", specialty: "orthodontics", sar: 6500, basis: "U", duration: 40, buffer: 10, durationNote: "Booked as the assessment visit that opens the case; the treatment plan itself is not one appointment. [DEMO-02]" },
  { key: "ortho_ceramic", ar: "تقويم خزفي — الفكين، شامل متابعة ١٨ شهر", en: "Ceramic braces, both arches, incl. 18 months of adjustments", category: "orthodontics", specialty: "orthodontics", sar: 9000, basis: "U", duration: 40, buffer: 10, durationNote: "Booked as the assessment visit that opens the case. [DEMO-02]" },
  { key: "ortho_aligners_basic", ar: "تقويم شفاف — حالة أساسية (حتى ١٤ خطوة)", en: "Clear aligners, basic case (≤ 14 steps)", category: "orthodontics", specialty: "orthodontics", sar: 12000, basis: "U", duration: 40, buffer: 10, durationNote: "Booked as the assessment visit that opens the case. [DEMO-02]" },
  { key: "ortho_adjustment", ar: "زيارة شدّ تقويم خارج الباقة", en: "Adjustment visit outside a package", category: "orthodontics", specialty: "orthodontics", sar: 200, basis: "U", duration: 20, buffer: 0 },
  { key: "ortho_retainers", ar: "مثبتات تقويم — علوي وسفلي", en: "Retainers, upper + lower", category: "orthodontics", specialty: "orthodontics", sar: 900, basis: "U", duration: 20, buffer: 0, durationNote: "§7.3 lists no retainer duration; the adjustment duration is used. [DEMO-02]" },

  // Whitening and hygiene — unanchored.
  { key: "dental_scaling_polishing", ar: "تنظيف وتلميع الأسنان", en: "Scaling + polishing", category: "dental_hygiene", specialty: "dentistry_general", sar: 250, basis: "U", duration: 30, buffer: 10 },
  { key: "whitening_in_office", ar: "تبييض بالعيادة — جلسة واحدة", en: "In-office whitening, one session", category: "dental_hygiene", specialty: "dentistry_general", sar: 900, basis: "U", duration: 60, buffer: 15 },
  { key: "whitening_in_office_plus_kit", ar: "تبييض بالعيادة + طقم منزلي", en: "In-office whitening + take-home kit", category: "dental_hygiene", specialty: "dentistry_general", sar: 1300, basis: "U", duration: 60, buffer: 15 },
  { key: "whitening_take_home_kit", ar: "طقم تبييض منزلي فقط", en: "Take-home whitening kit only", category: "dental_hygiene", specialty: "dentistry_general", sar: 600, basis: "U", duration: 20, buffer: 0, durationNote: "§7.3 lists no duration for a kit-only visit; a short dispensing visit is used. [DEMO-02]" },

  // Employment medicals — unanchored. Corporate batch pricing is deliberately
  // ABSENT (Rule EMP-1: batch pricing is a commercial negotiation).
  { key: "employment_basic", ar: "فحص ما قبل التوظيف — الباقة الأساسية", en: "Pre-employment medical, basic panel", category: "employment_medicals", specialty: "employment_medicals", sar: 250, basis: "U", duration: 30, buffer: 0 },
  { key: "employment_plus_xray_labs", ar: "فحص ما قبل التوظيف + أشعة صدر وتحاليل", en: "Pre-employment medical + chest X-ray + labs", category: "employment_medicals", specialty: "employment_medicals", sar: 400, basis: "U", duration: 30, buffer: 0 },

  // Paediatrics — mixed. Rule PED-1: no vaccine, schedule or availability is
  // ever named; the ADMINISTRATION FEE is listed, the vaccine is not.
  { key: "wellbaby_growth_check", ar: "متابعة نمو الطفل السليم", en: "Well-baby / growth check", category: "paediatrics", specialty: "paediatrics", sar: 150, basis: "U", duration: 15, buffer: 0 },
  { key: "nebuliser_session", ar: "جلسة بخّار (نبيولايزر)", en: "Nebuliser session", category: "paediatrics", specialty: "paediatrics", sar: 120, basis: "U", duration: 30, buffer: 0, durationNote: "§7.3 lists no nebuliser duration. [DEMO-02]" },
  { key: "vaccine_admin_fee", ar: "رسوم إعطاء التطعيم", en: "Vaccine administration fee", category: "paediatrics", specialty: "paediatrics", sar: 100, basis: "U", duration: 15, buffer: 0, durationNote: "§7.3 lists no duration; the paediatric consult duration is used. [DEMO-02]" },

  // Women's health — mixed.
  { key: "pelvic_ultrasound", ar: "سونار حوض", en: "Pelvic ultrasound", category: "womens_health", specialty: "obgyn", sar: 300, basis: "U", duration: 40, buffer: 10 },
  { key: "obstetric_ultrasound_2d", ar: "سونار حمل ثنائي الأبعاد (تحديد عمر / متابعة نمو)", en: "Obstetric ultrasound (dating / growth, 2D)", category: "womens_health", specialty: "obgyn", sar: 350, basis: "U", duration: 40, buffer: 10 },
  { key: "pap_smear", ar: "مسحة عنق الرحم (أخذ العيّنة + التحليل)", en: "Pap smear (collection + lab)", category: "womens_health", specialty: "obgyn", sar: 300, basis: "U", duration: 20, buffer: 0 },
  { key: "antenatal_package_trimester", ar: "باقة متابعة حمل — لكل ثلث", en: "Antenatal package, per trimester", category: "womens_health", specialty: "obgyn", sar: 1200, basis: "U", duration: 40, buffer: 10 },
];

// DELIBERATELY ABSENT FROM THE CATALOGUE (SPEC-1 §9.4), and they must stay
// absent: a laboratory/radiology price list, ER fees, day-case surgery prices,
// any price that varies by branch (Rule PRICE-5), and any TPA discount amount
// (Rule PRICE-4). §7.3 also gives durations for "dental extraction" and
// "day-case procedure"; neither has a price anywhere in the dossier or the
// catalogue, so neither is seeded as a bookable service. A service row needs a
// price, and a price we do not have is not a price we may invent past §9.3.

// ---------------------------------------------------------------------------
// The roster — SPEC-1 §6.3. ALL FICTIONAL. 47 clinicians, 24 female and 23 male,
// every site carrying at least four and at least one of each gender wherever a
// clinic here can actually be booked.
//
// THIS LIST AND `lib/health/clinicians.ts` ARE THE SAME PEOPLE, and
// scripts/proof-faysal-domain.test.ts fails the build when they stop being. The
// engine roster is the authority — it is the one a patient is answered from —
// and this file is its database projection, so a doctor added there and not here
// seeds a tenant that cannot serve the conversation the demo has already had.
// The two drifted to thirty against thirty-six before anything checked, and the
// six missing people were the six who make «أبغى كشف عام» bookable at all.
//
// The two files disagree on VOCABULARY, and deliberately: the engine's
// `SpecialtyKey` union is what a sentence is built from, while these keys are
// rows in `health_specialties`, which splits dermatology from laser and names
// day-case surgery in full. The proof holds one map between them, asserts it
// covers every key in use, and compares the rosters through it.
// ---------------------------------------------------------------------------

interface DoctorSeed {
  key: string;
  ar: string;
  en: string;
  gender: "female" | "male";
  specialty: string;
  /** A second clinic this person also staffs — the engine's `subSpecialties`. */
  subSpecialties?: string[];
  languages: Array<"ar" | "en" | "ur" | "fr">;
  sites: SiteKey[];
  seniority: "consultant" | "specialist" | "general_practitioner";
  /**
   * Null where §9.4 leaves the specialty unpriced. Laboratory and radiology are
   * named at Al Yamamah and have no figure anywhere in the dossier, so the two
   * clinicians who staff that clinic are seeded as people and given no slots: a
   * bookable minute we could not quote is worse than no minute at all.
   */
  defaultService: string | null;
}

/** Exported so the proof can compare it to the engine roster object-for-object. */
export const DOCTORS: DoctorSeed[] = [
  { key: "dr-aldosari", ar: "د. عبدالله الدوسري", en: "Abdullah Al-Dosari", gender: "male", specialty: "internal_medicine", languages: ["ar", "en"], sites: ["wattan-1"], seniority: "consultant", defaultService: "consult_internal" },
  { key: "dr-alotaibi", ar: "د. منيرة العتيبي", en: "Munirah Al-Otaibi", gender: "female", specialty: "general_family", languages: ["ar", "en"], sites: ["wattan-1"], seniority: "specialist", defaultService: "consult_general" },
  { key: "dr-alshammari", ar: "د. طارق الشمري", en: "Tariq Al-Shammari", gender: "male", specialty: "emergency", languages: ["ar", "en"], sites: ["wattan-1"], seniority: "specialist", defaultService: "consult_general" },
  { key: "dr-hegazy", ar: "د. ياسمين حجازي", en: "Yasmin Hegazy", gender: "female", specialty: "paediatrics", languages: ["ar", "en"], sites: ["wattan-1"], seniority: "consultant", defaultService: "consult_paediatric" },
  { key: "dr-alqahtani", ar: "د. سامي القحطاني", en: "Sami Al-Qahtani", gender: "male", specialty: "neurology", languages: ["ar", "en"], sites: ["wattan-1"], seniority: "consultant", defaultService: "consult_neurology" },
  { key: "dr-almuhanna", ar: "د. عبير المهنا", en: "Abeer Al-Muhanna", gender: "female", specialty: "obgyn", languages: ["ar", "en"], sites: ["wattan-1"], seniority: "consultant", defaultService: "consult_obgyn" },
  { key: "dr-alruwaili", ar: "د. عادل الرويلي", en: "Adel Al-Ruwaili", gender: "male", specialty: "obgyn", languages: ["ar", "en"], sites: ["wattan-1"], seniority: "specialist", defaultService: "consult_obgyn" },
  { key: "dr-alkhuraiji", ar: "د. شذى الخريجي", en: "Shatha Al-Khuraiji", gender: "female", specialty: "lab_radiology", languages: ["ar", "en"], sites: ["wattan-1"], seniority: "consultant", defaultService: null },
  { key: "dr-alwuhaibi", ar: "د. تركي الوهيبي", en: "Turki Al-Wuhaibi", gender: "male", specialty: "lab_radiology", languages: ["ar", "en"], sites: ["wattan-1"], seniority: "specialist", defaultService: null },
  { key: "dr-alshathri", ar: "د. نوف الشثري", en: "Nouf Al-Shathri", gender: "female", specialty: "internal_medicine", languages: ["ar", "en"], sites: ["wattan-1"], seniority: "specialist", defaultService: "consult_internal" },

  { key: "dr-albaqami", ar: "د. ريم البقمي", en: "Reem Al-Baqami", gender: "female", specialty: "dermatology_medical", subSpecialties: ["laser_aesthetics"], languages: ["ar", "en"], sites: ["wattan-2"], seniority: "consultant", defaultService: "consult_dermatology" },
  { key: "dr-alkhatib", ar: "د. لينا الخطيب", en: "Lina Al-Khatib", gender: "female", specialty: "dermatology_medical", subSpecialties: ["laser_aesthetics"], languages: ["ar", "en", "fr"], sites: ["wattan-2"], seniority: "specialist", defaultService: "consult_dermatology" },
  { key: "dr-almutairi", ar: "د. فهد المطيري", en: "Fahd Al-Mutairi", gender: "male", specialty: "orthodontics", languages: ["ar", "en"], sites: ["wattan-2", "wattan-4"], seniority: "consultant", defaultService: "ortho_assessment" },
  { key: "dr-alharbi", ar: "د. نورة الحربي", en: "Noura Al-Harbi", gender: "female", specialty: "dentistry_general", languages: ["ar", "en"], sites: ["wattan-2"], seniority: "specialist", defaultService: "dental_scaling_polishing" },
  { key: "dr-alghamdi", ar: "د. عمر الغامدي", en: "Omar Al-Ghamdi", gender: "male", specialty: "ent", languages: ["ar", "en"], sites: ["wattan-2"], seniority: "consultant", defaultService: "consult_ent" },
  { key: "dr-saadeldin", ar: "د. أميرة سعد الدين", en: "Amira Saad El-Din", gender: "female", specialty: "obgyn", languages: ["ar", "en"], sites: ["wattan-2"], seniority: "consultant", defaultService: "consult_obgyn" },
  { key: "dr-alzahrani", ar: "د. بدر الزهراني", en: "Badr Al-Zahrani", gender: "male", specialty: "ophthalmology", languages: ["ar", "en"], sites: ["wattan-2"], seniority: "specialist", defaultService: "consult_ophthalmology" },
  { key: "dr-mansour", ar: "د. هالة منصور", en: "Hala Mansour", gender: "female", specialty: "paediatrics", languages: ["ar", "en"], sites: ["wattan-2"], seniority: "specialist", defaultService: "consult_paediatric" },
  { key: "dr-alanazi", ar: "د. لطيفة العنزي", en: "Latifa Al-Anazi", gender: "female", specialty: "general_family", languages: ["ar", "en"], sites: ["wattan-2"], seniority: "specialist", defaultService: "consult_general" },
  { key: "dr-aljasser", ar: "د. سلطان الجاسر", en: "Sultan Al-Jasser", gender: "male", specialty: "general_family", languages: ["ar", "en"], sites: ["wattan-2"], seniority: "general_practitioner", defaultService: "consult_general" },
  { key: "dr-alshayea", ar: "د. جمانة الشايع", en: "Jumanah Al-Shayea", gender: "female", specialty: "internal_medicine", languages: ["ar", "en"], sites: ["wattan-2"], seniority: "consultant", defaultService: "consult_internal" },
  { key: "dr-alfawzan", ar: "د. مازن الفوزان", en: "Mazen Al-Fawzan", gender: "male", specialty: "internal_medicine", languages: ["ar", "en"], sites: ["wattan-2"], seniority: "specialist", defaultService: "consult_internal" },

  { key: "dr-alansari", ar: "د. وليد الأنصاري", en: "Waleed Al-Ansari", gender: "male", specialty: "endodontics", languages: ["ar", "en"], sites: ["wattan-3"], seniority: "consultant", defaultService: "dental_scaling_polishing" },
  { key: "dr-alsaleh", ar: "د. دانة الصالح", en: "Dana Al-Saleh", gender: "female", specialty: "dentistry_general", languages: ["ar", "en"], sites: ["wattan-3"], seniority: "specialist", defaultService: "dental_scaling_polishing" },
  { key: "dr-alsubaie", ar: "د. ماجد السبيعي", en: "Majed Al-Subaie", gender: "male", specialty: "internal_medicine", subSpecialties: ["general_family"], languages: ["ar", "en", "ur"], sites: ["wattan-3"], seniority: "specialist", defaultService: "consult_internal" },
  { key: "dr-benyoussef", ar: "د. عائشة بن يوسف", en: "Aisha Ben Youssef", gender: "female", specialty: "dermatology_medical", languages: ["ar", "en", "fr"], sites: ["wattan-3"], seniority: "specialist", defaultService: "consult_dermatology" },

  { key: "dr-alnuaimi", ar: "د. إبراهيم النعيمي", en: "Ibrahim Al-Nuaimi", gender: "male", specialty: "orthodontics", languages: ["ar", "en"], sites: ["wattan-4"], seniority: "consultant", defaultService: "ortho_assessment" },
  { key: "dr-altayeb", ar: "د. سلمى الطيب", en: "Salma Al-Tayeb", gender: "female", specialty: "general_family", languages: ["ar", "en"], sites: ["wattan-4"], seniority: "specialist", defaultService: "consult_general" },
  { key: "dr-alajmi", ar: "د. راكان العجمي", en: "Rakan Al-Ajmi", gender: "male", specialty: "dentistry_general", languages: ["ar", "en"], sites: ["wattan-4"], seniority: "general_practitioner", defaultService: "dental_scaling_polishing" },

  { key: "dr-alhamdan", ar: "د. عبدالرحمن الحمدان", en: "Abdulrahman Al-Hamdan", gender: "male", specialty: "general_surgery_day_case", languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "consultant", defaultService: "consult_general" },
  { key: "dr-binomar", ar: "د. ليلى بن عمر", en: "Layla Bin Omar", gender: "female", specialty: "obgyn", languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "consultant", defaultService: "consult_obgyn" },
  { key: "dr-alshehri", ar: "د. مها الشهري", en: "Maha Al-Shehri", gender: "female", specialty: "obgyn", languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "specialist", defaultService: "consult_obgyn" },
  { key: "dr-alhalabi", ar: "د. زياد الحلبي", en: "Ziad Al-Halabi", gender: "male", specialty: "ent", languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "consultant", defaultService: "consult_ent" },
  { key: "dr-abdeljalil", ar: "د. أنس عبد الجليل", en: "Anas Abdel-Jalil", gender: "male", specialty: "paediatrics", languages: ["ar", "en", "ur"], sites: ["shoaa-wurud"], seniority: "consultant", defaultService: "consult_paediatric" },
  { key: "dr-alqarni", ar: "د. رنا القرني", en: "Rana Al-Qarni", gender: "female", specialty: "dermatology_medical", subSpecialties: ["laser_aesthetics"], languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "specialist", defaultService: "consult_dermatology" },
  { key: "dr-bashir", ar: "د. عثمان بشير", en: "Othman Bashir", gender: "male", specialty: "employment_medicals", languages: ["ar", "en", "ur"], sites: ["shoaa-wurud", "shoaa-rawdah"], seniority: "specialist", defaultService: "employment_basic" },
  { key: "dr-alsuwailem", ar: "د. غادة السويلم", en: "Ghada Al-Suwailem", gender: "female", specialty: "general_family", languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "specialist", defaultService: "consult_general" },
  { key: "dr-albarrak", ar: "د. خالد البراك", en: "Khalid Al-Barrak", gender: "male", specialty: "general_family", languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "general_practitioner", defaultService: "consult_general" },
  { key: "dr-alqathami", ar: "د. بشاير القثامي", en: "Bashayer Al-Qathami", gender: "female", specialty: "internal_medicine", languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "specialist", defaultService: "consult_internal" },
  { key: "dr-alduraiham", ar: "د. يوسف الدريهم", en: "Yousef Al-Duraiham", gender: "male", specialty: "internal_medicine", languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "consultant", defaultService: "consult_internal" },
  { key: "dr-almuqbil", ar: "د. رغد المقبل", en: "Raghad Al-Muqbil", gender: "female", specialty: "dentistry_general", languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "specialist", defaultService: "dental_scaling_polishing" },
  { key: "dr-alturaif", ar: "د. نايف الطريف", en: "Naif Al-Turaif", gender: "male", specialty: "dentistry_general", languages: ["ar", "en"], sites: ["shoaa-wurud"], seniority: "general_practitioner", defaultService: "dental_scaling_polishing" },

  { key: "dr-aldakhil", ar: "د. هيفاء الدخيل", en: "Haifa Al-Dakhil", gender: "female", specialty: "paediatrics", languages: ["ar", "en"], sites: ["shoaa-rawdah"], seniority: "consultant", defaultService: "consult_paediatric" },
  { key: "dr-alnour", ar: "د. مصعب النور", en: "Musab Al-Nour", gender: "male", specialty: "internal_medicine", languages: ["ar", "en"], sites: ["shoaa-rawdah"], seniority: "specialist", defaultService: "consult_internal" },
  { key: "dr-alfahad", ar: "د. جواهر الفهد", en: "Jawaher Al-Fahad", gender: "female", specialty: "dentistry_general", languages: ["ar", "en"], sites: ["shoaa-rawdah"], seniority: "specialist", defaultService: "dental_scaling_polishing" },
  { key: "dr-alhumaidi", ar: "د. أروى الحميدي", en: "Arwa Al-Humaidi", gender: "female", specialty: "general_family", languages: ["ar", "en"], sites: ["shoaa-rawdah"], seniority: "specialist", defaultService: "consult_general" },
  { key: "dr-alsudairi", ar: "د. مشعل السديري", en: "Mishal Al-Sudairi", gender: "male", specialty: "general_family", languages: ["ar", "en"], sites: ["shoaa-rawdah"], seniority: "general_practitioner", defaultService: "consult_general" },
];

// ---------------------------------------------------------------------------
// Payers — SPEC-1 §10.2. Insurers, TPA discount cards and directory sources are
// three DIFFERENT things and the schema keeps them apart. Rule INS-1 pins
// `acceptance_confirmed` false in the database: a list of networks a building
// appears on is not eligibility, and Faysal never promises coverage.
// ---------------------------------------------------------------------------

interface PayerSeed {
  key: string;
  en: string;
  ar: string;
  kind: "insurer" | "tpa_discount_card" | "directory_source";
  evidence: Array<{ siteKey: SiteKey | "group"; dossierRef: string; note: string }>;
}

const PAYERS: PayerSeed[] = [
  { key: "bupa_arabia", en: "Bupa Arabia", ar: "بوبا العربية", kind: "insurer", evidence: [{ siteKey: "wattan-4", dossierRef: "[D §3.4 L171], [D §4 L217]", note: "A June 2024 ANNOUNCEMENT that Bupa patients are received at Complex 4 — never spoken as a present-tense fact, at a branch whose status is contested." }] },
  { key: "tawuniya", en: "Tawuniya", ar: "التعاونية", kind: "insurer", evidence: [{ siteKey: "wattan-1", dossierRef: "[D §4 L217], [D §3.1 L121]", note: "«Tawuniya-class hospital lists»." }] },
  { key: "medgulf", en: "Medgulf", ar: "ميدغلف", kind: "insurer", evidence: [{ siteKey: "group", dossierRef: "[D §4 L217]", note: "Group-wide network paragraph." }] },
  { key: "walaa", en: "Walaa", ar: "ولاء", kind: "insurer", evidence: [{ siteKey: "group", dossierRef: "[D §4 L217]", note: "Group-wide network paragraph." }] },
  { key: "gulf_general", en: "Gulf General", ar: "الخليجية العامة", kind: "insurer", evidence: [{ siteKey: "group", dossierRef: "[D §4 L217]", note: "Group-wide network paragraph." }] },
  { key: "saico", en: "SAICO", ar: "سايكو", kind: "insurer", evidence: [{ siteKey: "group", dossierRef: "[D §4 L217]", note: "Group-wide network paragraph." }] },
  { key: "malath", en: "Malath", ar: "ملاذ", kind: "insurer", evidence: [{ siteKey: "group", dossierRef: "[D §4 L217]", note: "Group-wide network paragraph." }] },
  { key: "united", en: "United", ar: "المتحدة", kind: "insurer", evidence: [{ siteKey: "group", dossierRef: "[D §4 L217]", note: "Group-wide network paragraph." }] },
  { key: "al_etihad", en: "Al-Etihad", ar: "الاتحاد", kind: "insurer", evidence: [{ siteKey: "group", dossierRef: "[D §4 L217]", note: "Group-wide network paragraph." }] },
  { key: "enaya_saudi", en: "Enaya Saudi", ar: "عناية السعودية", kind: "insurer", evidence: [{ siteKey: "group", dossierRef: "[D §4 L217]", note: "Group-wide network paragraph." }] },
  { key: "solidarity", en: "Solidarity", ar: "سلامة", kind: "insurer", evidence: [{ siteKey: "group", dossierRef: "[D §4 L217]", note: "Group-wide network paragraph." }] },

  { key: "takaful_al_arabia", en: "Takaful Al Arabia", ar: "تكافل العربية", kind: "tpa_discount_card", evidence: [
    { siteKey: "wattan-3", dossierRef: "[D §3.3 L161]", note: "A DISCOUNT CARD, not insurance cover. Published example rates exist for this site and are NEVER quoted (Rule PRICE-4): they are insurer/TPA promotional rates tied to a specific card, excluded on campaign days, and off an unpublished tariff." },
    { siteKey: "wattan-4", dossierRef: "[D §3.4 L172-173]", note: "Same discount-card pattern as other Wattan sites." },
  ] },
  { key: "takaful_watan", en: "Takaful Watan", ar: "تكافل وطن", kind: "tpa_discount_card", evidence: [{ siteKey: "group", dossierRef: "[D §4 L217]", note: "A discount card, not insurance cover." }] },

  { key: "amana", en: "Amana", ar: "أمانة", kind: "directory_source", evidence: [{ siteKey: "wattan-1", dossierRef: "[D §3.1 L121], [D §9 L291]", note: "Rule INS-2: provenance for a facility code, NOT a payer to name to a patient." }] },
  { key: "al_jazeera_takaful", en: "Al Jazeera Takaful", ar: "الجزيرة تكافل", kind: "directory_source", evidence: [{ siteKey: "wattan-1", dossierRef: "[D §3.1 L121], [D §9 L291]", note: "Rule INS-2: provenance for a facility code, NOT a payer to name to a patient." }] },
  { key: "al_jazeera_maps", en: "Al Jazeera Maps registry", ar: "سجل خرائط الجزيرة", kind: "directory_source", evidence: [{ siteKey: "group", dossierRef: "[D §9 L291]", note: "Rule INS-2: registry numbers only." }] },
];

// ---------------------------------------------------------------------------
// Constrained resources — SPEC-1 §7.4. Rule RES-1: never named to the patient.
// ---------------------------------------------------------------------------

const RESOURCES = [
  {
    key: "wattan-2-laser-device-1",
    siteKey: "wattan-2" as SiteKey,
    kind: "device" as const,
    capacity: 1,
    serviceKeys: ["laser_small_session", "laser_medium_session", "laser_large_session", "laser_full_body_session"],
  },
];

// ---------------------------------------------------------------------------
// Slot generation — SPEC-1 §7.2. Pure, deterministic, no Math.random anywhere.
// ---------------------------------------------------------------------------

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function xorshift32(seed: number): () => number {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= (x << 13) >>> 0;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    x >>>= 0;
    return x / 0x1_0000_0000;
  };
}

/**
 * The occupancy curve — fixed, documented, deterministic [INF-10]. Denser at
 * 09:00–11:00 and 17:00–20:00, which are the peaks implied by Complex 1's
 * published clinic-shift pattern [D §3.1 L126]. It is demo colour: it exists so
 * a demo day looks like a real day (some times gone, some free) instead of an
 * implausible wall of availability.
 */
const HOUR_OCCUPANCY: Record<number, number> = {
  9: 0.55, 10: 0.55, 11: 0.45, 12: 0.35,
  16: 0.4, 17: 0.55, 18: 0.6, 19: 0.55, 20: 0.45,
};
const DAY_OCCUPANCY: Record<DayKey, number> = { sat: 1.05, sun: 1.0, mon: 1.0, tue: 1.0, wed: 0.95, thu: 1.1, fri: 0.9 };
const SITE_OCCUPANCY: Record<string, number> = { "wattan-2": 1.05, "shoaa-wurud": 1.0, "shoaa-rawdah": 0.9 };

function occupancy(siteKey: SiteKey, dayKey: DayKey, hour: number): number {
  const base = HOUR_OCCUPANCY[hour] ?? 0.3;
  const p = base * (DAY_OCCUPANCY[dayKey] ?? 1) * (SITE_OCCUPANCY[siteKey] ?? 1);
  return Math.min(0.85, Math.max(0.05, p));
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return h * 60 + m;
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayKeyOf(dateISO: string): DayKey {
  return DOW_TO_DAY_KEY[new Date(`${dateISO}T12:00:00Z`).getUTCDay()];
}

/** Riyadh has no DST, so a local wall-clock minute maps to one instant, always. */
function riyadhInstant(dateISO: string, minuteOfDay: number): string {
  const h = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const m = String(minuteOfDay % 60).padStart(2, "0");
  return `${dateISO}T${h}:${m}:00${CLINIC_TZ_OFFSET}`;
}

interface GeneratedSlot {
  siteKey: SiteKey;
  doctorKey: string;
  serviceKey: string;
  dateISO: string;
  dayKey: DayKey;
  startMinute: number;
  duration: number;
  buffer: number;
  windowConfidence: Confidence;
}

/**
 * The clinic-layer windows a slot may be minted from. This is the seed's local
 * reading of `bookableWindows()`'s data preconditions, and it is deliberately
 * strict: the layer must be `clinic` (Invariant H4 — a facility or ER window
 * never authorises a clinic slot), the day must be open, there must be no
 * unresolved conflict, and the confidence must be one bookableWindows() accepts.
 * In Wave 1 that means `demo_seeded` under DEMO_MODE, at three sites.
 */
const BOOKABLE_CONFIDENCE = new Set<Confidence>(["client_confirmed", "high", "medium", "demo_seeded"]);

function bookableClinicWindows(site: SiteSeed, dayKey: DayKey): { windows: TimeWindow[]; confidence: Confidence } {
  const clinic = site.hours.layers.find((l) => l.layer === "clinic");
  if (!clinic) return { windows: [], confidence: "unknown" };
  const d = clinic.week[dayKey];
  if (!d) return { windows: [], confidence: "unknown" };
  if (d.status !== "windows" && d.status !== "open_24h") return { windows: [], confidence: d.confidence };
  if (d.conflicts.length > 0) return { windows: [], confidence: d.confidence };
  if (!BOOKABLE_CONFIDENCE.has(d.confidence)) return { windows: [], confidence: d.confidence };
  if (site.operating_state !== "operational" && site.operating_state !== "operational_contested") {
    return { windows: [], confidence: d.confidence };
  }
  const windows = d.status === "open_24h" ? [win("00:00", "24:00")] : d.windows;
  return { windows, confidence: d.confidence };
}

function generateSlots(fromISO: string): GeneratedSlot[] {
  const siteByKey = new Map(SITES.map((s) => [s.site_key, s]));
  const serviceByKey = new Map(SERVICES.map((s) => [s.key, s]));
  const out: GeneratedSlot[] = [];

  for (let dayOffset = 0; dayOffset < FAYSAL_BOOKING_HORIZON_DAYS; dayOffset++) {
    const dateISO = addDaysISO(fromISO, dayOffset);
    const dayKey = dayKeyOf(dateISO);

    for (const doctor of DOCTORS) {
      // A clinician cannot be in two buildings at one instant, and the database
      // says so (unique on clinic_id + doctor_id + starts_at). The two
      // multi-site clinicians therefore ROTATE by date across the sites where
      // they actually have bookable hours. [DEMO-02]
      const bookableSites = doctor.sites
        .map((k) => siteByKey.get(k))
        .filter((s): s is SiteSeed => Boolean(s) && bookableClinicWindows(s as SiteSeed, dayKey).windows.length > 0);
      if (bookableSites.length === 0) continue;
      const site = bookableSites[Math.abs(fnv1a32(`${doctor.key}|${dateISO}`)) % bookableSites.length];

      const { windows, confidence } = bookableClinicWindows(site, dayKey);
      // §9.4's unpriced specialties reach here as a null default service. They
      // get no slots and no row, which is the same answer the catalogue gives:
      // the clinic exists, the price does not, and reception takes it from here.
      if (!doctor.defaultService) continue;
      const service = serviceByKey.get(doctor.defaultService);
      if (!service) throw new Error(`seed: doctor ${doctor.key} points at unknown service ${doctor.defaultService}`);

      const rng = xorshift32(fnv1a32(`${site.site_key}|${doctor.key}|${dateISO}|${FAYSAL_SLOT_SALT}`));

      for (const w of windows) {
        const open = toMinutes(w.open);
        const close = w.close === "24:00" ? 24 * 60 : toMinutes(w.close);
        // Rule BUF-2: start + duration + buffer must fit before close. A
        // 30-minute laser session at 23:45 in a window closing at 24:00 is
        // exactly the slot that produces a patient in an empty corridor.
        for (let start = open; start + service.duration + service.buffer <= close; start += FAYSAL_SLOT_GRID_MINUTES) {
          const busy = rng() < occupancy(site.site_key, dayKey, Math.floor(start / 60));
          if (busy) continue;
          out.push({
            siteKey: site.site_key,
            doctorKey: doctor.key,
            serviceKey: service.key,
            dateISO,
            dayKey,
            startMinute: start,
            duration: service.duration,
            buffer: service.buffer,
            windowConfidence: confidence,
          });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Row builders — one shape, two sinks (SQL text or PostgREST JSON).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function buildRows(fromISO: string): { table: string; conflict: string; rows: Row[] }[] {
  const clinic: Row = {
    id: CLINIC_ID,
    name: "Al Wattan Medical Group",
    name_ar: "مجموعة الوطن الطبية",
    brand: "wattan",
    district: "الرياض / Riyadh",
    phone: "0114588444",
    unified_phone: "920009303",
    timezone: "Asia/Riyadh",
    country: "SA",
    dialect: "saudi",
    hours: {},
    cchi_code: null,
    agent_mode: "test",
    feature_flags: {
      faysal_persona: true,
      demo_mode: true,
      // The clinic layer at three sites is invented and labelled. Rule DEMO-1
      // discloses it in the conversation, once.
      hours_demo_seeded: true,
      price_demo_label: true,
    },
    demo_mode: true,
    active: true,
  };

  const sites: Row[] = SITES.map((s) => ({
    id: siteId(s.site_key),
    clinic_id: CLINIC_ID,
    site_key: s.site_key,
    brand: s.brand,
    name_ar: s.name_ar,
    name_en: s.name_en,
    aka_ar: s.aka_ar,
    aka_en: s.aka_en,
    maps_category: s.maps_category,
    district_ar: s.district_ar,
    district_en: s.district_en,
    address_en: s.address_en,
    address_ar: s.address_ar,
    postal_code: s.postal_code,
    landmarks: s.landmarks,
    plus_code: s.plus_code,
    phones: s.phones,
    established_year: s.established_year,
    established_kind: s.established_kind,
    operating_state: s.operating_state,
    operating_evidence: s.operating_evidence,
    requires_live_confirmation: s.requires_live_confirmation,
    insurance_facility_code: s.insurance_facility_code,
    insurance_code_kind: s.insurance_code_kind,
    insurance_code_confidence: s.insurance_code_confidence,
    insurance_code_source: s.insurance_code_source,
    accreditation_cbahi: s.accreditation_cbahi,
    accreditation_date: s.accreditation_date,
    accreditation_source: s.accreditation_source,
    rating: s.rating,
    amenities: s.amenities,
    hours: s.hours,
    timezone: "Asia/Riyadh",
    stale_after_days: 30,
    client_confirmed_stale_after_days: 180,
    active: true,
  }));

  const specialties: Row[] = SPECIALTIES.map((s, i) => ({
    id: specialtyId(s.key),
    clinic_id: CLINIC_ID,
    specialty_key: s.key,
    name_ar: s.ar,
    name_en: s.en,
    sort: i + 1,
  }));

  const siteSpecialties: Row[] = [];
  for (const [key, row] of Object.entries(MATRIX)) {
    const cells = row.trim().split(/\s+/);
    if (cells.length !== MATRIX_ORDER.length) throw new Error(`seed: matrix row ${key} has ${cells.length} cells`);
    cells.forEach((symbol, idx) => {
      const site = MATRIX_ORDER[idx];
      const evidence = evidenceOf(symbol);
      const cellKey = `${site}|${key}`;
      const ref = CELL_REFS[cellKey] ?? (evidence === "group_only" ? "[D §2 L82]" : null);
      siteSpecialties.push({
        id: uuid5(`site_specialty:${cellKey}`),
        clinic_id: CLINIC_ID,
        site_id: siteId(site),
        specialty_id: specialtyId(key),
        evidence,
        dossier_ref: evidence === "absent" ? null : ref,
        note: CELL_NOTES[cellKey] ?? null,
      });
    });
  }

  const doctors: Row[] = DOCTORS.map((d) => ({
    id: doctorId(d.key),
    clinic_id: CLINIC_ID,
    doctor_key: d.key,
    name_ar: d.ar,
    name_en: d.en,
    gender: d.gender,
    specialty_id: specialtyId(d.specialty),
    sub_specialties: d.subSpecialties ?? [],
    languages: d.languages,
    seniority: d.seniority,
    default_service_key: d.defaultService,
    fictional: true,
    active: true,
  }));

  const doctorSites: Row[] = DOCTORS.flatMap((d) =>
    d.sites.map((s) => ({
      id: uuid5(`doctor_site:${d.key}|${s}`),
      clinic_id: CLINIC_ID,
      doctor_id: doctorId(d.key),
      site_id: siteId(s),
    })),
  );

  // Sessions before packages: `base_service_id` is a self-reference.
  const orderedServices = [...SERVICES].sort((a, b) => Number(Boolean(a.packageSessions)) - Number(Boolean(b.packageSessions)));
  const services: Row[] = orderedServices.map((s) => ({
    id: serviceId(s.key),
    clinic_id: CLINIC_ID,
    service_key: s.key,
    name_ar: s.ar,
    name_en: s.en,
    category: s.category,
    specialty_id: s.specialty ? specialtyId(s.specialty) : null,
    amount_sar: s.sar,
    price_basis: s.basis === "A" ? "demo_invented_anchored" : "demo_invented_unanchored",
    anchor_note: s.anchorNote ?? s.durationNote ?? null,
    requires_demo_label: true,
    vat_note: "excluded_unknown",
    duration_minutes: s.duration,
    buffer_minutes: s.buffer,
    package_sessions: s.packageSessions ?? null,
    base_service_id: s.baseServiceKey ? serviceId(s.baseServiceKey) : null,
    client_confirmation: null,
    active: true,
  }));

  const payers: Row[] = PAYERS.map((p) => ({
    id: payerId(p.key),
    clinic_id: CLINIC_ID,
    payer_key: p.key,
    name_en: p.en,
    name_ar: p.ar,
    kind: p.kind,
    site_evidence: p.evidence,
    network_class: "unknown",
    acceptance_confirmed: false,
  }));

  const resources: Row[] = RESOURCES.map((r) => ({
    id: resourceId(r.key),
    clinic_id: CLINIC_ID,
    site_id: siteId(r.siteKey),
    resource_key: r.key,
    kind: r.kind,
    capacity: r.capacity,
    service_keys: r.serviceKeys,
  }));

  const slots: Row[] = generateSlots(fromISO).map((s) => {
    const startsAt = riyadhInstant(s.dateISO, s.startMinute);
    const endsAt = riyadhInstant(s.dateISO, s.startMinute + s.duration);
    const blockedUntil = riyadhInstant(s.dateISO, s.startMinute + s.duration + s.buffer);
    return {
      id: uuid5(`slot:${s.siteKey}|${s.doctorKey}|${s.dateISO}|${s.startMinute}`),
      clinic_id: CLINIC_ID,
      site_id: siteId(s.siteKey),
      doctor_id: doctorId(s.doctorKey),
      service_id: serviceId(s.serviceKey),
      starts_at: startsAt,
      ends_at: endsAt,
      blocked_until: blockedUntil,
      duration_minutes: s.duration,
      buffer_minutes: s.buffer,
      local_date: s.dateISO,
      local_start_minute: s.startMinute,
      day_key: s.dayKey,
      state: "offered",
      hold_id: null,
      held_until: null,
      window_confidence: s.windowConfidence,
      generator: SLOT_GENERATOR,
      seed_salt: FAYSAL_SLOT_SALT,
      source: "faysal_demo",
      is_test: true,
    };
  });

  return [
    { table: "health_clinics", conflict: "id", rows: [clinic] },
    { table: "health_sites", conflict: "id", rows: sites },
    { table: "health_specialties", conflict: "id", rows: specialties },
    { table: "health_site_specialties", conflict: "id", rows: siteSpecialties },
    { table: "health_doctors", conflict: "id", rows: doctors },
    { table: "health_doctor_sites", conflict: "id", rows: doctorSites },
    { table: "health_services", conflict: "id", rows: services },
    { table: "health_payers", conflict: "id", rows: payers },
    { table: "health_resources", conflict: "id", rows: resources },
    { table: "health_slots", conflict: "id", rows: slots },
  ];
}

// ---------------------------------------------------------------------------
// SQL emitter.
// ---------------------------------------------------------------------------

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (Array.isArray(value)) {
    // text[] for arrays of strings, jsonb for anything structured.
    if (value.every((v) => typeof v === "string")) {
      const inner = value.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
      return `'{${inner.replace(/'/g, "''")}}'::text[]`;
    }
    return `${quote(JSON.stringify(value))}::jsonb`;
  }
  if (typeof value === "object") return `${quote(JSON.stringify(value))}::jsonb`;
  return quote(String(value));
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

const SQL_CHUNK_ROWS: Record<string, number> = { health_sites: 1, health_site_specialties: 60 };

/**
 * Sites, without the copy-paste. SPEC-1 §4.1's hours record is a five-layer ×
 * seven-day matrix, and most weeks are one DayHours repeated six times with a
 * different Friday — because Friday is the compressed day and H3 forbids
 * inferring it from anything. Spelled literally that is ~14 KB of near-identical
 * JSON per site, six times over, which is a review surface nobody reads
 * carefully and a transcription hazard in any governed apply.
 *
 * So the distinct day documents are hoisted into a `values` row and the week is
 * assembled by `jsonb_build_object`. Same stored document, a quarter of the
 * bytes, and the repetition becomes visible as repetition: `'sat', d.d0, 'sun',
 * d.d0, …, 'fri', d.d1` reads as "six identical days and a different Friday",
 * which is exactly the fact §4.4 is about.
 */
function emitSiteInserts(rows: Row[]): string[] {
  return rows.map((row) => {
    const hours = row.hours as SiteHours;
    const dayDocs: string[] = [];
    const slotFor = (d: DayHours): string => {
      const json = JSON.stringify(d);
      let i = dayDocs.indexOf(json);
      if (i === -1) {
        dayDocs.push(json);
        i = dayDocs.length - 1;
      }
      return `d.d${i}`;
    };

    const layerExprs = hours.layers.map((l) => {
      const weekPairs = DAY_KEYS.map((k) => `'${k}', ${slotFor(l.week[k])}`).join(", ");
      return (
        `jsonb_build_object('layer', ${quote(l.layer)}, ` +
        `'week', jsonb_build_object(${weekPairs}), ` +
        `'overrides', ${quote(JSON.stringify(l.overrides))}::jsonb)`
      );
    });

    const hoursExpr =
      `jsonb_build_object('siteKey', ${quote(hours.siteKey)}, 'timezone', 'Asia/Riyadh', ` +
      `'staleAfterDays', ${hours.staleAfterDays}, 'layers', jsonb_build_array(\n    ` +
      layerExprs.join(",\n    ") +
      `\n  ))`;

    const cols = Object.keys(row);
    const values = cols.map((c) => (c === "hours" ? hoursExpr : sqlLiteral(row[c])));
    const updates = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`);
    const dayValues = dayDocs.map((j) => `${quote(j)}::jsonb`).join(",\n  ");
    const dayCols = dayDocs.map((_, i) => `d${i}`).join(", ");

    return (
      `insert into public.health_sites (${cols.join(", ")})\n` +
      `select ${values.join(", ")}\n` +
      `from (values (\n  ${dayValues}\n)) as d(${dayCols})\n` +
      `on conflict (id) do update set ${updates.join(", ")};`
    );
  });
}

function buildSeedSql(fromISO: string): string {
  const groups = buildRows(fromISO);
  const parts: string[] = [
    "-- فيصل / Faysal demo seed. Generated by scripts/seed-faysal.ts — do not hand-edit.",
    `-- Anchor date: ${fromISO} (Asia/Riyadh) · horizon ${FAYSAL_BOOKING_HORIZON_DAYS} days · salt ${FAYSAL_SLOT_SALT}`,
    "-- ALL CLINICIANS ARE FICTIONAL (SPEC-1 §6.3). ALL PRICES ARE INVENTED (SPEC-1 §9.1).",
    "begin;",
    // Regenerating inventory replaces UNRESERVED slots only: a held or
    // confirmed appointment is somebody's booking, not seed data.
    `delete from public.health_slots where clinic_id = ${quote(CLINIC_ID)} and state = 'offered';`,
  ];

  for (const group of groups) {
    if (group.rows.length === 0) continue;
    // Slots are emitted in the compact form below: 4,000 fully-spelled rows is
    // ~1.9 MB of literal UUIDs and timestamps, which no governed apply wants to
    // read or transport. The compact form is the same slots.
    if (group.table === "health_slots") continue;
    if (group.table === "health_sites") {
      parts.push(...emitSiteInserts(group.rows));
      continue;
    }
    const cols = Object.keys(group.rows[0]);
    const updates = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`);
    // Chunked so no single statement grows past what a SQL editor, a review
    // diff or a governed apply will comfortably accept. `health_sites` goes one
    // row per statement: each site carries a five-layer hours document and is
    // ~11 KB on its own, and a reviewer reads sites one at a time anyway.
    const chunkSize = SQL_CHUNK_ROWS[group.table] ?? 250;
    for (let i = 0; i < group.rows.length; i += chunkSize) {
      const chunk = group.rows.slice(i, i + chunkSize);
      const values = chunk.map((r) => `  (${cols.map((c) => sqlLiteral(r[c])).join(", ")})`).join(",\n");
      parts.push(
        `insert into public.${group.table} (${cols.join(", ")}) values\n${values}\n` +
          `on conflict (${group.conflict}) do update set ${updates.join(", ")};`,
      );
    }
  }

  parts.push(...emitSlotSql(fromISO));
  parts.push("commit;");
  return parts.join("\n\n") + "\n";
}

/**
 * Slots, compactly: one VALUES row per clinician-day carrying the array of
 * free start-minutes, expanded by `unnest`. The timestamps are computed by
 * Postgres from the local date and minute — which is exact, because Riyadh is
 * UTC+03:00 with no DST, the same pinned assumption `riyadhInstant()` makes on
 * this side. `local_start_minute` is stored, so the two can be compared row for
 * row after an apply rather than trusted.
 */
function emitSlotSql(fromISO: string): string[] {
  const generated = generateSlots(fromISO);
  const groups = new Map<string, { row: GeneratedSlot; minutes: number[] }>();
  for (const s of generated) {
    const key = `${s.siteKey}|${s.doctorKey}|${s.serviceKey}|${s.dateISO}|${s.duration}|${s.buffer}|${s.windowConfidence}`;
    const existing = groups.get(key);
    if (existing) existing.minutes.push(s.startMinute);
    else groups.set(key, { row: s, minutes: [s.startMinute] });
  }

  // Rows are keyed by site_key / doctor_key / service_key rather than by uuid:
  // the ids are resolved by joining the tables this seed has already written,
  // which halves the bytes and — more to the point — makes a slot row legible
  // to a reviewer, who can see WHICH clinician is being given WHICH day.
  const rows = [...groups.values()].map(({ row, minutes }, i) => {
    const cast = i === 0 ? "::text" : "";
    return (
      `  (${quote(row.siteKey)}${cast}, ${quote(row.doctorKey)}${cast}, ${quote(row.serviceKey)}${cast}, ` +
      `date ${quote(row.dateISO)}, ${row.duration}, ${row.buffer}, ` +
      `${quote(row.windowConfidence)}${cast}, array[${minutes.join(",")}])`
    );
  });

  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 90) {
    const chunk = rows.slice(i, i + 90);
    out.push(
      `insert into public.health_slots (
  clinic_id, site_id, doctor_id, service_id, starts_at, ends_at, blocked_until,
  duration_minutes, buffer_minutes, local_date, local_start_minute, day_key,
  state, window_confidence, generator, seed_salt, source, is_test)
select
  st.clinic_id, st.id, dr.id, sv.id,
  (g.local_date + make_interval(mins => m))::timestamp at time zone 'Asia/Riyadh',
  (g.local_date + make_interval(mins => m + g.duration_minutes))::timestamp at time zone 'Asia/Riyadh',
  (g.local_date + make_interval(mins => m + g.duration_minutes + g.buffer_minutes))::timestamp at time zone 'Asia/Riyadh',
  g.duration_minutes, g.buffer_minutes, g.local_date, m,
  (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from g.local_date)::int + 1],
  'offered', g.window_confidence, ${quote(SLOT_GENERATOR)}, ${quote(FAYSAL_SLOT_SALT)}, 'faysal_demo', true
from (values\n${chunk.join(",\n")}\n) as g(site_key, doctor_key, service_key, local_date, duration_minutes, buffer_minutes, window_confidence, mins)
cross join lateral unnest(g.mins) as m
join public.health_sites st on st.clinic_id = ${quote(CLINIC_ID)}::uuid and st.site_key = g.site_key
join public.health_doctors dr on dr.clinic_id = st.clinic_id and dr.doctor_key = g.doctor_key
join public.health_services sv on sv.clinic_id = st.clinic_id and sv.service_key = g.service_key
on conflict (clinic_id, doctor_id, starts_at) do nothing;`,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// REST writer (service-role), mirroring scripts/seed-demo-ksa-tenant.mjs.
// ---------------------------------------------------------------------------

async function writeViaRest(fromISO: string): Promise<void> {
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB || !SR) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Use --emit-sql to produce the statements for a governed apply instead.",
    );
  }
  const headers = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };

  const clear = await fetch(`${SB}/rest/v1/health_slots?clinic_id=eq.${CLINIC_ID}&state=eq.offered`, {
    method: "DELETE",
    headers,
  });
  if (!clear.ok) throw new Error(`clearing offered slots failed (HTTP ${clear.status}): ${await clear.text()}`);

  for (const group of buildRows(fromISO)) {
    for (let i = 0; i < group.rows.length; i += 250) {
      const chunk = group.rows.slice(i, i + 250);
      const res = await fetch(`${SB}/rest/v1/${group.table}`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        throw new Error(`upsert ${group.table} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 500)}`);
      }
    }
    console.log(`  ${group.table.padEnd(24)} ${group.rows.length} rows`);
  }
}

// ---------------------------------------------------------------------------

function todayInRiyadh(): string {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

/**
 * The clinic membership row, when an owner is named. It is OPT-IN and it
 * resolves an EXISTING `auth.users` row by email rather than creating one:
 * creating an auth user needs the service key, and quietly granting a login
 * access to a clinic's health records is not something a seed should decide.
 *
 * Without it the tenant has zero members, which is the safe default — RLS
 * denies every authenticated read, and the demo runs through server routes on
 * the service key exactly as the Kivo demo does. SPEC-3 §1.3's mitigation for
 * "two logins" is precisely this shape: one `auth.users` row, two memberships.
 */
function ownerMembershipSql(email: string): string {
  return (
    `insert into public.health_members (clinic_id, user_id, role)\n` +
    `select ${quote(CLINIC_ID)}::uuid, u.id, 'manager' from auth.users u where u.email = ${quote(email)}\n` +
    `on conflict (clinic_id, user_id) do update set role = excluded.role;`
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const emitSql = args.includes("--emit-sql");
  const outArg = args.find((a) => a.startsWith("--out="));
  const fromArg = args.find((a) => a.startsWith("--from="));
  const ownerArg = args.find((a) => a.startsWith("--owner-email="));
  const ownerEmail = ownerArg ? ownerArg.slice("--owner-email=".length) : null;
  const fromISO = fromArg ? fromArg.slice("--from=".length) : todayInRiyadh();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromISO)) throw new Error(`--from must be YYYY-MM-DD, got ${fromISO}`);

  const groups = buildRows(fromISO);
  const counts = groups.map((g) => `${g.table.replace("health_", "")}=${g.rows.length}`).join(" · ");

  if (emitSql) {
    let sql = buildSeedSql(fromISO);
    if (ownerEmail) {
      sql = sql.replace("\ncommit;\n", `\n${ownerMembershipSql(ownerEmail)}\n\ncommit;\n`);
    }
    if (outArg) {
      const out = outArg.slice("--out=".length);
      writeFileSync(out, sql, "utf8");
      console.error(`Faysal seed SQL → ${out}`);
    } else {
      process.stdout.write(sql);
    }
    console.error(`clinic_id ${CLINIC_ID} · anchor ${fromISO} · ${counts}`);
    return;
  }

  console.log(`Seeding Faysal demo tenant → ${CLINIC_ID} (anchor ${fromISO})`);
  await writeViaRest(fromISO);
  console.log(`\n=== Faysal seeded ===\n${counts}`);
  console.log("ALL CLINICIANS ARE FICTIONAL · ALL PRICES ARE DEMO DATA");
}

// Only when this file is the program. It exports its roster for the proof that
// keeps it level with `lib/health/clinicians.ts`, and an import must never write
// to a database or print a seed to stdout.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error("SEED FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
