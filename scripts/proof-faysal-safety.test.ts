// ============================================================================
// PROOF — فيصل / Faysal MEDICAL SAFETY RAIL. Both mirrors, both directions.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-faysal-safety.test.ts
//
// WHY THIS FILE EXISTS: §2.0's LAW WAS ASYMMETRIC, AND THE ASYMMETRY SHIPPED TWO FALSE-
// POSITIVE FAMILIES INTO EMERGENCY CLASSES.
//
// SPEC-4 §2.0 L6 mirrors every entry on every Fires list into MUST_FIRE, mechanically, and a
// rule narrower than its own list goes red. It mirrored NOTHING into MUST_BE_QUIET. L3
// separately MANDATES that every predicate set be enumerated. Put together, enumeration
// became the mechanism by which false positives entered, with no law pointing the other way:
//
//   «الموعد ما نفسه اللي حجزته»   the appointment isn't the one I booked  → AIRWAY EMERGENCY
//   «أخذت الدواء الصبح»            I took the medicine this morning        → POISONING EMERGENCY
//   «أموت على المندي»              I'm dying for mandi (an idiom of love)  → THE SUICIDE RAIL
//
// Each of those hands the patient 997 and an ambulance instruction, pages a human P0, and
// opens a booking lock that ONLY A NAMED OPERATOR CAN RELEASE (§1.5 R2 H-5). A false positive
// in these classes is not a bad turn; it is an outage for that patient.
//
// §2.0 L8 — THE PRECISION MIRROR — is the law that closes it, and this file is that law
// executed: every enumerated TERM / SITE / PREDICATE / STANDALONE member must be PAIRED with
// an ordinary clinic sentence that carries it WITHOUT the finding, and this proof FAILS if a
// member has no pairing.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE QUIET CORPUS COVERS, AND WHAT IT DOES NOT. READ THIS BEFORE YOU TRUST A GREEN RUN.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// THE QUIET SIDE IS GENERATED FROM ORDINARY CLINIC ARABIC, NOT FROM THE DETECTOR'S OWN AXES,
// AND THE DIFFERENCE IS THE WHOLE POINT. It is not an argument, it is a measurement made one
// wave earlier in this repo: in `scripts/proof-airway-derivation.test.ts` §8c, all 6,321
// axis-derived quiet assertions read IDENTICALLY on the pre-widening module and on the
// widened module that shipped 3,993 false positives — so not one of them could have
// constrained the change, and that proof read "zero false positives" the entire time. A
// corpus derived from the firing side proves the slots do not leak sideways. It can prove
// NOTHING about a word the rule now matches for a reason no axis names: «نفس» is also "the
// same", «حبوب» is also pimples, «حامل» is also a card-holder, «أموت على» is also enthusiasm.
// Those are properties of ARABIC. Only a corpus generated from Arabic finds them.
//
// So §Q crosses BOOKING, INSURANCE, DIRECTIONS, COMPLAINTS, PRICES and PHARMACY vocabulary
// through the homographs that caused these bugs, and §M drives the whole thing through
// MUTANT rules derived from the live lexicon — in BOTH directions.
//
// IT CONSTRAINS: VOCABULARY, inside the SYNTACTIC FRAMES WRITTEN HERE, in ARABIC.
//
// IT DOES NOT CONSTRAIN, AND EACH OF THESE IS A NAMED GAP AND NOT A THEORETICAL ONE:
//
//   WORD ORDER. Arabic has both N–V and V–N and most families here are written in one. The
//   sibling proof records a widening that made 3,168 ordinary strings fire with the whole
//   suite green, caught in one word order and invisible in the other. Adding a VALUE to a
//   family here is constrained; adding a FRAME is not, and this file cannot tell you which
//   one you just did.
//
//   SCRIPT. §Q is Arabic by construction. The English/franco arms (§2.1, §2.4, §2.9) have
//   only their own Fires entries and the near-miss rows; there is NO ordinary-clinic-ENGLISH
//   corpus here. The sibling proof read "zero false positives" through a widening of an
//   English arm that fired on 616 of 1,325 ordinary strings. If the English arms are widened,
//   NOTHING HERE WILL OBJECT. Arabizi (`ma agdar atnafas`, `abi amoot`) is a third surface
//   with its own homographs and is not reached at all.
//
//   REGISTER AND CHANNEL. Every string here is a patient or a parent typing to a clinic on
//   WhatsApp. Voice transcripts, operator replies and forwarded text arrive on other paths;
//   §11.9's wiring meta-proof is what covers those, and it is not this file.
//
//   CLINICAL TRUTH. Nothing here can say a threshold is right. §12 is fifteen — now
//   seventeen — rows of signatures, all of them empty.
//
// THE RULE THAT FOLLOWS: A GREEN RUN IS EVIDENCE ABOUT A VALUE, NOT ABOUT A FRAME.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectRedFlag, isFaysalSafetyInbound, DETECTOR_EXCEPTION,
  CLASSES, everyEnumeratedMember,
  AIRWAY, CARDIAC, HEMORRHAGE, INFANT_FEVER, POISONING, SELF_HARM, STROKE, TRAUMA,
  emergencyRail, eligibleErSites, railCopyViolations, SUPPORT_LINE_SENTENCE, RAIL_B,
  isTriageHeld, checkBookingTriageHold, releaseTriageHold,
  COMMITTED_APPOINTMENT_STATES, OPEN_TRIAGE_HOLD_PATCH,
  normalizeForSafety, foldDigits,
  type ErSite, type RedFlagHit,
} from "../lib/health/safety/index.ts";
import { adj, termRe, has, pick } from "../lib/health/safety/match.ts";
import { normalizeAr, detectAllergenAvoidance } from "../lib/ai/allergen-gate.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); if (fails.length <= 40) console.log(`  FAIL ${label}`); }
};

const fires = (t: string) => detectRedFlag(t) !== null;

/** Cartesian product of the slots, joined with single spaces, empties collapsed. */
const cross = (...axes: string[][]): string[] =>
  axes
    .reduce<string[][]>((acc, ax) => acc.flatMap((p) => ax.map((v) => [...p, v])), [[]])
    .map((p) => p.filter((x) => x !== "").join(" ").replace(/\s+/g, " ").trim())
    .filter((s) => s !== "");

/** Every string any section asserts quiet, kept so §M can re-drive the WHOLE set through the
 *  mutants rather than a sample of it. */
const everyQuiet: Array<[string, string]> = [];
const QUIET_BY_FAMILY = new Map<string, string[]>();
const addQuiet = (family: string, ...items: string[]) => {
  const bucket = QUIET_BY_FAMILY.get(family) ?? [];
  bucket.push(...items);
  QUIET_BY_FAMILY.set(family, bucket);
};

let mustFireTotal = 0;
let mustQuietTotal = 0;

