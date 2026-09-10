// ============================================================================
// فيصل / Faysal — the roster and the specialty matrix. SPEC-1-DOMAIN.md §6.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  EVERY CLINICIAN IN THIS FILE IS FICTIONAL.                              │
// │  Every name, gender, language set, site assignment and schedule below is │
// │  INVENTED for demonstration purposes [DEMO-01]. None corresponds to any  │
// │  real person practising at Al Wattan Medical Group, Shoaa Medical        │
// │  Complex, or anywhere else. Any resemblance to a real clinician is       │
// │  unintended.                                                             │
// │                                                                          │
// │  PROHIBITION A (§0.3): the dossier names real, identifiable, licensed    │
// │  clinicians harvested from public Google reviews and social posts. Wiring │
// │  them into a fabricated booking system would attach invented availability │
// │  and invented fees to a real professional's licence. Their names are      │
// │  denylisted below and no name here collides with one.                    │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Rule DOC-1 — gender is a FILTER, never a recommendation.
// Rule DOC-2 — specialty and seniority only. No licence numbers, no
//              universities, no years of experience, no certifications.
// Rule DOC-3 — availability is bounded by bookableWindows(); this file states
//              capability, hours.ts states time, and neither reaches into the
//              other.
// ============================================================================

import type { Clinician, SiteId, SiteSpecialty, SpecialtyEvidence, SpecialtyKey } from "./types";

