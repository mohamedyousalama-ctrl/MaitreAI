// ============================================================================
// فيصل / Faysal — DEMO SEED DATA, transcribed from docs/faysal/SPEC-1-DOMAIN.md.
//
// ⚠ TEMPORARY. This is the demo surface's BRIDGE while `lib/health/*` is being
//   built by the domain agent. Every value below is transcribed from SPEC-1 with
//   its section reference; nothing here is invented by this file. When
//   `lib/health` lands, this file and `bridge.ts` are DELETED and
//   `_domain/index.ts` re-exports the real module. See that file's header.
//
// ⚠ ALL CLINICIANS BELOW ARE FICTIONAL — SPEC-1 §6.3, reproduced as that section
//   requires. None corresponds to any real person practising at Al Wattan Medical
//   Group, Shoaa Medical Complex, or anywhere else. SPEC-1 PROHIBITION A: the
//   dossier's real, review-harvested clinician names are NEVER used.
//
// ⚠ EVERY PRICE BELOW IS DEMO DATA — SPEC-1 §9.1/§9.3. Rule PRICE-1 renders the
//   label on every figure; Rule DEMO-1 discloses the demo in the conversation.
// ============================================================================

import type { NeedKey, SiteId } from "./contract";

export interface SeedSite {
  id: SiteId;
  nameAr: string;
  nameEn: string;
  districtAr: string;
  /** Districts a patient might name that make this the geographically nearest site. */
  nearDistrictsAr: string[];
  addressAr: string;
  /** SPEC-1 Rule PHONE-1 — `primary`/`unified_920`/`whatsapp` only. Never a fax. */
  phoneAr: string;
  /** SPEC-1 §3.4.1 — `operational_contested` for wattan-4. */
  contested: boolean;
  /** SPEC-1 §6.3 — the three demo-bookable sites. Everything else is callback-only. */
  bookable: boolean;
  /** Rule HRS-DEMO clinic layer, `confidence: "demo_seeded"`. Riyadh wall-clock hours. */
  clinicHours: { satThu: [number, number] | null; friday: [number, number] | null };
  /** Clinics genuinely listed at this site (SPEC-1 §6.2 / §6.3 roster). */
  clinicsAr: string[];
  /** Insurer network lists the BUILDING appears on. Never eligibility (Rule INS-1). */
  networks: string[];
  accreditationAr: string | null;
}