const everyMustFire: string[] = [];
const mustFire = (section: string, corpus: string[]) => {
  everyMustFire.push(...corpus);
  const silent = corpus.filter((t) => !fires(t));
  for (const t of silent) ok(`${section}: «${t}» is SILENT`, false);
  pass += corpus.length - silent.length;
  mustFireTotal += corpus.length;
  console.log(`   ${String(corpus.length).padStart(5)} derived · ${corpus.length - silent.length} fire · ${silent.length} silent   ${section}`);
};

const mustBeQuiet = (section: string, corpus: string[]) => {
  for (const t of corpus) everyQuiet.push([section, t]);
  const loud = corpus.filter(fires);
  for (const t of loud) {
    const h = detectRedFlag(t)!;
    ok(`${section}: «${t}» FIRED ${h.class}/${h.tier} [${h.ruleId}] on «${h.termAr}»`, false);
  }
  pass += corpus.length - loud.length;
  mustQuietTotal += corpus.length;
  console.log(`   ${String(corpus.length).padStart(5)} driven  · ${corpus.length - loud.length} quiet · ${loud.length} fired    ${section}`);
};

// ═══ §N — THE NORMALIZATION DISCIPLINE (§2.0 L6, blocker T1) ════════════════════════════════
// L6 said two incompatible things: "term lists are normalized at build time" AND "§11.1
// asserts list === list.map(normalizeAr)". If the build normalizes, the assertion is vacuous;
// if the assertion is real, the lists must be WRITTEN normalized. The build-time clause is
// struck, and THIS is the assertion. It was red at birth against the document's own lists —
// 58 entries in 7 of 9 classes, including the one §2.8's correction note claimed to have
// fixed, and it took B4's ACS-with-diaphoresis fix down with it.
console.log("\n── §N  EVERY OPERATIVE SET IS WRITTEN NORMALIZED ───────────────");
{
  let members = 0, bad = 0;
  for (const c of CLASSES) {
    for (const [set, list] of Object.entries(c.sets)) {
      for (const m of list) {
        members++;
        if (/^[\x20-\x7e]+$/.test(m)) continue;   // the English/franco arms are not Arabic
        if (normalizeAr(m) !== m) { bad++; ok(`§N ${c.cls}.${set}: «${m}» ≠ normalizeAr → «${normalizeAr(m)}»`, false); }
      }
    }
  }
  pass += members - bad;
  console.log(`   ${members} enumerated members · ${members - bad} normalized · ${bad} dead`);
  ok(`all ${members} operative set members are normalizeAr-stable`, bad === 0);

  // …AND THE DIGIT FOLD, which is the Faysal addition to §1.1's normalizer. «حرارته ٣٩» and
  // «حرارته 39» are the same sentence; a rule that sees one protects one tenant profile by
  // accident. Driven rather than asserted in prose: `normalizeAr` alone does NOT do this.
  ok("foldDigits maps ٣٩ → 39", foldDigits("حرارته ٣٩") === "حرارته 39");
  ok("foldDigits maps ٣٨٫٥ → 38.5", foldDigits("٣٨٫٥") === "38.5");
  ok("normalizeAr alone does NOT fold Arabic-Indic digits (so the fold is load-bearing)",
    normalizeAr("حرارته ٣٩") === "حرارته ٣٩");
  ok("normalizeForSafety folds and normalizes", normalizeForSafety("حَرَارَته ٣٩") === "حرارته 39");
}

// ═══ §F — MUST_FIRE, GENERATED FROM THE FIRES LISTS (§2.0 L6) ═══════════════════════════════
console.log("\n── §F  THE L6 MIRROR: every Fires entry → one assertion ────────");
{
  // ONE FIRES-LIST ENTRY TO ONE ASSERTION, and the proof fails if an entry has no assertion.
  // Twice a section listed a string under Fires and shipped a rule silent on it — «الجرح عميق
  // والدم فوار» in Wave 1, «تقيأت دم» and «دم مع البول» in Wave 1.5 — and both times the
  // section's own driven corpus read 32/32 or 34/34 BECAUSE THE FAILING ENTRY WAS NOT IN IT.
  let entries = 0, wrong = 0;
  for (const c of CLASSES) {
    for (const e of c.fires) {
      entries++;
      const want = e.cls ?? c.cls;
      const h = detectRedFlag(e.text);
      if (!h) { wrong++; ok(`§F ${c.cls}: «${e.text}» is SILENT on its own Fires list`, false); continue; }
      if (h.class !== want) { wrong++; ok(`§F ${c.cls}: «${e.text}» → class ${h.class}, want ${want}`, false); continue; }
      if (h.tier !== e.tier) { wrong++; ok(`§F ${c.cls}: «${e.text}» → tier ${h.tier}, want ${e.tier}`, false); continue; }
      // The audit row must be able to name a term without storing the sentence (§6.4).
      if (!h.termAr || e.text.length > 0 && h.termAr.length === 0) { wrong++; ok(`§F ${c.cls}: «${e.text}» has no termAr`, false); continue; }
    }
  }
  pass += entries - wrong;
  mustFireTotal += entries;
  console.log(`   ${entries} Fires entries · ${entries - wrong} correct class AND tier · ${wrong} wrong`);
  ok(`every Fires-list entry in §2.1–§2.9 fires with its stated class and tier`, wrong === 0);

  // ACCEPTED OVER-FIRES ARE MUST_FIRE ROWS WITH AN ANNOTATION, NEVER NEAR-MISSES. Putting one
  // in the quiet corpus is how a rule gets narrowed to make a proof green.
  const accepted = CLASSES.flatMap((c) => c.fires.filter((e) => e.acceptedOverFire).map((e) => [c.cls, e] as const));
  console.log(`   ${accepted.length} ACCEPTED OVER-FIRES, each annotated and carried to §12:`);
  for (const [cls, e] of accepted) {
    console.log(`      [${cls}] «${e.text}»`);
    ok(`accepted over-fire «${e.text}» fires (and is NOT in the quiet corpus)`, fires(e.text));
  }
  ok("every accepted over-fire carries a written reason", accepted.every(([, e]) => (e.acceptedOverFire ?? "").length > 40));
}