export const CLINICIANS: readonly Clinician[] = Object.freeze([
  // ── wattan-1 — Al Yamamah: neurology + emergency medicine emphasis ────────
  c("dr-aldosari", "د. عبدالله الدوسري", "Abdullah Al-Dosari", "male", "internal_medicine", ["ar", "en"], ["wattan-1"], "consultant"),
  c("dr-alotaibi", "د. منيرة العتيبي", "Munirah Al-Otaibi", "female", "general_family", ["ar", "en"], ["wattan-1"], "specialist"),
  c("dr-alshammari", "د. طارق الشمري", "Tariq Al-Shammari", "male", "emergency", ["ar", "en"], ["wattan-1"], "specialist"),
  c("dr-hegazy", "د. ياسمين حجازي", "Yasmin Hegazy", "female", "paediatrics", ["ar", "en"], ["wattan-1"], "consultant"),
  c("dr-alqahtani", "د. سامي القحطاني", "Sami Al-Qahtani", "male", "neurology", ["ar", "en"], ["wattan-1"], "consultant"),
  // Al Yamamah's §6.2 column names «نساء وولادة» and «مختبر وأشعة» at this
  // building, and until now neither had anybody in it. Al Yamamah mints no slots
  // today because Rule HRS-DEMO does not seed its hours, so the two empty clinics
  // were invisible — but the capability gate is what opens the door and the hours
  // gate is what times it, and the day the hours land the patient meets the
  // general-practice defect again, one clinic over. Staffing them now is the
  // cheaper half of that trade.
  c("dr-almuhanna", "د. عبير المهنا", "Abeer Al-Muhanna", "female", "obgyn", ["ar", "en"], ["wattan-1"], "consultant"),
  c("dr-alruwaili", "د. عادل الرويلي", "Adel Al-Ruwaili", "male", "obgyn", ["ar", "en"], ["wattan-1"], "specialist"),
  // §9.4 gives laboratory and radiology no price on purpose, so these two are
  // rostered against a capability the money path deliberately refuses. That is
  // the honest shape: the building really does name a lab, and quoting one is
  // what we may not do.
  c("dr-alkhuraiji", "د. شذى الخريجي", "Shatha Al-Khuraiji", "female", "lab_radiology", ["ar", "en"], ["wattan-1"], "consultant"),
  c("dr-alwuhaibi", "د. تركي الوهيبي", "Turki Al-Wuhaibi", "male", "lab_radiology", ["ar", "en"], ["wattan-1"], "specialist"),
  // Al Yamamah's internal medicine was a one-man clinic, so «أبغى دكتورة باطنية»
  // emptied the day here for the same reason it emptied it at the other two.
  c("dr-alshathri", "د. نوف الشثري", "Nouf Al-Shathri", "female", "internal_medicine", ["ar", "en"], ["wattan-1"], "specialist"),

  // ── wattan-2 — Ar Rawabi: derm/laser and dental heavy ─────────────────────
  c("dr-albaqami", "د. ريم البقمي", "Reem Al-Baqami", "female", "dermatology", ["ar", "en"], ["wattan-2"], "consultant", ["laser_aesthetics"]),
  c("dr-alkhatib", "د. لينا الخطيب", "Lina Al-Khatib", "female", "dermatology", ["ar", "en", "fr"], ["wattan-2"], "specialist", ["laser_aesthetics"]),
  c("dr-almutairi", "د. فهد المطيري", "Fahd Al-Mutairi", "male", "orthodontics", ["ar", "en"], ["wattan-2", "wattan-4"], "consultant"),
  c("dr-alharbi", "د. نورة الحربي", "Noura Al-Harbi", "female", "dentistry", ["ar", "en"], ["wattan-2"], "specialist"),
  c("dr-alghamdi", "د. عمر الغامدي", "Omar Al-Ghamdi", "male", "ent", ["ar", "en"], ["wattan-2"], "consultant"),
  c("dr-saadeldin", "د. أميرة سعد الدين", "Amira Saad El-Din", "female", "obgyn", ["ar", "en"], ["wattan-2"], "consultant"),
  c("dr-alzahrani", "د. بدر الزهراني", "Badr Al-Zahrani", "male", "ophthalmology", ["ar", "en"], ["wattan-2"], "specialist"),
  c("dr-mansour", "د. هالة منصور", "Hala Mansour", "female", "paediatrics", ["ar", "en"], ["wattan-2"], "specialist"),
  // «أبغى كشف عام» is the commonest way a patient opens, and the §6.2 matrix reads
  // `named_at_site` for family medicine at Ar Rawabi and at Shoaa Al Wurud. The
  // roster contradicted it: general practice was staffed only at Al Yamamah, Ar
  // Rabwah and Ash Shifa — precisely the three sites Rule HRS-DEMO does not seed —
  // so the capability gate opened onto an empty roster, and a patient standing in
  // Ar Rawabi asking for the commonest service in the building was told the branch
  // was still confirming its hours. The gap was here, not in hours.ts, and every
  // sentence downstream of it was therefore false about the wrong thing.
  //
  // A woman AND a man at each of the three, because «أبغى دكتورة» is a filter
  // (Rule DOC-1) and a filter that empties the day at a site is a refusal wearing
  // a filter's clothes.
  c("dr-alanazi", "د. لطيفة العنزي", "Latifa Al-Anazi", "female", "general_family", ["ar", "en"], ["wattan-2"], "specialist"),
  c("dr-aljasser", "د. سلطان الجاسر", "Sultan Al-Jasser", "male", "general_family", ["ar", "en"], ["wattan-2"], "general_practitioner"),
  // The family-medicine defect above, one need over and word for word. §6.2 reads
  // `named_at_site` for internal medicine at Ar Rawabi, at Shoaa Al Wurud and at
  // Al Yamamah — the whole of §5.3's internal-medicine chain — and not one of the
  // three had an internist. «أبغى دكتور باطنية» therefore minted nothing at the
  // branch the chain names FIRST, and the engine reported the silence as hours it
  // could not confirm: «دوامه قيد التأكيد» about a branch whose hours are seeded
  // and fine. No capability row is added for any of this, and none is needed —
  // unlike Ar Rawdah's family medicine, every site here was already named.
  c("dr-alshayea", "د. جمانة الشايع", "Jumanah Al-Shayea", "female", "internal_medicine", ["ar", "en"], ["wattan-2"], "consultant"),
  c("dr-alfawzan", "د. مازن الفوزان", "Mazen Al-Fawzan", "male", "internal_medicine", ["ar", "en"], ["wattan-2"], "specialist"),

  // ── wattan-3 — Ar Rabwah: endodontics ─────────────────────────────────────
  c("dr-alansari", "د. وليد الأنصاري", "Waleed Al-Ansari", "male", "endodontics", ["ar", "en"], ["wattan-3"], "consultant"),
  c("dr-alsaleh", "د. دانة الصالح", "Dana Al-Saleh", "female", "dentistry", ["ar", "en"], ["wattan-3"], "specialist"),
  c("dr-alsubaie", "د. ماجد السبيعي", "Majed Al-Subaie", "male", "internal_medicine", ["ar", "en", "ur"], ["wattan-3"], "specialist", ["general_family"]),
  c("dr-benyoussef", "د. عائشة بن يوسف", "Aisha Ben Youssef", "female", "dermatology", ["ar", "en", "fr"], ["wattan-3"], "specialist"),

  // ── wattan-4 — Ash Shifa: the orthodontics campaign ───────────────────────
  c("dr-alnuaimi", "د. إبراهيم النعيمي", "Ibrahim Al-Nuaimi", "male", "orthodontics", ["ar", "en"], ["wattan-4"], "consultant"),
  c("dr-altayeb", "د. سلمى الطيب", "Salma Al-Tayeb", "female", "general_family", ["ar", "en"], ["wattan-4"], "specialist"),
  c("dr-alajmi", "د. راكان العجمي", "Rakan Al-Ajmi", "male", "dentistry", ["ar", "en"], ["wattan-4"], "general_practitioner"),

  // ── shoaa-wurud — day-case surgery + employment medicals ──────────────────
  c("dr-alhamdan", "د. عبدالرحمن الحمدان", "Abdulrahman Al-Hamdan", "male", "general_surgery", ["ar", "en"], ["shoaa-wurud"], "consultant"),
  c("dr-binomar", "د. ليلى بن عمر", "Layla Bin Omar", "female", "obgyn", ["ar", "en"], ["shoaa-wurud"], "consultant"),
  c("dr-alshehri", "د. مها الشهري", "Maha Al-Shehri", "female", "obgyn", ["ar", "en"], ["shoaa-wurud"], "specialist"),
  c("dr-alhalabi", "د. زياد الحلبي", "Ziad Al-Halabi", "male", "ent", ["ar", "en"], ["shoaa-wurud"], "consultant"),
  c("dr-abdeljalil", "د. أنس عبد الجليل", "Anas Abdel-Jalil", "male", "paediatrics", ["ar", "en", "ur"], ["shoaa-wurud"], "consultant"),
  c("dr-alqarni", "د. رنا القرني", "Rana Al-Qarni", "female", "dermatology", ["ar", "en"], ["shoaa-wurud"], "specialist", ["laser_aesthetics"]),
  c("dr-bashir", "د. عثمان بشير", "Othman Bashir", "male", "employment_medicals", ["ar", "en", "ur"], ["shoaa-wurud", "shoaa-rawdah"], "specialist"),
  c("dr-alsuwailem", "د. غادة السويلم", "Ghada Al-Suwailem", "female", "general_family", ["ar", "en"], ["shoaa-wurud"], "specialist"),
  c("dr-albarrak", "د. خالد البراك", "Khalid Al-Barrak", "male", "general_family", ["ar", "en"], ["shoaa-wurud"], "general_practitioner"),
  c("dr-alqathami", "د. بشاير القثامي", "Bashayer Al-Qathami", "female", "internal_medicine", ["ar", "en"], ["shoaa-wurud"], "specialist"),
  c("dr-alduraiham", "د. يوسف الدريهم", "Yousef Al-Duraiham", "male", "internal_medicine", ["ar", "en"], ["shoaa-wurud"], "consultant"),
  // Dentistry is `named_at_site` here and §5.3's dental chain ends at this
  // branch, so a patient who has refused Ar Rawabi lands on an empty dental
  // clinic — the same product of a true capability and an absent roster.
  c("dr-almuqbil", "د. رغد المقبل", "Raghad Al-Muqbil", "female", "dentistry", ["ar", "en"], ["shoaa-wurud"], "specialist"),
  c("dr-alturaif", "د. نايف الطريف", "Naif Al-Turaif", "male", "dentistry", ["ar", "en"], ["shoaa-wurud"], "general_practitioner"),

  // ── shoaa-rawdah — Ar Rawdah ──────────────────────────────────────────────
  c("dr-aldakhil", "د. هيفاء الدخيل", "Haifa Al-Dakhil", "female", "paediatrics", ["ar", "en"], ["shoaa-rawdah"], "consultant"),
  c("dr-alnour", "د. مصعب النور", "Musab Al-Nour", "male", "internal_medicine", ["ar", "en"], ["shoaa-rawdah"], "specialist"),
  c("dr-alfahad", "د. جواهر الفهد", "Jawaher Al-Fahad", "female", "dentistry", ["ar", "en"], ["shoaa-rawdah"], "specialist"),
  c("dr-alhumaidi", "د. أروى الحميدي", "Arwa Al-Humaidi", "female", "general_family", ["ar", "en"], ["shoaa-rawdah"], "specialist"),
  c("dr-alsudairi", "د. مشعل السديري", "Mishal Al-Sudairi", "male", "general_family", ["ar", "en"], ["shoaa-rawdah"], "general_practitioner"),
]);

