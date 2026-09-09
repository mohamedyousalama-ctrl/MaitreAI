// ============================================================================
// فيصل / Faysal — the six sites. SPEC-1-DOMAIN.md §3.
//
// `unknown` is written where the dossier is silent. It is NEVER back-filled
// from a sibling site — the same law as Friday never being copied from
// Thursday. Every value carries its provenance in-band (Rule S-1).
//
// Rule RATE-1: ratings live here as an internal tie-breaker ONLY. Nothing in
// this module renders one, and `patientPhoneFor()` is the only phone reader —
// it never returns a fax (Rule PHONE-1) or a suppressed number (§3.4).
// ============================================================================

import type { Phone, Site, SiteId, SourceRef } from "./types";

function src(
  kind: SourceRef["kind"],
  note: string,
  dossierRef: string,
  capturedAt: string
): SourceRef {
  return { kind, note, dossierRef, capturedAt };
}

const D_GROUP = src("dossier_only", "group profile", "§2 L48-92", "2026-09-09");

// ── wattan-1 — Al Yamamah / Atika, est. 1982 ────────────────────────────────

const WATTAN_1: Site = {
  id: "wattan-1",
  brand: "wattan",
  nameAr: "مجمع الوطن الطبي 1",
  nameEn: "Al Wattan Medical Complex 1",
  akaAr: ["مستوصف الوطن عتيقة"],
  akaEn: ["Al Watan Polyclinic"],
  mapsCategory: "Hospital",
  district: { ar: "اليمامة", en: "Al Yamamah" },
  addressEn: "2807 Prince Mohammed bin Abdulrahman Road, Al Yamamah, Riyadh 12671",
  addressAr: "2807 طريق الأمير محمد بن عبدالرحمن، اليمامة، الرياض 12671",
  postalCode: "12671",
  landmarks: ["شرق سوق عتيقة، منفوحة", "الشارع محلياً «شارع الستين»"],
  plusCode: "JP46+5C Al Yamamah, Riyadh",
  phones: [
    {
      e164OrNational: "0114588444",
      kind: "primary",
      confidence: "high",
      suppressed: false,
      source: src("google_maps", "primary line, ext. 250", "§3.1 L104-107", "2026-09-09"),
    },
    {
      e164OrNational: "0114581913",
      kind: "fax",
      confidence: "medium",
      suppressed: true,
      suppressionReason: "Fax / unlabelled alternate. Rule PHONE-1 — never read out.",
      source: src("directory", "alt/fax", "§3.1 L104-107", "2026-09-09"),
    },
    {
      e164OrNational: "920009303",
      kind: "unified_920",
      confidence: "high",
      suppressed: false,
      source: src("official_site", "Wattan unified line", "§1 L45", "2026-09-09"),
    },
    {
      e164OrNational: "0504490460",
      kind: "whatsapp",
      confidence: "high",
      suppressed: false,
      source: src("official_site", "group WhatsApp, both brands", "§1 L45", "2026-09-09"),
    },
  ],
  established: { year: 1982, kind: "established" },
  operatingStatus: {
    state: "operational",
    since: null,
    evidenceFor: [src("google_maps", "listing active", "§3.1 passim", "2026-09-09")],
    evidenceAgainst: [],
    dossierGuidance: null,
    requiresLiveConfirmation: false,
  },
  insurance: {
    facilityCode: "18002",
    codeKind: "cchi_style_network_code",
    codeConfidence: "medium",
    codeSource: src("insurer_pdf", "CCHI-style ID in insurer PDFs", "§3.1 L120-121", "2026-09-09"),
  },
  accreditation: {
    cbahi: "not_accredited_claimed_in_progress",
    cbahiDate: null,
    source: src("dossier_only", "group claims work in progress", "§2 L84", "2026-09-09"),
  },
  rating: {
    value: 3.1,
    reviewCountMin: 1447,
    reviewCountMax: 1499,
    scale: "google_5",
    caveat: "listing snapshots differ on the review count; stored as a range, never averaged",
    internalOnly: true,
  },
  amenities: {
    onSitePharmacy: "yes",
    pharmacyName: "صيدلية الديار 1 / Diyar Pharmacy 1",
    parking: "yes",
    parking24h: "yes",
    wheelchairAccess: "yes",
    accessEvidence:
      "Google Maps wheelchair icon — Rule ACC-1: speaks to ENTRANCE access only, not lifts, treatment rooms or restrooms [INF-02].",
  },
};