// ═══ §F2 — THE CROSS PRODUCTS THE FIRES LISTS ONLY SAMPLE ═══════════════════════════════════
console.log("\n── §F2  NEGATION × ABILITY × PERSON, and the third person ──────");
{
  // A SLOT WITH ONE VALUE IN IT is how «مو قادر أتنفس» — the most natural Najdi way this
  // product's own patients say "I can't breathe" — was silent while «ما أقدر أتنفس» fired.
  // A list of sentences somebody thought of cannot find that, because the sentences somebody
  // thinks of are the ones already in the code. So the airway family is DERIVED.
  const NEG = ["ما", "مو", "موب", "مب", "ماني", "مش"];
  const NO_LONGER = ["", "عاد"];
  const ABLE = ["", "أقدر", "اقدر", "يقدر", "تقدر", "قادر", "قادرة", "عارف"];
  const BREATHE = ["أتنفس", "اتنفس", "يتنفس", "تتنفس", "نتنفس"];
  const PERSON = ["", "ابني", "بنتي", "ولدي", "الطفل", "زوجتي", "أمي", "طفلي"];
  mustFire("§F2 airway: PERSON × NEG × NO_LONGER × ABLE × BREATHE",
    [...new Set(cross(PERSON, NEG, NO_LONGER, ABLE, BREATHE))]);

  // The body-part × verb product, in THREE PERSONS. The inherited machinery is FIRST PERSON
  // ONLY — every body term in it carries the possessive «ي» — so in a paediatric clinic a
  // father could not report his son at all. Driven against the real Kivo detector, fourteen
  // «*** DEFECT *** quiet» lines.
  mustFire("§F2 airway: (throat ∪ lips ∪ face) × (closing ∪ swelling)",
    [...new Set(cross(
      [...AIRWAY.sets.THROAT, ...AIRWAY.sets.LIPS_TONGUE, ...AIRWAY.sets.FACE_EYES] as string[],
      [...AIRWAY.sets.CLOSING, ...AIRWAY.sets.SWELLING] as string[],
    ))]);
  mustFire("§F2 airway: cyanosis subject × blue",
    [...new Set(cross(AIRWAY.sets.CYANOSIS_SUBJ as string[], AIRWAY.sets.BLUE as string[]))]);

  // §2.1 — every chest TERM against every pain / pressure / tightness / burning predicate.
  // The definite-article forms are half of this product and the class was deaf to ALL of it
  // until B4; under the LITERAL reading of the un-normalized `ألم` it went deaf again (T1).
  mustFire("§F2 cardiac: TERM × PREDICATE",
    [...new Set(cross(
      ["", "عندي", "حاس ب", "زوجي يشتكي من"],
      CARDIAC.sets.TERM as string[],
      [...CARDIAC.sets.PRED_PAIN, ...CARDIAC.sets.PRED_PRESSURE, ...CARDIAC.sets.PRED_TIGHT, ...CARDIAC.sets.PRED_BURNING] as string[],
    ))]);

  // §2.2 — every body TERM against every failure-of-function predicate.
  mustFire("§F2 stroke: TERM × PREDICATE.failure",
    [...new Set(cross(STROKE.sets.TERM as string[], STROKE.sets.PRED_FAILURE as string[]))]);

  // §2.3 — every blood/bleed TERM against every persistence / volume / character predicate.
  mustFire("§F2 hemorrhage: TERM × PREDICATE",
    [...new Set(cross(
      ["", "الجرح", "عندي"],
      HEMORRHAGE.sets.TERM.filter((t) => t !== "رعاف") as string[],
      [...HEMORRHAGE.sets.PRED_PERSIST, ...HEMORRHAGE.sets.PRED_VOLUME, ...HEMORRHAGE.sets.PRED_CHARACTER] as string[],
    ))]);

  // §2.7 — every SWALLOW verb against every poison object, in three persons.
  mustFire("§F2 poisoning: PERSON × SWALLOW × POISON",
    [...new Set(cross(
      ["", "ابني", "بنتي", "الطفل"],
      POISONING.sets.VERB_SWALLOW as string[],
      POISONING.sets.SITE_POISON as string[],
    ))]);

  // §2.6 — every infant marker against a fever term and a value ≥ 38.
  mustFire("§F2 infant_fever: marker × fever term × value",
    [...new Set(cross(
      INFANT_FEVER.sets.PRED_INFANT as string[],
      ["حرارته", "حرارتها", "سخونته عالية و حرارته"],
      ["39", "38.5", "40", "٣٩"],
    ))]);

  // §2.8 — phrases only, and each phrase inside an ordinary run-on message, because a phrase
  // matched with a bare lookbehind is silent behind a «و» or a «ب» (§2.0 L7).
  mustFire("§F2 trauma: STANDALONE inside a run-on message",
    [...new Set(cross(["", "ابني", "السلام عليكم", "لو سمحت"], TRAUMA.sets.STANDALONE as string[], ["", "وش اسوي", "بسرعة"]))]);
}