/** SPEC-1 §3.1–§3.6. */
export const SITES: Readonly<Record<SiteId, SeedSite>> = {
  "wattan-1": {
    id: "wattan-1",
    nameAr: "مجمع الوطن الطبي 1 — اليمامة",
    nameEn: "Al Wattan Medical Complex 1 — Al Yamamah",
    districtAr: "اليمامة",
    nearDistrictsAr: ["اليمامة", "عتيقة", "منفوحة", "الديرة", "البطحاء"],
    addressAr: "2807 طريق الأمير محمد بن عبدالرحمن، اليمامة، الرياض 12671",
    phoneAr: "011 458 8444",
    contested: false,
    // SPEC-1 §4.7 + Invariant H4: a 24h FACILITY with a duty doctor is not an open
    // clinic. The clinic layer here is `unknown`, so there is no bookable inventory.
    bookable: false,
    clinicHours: { satThu: null, friday: null },
    clinicsAr: ["الباطنة", "طب الأسرة", "المخ والأعصاب", "الأطفال", "الطوارئ"],
    networks: ["بوبا", "التعاونية", "ميدغلف", "ولاء", "الخليجية العامة", "سايكو", "ملاذ", "المتحدة", "الاتحاد", "عناية", "سلامة"],
    accreditationAr: null,
  },
  "wattan-2": {
    id: "wattan-2",
    nameAr: "مجمع الوطن الطبي 2 — الروابي",
    nameEn: "Al Wattan Medical Complex 2 — Ar Rawabi",
    districtAr: "الروابي",
    nearDistrictsAr: ["الروابي", "الريان", "النسيم", "قرطبة", "اليرموك"],
    addressAr: "7291 شارع عنيزة، الروابي، الرياض 14216",
    phoneAr: "011 496 4455",
    contested: false,
    bookable: true,
    // Rule HRS-DEMO, `demo_seeded`. Friday confidence `medium` at this site
    // (SPEC-1 §4.4, "often listed" 16:00–24:00) — so Rule FRI-1 applies to it.
    clinicHours: { satThu: [9, 21], friday: [16, 22] },
    clinicsAr: ["الجلدية والليزر", "الأسنان والتقويم", "الأنف والأذن", "النساء والولادة", "العيون", "الأطفال"],
    networks: ["بوبا", "التعاونية", "ميدغلف", "ولاء", "الخليجية العامة", "سايكو", "ملاذ", "المتحدة", "الاتحاد", "عناية", "سلامة"],
    accreditationAr: null,
  },
  "wattan-3": {
    id: "wattan-3",
    nameAr: "مجمع الوطن الطبي 3 — الربوة",
    nameEn: "Al Wattan Medical Complex 3 — Ar Rabwah",
    districtAr: "الربوة",
    nearDistrictsAr: ["الربوة", "الملز", "الوزارات", "السليمانية"],
    addressAr: "طريق الأمير متعب بن عبدالعزيز، الربوة، الرياض 12835",
    phoneAr: "011 491 8003",
    contested: false,
    // SPEC-1 §4.4: Friday `conflicted`, and §6.3's demo inventory names three other
    // sites. Callback-only in this build.
    bookable: false,
    clinicHours: { satThu: null, friday: null },
    clinicsAr: ["علاج الجذور (حشو عصب)", "الأسنان", "الباطنة", "الجلدية"],
    networks: ["بوبا", "التعاونية", "ميدغلف", "ولاء", "الخليجية العامة", "سايكو", "ملاذ", "المتحدة", "الاتحاد", "عناية", "سلامة"],
    accreditationAr: null,
  },
  "wattan-4": {
    id: "wattan-4",
    nameAr: "مجمع الوطن الطبي 4 — الشفا",
    nameEn: "Al Wattan Medical Complex 4 — Ash Shifa",
    districtAr: "الشفا",
    nearDistrictsAr: ["الشفا", "الحزم", "بدر", "المروة", "عريض", "الدار البيضاء", "جنوب الرياض"],
    addressAr: "7348 ابن طولون، الشفا، الرياض 14721",
    // SPEC-1 §3.4 PHONE WARNING: 011 458 8444 is Complex 1's line and is SUPPRESSED
    // for this site. Faysal gives 011 497 7900 for Complex 4 and never the other.
    phoneAr: "011 497 7900",
    contested: true,
    bookable: false,
    clinicHours: { satThu: null, friday: null }, // SPEC-1 §4.6 — silent, not closed.
    clinicsAr: ["طب الأسرة", "الأسنان", "التقويم"],
    networks: ["بوبا", "التعاونية", "ميدغلف", "ولاء", "الخليجية العامة", "سايكو", "ملاذ", "المتحدة", "الاتحاد", "عناية", "سلامة"],
    accreditationAr: null,
  },
  "shoaa-wurud": {
    id: "shoaa-wurud",
    nameAr: "مجمع شعاع الطبي — الورود",
    nameEn: "Shoaa Medical Complex — Al Wurud",
    districtAr: "الورود",
    nearDistrictsAr: ["الورود", "المروج", "الملقا", "العليا", "السليمانية", "شمال الرياض"],
    addressAr: "طريق الملك عبدالله، الورود، الرياض 12254",
    phoneAr: "011 456 3777",
    contested: false,
    bookable: true,
    clinicHours: { satThu: [8, 21], friday: [16, 22] },
    clinicsAr: ["الجراحة العامة وجراحة اليوم الواحد", "النساء والولادة", "الأنف والأذن", "الأطفال", "الجلدية والليزر", "فحوصات ما قبل التوظيف"],
    networks: ["بوبا", "التعاونية", "ميدغلف", "ولاء", "الخليجية العامة", "سايكو", "ملاذ", "المتحدة", "الاتحاد", "عناية", "سلامة"],
    // SPEC-1 §3.5 — the only accredited site in the group, 13 March 2023.
    accreditationAr: "اعتماد المجلس السعودي للمنشآت الصحية CBAHI",
  },
  "shoaa-rawdah": {
    id: "shoaa-rawdah",
    nameAr: "مجمع شعاع الطبي 2 — الروضة",
    nameEn: "Shoaa Medical Complex 2 — Ar Rawdah",
    districtAr: "الروضة",
    nearDistrictsAr: ["الروضة", "الأندلس", "الحمراء", "غرناطة", "النهضة", "شرق الرياض"],
    addressAr: "الطريق الدائري الشرقي الفرعي، الروضة، الرياض 13213",
    phoneAr: "011 208 8585",
    contested: false,
    bookable: true,
    clinicHours: { satThu: [8, 22], friday: [16, 22] },
    clinicsAr: ["الأطفال", "الباطنة", "الأسنان", "فحوصات ما قبل التوظيف"],
    networks: ["بوبا", "التعاونية", "ميدغلف", "ولاء", "الخليجية العامة", "سايكو", "ملاذ", "المتحدة", "الاتحاد", "عناية", "سلامة"],
    accreditationAr: null,
  },
};