function c(
  id: string,
  nameAr: string,
  nameEn: string,
  gender: Clinician["gender"],
  specialty: SpecialtyKey,
  languages: Clinician["languages"],
  siteIds: SiteId[],
  seniority: Clinician["seniority"],
  subSpecialties: SpecialtyKey[] = []
): Clinician {
  // `fictional: true` is a LITERAL type on Clinician — a false value does not
  // compile (§14 criterion 13). It is set here, once, for every record.
  return { id, nameAr, nameEn, gender, specialty, subSpecialties, languages, siteIds, seniority, fictional: true };
}

export function clinicianById(id: string): Clinician | null {
  return CLINICIANS.find((x) => x.id === id) ?? null;
}

/** Clinicians at a site who can deliver a given specialty (incl. sub-specialty). */
export function cliniciansFor(siteId: SiteId, specialty: SpecialtyKey): Clinician[] {
  return CLINICIANS.filter(
    (x) =>
      x.siteIds.includes(siteId) &&
      (x.specialty === specialty || x.subSpecialties.includes(specialty))
  );
}

// ── §6.4 — the denylist. REAL people named in the dossier. ──────────────────
//
// Rule DOC-4: a build-failing test scans seed data, prompt templates, fixtures,
// eval sets AND the assembled prompt bundle for these strings — normalised with
// the AUTHORITATIVE `normalizeAr` (lib/ai/allergen-gate.ts L19–31, to be
// re-exported from lib/util/arabic-normalize.ts after SPEC-3 §10.2's
// extraction), NOT `norm()` from order-pricing.ts, which folds tashkeel and
// tatweel only and would pass «هبه احمد» silently.
//
// Matching discipline, both halves required:
//   • multi-token entries → FULL-NAME CONTAINMENT after normalisation
//     (token matching flags the particle «ال»/"al" against most of the invented
//      names, after which someone loosens the test and the guard is gone)
//   • mononyms («نورين») → BOUNDARY-MATCHED single token
//
// The list lives here, beside the roster it protects. The build-time scan that
// consumes it is a cross-cutting guard and belongs with the safety rail owner
// (lib/health/safety/), which also owns the normaliser dependency.
export const REAL_CLINICIAN_DENYLIST: readonly string[] = Object.freeze([
  "Heba Ahmed",
  "Ahmed Sayed Mustafa",
  "Noreen",
  "Huda Al-Rashidi",
  "Sarah Al-Jundi",
  "Hanan Ali",
  "هبة أحمد",
  "أحمد سيد مصطفى",
  "نورين",
  "هدى الرشيدي",
  "سارة الجندي",
  "حنان علي",
]);