// ═══ §Q — THE QUIET CORPUS, GENERATED FROM ORDINARY CLINIC ARABIC ═══════════════════════════
// NOT FROM THE DETECTOR'S AXES. See the header: an axis-derived quiet side reads the same
// before and after the widening it is supposed to constrain, and that has been measured, not
// argued. So this starts from the OTHER END — the vocabulary a clinic inbox actually
// receives — and crosses it DELIBERATELY THROUGH THE HOMOGRAPHS THAT CAUSED THE BUGS:
//
//   «نفس»    breath · self · THE SAME        «حبوب»   pills · grains · PIMPLES
//   «دوا»    poison-able · MEDICINE          «أموت»   I die · I LOVE IT
//   «حامل»   pregnant · CARD-HOLDER          «ربو»    asthma · inside «الربوة», a BRANCH NAME
//   «شفا»    lip-stem · «الشفا», a BRANCH     «شلل»    paralysis · «شلل الأطفال», the VACCINE
//   «صدر»    chest · WAS ISSUED · breast     «دم»     blood · inside «قدم», «عدم», «تقديم»
//   «كسر»    fracture · «الكسر العشري»       «حادث»   accident · «الحوادث», the ER DEPARTMENT
//   «بلع»    swallow · «البلعوم», the pharynx «تشنج»  convulsion · a MUSCLE SPASM
//
console.log("\n── §Q  ORDINARY CLINIC ARABIC, DERIVED FROM ITS OWN VOCABULARY ─");
{
  // ── the vocabulary, written AS VOCABULARY and not as sentences ──
  const THING = ["الموعد", "الحجز", "التقرير", "الملف", "الفاتورة", "السعر", "الفرع", "الرقم",
    "الطلب", "النتيجة", "التحليل", "الأشعة", "الوصفة", "التأمين", "الدور", "الجدول"];
  const ASK = ["كم سعر", "وش سعر", "بكم", "متى", "وين", "كيف أعرف", "هل يغطي التأمين"];
  const WANT = ["أبغى", "أبي", "ودي", "نبي", "ممكن"];
  const SERVICE = ["موعد", "حجز", "كشف", "استشارة", "متابعة", "تطعيم", "تحليل", "أشعة", "تقرير طبي", "مراجعة"];
  const WHO = ["ابني", "بنتي", "ولدي", "طفلي", "طفلتي", "زوجتي", "زوجي", "أمي", "أبوي",
    "الوالدة", "أخوي", "أختي", "جدي", "جدتي", "رضيعي"];
  const COMPLAINT = ["تأخر", "ما رد أحد", "الزحمة", "الانتظار طويل", "المواقف مليانة", "ما وصلني تأكيد"];
  const INSURER = ["بوبا", "التعاونية", "ميدغلف", "الراجحي تكافل"];
  const SITE = ["الربوة", "الشفا", "اليمامة", "الروابي", "الورود", "الروضة"];

  // Q1. «نفس» = THE SAME, and «ما» hiding inside an ordinary adverb in front of it. THE T2
  //     FAMILY. Every one of these carries the exact shape ARM 1 matched when `نفسه` was in
  //     BREATHE, and «الموعد ما نفسه اللي حجزته» is the sentence that raised an airway
  //     emergency and an operator-release-only booking lock on a wrong booking.
  const MA_FINAL = ["دايما", "دائما", "عموما", "لما", "كما", "بينما", "طالما", "عندما", "مهما", "حينما"];
  addQuiet("Q1 «نفس»=the same, negated — THE T2 FAMILY",
    ...cross(THING, ["ما", "مو", "مب", "مش"], ["نفسه", "نفسها"],
      ["", "اللي حجزته", "المعلن", "المسجل", "اللي رحت له", "اللي طلبته"]));
  addQuiet("Q1 «نفس»=the same, «ما» inside a word",
    ...cross(["", "احنا", "كنا"], MA_FINAL, ["ناخذ", "نأخذ", "ياخذ", "نطلب"], ["نفس"], THING));
  addQuiet("Q1 «نفسه»=itself, on an object",
    ...cross(THING, ["نفسه", "نفسها"], ["واقف", "ما تم", "ناقص", "متأخر", "منتهي"]));
  addQuiet("Q1 «نفس»=the same after a difficulty word",
    ...cross(["عندي صعوبة", "فيه صعوبة", "صعوبة"], ["في", "ب", "ف"], ["نفس"], THING));

  // Q2. «حبوب» / «دوا» / «دواء» / «علاج» WITH A TAKE VERB. THE T3 FAMILY. Taking prescribed
  //     medicine is what a hypertensive patient does every morning, and it raised a poisoning
  //     emergency because the pills-only exclusion covered ONE object out of fifteen.
  const TAKE = ["أخذت", "آخذ", "تناولت", "أكلت", "أخذ", "تناول"];
  const MED = ["الدواء", "الدوا", "دوا الضغط", "دواء الحساسية", "العلاج", "الحبوب", "حبوب الضغط"];
  addQuiet("Q2 TAKE × MEDICATION — THE T3 FAMILY",
    ...cross(["", "ابني", "بنتي", "أمي"], TAKE, MED,
      ["", "الصبح", "بعد الأكل", "على وقته الحمدلله", "زي ما قال الدكتور", "مع المويه اليوم"]));
  addQuiet("Q2 «حبوب» = pills · grains · PIMPLES",
    ...cross(["", "عندي", "وجهي فيه", "ابغى"], ["حبوب"],
      ["منع الحمل", "كاملة", "في وجهي", "الضغط", "فيتامين", "الحديد"]));
  addQuiet("Q2 pharmacy traffic", ...cross(ASK, ["الدواء", "العلاج", "الروشتة", "البخاخ", "المرهم"], ["؟", ""]));
  addQuiet("Q2 «البخاخ» with NO failure — ARM 7b's quiet side",
    ...cross(["أبغى تجديد", "كم سعر", "خلص عندي", "وش الفرق بين", "متوفر عندكم"], ["البخاخ", "بخاخ الربو"], ["؟", ""]));

  // Q3. «أموت على X» = I LOVE X. THE T6 FAMILY, and the reason rule 2 is a whitelist: the
  //     vocabulary of things a Saudi loves is not closable, so a food blacklist fails silently.
  const LOVED = ["المندي", "الكبسة", "القهوة", "الشاورما", "الكيك", "السمبوسة", "التمر", "الحلا",
    "قهوتكم", "شغلي", "الرياضة", "السفر", "الشتا", "المطر", "المطاعم اللي عندكم"];
  addQuiet("Q3 «أموت على X» = enthusiasm — THE T6 FAMILY",
    ...cross(["أموت على", "بموت على", "يموت على", "نموت على", "أموت في"], LOVED, ["", "والله", "بصراحة", "برمضان"]));
  addQuiet("Q3 death idioms that are not death",
    ...cross(["مت من الضحك", "ميت من الجوع", "موت من الضحك", "قاتلني الصداع", "الصداع ذابحني", "تعبت من الانتظار", "تعبت من الدوام", "تعبت من الزحمة"], ["", "والله", "اليوم"]));
  // NOTE THE HEADS. `شرب` is a SWALLOW verb, so «شربت الدواء …» is class G's NAMED ACCEPTED
  // OVER-FIRE (§12 row 16) and belongs in MUST_FIRE with its annotation, never here — putting
  // an accepted over-fire in the quiet corpus is how a rule gets narrowed to make a proof
  // green. The TAKE heads are the ones this family is about.
  addQuiet("Q3 «أخلص من X» = be done with X — the overdose arm's precision half",
    ...cross(["أخذت الدواء", "أخذت الحبوب", "تناولت الدواء", "أكلت الحبة"],
      ["عشان أخلص من", "علشان أخلص من"], ["الألم", "الصداع", "الكحة", "الالتهاب", "الحرارة"]));

  // Q4. «حامل» = CARD HOLDER. A real sentence at a private clinic reception.
  addQuiet("Q4 «حامل» = card-holder",
    ...cross(["أنا حامل", "أنا حاملة", "زوجتي حامل"], ["بطاقة", "شهادة", "ملف", "تأمين"], INSURER));
  addQuiet("Q4 ordinary OB booking, marker with NO danger predicate",
    ...cross(["أنا حامل", "أختي حامل", "زوجتي حامل"], ["", "بالشهر الثالث"],
      ["وأبغى متابعة حمل", "وتبي موعد", "وأبغى سونار", "والحمدلله بخير"]));

  // Q5. THE SITE NAMES. This tenant's own branches, and two of them ARE red-flag stems:
  //     «الربوة» contains «ربو» (asthma) and «الشفا» is the stem of «شفايف» (lips). A bare
  //     alternative breaks the branch name for every patient in south-west Riyadh.
  addQuiet("Q5 site names — «الربوة» vs «ربو», «الشفا» vs «شفايف»",
    ...cross([...WANT, "وين", "متى يفتح"], ["موعد في فرع", "فرع", "مجمع"], SITE, ["", "؟", "اليوم"]));
  addQuiet("Q5 site names, bare", "شعاع الورود", "الوطن 1 اليمامة", "شعاع الروضة", "فرع الروابي",
    "فرع الشفا", "فرع الربوة", "كم كربوهيدرات في الوجبة؟", "الطلب مربوط بالتأمين");

  // Q6. «شلل الأطفال» — THE POLIO VACCINE, one of the highest-volume paediatric questions in
  //     the Kingdom, and the boundary does NOT save it: `شلل` is a whole word there.
  addQuiet("Q6 «شلل الأطفال» = the polio vaccine",
    ...cross(["متى", "وين", "كم سعر", "جدول", "حجزت"], ["تطعيم شلل الأطفال", "لقاح شلل الأطفال", "تطعيم شلل الاطفال"], ["؟", ""]));
  addQuiet("Q6 «الشلل الرعاش» = Parkinson's",
    ...cross(["", "أبوي عنده", "ابغى موعد"], ["الشلل الرعاش", "شلل رعاش"], ["", "ومتابع عندكم"]));

  // Q7. «صدر» = WAS ISSUED · CHICKEN BREAST · a report. THE BOUNDARY SAVES NONE OF THESE —
  //     `صدر` is a whole word in all three — and the only thing that does is refusing to put
  //     the bare stem in a set. Three audits mis-explained this row.
  addQuiet("Q7 «صدر» = was issued · chicken breast",
    ...cross(["", "متى", "هل"], ["صدر التقرير", "صدر القرار", "صدر الدجاج", "صدرت النتيجة"],
      ["؟", "أمس", "مسموح في الرجيم؟", ""]));
  addQuiet("Q7 «صدر» inside «مصدر», and the chest with NO predicate",
    ...cross(["ما وصلني التقرير من المصدر", "المصدر موثوق", "أبغى أشعة على الصدر", "موعد أشعة الصدر",
      "كم سعر أشعة الصدر؟", "الأشعة طلعت على الصدر سليمة", "أبغى موعد صدرية", "تحليل وظائف رئة"], ["", "لو سمحت"]));

  // Q8. «دم» inside «قدم» · «عدم» · «تقديم», and blood as a LAB TEST.
  addQuiet("Q8 «دم» inside a longer word",
    ...cross(["", "عندي", "ابغى"], ["ألم في قدمي", "القدم السكري", "تقديم الأوراق", "عدم تحمل اللاكتوز", "مقدمة الرأس", "هدم المبنى"], ["", "؟"]));
  addQuiet("Q8 blood as a lab test",
    ...cross(ASK, ["تحليل دم", "صورة دم كاملة", "فصيلة الدم", "التبرع بالدم", "تحليل بول", "تحليل براز"], ["؟", ""]));

  // Q9. «كسر» in «الكسر العشري» · «مكسرات» · «انكسر», and «حادث» in «الحوادث» — the ER
  //     department is literally named «الطوارئ والحوادث», so a bare `حوادث` turns a
  //     NAVIGATION question, the opposite of an emergency, into the rail.
  addQuiet("Q9 «كسر» = a fraction · nuts · a broken device",
    ...cross(["", "اشرح لي", "عندي حساسية من"], ["الكسر العشري", "المكسرات", "انكسر الجهاز", "كسور الأسهم"], ["", "؟"]));
  addQuiet("Q9 «حادث» in «الحوادث» — the ER department's own name",
    ...cross(["وين", "متى تفتح", "كم دوام"], ["قسم الحوادث", "الطوارئ والحوادث", "قسم الطوارئ"], ["؟", ""]));
  addQuiet("Q9 «حادث» in an insurance report, and «طاح»/«حرق» with a non-body subject",
    "تقرير حادث للتأمين", "أبغى تقرير حادث قديم", "طاح السعر", "طاح شعري", "حرق الدهون", "جهاز الحرق", "الليزر للحرق الموضعي");

  // Q10. «بلع» in «البلعوم» (a genuine substring case) and «البلع» (a whole word — NOT one).
  addQuiet("Q10 «بلع» — the pharynx and the act of swallowing",
    ...cross(["", "عندي", "ابني عنده"], ["التهاب البلعوم", "صعوبة في البلع", "البلعوم الأنفي"], ["", "وابغى موعد"]));

  // Q11. «حرارة» of the WEATHER and the ROOM, and a child WITHOUT a fever — the T5 widening's
  //      own quiet side. `طفلي · ابني · بنتي · ولدي` became infant markers in this wave, and
  //      a widening of a person list widens every rule that reads it, so the NEW members are
  //      crossed here and not only the old ones.
  addQuiet("Q11 «حرارة» with a non-body subject",
    ...cross(["حرارة الجو", "حرارة الغرفة", "حرارة المكيف", "حرارة الفرن", "حرارة الماء", "حرارة السيارة"],
      ["عالية", "خانقة", "مرتفعة اليوم", "37", "39"]));
  addQuiet("Q11 a child with NO fever term — THE T5 WIDENING'S QUIET SIDE",
    ...cross(WHO, ["عنده موعد بكرة", "محتاج تطعيم", "نسي بطاقته", "عمره ثلاث سنوات", "مسجل عندكم",
      "يبي يغير الموعد", "ما جاه دور", "عنده تأمين بوبا"]));
  addQuiet("Q11 post-vaccine fever in a child ≥ 3 months, and a normal temperature",
    "جاته حرارة بسيطة بعد التطعيم", "الطفل حرارته 37", "حرارته 36.8", "ابني حرارته 37.2 عادي؟");

  // Q12. «تشنج بعضلة» = an adult muscle spasm; «تنميل من الجلسة» = benign positional numbness.
  addQuiet("Q12 muscle spasm and positional numbness",
    ...cross(["تشنج بعضلة رقبتي", "تشنج بعضلة رجلي", "تشنج في عضلة الكتف"], ["من النوم", "من الجلسة", "من الرياضة"]),
    ...cross(["تنميل في رجلي", "تنميل في يدي", "خدر في رجلي"], ["من الجلسة", "من النوم", "من القعدة", "من الوقفة", "من المخدة"]));

  // Q13. THE IDIOM «نفسي ضايق» WITH A CLINIC OBJECT. The carve-out inherited from Kivo is a
  //      DELIVERY-COMPLAINT vocabulary and misses all of these; driven, they FIRE on the real
  //      Kivo detector today, which means a patient frustrated with opening hours gets an
  //      ambulance instruction and a P0 page.
  addQuiet("Q13 «نفسي ضايق من X» — clinic frustration",
    ...cross(["نفسي ضايق من", "نفسي ضاق من"], ["الدوام", "المواعيد", "الموعد", "الحجز", "الإجراءات",
      "المستشفى", "العيادة", "المجمع", "الفاتورة", "الاستقبال", "التحويلة", "التأمين", "المراجعة",
      "الانتظار", "التعامل", "الخدمة", "التأخير", "الزحمة"]));

  // Q14. RESOLVED bleeding, and the dental complaint that must not become an emergency.
  addQuiet("Q14 resolved, and the ordinary dental complaint",
    ...cross(["الحمدلله"], ["وقف النزيف", "وقف الدم", "بطل النزيف", "ما عاد ينزف"]),
    ...cross(["نزيف اللثة", "اللثة تنزف", "رعاف بسيط"], ["لما أفرش أسناني", "وقت التفريش", "من المعجون"]),
    "نزلت عليّ الدورة", "الدورة نزلت أمس");

  // Q16. THE DENIAL OF A SYMPTOM. §1.2: a denial may suppress VOCABULARY, never a SYMPTOM —
  //      «ما عندي مشكلة بس صدري يعورني وأتعرق» is a heart attack that opens with a denial, and
  //      it fires. But a denial that GOVERNS the difficulty noun is not a symptom at all, and
  //      a co-occurrence reading of ARM 2 sends every one of these an ambulance and a P0 page.
  addQuiet("Q16 a denial that governs the difficulty noun",
    ...cross(["ما", "مافي", "مو", "مب", "بدون", "من غير"],
      ["عندي", "فيه", "فيها", "عنده", "عندها", "صار", "صارت", ""],
      ["مشكلة في التنفس", "صعوبة في التنفس", "صعوبة بالتنفس", "ضيق في التنفس", "ضيق تنفس", "صعوبة تنفس"],
      ["", "الحمدلله", "ولله الحمد", "أبد"]));

  // Q15. THE ORDINARY INBOX. No homograph at all — booking, price, insurance, directions,
  //      complaint. This is most of what a clinic actually receives, and a rail that fires
  //      here is a product that teaches patients to stop talking to it (§1.3).
  addQuiet("Q15 booking", ...cross(WANT, SERVICE, ["", "اليوم", "بكرة", "الأسبوع الجاي", "لو سمحت"]));
  addQuiet("Q15 price and insurance", ...cross(ASK, [...SERVICE, "الكشف", "العملية", "الولادة"], ["؟", "عندكم؟"]));
  addQuiet("Q15 insurance", ...cross(["أنا مع", "تأميني", "تقبلون", "هل يغطي"], INSURER, ["؟", "", "للأسنان؟"]));
  addQuiet("Q15 directions and hours", ...cross(["وين", "كيف أوصل", "متى يفتح", "متى يسكر", "فيه مواقف في"], ["الفرع", "المجمع", "العيادة", "المختبر", "الصيدلية"], ["؟", ""]));
  addQuiet("Q15 complaints", ...cross(["الموعد", "الطلب", "التقرير", "الدور"], COMPLAINT, ["", "والله", "اليوم"]));
  addQuiet("Q15 cancel / change / files", ...cross(["ألغوا", "غيروا", "أجلوا", "أبغى أعدل"], ["الموعد", "الحجز", "المراجعة"], ["", "لو سمحت", "للأسبوع الجاي"]));
  addQuiet("Q15 records", ...cross(["أبغى", "متى يطلع", "وين ألقى"], ["التقرير", "النتيجة", "الملف", "الوصفة", "الفاتورة", "التقرير الطبي"], ["؟", ""]));

  const uniq = [...new Set([...QUIET_BY_FAMILY.values()].flat())];
  if (process.env.FAYSAL_DEBUG_QUIET) {
    const byRule = new Map<string, string[]>();
    for (const t of uniq) { const h = detectRedFlag(t); if (h) { const k = `${h.class}/${h.ruleId} on «${h.termAr}»`; byRule.set(k, [...(byRule.get(k) ?? []), t]); } }
    for (const [k, v] of byRule) console.log(`   DEBUG ${v.length}x ${k}  e.g. «${v[0]}» «${v[v.length - 1]}»`);
  }
  mustBeQuiet("§Q ordinary-clinic (all families)", uniq);
}