export const SITE_IDS = Object.keys(SITES) as SiteId[];

/**
 * SPEC-1 §5.2 routing table + §5.3 fallback chains, as data.
 * `reasonAr` is the patient-facing one-liner, verbatim where SPEC-1 gives one.
 * A reason is a loaded specific, never an adjective (SPEC-2 §4.1 #2).
 */
export interface RouteRow {
  need: NeedKey;
  chain: SiteId[];
  reasonAr: string;
  clinicKey: string;
  clinicAr: string;
}

export const ROUTES: Readonly<Record<NeedKey, RouteRow>> = {
  laser: {
    need: "laser",
    chain: ["wattan-2", "shoaa-wurud", "wattan-3"],
    reasonAr: "القسم هناك مركّز على الجلدية والليزر، والجلسات نفسها تنعمل فيه",
    clinicKey: "derm_laser",
    clinicAr: "الجلدية والليزر",
  },
  dermatology: {
    need: "dermatology",
    chain: ["wattan-2", "shoaa-wurud", "wattan-3"],
    reasonAr: "القسم هناك مركّز على الجلدية والليزر",
    clinicKey: "derm_laser",
    clinicAr: "الجلدية والليزر",
  },
  dental: {
    need: "dental",
    chain: ["wattan-2", "wattan-3", "shoaa-wurud", "wattan-4"],
    reasonAr: "الروابي فرع الأسنان والتقويم عندهم",
    clinicKey: "dental",
    clinicAr: "الأسنان",
  },
  orthodontics: {
    need: "orthodontics",
    chain: ["wattan-2", "wattan-3", "shoaa-wurud", "wattan-4"],
    reasonAr: "الروابي فرع الأسنان والتقويم عندهم",
    clinicKey: "ortho",
    clinicAr: "التقويم",
  },
  endodontics: {
    need: "endodontics",
    chain: ["wattan-3", "wattan-2"],
    reasonAr: "الربوة عندهم عيادة علاج جذور (حشو عصب)",
    clinicKey: "endo",
    clinicAr: "علاج الجذور",
  },
  paediatrics: {
    need: "paediatrics",
    chain: ["shoaa-wurud", "wattan-2", "shoaa-rawdah", "wattan-1"],
    reasonAr: "عيادة الأطفال عندهم، والصيدلية بنفس المبنى",
    clinicKey: "paeds",
    clinicAr: "الأطفال",
  },
  obgyn: {
    need: "obgyn",
    chain: ["wattan-2", "shoaa-wurud"],
    reasonAr: "عيادة النساء والولادة عندهم، وفيه دكتورات في الجدول",
    clinicKey: "obgyn",
    clinicAr: "النساء والولادة",
  },
  ent: {
    need: "ent",
    chain: ["wattan-2", "shoaa-wurud"],
    reasonAr: "عيادة الأنف والأذن والحنجرة عندهم",
    clinicKey: "ent",
    clinicAr: "الأنف والأذن والحنجرة",
  },
  orthopaedics: {
    need: "orthopaedics",
    chain: ["shoaa-wurud", "wattan-2"],
    reasonAr: "الجراحة وجراحة اليوم الواحد عندهم، والأشعة بنفس المبنى",
    clinicKey: "ortho_surgery",
    clinicAr: "العظام",
  },
  internal: {
    need: "internal",
    chain: ["shoaa-rawdah", "shoaa-wurud", "wattan-1"],
    reasonAr: "عيادة الباطنة عندهم",
    clinicKey: "internal",
    clinicAr: "الباطنة",
  },
  general: {
    need: "general",
    chain: ["shoaa-wurud", "wattan-2", "shoaa-rawdah"],
    reasonAr: "الكشف العام عندهم، والصيدلية بنفس المبنى",
    clinicKey: "general",
    clinicAr: "الكشف العام",
  },
  employment_medical: {
    need: "employment_medical",
    chain: ["shoaa-wurud", "shoaa-rawdah"],
    reasonAr: "شعاع الورود يسوّي فحوصات ما قبل التوظيف",
    clinicKey: "employment",
    clinicAr: "فحوصات ما قبل التوظيف",
  },
  neurology: {
    need: "neurology",
    chain: ["wattan-1"],
    reasonAr: "عيادة المخ والأعصاب مذكورة في فرع اليمامة",
    clinicKey: "neuro",
    clinicAr: "المخ والأعصاب",
  },
  after_hours: {
    need: "after_hours",
    chain: ["wattan-1", "shoaa-wurud"],
    reasonAr: "اليمامة فيه طوارئ وطبيب مناوب",
    clinicKey: "er",
    clinicAr: "الطوارئ",
  },
};