/** Entries with no surname; these need boundary matching, not containment. */
export const DENYLIST_MONONYMS: readonly string[] = Object.freeze(["Noreen", "نورين"]);

// ── §6.2 — the specialty matrix ─────────────────────────────────────────────
//
// N = named at site · G = group-wide only · I = inferred · — = no evidence
//
// Rule SPEC-1: ONLY `named_at_site` is bookable. `group_only` and `inferred`
// are CONVERSATIONAL — "the group lists urology across its complexes, let me
// confirm which branch runs that clinic." That is Invariant H2 applied to
// capability instead of time, and for the same reason.

type Code = "N" | "G" | "I" | "-";

const SITE_ORDER: readonly SiteId[] = ["wattan-1", "wattan-2", "wattan-3", "wattan-4", "shoaa-wurud", "shoaa-rawdah"];

/* eslint-disable no-multi-spaces */
const MATRIX: Record<SpecialtyKey, readonly Code[]> = {
  //                     W1   W2   W3   W4   Wurud Rawdah
  general_family:       ["N", "N", "I", "G", "N", "G"],
  internal_medicine:    ["N", "N", "G", "G", "N", "G"],
  paediatrics:          ["N", "N", "G", "G", "N", "G"],
  // Shoaa Al Wurud's OB-GYN was `N` on the strength of a review naming a
  // DENYLISTED clinician, which Rule STR-1 forbids as a basis. §6.2 fn3 / audit
  // S10 says the entry "should read G — recorded here so the next pass does it
  // deliberately". This is that pass, and this is deliberate: the women's-health
  // path with a female clinician runs at Ar Rawabi instead, and one line flips
  // back the day [OPEN-02] is answered.
  obgyn:                ["N", "N", "G", "G", "G", "G"],
  ent:                  ["G", "N", "G", "G", "N", "G"],
  ophthalmology:        ["G", "N", "G", "G", "G", "G"],
  dermatology:          ["G", "N", "I", "G", "N", "G"],
  laser_aesthetics:     ["G", "N", "I", "G", "N", "G"],
  dentistry:            ["G", "N", "N", "G", "N", "G"],
  orthodontics:         ["G", "N", "G", "N", "G", "G"],
  endodontics:          ["-", "G", "N", "-", "G", "-"],
  orthopaedics:         ["G", "G", "G", "G", "G", "G"],
  neurology:            ["N", "-", "-", "-", "G", "-"],
  urology:              ["G", "G", "G", "G", "G", "G"],
  general_surgery:      ["G", "G", "G", "G", "N", "G"],
  emergency:            ["N", "G", "G", "-", "N", "N"],
  lab_radiology:        ["N", "G", "I", "G", "G", "G"],
  employment_medicals:  ["G", "G", "G", "G", "N", "G"],
};
/* eslint-enable no-multi-spaces */