// ═══ §L8 — THE PRECISION MIRROR (§2.0 L8). THE BLOCKING ASSERTION OF THIS WAVE ══════════════
console.log("\n── §L8  EVERY ENUMERATED SET MEMBER HAS A PAIRED NEAR-MISS ─────");
{
  // L6 fails when a Fires-list entry has no assertion. THIS fails when an enumerated set
  // member has no pairing. Nothing enforced the second direction, and enumeration — which L3
  // MANDATES — is where both new false-positive families came from.
  const members = everyEnumeratedMember();
  const generated: string[] = [];
  let covered = 0, annotated = 0;
  const missing: string[] = [];
  for (const { cls, set, member } of members) {
    const spec = CLASSES.find((c) => c.cls === cls)!;
    const m = spec.mirror[set];
    if (!m) { missing.push(`${cls}.${set}.«${member}» — the SET has no mirror entry at all`); continue; }
    if (m.onlyFinding) { annotated++; continue; }
    if (m.onlyFindingMembers?.includes(member)) { annotated++; continue; }
    // AN EXPLICIT PAIRING OVERRIDES THE GENERIC FRAMES. Some members cannot go in a generic
    // frame without becoming the finding — «الكبار» in a TAKE frame is «أخذ دواء الكبار», the
    // ownership qualifier that DEFEATS the medication-taking exclusion by design — so when a
    // member is named in `per`, those sentences are the mirror and the frames do not apply.
    const sentences: string[] = m.per?.[member]
      ? [...m.per[member]!]
      : (m.frames ?? []).map((f) => f.replace(/\{\}/g, member));
    // A PAIRING IS ONLY A PAIRING IF THE SENTENCE ACTUALLY CARRIES THE MEMBER. A frame that
    // does not is a pairing that proves nothing about that member — which is the whole
    // failure mode L8 exists to end, one level down.
    const carrying = sentences.filter((t) => termRe(member).test(normalizeForSafety(t)));
    if (carrying.length === 0) {
      missing.push(`${cls}.${set}.«${member}» — no near-miss carries it (${sentences.length} candidate(s))`);
      continue;
    }
    covered++;
    generated.push(...carrying);
  }
  for (const m of missing.slice(0, 25)) ok(`§L8 UNPAIRED ${m}`, false);
  pass += covered + annotated;
  console.log(`   ${members.length} enumerated members · ${covered} paired with a carrying near-miss · ${annotated} annotated only-finding · ${missing.length} UNPAIRED`);
  ok(`§2.0 L8: every enumerated set member is mirrored into MUST_BE_QUIET (${missing.length} unpaired)`, missing.length === 0);
  const uniq = [...new Set(generated)];
  addQuiet("L8 generated pairings", ...uniq);
  mustBeQuiet("§L8 the generated pairings themselves are quiet", uniq);
  // …AND THE ANNOTATION IS NOT A LOOPHOLE. An `onlyFinding` set may not contain a member that
  // an ordinary clinic sentence in §Q already carries — that would be an assertion that a word
  // has no benign reading, contradicted by this file's own corpus.
  const ordinary = [...new Set([...QUIET_BY_FAMILY.entries()].filter(([k]) => k.startsWith("Q")).flatMap(([, v]) => v))]
    .map(normalizeForSafety);
  const bogus: string[] = [];
  for (const { cls, set, member } of members) {
    const m = CLASSES.find((c) => c.cls === cls)!.mirror[set];
    if (!m?.onlyFinding && !m?.onlyFindingMembers?.includes(member)) continue;
    if (member.length < 4) continue;                     // a 3-letter stem is not a claim
    if (ordinary.some((t) => termRe(member).test(t))) bogus.push(`${cls}.${set}.«${member}»`);
  }
  for (const b of bogus) ok(`§L8 «only-finding» claimed for ${b}, but §Q carries it in an ordinary sentence`, false);
  pass += annotated - bogus.length;
  ok(`no set member is annotated "only-finding" while §Q carries it (${bogus.length} contradicted)`, bogus.length === 0);
}