/** SPEC-1 §6.3 — FICTIONAL roster. Gender is a filter, never a recommendation (DOC-1). */
export interface SeedClinician {
  id: string;
  nameAr: string;
  gender: "female" | "male";
  clinicKey: string;
  siteIds: SiteId[];
  fictional: true;
}

export const CLINICIANS: readonly SeedClinician[] = [
  { id: "dr-albaqami", nameAr: "د. ريم البقمي", gender: "female", clinicKey: "derm_laser", siteIds: ["wattan-2"], fictional: true },
  { id: "dr-alkhatib", nameAr: "د. لينا الخطيب", gender: "female", clinicKey: "derm_laser", siteIds: ["wattan-2"], fictional: true },
  { id: "dr-alqarni", nameAr: "د. رنا القرني", gender: "female", clinicKey: "derm_laser", siteIds: ["shoaa-wurud"], fictional: true },
  { id: "dr-almutairi", nameAr: "د. فهد المطيري", gender: "male", clinicKey: "ortho", siteIds: ["wattan-2", "wattan-4"], fictional: true },
  { id: "dr-alharbi", nameAr: "د. نورة الحربي", gender: "female", clinicKey: "dental", siteIds: ["wattan-2"], fictional: true },
  { id: "dr-alghamdi", nameAr: "د. عمر الغامدي", gender: "male", clinicKey: "ent", siteIds: ["wattan-2"], fictional: true },
  { id: "dr-saadeldin", nameAr: "د. أميرة سعد الدين", gender: "female", clinicKey: "obgyn", siteIds: ["wattan-2"], fictional: true },
  { id: "dr-mansour", nameAr: "د. هالة منصور", gender: "female", clinicKey: "paeds", siteIds: ["wattan-2"], fictional: true },
  { id: "dr-alhamdan", nameAr: "د. عبدالرحمن الحمدان", gender: "male", clinicKey: "ortho_surgery", siteIds: ["shoaa-wurud"], fictional: true },
  { id: "dr-binomar", nameAr: "د. ليلى بن عمر", gender: "female", clinicKey: "obgyn", siteIds: ["shoaa-wurud"], fictional: true },
  { id: "dr-alhalabi", nameAr: "د. زياد الحلبي", gender: "male", clinicKey: "ent", siteIds: ["shoaa-wurud"], fictional: true },
  { id: "dr-abdeljalil", nameAr: "د. أنس عبد الجليل", gender: "male", clinicKey: "paeds", siteIds: ["shoaa-wurud"], fictional: true },
  { id: "dr-bashir", nameAr: "د. عثمان بشير", gender: "male", clinicKey: "employment", siteIds: ["shoaa-wurud", "shoaa-rawdah"], fictional: true },
  { id: "dr-aldakhil", nameAr: "د. هيفاء الدخيل", gender: "female", clinicKey: "paeds", siteIds: ["shoaa-rawdah"], fictional: true },
  { id: "dr-alnour", nameAr: "د. مصعب النور", gender: "male", clinicKey: "internal", siteIds: ["shoaa-rawdah"], fictional: true },
  { id: "dr-alfahad", nameAr: "د. جواهر الفهد", gender: "female", clinicKey: "dental", siteIds: ["shoaa-rawdah"], fictional: true },
  { id: "dr-altayeb", nameAr: "د. سلمى الطيب", gender: "female", clinicKey: "general", siteIds: ["shoaa-wurud", "wattan-4"], fictional: true },
];