// ── wattan-2 — Ar Rawabi, est. 1999. The derm/laser + dental branch ─────────

const WATTAN_2: Site = {
  id: "wattan-2",
  brand: "wattan",
  nameAr: "مجمع الوطن الطبي 2",
  nameEn: "Al Wattan Medical Complex 2",
  mapsCategory: "Medical Center",
  district: { ar: "الروابي", en: "Ar Rawabi" },
  addressEn: "7291 Unayzah Street, Ar Rawabi, Riyadh 14216",
  addressAr: null, // the dossier gives no Arabic form. NOT back-filled.
  postalCode: "14216",
  landmarks: ["شارع عنيزة"],
  plusCode: "MQRP+CR Ar Rawabi",
  phones: [
    {
      e164OrNational: "0114964455",
      kind: "primary",
      confidence: "high",
      suppressed: false,
      source: src("google_maps", "primary line", "§3.2 L134-135", "2026-09-09"),
    },
    {
      e164OrNational: "0114964439",
      kind: "fax",
      confidence: "medium",
      suppressed: true,
      suppressionReason: "Fax / unlabelled alternate. Rule PHONE-1.",
      source: src("directory", "alt/fax", "§3.2 L134-135", "2026-09-09"),
    },
    {
      e164OrNational: "0504490460",
      kind: "whatsapp",
      confidence: "high",
      suppressed: false,
      source: src("official_site", "group WhatsApp", "§1 L45", "2026-09-09"),
    },
  ],
  established: { year: 1999, kind: "established" },
  operatingStatus: {
    state: "operational",
    since: null,
    evidenceFor: [src("official_social", "active Instagram/Facebook marketing", "§3.2 L142-145", "2026-09-09")],
    evidenceAgainst: [],
    dossierGuidance: null,
    requiresLiveConfirmation: false,
  },
  insurance: {
    facilityCode: "18003",
    codeKind: "cchi_style_network_code",
    codeConfidence: "medium",
    codeSource: src("insurer_pdf", "code in insurer PDFs", "§3.2 L140-141", "2026-09-09"),
  },
  accreditation: {
    cbahi: "not_accredited_claimed_in_progress",
    cbahiDate: null,
    source: D_GROUP,
  },
  rating: {
    value: 3.4,
    reviewCountMin: 1056,
    reviewCountMax: 1056,
    scale: "google_5",
    caveat: null,
    internalOnly: true,
  },
  amenities: {
    onSitePharmacy: "unknown",
    pharmacyName: null,
    parking: "unknown",
    parking24h: "unknown",
    wheelchairAccess: "unknown",
    accessEvidence: null, // dossier silent. Faysal says it does not know and offers to check.
  },
};

// ── wattan-3 — Ar Rabwah, acquired 2022 ─────────────────────────────────────