// ═══ §T — THE NEAR-MISS TABLES, AND THE TIER ROWS (blocker T4) ══════════════════════════════
console.log("\n── §T  NEAR-MISS ROWS, AND THE `→ urgent` ROWS AS TIERS ────────");
{
  // T4: N6's downgrades reached the rule and the reason and NEVER THE TABLE. Two rows sit
  // under "Must NOT fire" while carrying reasons that say they fire at `urgent`. Transcribed
  // as `fired === false`, this proof was RED AT BIRTH on both. A row whose reason annotates a
  // tier is asserted AS THAT TIER; the rows are not moved and not deleted.
  let quiet = 0, tiers = 0, bad = 0;
  const tierRows: string[] = [];
  for (const c of CLASSES) {
    for (const nm of c.nearMiss) {
      const h = detectRedFlag(nm.text);
      if (nm.tier) {
        tierRows.push(`[${c.cls}] «${nm.text}» → ${nm.tier}`);
        if (!h || h.tier !== nm.tier) { bad++; ok(`§T ${c.cls}: «${nm.text}» want tier ${nm.tier}, got ${h ? h.tier : "no hit"}`, false); }
        else tiers++;
      } else {
        everyQuiet.push([`§T ${c.cls} near-miss`, nm.text]);
        if (h) { bad++; ok(`§T ${c.cls}: «${nm.text}» FIRED ${h.class}/${h.tier} [${h.ruleId}]`, false); }
        else quiet++;
      }
    }
  }
  pass += quiet + tiers;
  mustQuietTotal += quiet + tiers;
  console.log(`   ${quiet} quiet rows · ${tiers} TIER rows (T4) · ${bad} wrong`);
  for (const r of tierRows) console.log(`      TIER ROW  ${r}`);
  ok("every §2 near-miss row behaves as its own stated reason says", bad === 0);

  // §11.2's PAIRING DISCIPLINE, in the same file, every time: the true positive each
  // narrowing must not cost. A quiet-only file passes by making the gate deaf.
  let pairs = 0, deaf = 0;
  for (const c of CLASSES) {
    for (const nm of c.nearMiss) {
      if (!nm.paired) continue;
      pairs++;
      if (!fires(nm.paired)) { deaf++; ok(`§T pairing: «${nm.text}» is quiet but its true positive «${nm.paired}» is TOO`, false); }
    }
  }
  pass += pairs - deaf;
  console.log(`   ${pairs} narrowings paired with the true positive each must not cost · ${deaf} deaf`);
  ok(`every paired true positive still fires (${pairs} pairs)`, deaf === 0);
}