const CODE_TO_EVIDENCE: Record<Code, SpecialtyEvidence> = {
  N: "named_at_site",
  G: "group_only",
  I: "inferred",
  "-": "absent",
};

/**
 * Rule HRS-DEMO's logic, applied to CAPABILITY — the same defect, third
 * instance, resolved the same way.
 *
 * Ar Rawdah is one of the three sites DOC-3 names as demo inventory, yet its
 * whole matrix column is `G`, so under Rule SPEC-1 it would book nothing however
 * good its hours were. The demo's invented roster IS the capability claim there,
 * so it is stamped as invented — accepted ONLY under DEMO_MODE, exactly like a
 * `demo_seeded` hours record, and never spoken as an Al Wattan fact.
 *
 * Family medicine joins the list for exactly the reason the other four are on it,
 * and for no new one: Ar Rawdah now carries two invented family-medicine
 * clinicians, and without a row here they would be a roster nobody can book —
 * the mirror image of the defect the Ar Rawabi entries above were added to fix.
 *
 * Shoaa Al Wurud's OB-GYN is deliberately NOT on this list: re-adding it here
 * would smuggle back the path the S10 downgrade above removed on purpose.
 */
const DEMO_SEEDED_CAPABILITY: ReadonlyArray<{ siteId: SiteId; specialty: SpecialtyKey }> = Object.freeze([
  { siteId: "shoaa-rawdah", specialty: "paediatrics" },
  { siteId: "shoaa-rawdah", specialty: "internal_medicine" },
  { siteId: "shoaa-rawdah", specialty: "dentistry" },
  { siteId: "shoaa-rawdah", specialty: "employment_medicals" },
  { siteId: "shoaa-rawdah", specialty: "general_family" },
]);

export function specialtyEvidence(siteId: SiteId, specialty: SpecialtyKey): SpecialtyEvidence {
  const row = MATRIX[specialty];
  if (!row) return "absent";
  const i = SITE_ORDER.indexOf(siteId);
  if (i < 0) return "absent";
  return CODE_TO_EVIDENCE[row[i]];
}

export function siteSpecialty(siteId: SiteId, specialty: SpecialtyKey): SiteSpecialty {
  return {
    siteId,
    specialty,
    evidence: specialtyEvidence(siteId, specialty),
    dossierRef: "§6.2",
  };
}

export function isDemoSeededCapability(siteId: SiteId, specialty: SpecialtyKey): boolean {
  return DEMO_SEEDED_CAPABILITY.some((r) => r.siteId === siteId && r.specialty === specialty);
}

/**
 * Rule SPEC-1 — the bookability gate for CAPABILITY. `group_only` and
 * `inferred` are conversational, never bookable: the group offering
 * ophthalmology somewhere is not evidence that Ar Rawdah has an
 * ophthalmologist on Tuesday.
 */
export function isBookableSpecialty(
  siteId: SiteId,
  specialty: SpecialtyKey,
  demoMode: boolean
): boolean {
  if (specialtyEvidence(siteId, specialty) === "named_at_site") return true;
  return demoMode && isDemoSeededCapability(siteId, specialty);
}