const WATTAN_3: Site = {
  id: "wattan-3",
  brand: "wattan",
  nameAr: "مجمع الوطن الطبي 3",
  nameEn: "Al Wattan Medical Complex 3",
  akaAr: ["مجمع الوطن الطبي الثالث"],
  akaEn: ["Modern Medical Center"],
  mapsCategory: "Medical Center",
  district: { ar: "الربوة", en: "Ar Rabwah" },
  addressEn: "Prince Mutaib bin Abdulaziz Road, Ar Rabwah, Riyadh 12835",
  addressAr: "طريق الأمير متعب بن عبدالعزيز، الربوة، الرياض 12835",
  postalCode: "12835",
  landmarks: [],
  plusCode: null,
  phones: [
    {
      e164OrNational: "0114918003",
      kind: "primary",
      confidence: "high",
      suppressed: false,
      source: src("google_maps", "primary line", "§3.3 L153-154", "2026-09-09"),
    },
    {
      e164OrNational: "0114974111",
      kind: "alt",
      confidence: "medium",
      suppressed: true,
      suppressionReason: "Unlabelled alternate — Rule PHONE-1 renders primary/unified/whatsapp only.",
      source: src("directory", "alt", "§10 L303-305", "2026-09-09"),
    },
    {
      e164OrNational: "0114933115",
      kind: "fax",
      confidence: "medium",
      suppressed: true,
      suppressionReason: "Fax. Rule PHONE-1.",
      source: src("directory", "fax", "§10 L303-305", "2026-09-09"),
    },
  ],
  established: { year: 2022, kind: "acquired" },
  operatingStatus: {
    state: "operational",
    since: null,
    evidenceFor: [src("official_social", "group Facebook announcement of a Rabwah dental addition", "§3.3 L159-160", "2026-09-09")],
    evidenceAgainst: [],
    dossierGuidance: null,
    requiresLiveConfirmation: false,
  },
  insurance: {
    facilityCode: "17985",
    codeKind: "cchi_style_network_code",
    codeConfidence: "medium",
    codeSource: src("insurer_pdf", "code in insurer PDFs", "§3.3 L157-158", "2026-09-09"),
  },
  accreditation: { cbahi: "not_accredited_claimed_in_progress", cbahiDate: null, source: D_GROUP },
  rating: {
    // The value comes from one source and the count from another. The schema
    // does not pretend: `conflicted`, and internal-only anyway (Rule RATE-1).
    value: 4.1,
    reviewCountMin: 460,
    reviewCountMax: 460,
    scale: "aggregator_5",
    caveat: "rating and review count come from different sources",
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
};

// ── wattan-4 — Ash Shifa. CONTESTED STATUS (§3.4.1) ─────────────────────────

const WATTAN_4: Site = {
  id: "wattan-4",
  brand: "wattan",
  nameAr: "مجمع الوطن الطبي 4",
  nameEn: "Al Wattan Medical Complex 4",
  akaAr: ["مجمع الوطن الطبي - الشفا"],
  akaEn: ["Al Wattan Medical Complex – Shifa"],
  mapsCategory: "Polyclinic",
  district: { ar: "الشفا", en: "Ash Shifa" },
  addressEn: "7348 Ibn Tulun, Ash Shifa, Riyadh 14721 (also given as Ibn Taymiyyah Street)",
  addressAr: "7348 ابن طولون، الشفا، الرياض 14721",
  postalCode: "14721",
  landmarks: ["تقاطع ابن طولون مع ابن تيمية"],
  plusCode: null,
  phones: [
    {
      e164OrNational: "0114977900",
      kind: "primary",
      confidence: "medium",
      suppressed: false,
      source: src("official_social", "Takaful / Bupa posts", "§3.4 L168-169", "2026-09-09"),
    },
    {
      // ENCODED, not left in prose. This is Complex 1's primary line.
      e164OrNational: "0114588444",
      kind: "alt",
      confidence: "conflicted",
      suppressed: true,
      suppressionReason:
        "This is Complex 1's primary line (§3.1 L104). Group X posts used it for Shifa offers. " +
        "Giving it as 'the Shifa number' may route a patient to a different branch. [OPEN-11]",
      source: src("official_social", "group X posts for Shifa offers", "§3.4 L168-169", "2026-09-09"),
    },
  ],
  established: { year: 2023, kind: "acquired" },
  operatingStatus: {
    state: "operational_contested",
    since: "2023",
    evidenceFor: [
      src("official_social", "X post 13 Jun 2024 — Bupa Arabia patients received at Complex 4", "§3.4 L171", "2024-06-13"),
      src("official_social", "X post 29 Jul 2026 — orthodontics offer at Al Wattan Medical Complex – Shifa", "§3.4 L171", "2026-07-29"),
    ],
    evidenceAgainst: [
      src("official_site", "website pages: 'Temporarily Closed'", "§3.4 L170-171", "2023-01-01"),
    ],
    dossierGuidance: "Treat as operating unless reception says otherwise; call before travelling.",
    requiresLiveConfirmation: true,
  },
  insurance: {
    // Never borrowed from a sibling, for the same reason Friday is never
    // borrowed from Thursday.
    facilityCode: null,
    codeKind: null,
    codeConfidence: "unknown",
    codeSource: null,
  },
  accreditation: { cbahi: "not_accredited_claimed_in_progress", cbahiDate: null, source: D_GROUP },
  rating: {
    value: null,
    reviewCountMin: null,
    reviewCountMax: null,
    scale: "none",
    caveat: "not consistently indexed",
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
};

// ── shoaa-wurud — the flagship, CBAHI accredited ────────────────────────────

const SHOAA_WURUD: Site = {
  id: "shoaa-wurud",
  brand: "shoaa",
  nameAr: "مجمع شعاع الطبي",
  nameEn: "Shoaa Medical Complex",
  mapsCategory: "Hospital",
  district: { ar: "الورود", en: "Al Wurud" },
  addressEn: "King Abdullah Branch Road, Al Wurud, Riyadh 12254",
  addressAr: "طريق الملك عبدالله الفرعي، الورود، الرياض 12254",
  postalCode: "12254",
  landmarks: ["بجانب صيدلية الديار / قرب أسواق السدحان (نص قديم)"],
  plusCode: null,
  phones: [
    {
      e164OrNational: "920002258",
      kind: "unified_920",
      confidence: "high",
      suppressed: false,
      source: src("official_site", "Shoaa unified line", "§3.5 L180-181", "2026-09-09"),
    },
    {
      e164OrNational: "0114563777",
      kind: "primary",
      confidence: "high",
      suppressed: false,
      source: src("official_site", "direct line", "§3.5 L180-181", "2026-09-09"),
    },
    {
      e164OrNational: "0504490460",
      kind: "whatsapp",
      confidence: "high",
      suppressed: false,
      source: src("official_site", "group WhatsApp", "§1 L45", "2026-09-09"),
    },
    {
      e164OrNational: "0112052613",
      kind: "fax",
      confidence: "medium",
      suppressed: true,
      suppressionReason: "Fax. Rule PHONE-1.",
      source: src("official_site", "fax", "§3.5 L180-181", "2026-09-09"),
    },
  ],
  established: { year: 1992, kind: "joined_group" },
  operatingStatus: {
    state: "operational",
    since: null,
    evidenceFor: [src("official_site", "shoaamc.com + mobile app", "§3.5 L175", "2026-09-09")],
    evidenceAgainst: [],
    dossierGuidance: null,
    requiresLiveConfirmation: false,
  },
  insurance: {
    facilityCode: "18004",
    codeKind: "cchi_style_network_code",
    codeConfidence: "medium",
    codeSource: src("insurer_pdf", "code in insurer PDFs", "§3.5 L188-189", "2026-09-09"),
  },
  accreditation: {
    cbahi: "accredited",
    cbahiDate: "2023-03-13",
    source: src("official_site", "the only accredited site in the group", "§2 L84, §3.5 L175", "2026-09-09"),
  },
  rating: {
    value: 3.5,
    reviewCountMin: 2684,
    reviewCountMax: 2684,
    scale: "google_5",
    caveat: null,
    internalOnly: true,
  },
  amenities: {
    onSitePharmacy: "yes",
    pharmacyName: "in-house pharmacy (first-party marketing claim)",
    parking: "unknown",
    parking24h: "unknown",
    wheelchairAccess: "unknown",
    accessEvidence:
      "'next to Diyar Pharmacy' is an ADDRESS LANDMARK, not evidence of an on-site pharmacy; the on-site claim rests separately on the site's own marketing (§3.5 L194).",
  },
};

// ── shoaa-rawdah — Ar Rawdah, acquired 2022 (ex-Mashfa) ─────────────────────

const SHOAA_RAWDAH: Site = {
  id: "shoaa-rawdah",
  brand: "shoaa",
  nameAr: "مجمع شعاع الطبي 2",
  nameEn: "Shoaa Medical Complex 2",
  akaAr: ["مركز المشفى الطبي"],
  akaEn: ["Mashfa Medical Center"],
  mapsCategory: "Medical Center",
  district: { ar: "الروضة", en: "Ar Rawdah" },
  addressEn: "Eastern Ring Branch Road, Ar Rawdah, Riyadh 13213",
  addressAr: "الطريق الدائري الشرقي الفرعي، الروضة، الرياض 13213",
  postalCode: "13213",
  landmarks: ["بجانب شركة صيانة الآلات الحديثة"],
  plusCode: null,
  phones: [
    {
      e164OrNational: "0112088585",
      kind: "primary",
      confidence: "high",
      suppressed: false,
      source: src("directory", "primary line", "§3.6 L201-202", "2026-09-09"),
    },
    {
      e164OrNational: "920002258",
      kind: "unified_920",
      confidence: "high",
      suppressed: false,
      source: src("official_site", "Shoaa unified line", "§3.6 L201-202", "2026-09-09"),
    },
    {
      e164OrNational: "0114453929",
      kind: "fax",
      confidence: "medium",
      suppressed: true,
      suppressionReason: "Fax. Rule PHONE-1.",
      source: src("directory", "fax", "§3.6 L201-202", "2026-09-09"),
    },
  ],
  established: { year: 2022, kind: "acquired" },
  operatingStatus: {
    state: "operational",
    since: null,
    evidenceFor: [src("directory", "listed and trading under Shoaa branding", "§3.6 L195-200", "2026-09-09")],
    evidenceAgainst: [],
    dossierGuidance: null,
    requiresLiveConfirmation: false,
  },
  insurance: {
    // Deliberately NOT equivalent to the other four codes (§10.3).
    facilityCode: "17081",
    codeKind: "legacy_map_id",
    codeConfidence: "low",
    codeSource: src("directory", "older codes such as 17081 in some maps", "§3.6 L207-208", "2026-09-09"),
  },
  accreditation: { cbahi: "unknown", cbahiDate: null, source: null },
  rating: {
    value: 4.9,
    reviewCountMin: null,
    reviewCountMax: null,
    scale: "marketplace_5",
    caveat: "small sample of booked visitors on Tebcan, explicitly NOT a Google global rating",
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
};

export const SITES: Readonly<Record<SiteId, Site>> = Object.freeze({
  "wattan-1": WATTAN_1,
  "wattan-2": WATTAN_2,
  "wattan-3": WATTAN_3,
  "wattan-4": WATTAN_4,
  "shoaa-wurud": SHOAA_WURUD,
  "shoaa-rawdah": SHOAA_RAWDAH,
});

export const SITE_IDS: readonly SiteId[] = Object.freeze([
  "wattan-1",
  "wattan-2",
  "wattan-3",
  "wattan-4",
  "shoaa-wurud",
  "shoaa-rawdah",
] as const);

export function isSiteId(v: string): v is SiteId {
  return (SITE_IDS as readonly string[]).includes(v);
}

export function siteById(siteId: SiteId): Site {
  const site = SITES[siteId];
  if (!site) throw new Error(`unknown_site:${siteId}`);
  return site;
}

/**
 * Rule PHONE-1 — the ONLY phone reader a patient-facing path may use.
 * Renders `primary` | `unified_920` | `whatsapp` only, never a fax, never a
 * suppressed number. A fax given to a patient as a booking line is a small
 * failure with a large smell, and this dataset is full of them.
 */
export function patientPhoneFor(siteId: SiteId): string {
  const phones = siteById(siteId).phones;
  const speakable: Phone["kind"][] = ["primary", "unified_920", "whatsapp"];
  for (const kind of speakable) {
    const hit = phones.find((p) => p.kind === kind && !p.suppressed);
    if (hit) return hit.e164OrNational;
  }
  throw new Error(`no_speakable_phone:${siteId}`);
}

/** Every number Faysal may say for a site, in speaking order. */
export function patientPhonesFor(siteId: SiteId): string[] {
  const order: Phone["kind"][] = ["primary", "unified_920", "whatsapp"];
  return siteById(siteId)
    .phones.filter((p) => !p.suppressed && order.includes(p.kind))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .map((p) => p.e164OrNational);
}

/**
 * The branch that IS in a named district — never "the nearest branch by
 * distance", which we cannot compute: the dossier gives a plus code for two of
 * six sites and no coordinates at all. Matching is on the district's own Arabic
 * or English name and the site's recorded alternates, so «الشفا» resolves and
 * «جنوب الرياض» does not. A null answer is the honest one; the caller asks.
 */
export function siteInDistrict(text: string): SiteId | null {
  const q = String(text ?? "").trim().toLowerCase();
  if (!q) return null;
  for (const id of SITE_IDS) {
    const site = SITES[id];
    const names = [site.district.ar, site.district.en, ...(site.akaAr ?? []), ...(site.akaEn ?? [])]
      .filter(Boolean)
      .map((n) => n.toLowerCase());
    if (names.some((n) => q === n || q.includes(n))) return id;
  }
  return null;
}

/** H5 / Rule C4-1 — a contested site's bookings carry pendingBranchConfirmation. */
export function isContested(siteId: SiteId): boolean {
  return siteById(siteId).operatingStatus.state === "operational_contested";
}

/** §4.2 gate — only an `operational` or `operational_contested` site can mint. */
export function canMintSlots(siteId: SiteId): boolean {
  const state = siteById(siteId).operatingStatus.state;
  return state === "operational" || state === "operational_contested";
}