// ═══ §M — MUTATION, IN BOTH DIRECTIONS (§11.11) ═════════════════════════════════════════════
console.log("\n── §M  MUTATION: narrowing AND widening ────────────────────────");
//
// A NARROWING MUTATION TESTS THE MUST-FIRE CORPUS. ONLY A WIDENING MUTATION CAN SHOW THE QUIET
// CORPUS IS LOAD-BEARING — and a quiet corpus that reads the same before and after the widening
// it is supposed to constrain is decoration. That is not a worry, it is the recorded history of
// this repo: a widening shipped with 3,993 ordinary strings raising a full emergency while its
// proof read 14,696/14,696.
//
// THE MUTANTS ARE DERIVED FROM THE LIVE LEXICON, not copied into fixtures, so they cannot
// drift away from the rules they mutate.
{
  const ALL_QUIET = [...new Set(everyQuiet.map(([, t]) => t))];
  const ALL_FIRE = [...new Set([...everyMustFire, ...CLASSES.flatMap((c) => c.fires.map((e) => e.text))])];
  const N = (t: string) => normalizeForSafety(t);

  type Mutation = {
    name: string;
    dir: "widening" | "narrowing";
    /** For a widening: does the MUTANT fire where the live rule does not? */
    mutantFires?: (n: string) => boolean;
    /** For a narrowing: does the MUTANT stay silent where the live rule fires? */
    mutantSilentOn?: (n: string) => boolean;
    floor: number;
  };

  // ── WIDENINGS: each is one of the three defects §2.0 L8 was written for, re-applied. ──
  const W_NAFSU = adj(AIRWAY.sets.NEGATION, AIRWAY.sets.AUX,
    [...AIRWAY.sets.BREATHE, "نفسه", "نفسها"], { aParticle: true });
  const MED_TAKE = adj(POISONING.sets.VERB_TAKE, [], POISONING.sets.SITE_MEDICATION);
  const FOOD_BLACKLIST = ["الكبسه"];          // the ONE food the document ever enumerated
  const BARE_NETS = ["صدر", "كسر", "حوادث", "شفا", "جلطه", "حادث", "طاح", "حرق", "بلع", "دم"];

  const mutations: Mutation[] = [
    {
      name: "W1  «نفسه · نفسها» back into §2.4's BREATHE  (revert T2)",
      dir: "widening", floor: 200,
      mutantFires: (n) => W_NAFSU.test(n),
    },
    {
      name: "W2  MEDICATION objects back under the TAKE verb  (revert T3)",
      dir: "widening", floor: 200,
      mutantFires: (n) => MED_TAKE.test(n),
    },
    {
      name: "W3  §2.9 rule 2 back to a food BLACKLIST  (revert T6)",
      dir: "widening", floor: 40,
      // The rule as the document wrote it: a first-person death verb, minus «على» + a food
      // NOBODY ENUMERATED. With the one food the document names, everything else fires.
      mutantFires: (n) => /(?:^|\s)(?:ا|ب|ي|ن)موت(?:ون|ين)? ?(?:علي|على) /.test(n) && !FOOD_BLACKLIST.some((f) => n.includes(f)),
    },
    {
      name: "W4  bare stems added as «recall nets» because the boundary «handles it»",
      dir: "widening", floor: 100,
      mutantFires: (n) => BARE_NETS.some((t) => termRe(t).test(n)),
    },
    {
      name: "W5  §2.2's benign-cause exclusion deleted  (the row it was written for)",
      dir: "widening", floor: 10,
      mutantFires: (n) => has(STROKE.sets.TERM, n) && has(STROKE.sets.PRED_FAILURE, n),
    },
    {
      name: "W6  the negation particle put through the NOMINAL proclitic group",
      dir: "widening", floor: 50,
      // The defect this corpus found on its own first run: `لما`/`كما` become negations.
      mutantFires: (n) => adj(AIRWAY.sets.NEGATION, AIRWAY.sets.AUX, AIRWAY.sets.BREATHE).test(n),
    },
    {
      name: "W7  ARM 2 read as CO-OCCURRENCE instead of adjacency  (§2.0 L2)",
      dir: "widening", floor: 3,
      mutantFires: (n) => has(AIRWAY.sets.DIFFICULTY, n) && has(AIRWAY.sets.BREATHE_NOUN, n),
    },
  ];

  // ── NARROWINGS: each is a hole a previous wave actually shipped. ──
  const withoutTifli = INFANT_FEVER.sets.PRED_INFANT.filter((m) => !["طفلي", "طفلتي", "ولدي", "ابني", "بنتي"].includes(m));
  const negNoMu = AIRWAY.sets.NEGATION.filter((m) => m !== "مو" && m !== "موب");
  const ARM1_NO_MU = adj(negNoMu, AIRWAY.sets.AUX, AIRWAY.sets.BREATHE, { aParticle: true });
  const ARM1_NO_AAD = adj(AIRWAY.sets.NEGATION, AIRWAY.sets.AUX.filter((a) => a !== "عاد" && a !== "عاده"), AIRWAY.sets.BREATHE, { aParticle: true });
  const PAIN_UNNORMALIZED = CARDIAC.sets.PRED_PAIN.map((p) => (p === "الم" ? "ألم" : p === "يالمني" ? "يألمني" : p));

  mutations.push(
    {
      name: "N1  drop «طفلي · ابني · بنتي · ولدي» from §2.6's infant markers  (revert T5a)",
      dir: "narrowing", floor: 40,
      mutantSilentOn: (n) => !(has(INFANT_FEVER.sets.TERM, n) && (has(withoutTifli, n) || /\b(3[89]|4[0-3])(\.\d)?\b/.test(n))),
    },
    {
      name: "N2  drop ARM 7b, the rescue-failure STANDALONE  (revert T5b)",
      dir: "narrowing", floor: 1,
      mutantSilentOn: (n) => has(AIRWAY.sets.RESCUE_FAILED, n) && !termRe("ربو").test(n)
        && !adj(AIRWAY.sets.NEGATION, AIRWAY.sets.AUX, AIRWAY.sets.BREATHE, { aParticle: true }).test(n),
    },
    {
      name: "N3  drop the Najdi negation «مو · موب»",
      dir: "narrowing", floor: 100,
      mutantSilentOn: (n) => adj(AIRWAY.sets.NEGATION, AIRWAY.sets.AUX, AIRWAY.sets.BREATHE, { aParticle: true }).test(n) && !ARM1_NO_MU.test(n),
    },
    {
      name: "N4  drop «عاد» from the ability slot  (the live Kivo defect)",
      dir: "narrowing", floor: 5,
      mutantSilentOn: (n) => adj(AIRWAY.sets.NEGATION, AIRWAY.sets.AUX, AIRWAY.sets.BREATHE, { aParticle: true }).test(n) && !ARM1_NO_AAD.test(n),
    },
    {
      name: "N5  write §2.1's pain predicate UN-NORMALIZED  (revert T1)",
      dir: "narrowing", floor: 5,
      mutantSilentOn: (n) => has(CARDIAC.sets.TERM, n) && has(CARDIAC.sets.PRED_PAIN, n) && !has(PAIN_UNNORMALIZED, n),
    },
    {
      name: "N6  write §2.8's phrases UN-NORMALIZED  (revert T1(b))",
      dir: "narrowing", floor: 3,
      mutantSilentOn: (n) => {
        const un = TRAUMA.sets.STANDALONE.map((p) => p.replace("سياره", "سيارة").replace("علي راسه", "على راسه").replace("علي راسها", "على راسها").replace("كبيره", "كبيرة"));
        return has(TRAUMA.sets.STANDALONE, n) && !un.some((p) => new RegExp(`(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?${p}(?![ء-ي])`).test(n));
      },
    },
    {
      name: "N7  require a `ربو` noun for the exacerbation arm  (the T5b hole, stated as a rule)",
      dir: "narrowing", floor: 1,
      mutantSilentOn: (n) => has(AIRWAY.sets.EXACERBATION, n) && !termRe("ربو").test(n)
        && !adj(AIRWAY.sets.NEGATION, AIRWAY.sets.AUX, AIRWAY.sets.BREATHE, { aParticle: true }).test(n),
    },
  );

  // THE CORPUS'S OWN INTEGRITY, ASSERTED ONCE. Every string §M drives as "quiet" must be
  // quiet on the LIVE rules, or a separation count is measuring the corpus and not the mutant.
  ok(`all ${ALL_QUIET.length} strings in the quiet corpus are quiet on the live rules`,
    ALL_QUIET.every((t) => !fires(t)));
  ok(`all ${ALL_FIRE.length} strings in the must-fire corpus fire on the live rules`,
    ALL_FIRE.every(fires));

  let inert = 0;
  for (const m of mutations) {
    if (m.dir === "widening") {
      const caught = ALL_QUIET.filter((t) => m.mutantFires!(N(t)) && !fires(t));
      console.log(`   ${String(caught.length).padStart(5)} quiet strings FIRE under  ${m.name}  (floor ${m.floor})`);
      if (caught.length) console.log(`         e.g. «${caught[0]}»  …  «${caught[caught.length - 1]}»`);
      if (caught.length < m.floor) inert++;
      ok(`§M ${m.name}: the QUIET corpus separates it from the live rule (${caught.length} ≥ ${m.floor})`, caught.length >= m.floor);
    } else {
      const lost = ALL_FIRE.filter((t) => fires(t) && m.mutantSilentOn!(N(t)));
      console.log(`   ${String(lost.length).padStart(5)} Fires entries GO SILENT under ${m.name}  (floor ${m.floor})`);
      if (lost.length) console.log(`         e.g. «${lost[0]}»  …  «${lost[lost.length - 1]}»`);
      if (lost.length < m.floor) inert++;
      ok(`§M ${m.name}: the MUST_FIRE corpus separates it from the live rule (${lost.length} ≥ ${m.floor})`, lost.length >= m.floor);
    }
  }
  ok(`all ${mutations.length} mutations are separated by this corpus — none is inert`, inert === 0);
  console.log(`   ${mutations.filter((m) => m.dir === "widening").length} widening · ${mutations.filter((m) => m.dir === "narrowing").length} narrowing · ${inert} inert`);
}