/**
 * SPEC-1 §9.3 — the catalogue. ALL DEMO DATA.
 * `A` = demo_invented_anchored (against the 56–200 SAR consultation band)
 * `U` = demo_invented_unanchored
 * Rule PKG-1: every 6-session package is exactly 5 × the single session. Asserted
 * by `assertPackageRelationship()` below, which runs at module load — a drift
 * between the number and the sentence «باقة 6 جلسات بسعر 5» throws at import.
 */
export interface SeedPrice {
  id: string;
  nameAr: string;
  amount: number;
  basis: "demo_invented_anchored" | "demo_invented_unanchored";
  /** The single-session id a 6-session package is derived from (Rule PKG-1). */
  packageOf?: string;
}

export const PRICES: readonly SeedPrice[] = [
  { id: "consult-general", nameAr: "كشف طب عام / أسرة", amount: 90, basis: "demo_invented_anchored" },
  { id: "consult-paeds", nameAr: "كشف أطفال", amount: 120, basis: "demo_invented_anchored" },
  { id: "consult-internal", nameAr: "كشف باطنة", amount: 130, basis: "demo_invented_anchored" },
  { id: "consult-derm", nameAr: "كشف جلدية", amount: 150, basis: "demo_invented_anchored" },
  { id: "consult-ent", nameAr: "كشف أنف وأذن", amount: 150, basis: "demo_invented_anchored" },
  { id: "consult-eye", nameAr: "كشف عيون", amount: 150, basis: "demo_invented_anchored" },
  { id: "consult-obgyn", nameAr: "كشف نساء وولادة", amount: 170, basis: "demo_invented_anchored" },
  { id: "consult-neuro", nameAr: "كشف مخ وأعصاب", amount: 200, basis: "demo_invented_anchored" },

  { id: "laser-small-session", nameAr: "جلسة ليزر — منطقة صغيرة", amount: 150, basis: "demo_invented_unanchored" },
  { id: "laser-medium-session", nameAr: "جلسة ليزر — منطقة متوسطة", amount: 300, basis: "demo_invented_unanchored" },
  { id: "laser-large-session", nameAr: "جلسة ليزر — منطقة كبيرة", amount: 700, basis: "demo_invented_unanchored" },
  { id: "laser-full-session", nameAr: "جلسة ليزر — الجسم كامل", amount: 1200, basis: "demo_invented_unanchored" },
  { id: "laser-small-pkg6", nameAr: "باقة 6 جلسات ليزر — منطقة صغيرة", amount: 750, basis: "demo_invented_unanchored", packageOf: "laser-small-session" },
  { id: "laser-medium-pkg6", nameAr: "باقة 6 جلسات ليزر — منطقة متوسطة", amount: 1500, basis: "demo_invented_unanchored", packageOf: "laser-medium-session" },
  { id: "laser-large-pkg6", nameAr: "باقة 6 جلسات ليزر — منطقة كبيرة", amount: 3500, basis: "demo_invented_unanchored", packageOf: "laser-large-session" },
  { id: "laser-full-pkg6", nameAr: "باقة 6 جلسات ليزر — الجسم كامل", amount: 6000, basis: "demo_invented_unanchored", packageOf: "laser-full-session" },

  { id: "ortho-assessment", nameAr: "تقييم تقويم + أشعة وقياسات", amount: 300, basis: "demo_invented_unanchored" },
  { id: "ortho-metal", nameAr: "تقويم معدني — الفكين، شامل 18 شهر متابعة", amount: 6500, basis: "demo_invented_unanchored" },
  { id: "ortho-ceramic", nameAr: "تقويم سيراميك — الفكين، شامل 18 شهر متابعة", amount: 9000, basis: "demo_invented_unanchored" },
  { id: "dental-scaling", nameAr: "تنظيف وتلميع الأسنان", amount: 250, basis: "demo_invented_unanchored" },
  { id: "employment-basic", nameAr: "فحص ما قبل التوظيف — الأساسي", amount: 250, basis: "demo_invented_unanchored" },
];

/** Rule PKG-1, asserted mechanically rather than in a sentence. */
function assertPackageRelationship(): void {
  for (const p of PRICES) {
    if (!p.packageOf) continue;
    const single = PRICES.find((s) => s.id === p.packageOf);
    if (!single || p.amount !== single.amount * 5) {
      throw new Error(
        `[faysal] Rule PKG-1 violated: ${p.id} is ${p.amount} but 5 × ${p.packageOf} is ${
          single ? single.amount * 5 : "unknown"
        }. The sentence «باقة 6 جلسات بسعر 5» is pinned to these numbers.`,
      );
    }
  }
}
assertPackageRelationship();

/** SPEC-1 §10.2 — payers the dossier names. Aliases are how patients actually type them. */
export const CARRIERS: readonly { key: string; nameAr: string; aliases: string[] }[] = [
  { key: "bupa", nameAr: "بوبا", aliases: ["بوبا", "بوبه", "bupa"] },
  { key: "tawuniya", nameAr: "التعاونية", aliases: ["التعاونية", "التعاونيه", "تعاونية", "tawuniya"] },
  { key: "medgulf", nameAr: "ميدغلف", aliases: ["ميدغلف", "ميد غلف", "medgulf"] },
  { key: "walaa", nameAr: "ولاء", aliases: ["ولاء", "walaa"] },
  { key: "gulf-general", nameAr: "الخليجية العامة", aliases: ["الخليجية", "الخليجيه", "gulf general"] },
  { key: "saico", nameAr: "سايكو", aliases: ["سايكو", "saico"] },
  { key: "malath", nameAr: "ملاذ", aliases: ["ملاذ", "malath"] },
  { key: "united", nameAr: "المتحدة", aliases: ["المتحدة", "المتحده", "united"] },
  { key: "etihad", nameAr: "الاتحاد", aliases: ["الاتحاد", "etihad"] },
  { key: "enaya", nameAr: "عناية", aliases: ["عناية", "عنايه", "enaya"] },
  { key: "solidarity", nameAr: "سلامة", aliases: ["سلامة", "سلامه", "solidarity"] },
  // TPA discount cards — SPEC-1 §10.2. Never a percentage (Rule PRICE-4).
  { key: "takaful-arabia", nameAr: "تكافل العربية", aliases: ["تكافل العربية", "تكافل العربيه"] },
  { key: "takaful-watan", nameAr: "تكافل الوطن", aliases: ["تكافل الوطن"] },
];

/** SPEC-1 Rule DEMO-1(b) — the REAL booking numbers. Never invented, never omitted. */
export const REAL_CONTACTS = {
  unified: "920009303",
  whatsapp: "0504490460",
  emergency: "997",
} as const;

/** Ops-owned defaults — SPEC-2 §10. */
export const OPS = {
  arrivalBufferMinutes: 15,
  holdMinutes: 10,
} as const;
