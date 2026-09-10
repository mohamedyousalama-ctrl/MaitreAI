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
//   SCRIPT — THIS GAP IS NOW CLOSED FOR ENGLISH, AND THE PARAGRAPH IT REPLACES IS KEPT IN
//   FULL BELOW BECAUSE IT IS WHY §QE EXISTS. It read:
//
//       "§Q is Arabic by construction. The English/franco arms (§2.1, §2.4, §2.9) have only
//        their own Fires entries and the near-miss rows; there is NO ordinary-clinic-ENGLISH
//        corpus here. The sibling proof read 'zero false positives' through a widening of an
//        English arm that fired on 616 of 1,325 ordinary strings. If the English arms are
//        widened, NOTHING HERE WILL OBJECT."
//
//   That was written when English was four `STANDALONE_EN` arrays read with a bare `includes`
//   over the whole message. §2 now has a full English arm in all nine classes, so §QE is the
//   ordinary-clinic-ENGLISH corpus that paragraph says is missing — generated the same way §Q
//   is, from a clinic inbox's own vocabulary crossed through the ENGLISH homographs, never from
//   the English rules' axes. It found nineteen defects in those rules on its first run, every
//   one of them a sentence a clinic actually receives: «the wheelchair is not fitting through
//   the door», «I'm seeing double entries for the same booking», «my eyes are sensitive to
//   light after the laser», «I'm killing myself trying to reach your call centre».
//
//   STILL OPEN: Arabizi beyond the enumerated franco phrases (`ma agdar atnafas`) is a third
//   surface with its own homographs and is not reached at all; and §QE is one register — a
//   patient typing to a clinic — like §Q.
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

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectRedFlag, isFaysalSafetyInbound, DETECTOR_EXCEPTION,
  CLASSES, everyEnumeratedMember,
  AIRWAY, CARDIAC, HEMORRHAGE, INFANT_FEVER, OBSTETRIC, POISONING, SELF_HARM, STROKE, TRAUMA,
  emergencyRail, eligibleErSites, railCopyViolations, SUPPORT_LINE_SENTENCE, RAIL_B,
  isTriageHeld, checkBookingTriageHold, releaseTriageHold,
  COMMITTED_APPOINTMENT_STATES, OPEN_TRIAGE_HOLD_PATCH,
  normalizeForSafety, normalizeEn, foldDigits,
  type ErSite, type RedFlagHit,
} from "../lib/health/safety/index.ts";
import {
  adj, adjEn, adjEnAny, termRe, termReEn, has, hasEn, pick,
  bodyTemperatureEn, ageInMonthsEn,
} from "../lib/health/safety/match.ts";
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
        // THE ENGLISH ARM HAS THE SAME DISCIPLINE AND IT IS NOT THE SAME NORMALIZER. An ASCII
        // member is written in `normalizeEn`'s spelling, and the assertion is what makes the
        // apostrophe a data problem rather than a matcher problem: the shipped sets held
        // «can't breathe», «bleeding won't stop» and «i want to die», which were matchable ONLY
        // because the arm ran a bare `includes` over the raw message. Against a normalized
        // English string every one of them was dead code of exactly the §2.0 L6 kind — the
        // «تورم مفاجئ» defect in a second script, and this line is what finds it.
        if (/^[\x20-\x7e]+$/.test(m)) {
          if (normalizeEn(m) !== m) { bad++; ok(`§N ${c.cls}.${set}: «${m}» ≠ normalizeEn → «${normalizeEn(m)}»`, false); }
          continue;
        }
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
  // …AND WITH NO TEMPERATURE VALUE AT ALL, which is what the T5 fix is actually about:
  // «طفلي حرارته ما تنزل» — a parent saying their child's fever will not come down — carried
  // no value, no infant marker the document listed, and no persistence predicate, and so
  // produced NO HIT AT ANY TIER while sitting on §2.6's own Fires list.
  mustFire("§F2 infant_fever: child word × fever term × persistence, NO value  (T5)",
    [...new Set(cross(
      ["طفلي", "طفلتي", "ولدي", "ابني", "بنتي", "رضيعي", "الرضيع"],
      ["حرارته", "حرارتها"],
      INFANT_FEVER.sets.PRED_PERSIST as string[],
    ))]);

  // AN AGE IN THE SENTENCE MUST NOT SILENCE THE FEVER. `bodyTemperature` scanned for the
  // first two-digit number in [35, 43] and took «٣٦» out of «٣٦ يوم» as the temperature —
  // then `infantFever`'s own `value < 38.0 → return null` made a thirty-six-day-old with a
  // fever produce NO HIT AT ALL. Driven before the fix: fired false, ruleId none. The age
  // window that lands inside [35, 43] days is five and a half weeks — squarely the
  // population §2.6 exists for — and every unit a parent writes is here, because the bug is
  // the unit, not the number.
  mustFire("§F2 infant_fever: an age in days/weeks is not a temperature  (the silent miss)",
    [...new Set(cross(
      ["رضيعي", "مولودي", "ابني", "بنتي", "طفلي"],
      // With AND without the «عمره» lead: the lead and the unit are two independent
      // guards, and a corpus that only ever writes both cannot tell which one is doing
      // the work — remove either in isolation and it would still read green.
      ["عمره 36 يوم", "عمره ٣٦ يوم", "عمرها 40 يوم", "عمره 38 يوما", "عمره 41 يوم", "عمره 6 اسابيع", "عمره 35 يوم",
       "36 يوم", "٣٦ يوم", "40 يوم", "عنده 38 يوم", "عمره سنه و 41 يوم"],
      ["وعنده حرارة", "وعندها حرارة", "وحرارته عالية", "وعنده سخونة"],
    ))]);

  // SOMEONE ELSE TOOK THE SPEAKER'S MEDICATION. Filed as ordinary clinic English by the
  // family above and silent in Arabic for the mirror reason — the possessive forms «دوايي»
  // and «حبوبي» were not medication objects at all. §13's fail-toward-firing decides it: the
  // cost of firing wrongly is a patient told to call 997 who did not need to, and the cost of
  // missing is a child who took an adult's dose. The separator is WHO IS TAKING, not the
  // possessive — «أخذتْ» (she took) and «أخذتُ» (I took) are the same consonants, so the
  // person marker in the clause is the whole test.
  mustFire("§G3 poisoning: someone else took the speaker's own medication",
    [...new Set(cross(
      ["my son", "my daughter", "my mother", "my father", "my wife", "the baby", "my child"],
      ["took", "swallowed", "has taken"],
      ["my medicine", "my pills", "my tablets", "my blood pressure tablets", "my meds"],
      ["", " this morning", " by mistake", " instead of his"],
    ))]);
  mustFire("§G3 poisoning: the same sentence in Arabic",
    [...new Set(cross(
      ["ابني", "بنتي", "امي", "ابوي", "الطفل", "الولد"],
      ["بلع", "اخذ", "اخذت", "شرب"],
      ["دوايي", "حبوبي", "علاجي", "دواي"],
      ["", " بالغلط", " الصبح"],
    ))]);

  // §2.8 — phrases only, and each phrase inside an ordinary run-on message, because a phrase
  // matched with a bare lookbehind is silent behind a «و» or a «ب» (§2.0 L7).
  mustFire("§F2 trauma: STANDALONE inside a run-on message",
    [...new Set(cross(["", "ابني", "السلام عليكم", "لو سمحت"], TRAUMA.sets.STANDALONE as string[], ["", "وش اسوي", "بسرعة"]))]);
}

// ═══ §FE — THE ENGLISH CROSS PRODUCTS (§2.0 L6, in the second script) ═══════════════════════
console.log("\n── §FE  ENGLISH: the slots, crossed, not the sentences somebody thought of ─");
{
  // A SLOT WITH ONE VALUE IN IT is what §F2 exists to find, and the English arm shipped with
  // FOUR of them: `STANDALONE_EN` arrays of four, one, one and seven strings, read with
  // `raw.toLowerCase().includes(p)`. «can't breathe» was in the list and «he can't breathe»,
  // «she cannot breathe», «he stopped breathing» and «I'm struggling to breathe» were not —
  // the same first-person-only defect §2.4 drove against the Kivo detector, one script over.
  const PERSON = ["", "he", "she", "my son", "my baby", "my father"];
  mustFire("§FE airway: PERSON × NEGATION × [mid] × BREATHE",
    [...new Set(cross(PERSON, AIRWAY.sets.NEG_EN as string[], ["", "even", "really", "properly"],
      AIRWAY.sets.BREATHE_EN as string[]))]);
  mustFire("§FE airway: DIFFICULTY × [in|with|of] × BREATHE-NOUN",
    [...new Set(cross(["", "he has", "she has", "my son has"], AIRWAY.sets.DIFFICULTY_EN as string[],
      ["", "in", "with", "of"], AIRWAY.sets.BREATHE_NOUN_EN as string[]))]);
  mustFire("§FE airway: (throat ∪ tongue ∪ lips ∪ face) × (swelling ∪ closing)",
    [...new Set(cross(["his", "her", "my"], AIRWAY.sets.PART_EN as string[], ["is", "are"],
      [...AIRWAY.sets.SWELL_EN, ...AIRWAY.sets.CLOSE_EN] as string[]))]);

  // §2.1 — the chest term against every pain / pressure / burning predicate, in both word
  // orders, because English writes «chest pain» and «pain in my chest» with equal frequency and
  // a rule that only carries one of them is deaf to half its own patients.
  const A_PRED = [...CARDIAC.sets.PRED_PAIN_EN, ...CARDIAC.sets.PRED_PRESSURE_EN,
    ...CARDIAC.sets.PRED_BURNING_EN] as string[];
  mustFire("§FE cardiac: chest × PREDICATE", [...new Set(cross(["", "i have", "he has"], ["chest", "my chest"], ["", "is"], A_PRED))]);
  mustFire("§FE cardiac: PREDICATE × in my chest", [...new Set(cross(["", "i have"], A_PRED, ["in my", "on my"], ["chest"]))]);
  // The COMPANIONS, mirrored as complete sentences (§2.0 L6) — each is a hit ONLY with a term.
  mustFire("§FE cardiac: chest term + companion",
    [...new Set(cross(["my chest hurts and i am", "my chest hurts and he is"], CARDIAC.sets.PRED_COMPANION_EN as string[]))]);

  // §2.2 — body term × failure of function, both orders.
  mustFire("§FE stroke: TERM × FAILURE",
    [...new Set(cross(["his", "her", "my"], STROKE.sets.TERM_EN as string[], ["is", "are"], STROKE.sets.PRED_FAILURE_EN as string[]))]);
  mustFire("§FE stroke: FAILURE × TERM",
    [...new Set(cross(["he", "she"], STROKE.sets.PRED_FAILURE_EN as string[], ["his", "her"], STROKE.sets.TERM_EN as string[]))]);

  // §2.3 — blood/bleeding × volume, both orders, and the persistence predicates.
  mustFire("§FE hemorrhage: VOLUME × TERM",
    [...new Set(cross(["there is", "he has"], HEMORRHAGE.sets.PRED_VOLUME_EN as string[], ["", "of"], HEMORRHAGE.sets.TERM_EN.filter((t) => t !== "hemorrhage" && t !== "haemorrhage") as string[]))]);
  mustFire("§FE hemorrhage: TERM × VOLUME",
    [...new Set(cross(["the wound is", "he is"], HEMORRHAGE.sets.TERM_EN.filter((t) => t !== "hemorrhage" && t !== "haemorrhage") as string[], ["", "is"], HEMORRHAGE.sets.PRED_VOLUME_EN as string[]))]);
  mustFire("§FE hemorrhage: TERM × PERSISTENCE",
    [...new Set(cross(["the", "his"], ["bleeding", "blood"], HEMORRHAGE.sets.PRED_PERSIST_EN as string[]))]);

  // §2.6 — THE TEMPERATURE, IN BOTH SCALES. `bodyTemperature` accepts a bare number in [35, 43]
  // because that is Celsius, which is what a patient writing Arabic types. «102», «102.5F» and
  // «103 degrees» are all OUTSIDE that window, so the Arabic reader returns null on every one
  // of them and the fever-value arm was deaf to the commonest English fever report there is.
  mustFire("§FE infant_fever: infant marker × fever term × value, °C AND °F",
    [...new Set(cross(
      ["my baby", "my newborn", "the infant", "my baby"],
      ["has a fever of", "temperature is", "temp is", "has a temperature of"],
      ["39", "38.5", "40", "102 f", "102.5f", "103 degrees", "101", "100.4 f"],
    ))]);
  // …AND THE SAME VALUES WITH NO MARKER AT ALL, which is what an English-speaking adult types
  // about themselves. These are the rows that can SEE the Fahrenheit conversion: with an infant
  // marker the hit survives on the marker alone with no value, so a corpus written only in the
  // paediatric frame cannot tell whether the conversion is there at all.
  mustFire("§FE infant_fever: a Fahrenheit report with NO marker  (the °F conversion, isolated)",
    [...new Set(cross(
      ["my temperature is", "the temperature is", "temperature", "his temperature is", "her temp is"],
      ["102 f", "103 degrees", "101 f", "104 degrees", "102.5f", "100.5 f"],
    ))]);

  // AN AGE IN DAYS OR WEEKS MUST NOT BE READ AS A TEMPERATURE, and in English the collision is
  // wider than in Arabic: «38 days old» and «40 weeks» are how a parent of a newborn writes an
  // age, and 38 and 40 are both fevers. The discriminating values are 35, 36 and 37 — under the
  // bug they are read as the temperature, fall below 38.0, and the class returns NO HIT AT ALL
  // for the exact population §2.6 exists for. Every unit a parent writes is here, because the
  // bug is the unit and not the number.
  mustFire("§FE infant_fever: an age under three months IS the marker  (and is not a temperature)",
    [...new Set(cross(
      ["", "my baby", "my son", "she", "he"],
      ["is 35 days old", "is 36 days old", "is 37 days old", "is 38 days old", "is 40 days old",
       "is 6 weeks old", "is 3 weeks old", "is 8 weeks", "is 2 months old", "is 36 days"],
      ["and has a fever", "and has a temperature", "with a fever", "and is feverish"],
    ))]);
  mustFire("§FE infant_fever: the red flags, at any age",
    [...new Set(cross(["my baby", "my son", "my daughter"], ["", "has a fever and"],
      INFANT_FEVER.sets.PRED_REDFLAG_EN.filter((r) => !INFANT_FEVER.sets.PRED_REDFLAG_NEEDS_PERSON_EN.includes(r)) as string[]))]);

  // §2.5 — the pregnancy marker against every danger predicate.
  mustFire("§FE obstetric: marker × danger predicate",
    [...new Set(cross(["im pregnant and", "my wife is pregnant and", "im 30 weeks pregnant and"],
      ["", "i have", "there is"],
      [...OBSTETRIC.sets.PRED_BLEED_EN, ...OBSTETRIC.sets.PRED_MOVE_EN,
       ...OBSTETRIC.sets.PRED_LABOUR_EN, ...OBSTETRIC.sets.PRED_PREECL_EN,
       ...OBSTETRIC.sets.PRED_PAIN_EN] as string[]))]);

  // §2.7 — every SWALLOW verb against every poison object, in three persons.
  mustFire("§FE poisoning: PERSON × SWALLOW × POISON",
    [...new Set(cross(["", "my son", "my daughter", "the baby"], POISONING.sets.VERB_SWALLOW_EN as string[],
      ["", "some", "a"], POISONING.sets.SITE_POISON_EN as string[]))]);
  // …AND THE TAKE VERB WITH A QUALIFIER, which is the half T3 must not have taken with it.
  mustFire("§FE poisoning: TAKE × QUALIFIER × medication  (T3's other side)",
    [...new Set(cross(["he", "she", "my son"], POISONING.sets.VERB_TAKE_EN as string[],
      ["too many", "a lot of", "his mother", "the wrong"], ["pills", "tablets", "medicine"]))]);

  // §2.8 — phrases only, each inside an ordinary run-on message.
  mustFire("§FE trauma: STANDALONE inside a run-on message",
    [...new Set(cross(["", "my son", "hello", "please help"], TRAUMA.sets.STANDALONE_EN as string[], ["", "what do i do", "quickly"]))]);

  // §2.9 — the intent phrases, with the lead-ins a person actually types.
  mustFire("§FE self_harm: STANDALONE with lead-ins",
    [...new Set(cross(["", "i think", "honestly", "please help me"], SELF_HARM.sets.STANDALONE_EN as string[], ["", "please"]))]);

  // …AND THE READER ITSELF, driven rather than trusted. A conversion that is wrong by a degree
  // is a class F threshold that is wrong by a degree, and §12 row 3 is unsigned.
  const T = (t: string) => bodyTemperatureEn(normalizeEn(t));
  ok("§FE 102 F → 38.9 °C", T("his temperature is 102 f") === 38.9);
  ok("§FE 102.5F → 39.2 °C", T("temperature 102.5f") === 39.2);
  ok("§FE 103 degrees → 39.4 °C", T("a temperature of 103 degrees") === 39.4);
  ok("§FE 100 F is NOT a fever (37.8 °C)", T("temperature 100 f") === 37.8);
  ok("§FE a bare 39 is Celsius", T("his temperature is 39") === 39);
  ok("§FE 38.5 survives the decimal point", T("temperature 38.5") === 38.5);
  ok("§FE «38 days old» is not a temperature", T("she is 38 days old") === null);
  ok("§FE «40 weeks» is not a temperature", T("she was born at 40 weeks") === null);
  ok("§FE a phone number is not a temperature", T("call me on 0504490460") === null);
  ok("§FE a price is not a temperature", T("the consultation is 250 riyals") === null);
  const AGE = (t: string) => ageInMonthsEn(normalizeEn(t));
  ok("§FE «36 days old» → under three months", (AGE("she is 36 days old") ?? 99) < 3);
  ok("§FE «6 weeks» → under three months", (AGE("my baby is 6 weeks") ?? 99) < 3);
  ok("§FE «3 months» → NOT under three months", (AGE("my baby is 3 months") ?? 0) >= 3);
  ok("§FE «my daughter is 9» → nine YEARS", AGE("my daughter is 9") === 108);
  ok("§FE «he's 2 years old» → 24 months", AGE("he's 2 years old") === 24);
  // THE PAIR THAT MAKES THE BARE-AGE RULE SAFE: an age in years is under 18 and a body
  // temperature is at least 35, so no number can be claimed by both readings.
  ok("§FE «his temperature is 39» is NOT read as an age", AGE("his temperature is 39") === null);
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

// ═══ §QE — THE QUIET CORPUS, GENERATED FROM ORDINARY CLINIC ENGLISH ═════════════════════════
// The header names this corpus as the gap §Q could not cover: §Q is Arabic by construction, and
// an Arabic corpus can prove NOTHING about `chest` also being a chest of drawers or `fell` also
// being «fell behind on my payments». Those are properties of ENGLISH, and only a corpus
// generated from English finds them. Same discipline as §Q, other end of the same rule: this
// starts from what an English-speaking patient in Riyadh actually sends a clinic — booking,
// price, insurance, directions, records, pharmacy, complaints — and crosses it DELIBERATELY
// THROUGH THE ENGLISH HOMOGRAPHS:
//
//   chest      the thorax · A CHEST OF DRAWERS · a chest x-ray      heart   the organ · A HEART CLINIC
//   blood      haemorrhage · A BLOOD TEST · BLOOD PRESSURE          fell    fell over · FELL BEHIND
//   accident   a crash · «ACCIDENT AND EMERGENCY», the department   burn    a scald · FAT BURNING
//   breathing  dyspnoea · A BREATHING EXERCISES CLASS               stroke  a CVA · STROKE REHAB
//   killing    ending a life · KILLING TIME · «killing me»          dying   dying · «DYING TO GET…»
//   took       an overdose · «TOOK MY MEDICINE THIS MORNING»        speak   aphasia · «CAN'T SPEAK ARABIC»
//   fever      a fever now · «HAD A FEVER LAST MONTH»               moving  hemiplegia · A QUEUE
//   unresponsive  a lethargic child · A CLINIC THAT WON'T ANSWER    swallowed  ingestion · «my card»
console.log("\n── §QE  ORDINARY CLINIC ENGLISH, DERIVED FROM ITS OWN VOCABULARY ─");
{
  const ASK_EN = ["how much is", "what is the price of", "when is", "where is", "can i get", "do you have"];
  const WANT_EN = ["i want", "i need", "id like", "please book", "can i book"];
  const SERVICE_EN = ["an appointment", "a booking", "a consultation", "a follow up", "a check up",
    "a vaccination", "a blood test", "an x ray", "a medical report", "a dental cleaning"];
  const WHO_EN = ["my son", "my daughter", "my wife", "my husband", "my mother", "my father",
    "my baby", "my child", "my brother", "my sister"];
  const WHEN_EN = ["", "tomorrow", "on saturday", "this week", "please", "in the morning"];

  // QE1. «chest» = A CHEST OF DRAWERS · a chest x-ray · the chest clinic. The English «الصدر»,
  //      and saved by exactly the same thing: the predicate requirement (§2.1).
  addQuiet("QE1 «chest» = furniture, imaging, a clinic",
    ...cross([...ASK_EN, ...WANT_EN], ["a chest x ray", "a chest scan", "a chest ct", "the chest clinic appointment", "a chest physio session"], WHEN_EN),
    "my chest of drawers is broken", "the chest freezer at the pharmacy is off",
    "the chest x ray report is ready", "he has a chest infection, which clinic do i book");

  // QE2. «heart» = A HEART CLINIC · cardiology · the idiom «my heart is heavy». Bare `heart` is
  //      not a term for the same reason bare `قلب` is not, and «my heart is heavy» is grief.
  addQuiet("QE2 «heart» = a clinic, a follow-up, an idiom",
    ...cross([...ASK_EN, ...WANT_EN], ["a heart check up", "the heart clinic appointment", "a cardiology follow up", "an ecg", "an echo test"], WHEN_EN),
    ...cross(["my heart is heavy", "my heart feels heavy", "his heart is heavy"],
      ["after the news", "today", "since my father passed away", "about the funeral"]),
    "from the heart, thank you all",
    "my heart goes out to the family", "he has a heart of gold, that doctor",
    "my heart is with you in this", "heart clinic appointment", "cardiology follow-up");

  // QE3. «blood» = A BLOOD TEST · blood work · BLOOD PRESSURE · a blood type. This is most of
  //      what a laboratory inbox receives, and every one of them carries the class C term.
  addQuiet("QE3 «blood» = a lab test, a pressure reading, a donation",
    ...cross(ASK_EN, ["a blood test", "blood work", "the blood work results", "my blood type",
      "a blood sugar test", "the blood bank", "my blood pressure reading"], ["", "?", "please"]),
    "blood test", "blood work results", "i need a blood test before the appointment",
    "do you check blood pressure at reception", "i have high blood pressure and take pills");

  // QE4. «breathing» = A BREATHING EXERCISES CLASS · a spirometry — AND THE DENIAL FAMILY, which
  //      is the §2.4 ARM 2 test in English: a denial that GOVERNS the difficulty noun is a
  //      patient saying they are FINE, and a co-occurrence reading sends every one an ambulance.
  addQuiet("QE4 «breathing» = a class, a test",
    ...cross(["do you have", "i want to join", "how much is", "when is"],
      ["a breathing exercises class", "a breathing test", "the spirometry test", "a breathing course"], ["", "?", "please"]),
    "breathing exercises class", "it's not the breathing test I booked");
  addQuiet("QE4 THE DENIAL that governs the difficulty noun",
    ...cross(["no", "not", "without", "he has no", "she has no", "i have no", "there is no", "denies"],
      ["difficulty breathing", "trouble breathing", "difficulty in breathing", "trouble with his breathing",
       "shortness of breath", "difficulty with her breathing"],
      ["", "at all", "thank god", "the doctor checked"]));

  // QE5. «fell» · «accident» · «burn» · «fracture» — the four bare stems §2.8 refuses to admit,
  //      in the language where «Accident and Emergency» IS the department's name.
  addQuiet("QE5 «fell» = a payment, a price",
    ...cross(["i", "we", "the family"], ["fell behind on my payments", "fell behind on the instalments", "fell behind with the insurance"], ["", "sorry", "can you help"]),
    "the price fell last month", "the number of no shows fell this year");
  addQuiet("QE5 «accident» = the ER department's own name",
    ...cross(["where is", "what time does", "how do i get to", "is"], ["accident and emergency", "the accident and emergency department"], ["", "open", "?"]),
    "i need an accident report for the insurance", "the accident report was sent to the police",
    "do you write accident reports for work");
  addQuiet("QE5 «burn» = fat burning, a cream · «fracture» = a follow-up",
    "do you have a fat burning programme", "burn cream, do you sell it",
    "the laser burns a little, is that normal", "my fracture follow up appointment",
    "is there a fracture clinic on saturday", "he had a fall last week and needs an x ray");

  // QE6. «killing» · «dying» · «dead» — the T6 family in English, and the reason class I is
  //      standalone phrases only: the complement slot after an English death idiom is open.
  addQuiet("QE6 English death idioms are ENTHUSIASM, ANNOYANCE and FATIGUE",
    ...cross(["", "honestly", "wallah", "seriously"],
      ["killing time in the waiting room", "im dying to get an appointment", "this headache is killing me",
       "the waiting is killing me", "im dead tired after work", "your coffee is to die for",
       "i could kill for an earlier slot", "im dying for a coffee", "im dying of boredom here",
       "i could kill myself for forgetting the appointment", "im killing myself trying to reach your call centre",
       "i died laughing at the hold music"], ["", "haha", "😅"]));

  // QE7. «stroke» = STROKE REHAB · physio · a stroke clinic. §2.2's own near-miss table rules
  //      «متابعة بعد الجلطة» quiet; English gets there by naming the follow-up in the message.
  addQuiet("QE7 «stroke» = rehabilitation, physio, a clinic",
    ...cross(["", "my father needs", "i want", "how much is"],
      ["stroke rehab", "physio after his stroke", "rehab after her stroke", "the stroke clinic appointment",
       "post stroke follow up", "speech therapy for my son", "occupational therapy after his stroke"], ["", "please", "?"]),
    "my father is a stroke patient and needs a follow up", "do you have a stroke prevention clinic");

  // QE8. «took my medicine this morning» — T3 IN ENGLISH, the whole family. A TAKE verb with a
  //      medication object and no qualifier is a prescription being followed, not an ingestion.
  //
  //      WITH ONE SPLIT, ADDED AFTER THIS FAMILY SHIPPED. The subjects crossed here included
  //      «my son» and «my mother», and the objects included «my medicine» — so «my son took my
  //      medicine this morning» was generated as ORDINARY CLINIC ENGLISH. It is not: a child
  //      reaching the adult's box is the commonest paediatric poisoning presentation there is,
  //      and the same sentence in Arabic («ابني أخذ دوايي») was silent for the mirror reason.
  //      The speaker taking the speaker's own medication stays quiet, which is all T3 claimed.
  addQuiet("QE8 TAKE × MEDICATION — the T3 family in English, FIRST PERSON",
    ...cross(["i"], ["took", "take", "am taking", "have taken"],
      ["my medicine", "the tablets", "the pills", "her medication", "the syrup", "my meds", "the drops"],
      ["this morning", "after food", "on time", "as the doctor said", "before bed", "with water"]),
    ...cross(["my son", "my mother", "he", "she"], ["took", "take", "am taking", "have taken"],
      ["the tablets", "the pills", "her medication", "the syrup", "the drops"],
      ["this morning", "after food", "on time", "as the doctor said", "before bed", "with water"]),
    "i forgot to take my medicine yesterday", "when do i take the syrup",
    "the prescription has three medicines on it", "do you have this medication in stock",
    "i need a refill for my daughters drops");

  // QE9. «fever» = a fever NOW · «had a fever last month» · post-vaccine · the room, the weather.
  addQuiet("QE9 «temperature» with a non-body subject",
    ...cross(["the room temperature is", "the weather is", "the ac temperature is", "the water temperature is"],
      ["39", "40", "43", "102", "38.5"], ["", "today", "in the waiting area"]));
  addQuiet("QE9 a fever that is OVER, and a fever that never was",
    ...cross(["my son", "my daughter", "my baby", "my child", "my kid", "my boy", "my girl",
      "the baby", "my newborn", "my toddler"],
      ["had a fever last month", "had a fever last week", "had a temperature two weeks ago",
       "had a fever a month ago", "had a high temperature last month", "had a fever in ramadan"],
      ["", "and is fine now", "and recovered", "i want a check up", "he is fine now", "it cleared up"]),
    "post-vaccine fever in my 4-year-old", "is a fever normal after the vaccine",
    "his temperature is 37 and he is fine", "the fever is gone now, thank you",
    "my son had a fever last month, he's fine now, I want a check-up");
  addQuiet("QE9 a child with NO fever term at all",
    ...cross(WHO_EN, ["is 9 and needs a dentist", "needs a vaccination appointment", "lost his insurance card",
      "is 2 years old and needs braces", "has an appointment tomorrow", "needs a school medical report"]));

  // QE10. «pregnant» = an antenatal booking · A PREGNANCY TEST. The English collision §2.5 does
  //       not have: `حمل` and `حامل` are two words, `pregnancy` and `pregnant` are one stem.
  addQuiet("QE10 «pregnant» with no danger predicate",
    ...cross(["im pregnant and", "my wife is pregnant and", "im 12 weeks pregnant and"],
      ["i want to book", "we want a scan", "i need an antenatal appointment", "i need a blood test",
       "i want to register for delivery", "everything is fine alhamdulillah"], ["", "please"]),
    "pregnancy test price", "do you do pregnancy blood tests", "i need a blood test to see if im pregnant",
    "the baby is moving a lot, is that normal", "do you do postpartum check ups");

  // QE11. «can't speak Arabic» · «can't talk right now» · «can't move my appointment» — the
  //       intransitive inversion's whole reason, and §2.2's «ما أقدر أحرك موعدي» in English.
  addQuiet("QE11 «cant speak / cant talk / cant move» with an OBJECT",
    ...cross(["i", "he", "she", "my husband"],
      ["cant speak arabic", "cannot speak arabic well", "cant speak english", "cant talk right now",
       "cant move my appointment", "cant move the booking", "cant talk at work"],
      ["", "sorry", "please call later", "is there a translator"]),
    "im seeing double entries for the same booking", "i can't speak Arabic, do you have an English doctor?");

  // QE12. «unresponsive» · «not moving» · «lethargic» with an ADMINISTRATIVE subject — §2.6's
  //       `خامل` finding in English, and §2.2's «الدور ما يتحرك من ساعة» in English.
  addQuiet("QE12 an administrative subject with a clinical adjective",
    ...cross(["the clinic", "the app", "the phone line", "the queue", "the booking system", "the website", "the file"],
      ["is unresponsive", "is not moving", "is not responding", "is lethargic", "hasnt moved", "is paralysed"],
      ["", "today", "since the update", "for an hour"]));

  // QE13. «swallowed» · «choking» — a card, a leaflet, food down the wrong way.
  addQuiet("QE13 «swallowed» and «choking» without an ingestion",
    "is there a choking hazard leaflet for toddlers", "i swallowed my food the wrong way and coughed",
    "the machine swallowed my card at the payment kiosk", "a choking hazards brochure for parents please",
    "do you sell hearing aid batteries", "is there a button battery warning leaflet for parents");

  // QE14. THE ORDINARY INBOX, with no homograph at all. This is most of what a clinic receives,
  //       and a rail that fires here teaches patients to stop talking to it (§1.3).
  addQuiet("QE14 booking", ...cross(WANT_EN, SERVICE_EN, WHEN_EN));
  addQuiet("QE14 booking for someone else", ...cross(WANT_EN, SERVICE_EN, ["for"], WHO_EN));
  addQuiet("QE14 price and insurance", ...cross(ASK_EN, SERVICE_EN, ["", "?", "with insurance?"]));
  addQuiet("QE14 insurance", ...cross(["do you accept", "im with", "is this covered by", "does"], ["bupa", "tawuniya", "medgulf", "al rajhi takaful"], ["", "?", "for dental?"]));
  addQuiet("QE14 directions and hours", ...cross(["where is", "what time does", "how do i get to", "is there parking at"],
    ["the branch", "the lab", "the pharmacy", "the clinic", "reception"], ["", "open", "?"]));
  addQuiet("QE14 complaints", ...cross(["", "honestly"], ["nobody answered the phone", "i have been waiting for an hour",
    "the doctor was late", "i did not get a confirmation", "the app keeps logging me out", "i was sent to the wrong branch"], ["", "please fix it", "who do i talk to"]));
  addQuiet("QE14 records and admin", ...cross(["when will", "where do i get", "can you send"],
    ["my report", "the results", "my file", "the invoice", "the prescription", "the medical report"], ["", "be ready", "?"]));
  addQuiet("QE14 cancel and reschedule", ...cross(["please", "can you", "id like to"],
    ["cancel my appointment", "move my appointment", "reschedule the booking", "change the doctor"], WHEN_EN));

  const uniqEn = [...new Set([...QUIET_BY_FAMILY.entries()].filter(([k]) => k.startsWith("QE")).flatMap(([, v]) => v))];
  if (process.env.FAYSAL_DEBUG_QUIET) {
    const byRule = new Map<string, string[]>();
    for (const t of uniqEn) { const h = detectRedFlag(t); if (h) { const k = `${h.class}/${h.ruleId} on «${h.termAr}»`; byRule.set(k, [...(byRule.get(k) ?? []), t]); } }
    for (const [k, v] of byRule) console.log(`   DEBUG ${v.length}x ${k}  e.g. «${v[0]}» «${v[v.length - 1]}»`);
  }
  mustBeQuiet("§QE ordinary-clinic ENGLISH (all families)", uniqEn);
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
    // AN ENGLISH MEMBER IS CARRIED IN AN ENGLISH SENTENCE AND CHECKED WITH THE ENGLISH
    // MATCHER. `termRe` is §1.2's Arabic matcher: its `(?<![ء-ي])` boundary is satisfied by
    // every Latin character, so against English it degrades to a substring test and would call
    // «my heart» carried by «my heartburn». One matcher per script (§2.0 L7, as `match.ts`
    // extends it), on this side of the mirror as well as inside the detector.
    const ascii = /^[\x20-\x7e]+$/.test(member);
    const carrying = sentences.filter((t) => (ascii
      ? termReEn(member).test(normalizeEn(t))
      : termRe(member).test(normalizeForSafety(t))));
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
  const ordinaryRaw = [...new Set([...QUIET_BY_FAMILY.entries()].filter(([k]) => k.startsWith("Q")).flatMap(([, v]) => v))];
  const ordinary = ordinaryRaw.map(normalizeForSafety);
  const ordinaryEn = ordinaryRaw.map(normalizeEn);
  const bogus: string[] = [];
  for (const { cls, set, member } of members) {
    const m = CLASSES.find((c) => c.cls === cls)!.mirror[set];
    if (!m?.onlyFinding && !m?.onlyFindingMembers?.includes(member)) continue;
    if (member.length < 4) continue;                     // a 3-letter stem is not a claim
    const asciiMember = /^[\x20-\x7e]+$/.test(member);
    const hitsOrdinary = asciiMember
      ? ordinaryEn.some((t) => termReEn(member).test(t))
      : ordinary.some((t) => termRe(member).test(t));
    if (hitsOrdinary) bogus.push(`${cls}.${set}.«${member}»`);
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
  const NV = (t: string, view?: "ar" | "en") => (view === "en" ? normalizeEn(t) : normalizeForSafety(t));

  type Mutation = {
    name: string;
    dir: "widening" | "narrowing";
    /** WHICH VIEW THE MUTANT READS. An English mutant tested against Arabic-normalized text is
     *  a mutation that cannot fail: `normalizeForSafety` leaves «can't breathe» with its
     *  apostrophe and every English pattern here is written without one. The view picks the
     *  normalizer, exactly as `detectRedFlag` picks one per arm. */
    view?: "ar" | "en";
    /** For a widening: does the MUTANT fire where the live rule does not? */
    mutantFires?: (n: string) => boolean;
    /** For a narrowing: the MUTATED ARM. A Fires string is "lost" when the LIVE hit came from
     *  the arm this mutation touches (`ruleIdPrefix`) and the mutated arm no longer matches.
     *  Scoping by rule id is not bookkeeping: without it a narrowing mutation "loses" every
     *  string in the corpus, including the eight classes it never touched, and the number it
     *  reports is the size of the corpus rather than the reach of the mutation. */
    mutantArm?: (n: string) => boolean;
    ruleIdPrefix?: string;
    /** Scopes a narrowing to ONE SCRIPT's arms. Every English rule id ends `_en`, so a
     *  mutation of the English airway arm is `{ ruleIdPrefix: "D.", ruleIdEndsWith: "_en" }`
     *  and cannot claim the Arabic rows it never touched — the same reason the prefix exists. */
    ruleIdEndsWith?: string;
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
      dir: "narrowing", ruleIdPrefix: "F.", floor: 40,
      mutantArm: (n) => has(INFANT_FEVER.sets.TERM, n)
        && (has(withoutTifli, n) || /\b(3[89]|4[0-3])(\.\d)?\b/.test(n) || has(INFANT_FEVER.sets.PRED_REDFLAG, n)),
    },
    {
      name: "N2  drop ARM 7b, the rescue-failure STANDALONE  (revert T5b)",
      dir: "narrowing", ruleIdPrefix: "D.arm7b", floor: 1,
      mutantArm: () => false,
    },
    {
      name: "N3  drop the Najdi negation «مو · موب»",
      dir: "narrowing", ruleIdPrefix: "D.arm1", floor: 100,
      mutantArm: (n) => ARM1_NO_MU.test(n),
    },
    {
      name: "N4  drop «عاد» from the ability slot  (the live Kivo defect)",
      dir: "narrowing", ruleIdPrefix: "D.arm1", floor: 100,
      mutantArm: (n) => ARM1_NO_AAD.test(n),
    },
    {
      name: "N5  write §2.1's pain predicate UN-NORMALIZED  (revert T1)",
      dir: "narrowing", ruleIdPrefix: "A.pain", floor: 5,
      mutantArm: (n) => has(CARDIAC.sets.TERM, n) && has(PAIN_UNNORMALIZED, n),
    },
    {
      name: "N6  write §2.8's phrases UN-NORMALIZED  (revert T1(b))",
      dir: "narrowing", ruleIdPrefix: "H.", floor: 3,
      mutantArm: (n) => TRAUMA.sets.STANDALONE
        .map((ph) => ph.replace("سياره", "سيارة").replace("علي راسه", "على راسه").replace("علي راسها", "على راسها").replace("كبيره", "كبيرة"))
        .some((ph) => new RegExp(`(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?${ph}(?![ء-ي])`).test(n)),
    },
    {
      name: "N7  §2.2's onset arm scoped to ALL failures again  (the «الدور ما يتحرك» widening, inverted)",
      dir: "narrowing", ruleIdPrefix: "B.onset", floor: 1,
      mutantArm: (n) => has(STROKE.sets.PRED_ONSET, n) && has(STROKE.sets.TERM, n),
    },
  );

  // W8 IS A WIDENING AND NOT A NARROWING, and getting that wrong once is worth recording:
  // dropping a value from an EXCLUSION set makes a rule fire MORE, so it is measured against
  // the QUIET corpus. Written as a narrowing it reported 0 and looked inert, which is the
  // shape of a mutation that cannot fail.
  const DENIAL_NO_MAFI = adj(
    AIRWAY.sets.DENIAL_HEAD.filter((h) => h !== "مافي" && h !== "مافيه" && h !== "ماكو"),
    AIRWAY.sets.DENIAL_MID, AIRWAY.sets.DIFFICULTY, { aParticle: true });
  const ARM2_LIVE = adj(AIRWAY.sets.DIFFICULTY, ["في", "ب", "بال", "في ال"], AIRWAY.sets.BREATHE_NOUN);
  mutations.push({
    name: "W8  drop the «مافي · مافيه · ماكو» denial heads  (the Najdi contraction §Q found)",
    dir: "widening", floor: 100,
    mutantFires: (n) => ARM2_LIVE.test(n) && !DENIAL_NO_MAFI.test(n),
  });

  // ── THE ENGLISH MUTATIONS. Every one is a defect this wave actually shipped and §QE or §FE
  //    caught, re-applied on purpose — which is the only way to know the English corpora are
  //    load-bearing rather than decorative. A widening is measured against §QE (ordinary clinic
  //    ENGLISH, derived from a clinic inbox); a narrowing against §FE (the English slots,
  //    crossed). The header's own warning is what these close: "if the English arms are
  //    widened, NOTHING HERE WILL OBJECT."
  const BARE_EN = ["heart", "fell", "accident", "burn", "fracture", "blood", "chest", "speak", "stroke", "fever"];
  const A_PRED_ALL = [...CARDIAC.sets.PRED_PAIN_EN, ...CARDIAC.sets.PRED_PRESSURE_EN, ...CARDIAC.sets.PRED_BURNING_EN] as string[];
  const A_MIDS = ["is", "was", "feels", "felt", "in", "on", "of", "my", "his", "her", "the",
    "around", "under", "with", "really", "very", "so", "getting", "gets", "keeps"];
  const A_NO_IDIOM = (n: string) =>
    adjEn(CARDIAC.sets.TERM_EN, A_MIDS, A_PRED_ALL).test(n) || adjEn(A_PRED_ALL, A_MIDS, CARDIAC.sets.TERM_EN).test(n);
  const G_OBJ = [...POISONING.sets.SITE_POISON_EN, ...POISONING.sets.SITE_MEDICATION_EN] as string[];
  const G_TAKE = adjEnAny(POISONING.sets.VERB_TAKE_EN, G_OBJ, 4);
  const F_MARKER = (n: string) => hasEn(INFANT_FEVER.sets.TERM_EN, n)
    && (hasEn(INFANT_FEVER.sets.PRED_INFANT_EN, n) || hasEn(INFANT_FEVER.sets.PRED_CHILD_EN, n));

  mutations.push(
    {
      name: "WE1 bare English stems added as «recall nets» — `heart` `fell` `accident` `blood` `chest` `fever`",
      dir: "widening", view: "en", floor: 200,
      mutantFires: (n) => BARE_EN.some((t) => termReEn(t).test(n)),
    },
    {
      name: "WE2 ARM 2 EN read as CO-OCCURRENCE instead of adjacency  (§2.0 L2, in English)",
      dir: "widening", view: "en", floor: 100,
      // The denial family is the whole point: «no difficulty breathing» is a patient saying
      // they are FINE, and co-occurrence hands them an ambulance and a P0 page.
      mutantFires: (n) => hasEn(AIRWAY.sets.DIFFICULTY_EN, n) && hasEn(AIRWAY.sets.BREATHE_NOUN_EN, n),
    },
    {
      name: "WE3 the ownership qualifier back to CLAUSE-SCOPED  (T3's defect, rebuilt in English)",
      dir: "widening", view: "en", floor: 100,
      mutantFires: (n) => G_TAKE.test(n) && hasEn(POISONING.sets.QUALIFIER_OWNER_EN, n),
    },
    {
      name: "WE4 the intransitive inversion reverted — «cant speak» / «seeing double» as STANDALONE",
      dir: "widening", view: "en", floor: 40,
      mutantFires: (n) => hasEn(STROKE.sets.INTRANSITIVE_EN, n),
    },
    {
      name: "WE5 §2.2's English follow-up exclusion deleted — bare `stroke` fires again",
      dir: "widening", view: "en", floor: 30,
      mutantFires: (n) => termReEn("stroke").test(n),
    },
    {
      name: "WE6 §2.1's English grief-idiom exclusion deleted — «my heart is heavy»",
      dir: "widening", view: "en", floor: 8,
      mutantFires: A_NO_IDIOM,
    },
    {
      name: "WE7 §2.6's English past / resolved exclusions deleted — «had a fever last month»",
      dir: "widening", view: "en", floor: 100,
      mutantFires: F_MARKER,
    },
  );

  // ── ENGLISH NARROWINGS ──────────────────────────────────────────────────────────────────
  // NE1 is the bug the comment above `bodyTemperature` records, in the script where it is
  // WORSE: «38 days old» and «40 weeks» are how a parent of a newborn writes an age, and the
  // discriminating values are 35, 36 and 37 — read as a temperature they fall under 38.0 and
  // the class returns NO HIT AT ALL for the population §2.6 exists for.
  const MUT_TEMP_NO_AGE_GUARD = (n: string): number | null => {
    const re = /(?<![\d.])(\d{2,3}(?:\.\d)?)(?![\d])/g;
    for (let m = re.exec(n); m; m = re.exec(n)) {
      const v = Number(m[1]);
      if (v >= 35 && v <= 43) return v;
      const c = Math.round(((v - 32) * 5 / 9) * 10) / 10;
      if (c >= 35 && c <= 43) return c;
    }
    return null;
  };
  const MUT_TEMP_NO_F = (n: string): number | null => {
    const re = /(?<![\d.])(\d{2,3}(?:\.\d)?)(?![\d])/g;
    for (let m = re.exec(n); m; m = re.exec(n)) {
      const v = Number(m[1]);
      if (/^\s*(?:day|days|week|weeks|month|months|year|years)/.test(n.slice(m.index + m[0].length))) continue;
      if (v >= 35 && v <= 43) return v;
    }
    return null;
  };
  const unApos = (t: string) => t
    .replace(/(^|[a-z])cant([a-z]|$)/g, "$1can't$2").replace(/(^|[a-z])wont([a-z]|$)/g, "$1won't$2")
    .replace(/\bcant\b/g, "can't").replace(/\bwont\b/g, "won't").replace(/\bisnt\b/g, "isn't")
    .replace(/\bcouldnt\b/g, "couldn't").replace(/\bdidnt\b/g, "didn't").replace(/\bdoesnt\b/g, "doesn't");
  const D_ARM2 = adjEn(AIRWAY.sets.DIFFICULTY_EN, AIRWAY.sets.DIFFICULTY_MID_EN, AIRWAY.sets.BREATHE_NOUN_EN);
  const D_ARM2_DEN = adjEn(AIRWAY.sets.DENIAL_HEAD_EN, AIRWAY.sets.DENIAL_MID_EN, AIRWAY.sets.DIFFICULTY_EN);
  const D_PART = adjEn(AIRWAY.sets.PART_EN, AIRWAY.sets.PART_MID_EN, [...AIRWAY.sets.SWELL_EN, ...AIRWAY.sets.CLOSE_EN]);
  const D_PART_REV = adjEn([...AIRWAY.sets.SWELL_EN, ...AIRWAY.sets.CLOSE_EN], AIRWAY.sets.PART_MID_EN, AIRWAY.sets.PART_EN);
  const airwayEnWith = (neg: readonly string[], phrase: readonly string[], std: readonly string[]) =>
    (n: string) => adjEn(neg, AIRWAY.sets.MID_EN, AIRWAY.sets.BREATHE_EN).test(n)
      || (D_ARM2.test(n) && !D_ARM2_DEN.test(n)) || D_PART.test(n) || D_PART_REV.test(n)
      || hasEn(phrase, n) || hasEn(std, n);

  mutations.push(
    {
      name: "NE1 the age-unit guard removed from the ENGLISH temperature reader  (an age read as a fever)",
      dir: "narrowing", view: "en", ruleIdPrefix: "F.", ruleIdEndsWith: "_en", floor: 40,
      mutantArm: (n) => { const v = MUT_TEMP_NO_AGE_GUARD(n); return !(v !== null && v < 38.0); },
    },
    {
      name: "NE2 Fahrenheit dropped from the ENGLISH temperature reader  («102 F» · «103 degrees»)",
      dir: "narrowing", view: "en", ruleIdPrefix: "F.", ruleIdEndsWith: "_en", floor: 3,
      mutantArm: (n) => {
        if (MUT_TEMP_NO_F(n) !== null) return true;
        return hasEn(INFANT_FEVER.sets.PRED_INFANT_EN, n) || hasEn(INFANT_FEVER.sets.PRED_CHILD_EN, n)
          || hasEn(INFANT_FEVER.sets.PRED_PERSIST_EN, n) || hasEn(INFANT_FEVER.sets.PRED_REDFLAG_EN, n)
          || (ageInMonthsEn(n) ?? 99) < 3;
      },
    },
    {
      name: "NE3 the ENGLISH sets written UN-NORMALIZED — the apostrophe restored  (T1, in English)",
      dir: "narrowing", view: "en", ruleIdPrefix: "D.", ruleIdEndsWith: "_en", floor: 100,
      mutantArm: airwayEnWith(AIRWAY.sets.NEG_EN.map(unApos), AIRWAY.sets.PHRASE_EN.map(unApos), AIRWAY.sets.STANDALONE_EN.map(unApos)),
    },
    {
      name: "NE4 «stopped» and «struggling» dropped from the ENGLISH negation slot",
      dir: "narrowing", view: "en", ruleIdPrefix: "D.", ruleIdEndsWith: "_en", floor: 50,
      mutantArm: airwayEnWith(AIRWAY.sets.NEG_EN.filter((x) => x !== "stopped" && x !== "struggling"),
        AIRWAY.sets.PHRASE_EN, AIRWAY.sets.STANDALONE_EN),
    },
  );

  let inert = 0;
  for (const m of mutations) {
    if (m.dir === "widening") {
      const caught = ALL_QUIET.filter((t) => m.mutantFires!(NV(t, m.view)) && !fires(t));
      console.log(`   ${String(caught.length).padStart(5)} quiet strings FIRE under  ${m.name}  (floor ${m.floor})`);
      if (caught.length) console.log(`         e.g. «${caught[0]}»  …  «${caught[caught.length - 1]}»`);
      if (caught.length < m.floor) inert++;
      ok(`§M ${m.name}: the QUIET corpus separates it from the live rule (${caught.length} ≥ ${m.floor})`, caught.length >= m.floor);
    } else {
      const lost = ALL_FIRE.filter((t) => {
        const h = detectRedFlag(t);
        if (!h || !h.ruleId.startsWith(m.ruleIdPrefix!)) return false;
        if (m.ruleIdEndsWith && !h.ruleId.endsWith(m.ruleIdEndsWith)) return false;
        return !m.mutantArm!(NV(t, m.view));
      });
      console.log(`   ${String(lost.length).padStart(5)} Fires entries GO SILENT under ${m.name}  (floor ${m.floor})`);
      if (lost.length) console.log(`         e.g. «${lost[0]}»  …  «${lost[lost.length - 1]}»`);
      if (lost.length < m.floor) inert++;
      ok(`§M ${m.name}: the MUST_FIRE corpus separates it from the live rule (${lost.length} ≥ ${m.floor})`, lost.length >= m.floor);
    }
  }
  ok(`all ${mutations.length} mutations are separated by this corpus — none is inert`, inert === 0);
  console.log(`   ${mutations.filter((m) => m.dir === "widening").length} widening · ${mutations.filter((m) => m.dir === "narrowing").length} narrowing · ${inert} inert`);
}

// ═══ §R — THE RAIL (§4.1 structure, §4.2 copy, §4.3 output guard, §4.4 which ER) ════════════
console.log("\n── §R  THE RAIL: structural, not instructional ─────────────────");
{
  const fresh = (d: number): ErSite => ({
    id: "w1", name: "مجمع الوطن الطبي 1", address: "اليمامة، الرياض",
    is_er: true, er_open_24h: true,
    hours_verified_at: new Date(Date.now() - d * 86400000).toISOString(), verified_by: "ops",
  });
  const NOW = new Date();

  // §4.1 — BOOKING AND SALES ARE UNREACHABLE STRUCTURALLY, not by instruction. There is no
  // tool to call, no presentation to tap, and no composer stage to append «نكمل الحجز؟» to.
  for (const cls of ["cardiac", "stroke", "hemorrhage", "airway", "obstetric", "infant_fever", "poisoning", "trauma", "self_harm", null] as const) {
    const r = emergencyRail({ cls, tier: "emergency", sites: [fresh(3)], now: NOW });
    ok(`§R ${cls ?? "exception"}: toolNames is EMPTY`, r.toolNames.length === 0);
    ok(`§R ${cls ?? "exception"}: canBook === false`, r.canBook === false);
    ok(`§R ${cls ?? "exception"}: presentation === null`, r.presentation === null);
    ok(`§R ${cls ?? "exception"}: stopReason on EVERY branch (A, B and C)`, r.stopReason === "faysal_redflag_emergency");
    ok(`§R ${cls ?? "exception"}: triageHold set before the reply`, r.triageHold === true);
    ok(`§R ${cls ?? "exception"}: voice is hard-zeroed`, r.voiceHardZeroReason === "safety_hold");
    ok(`§R ${cls ?? "exception"}: pager priority is P0`, r.pagerPriority === "P0");
    ok(`§R ${cls ?? "exception"}: §4.3 output guard clean — ${railCopyViolations(r.text).join(", ") || "none"}`,
      railCopyViolations(r.text).length === 0);
  }

  // §4.2 / §11.3 — `997` in EVERY A–H branch, as the FIRST line, in WESTERN digits.
  for (const cls of ["cardiac", "airway", "trauma", null] as const) {
    const r = emergencyRail({ cls, tier: "emergency", sites: [fresh(3)], now: NOW });
    ok(`§R ${cls ?? "exception"}: 997 on the FIRST line`, r.text.split("\n")[0].includes("997"));
    ok(`§R ${cls ?? "exception"}: 997 in WESTERN digits, not ٩٩٧`, !r.text.includes("٩٩٧"));
  }
  ok("§R rail C also carries 997", emergencyRail({ cls: "self_harm", tier: "emergency" }).text.includes("997"));

  // §4.4 — THE ER SITE IS NAMED ONLY FROM A RECORD VERIFIED WITHIN 30 DAYS. Sending a patient
  // with chest pain to a branch that closed at midnight is a lethal defect a unit test cannot
  // catch, so the code refuses to guess: stale, absent, or not-an-ER all render branch B.
  ok("§R fresh (3 days) → branch A, site named",
    emergencyRail({ cls: "cardiac", tier: "emergency", sites: [fresh(3)], now: NOW }).branch === "A");
  ok("§R 29 days → still branch A", emergencyRail({ cls: "cardiac", tier: "emergency", sites: [fresh(29)], now: NOW }).branch === "A");
  ok("§R 31 DAYS → branch B, NO site named",
    emergencyRail({ cls: "cardiac", tier: "emergency", sites: [fresh(31)], now: NOW }).branch === "B");
  ok("§R 31 days → siteNamed is null", emergencyRail({ cls: "cardiac", tier: "emergency", sites: [fresh(31)], now: NOW }).siteNamed === null);
  ok("§R never verified → branch B",
    emergencyRail({ cls: "cardiac", tier: "emergency", sites: [{ ...fresh(1), hours_verified_at: null }], now: NOW }).branch === "B");
  ok("§R not an ER → branch B",
    emergencyRail({ cls: "cardiac", tier: "emergency", sites: [{ ...fresh(1), is_er: false }], now: NOW }).branch === "B");
  ok("§R zero sites → branch B", emergencyRail({ cls: "cardiac", tier: "emergency", sites: [], now: NOW }).branch === "B");
  ok("§R branch B is byte-exact", emergencyRail({ cls: "cardiac", tier: "emergency", sites: [], now: NOW }).text === RAIL_B);
  ok("§R eligibleErSites drops the stale row", eligibleErSites([fresh(31), fresh(2)], NOW).length === 1);
  ok("§R a FUTURE verification timestamp is not eligible either (clock skew is not evidence)",
    eligibleErSites([{ ...fresh(0), hours_verified_at: new Date(Date.now() + 86400000).toISOString() }], NOW).length === 0);

  // §12 row 6 — THE MENTAL-HEALTH NUMBER SHIPS BLANK. Precedent: the Egyptian ambulance number
  // was deliberately left out rather than guessed — "a wrong number is worse than none,
  // because it is dialled and it fails." A psychological-support number reached by a person in
  // crisis has the same property. It goes in with a SIGNATURE, not a deploy.
  ok("§12 row 6: SUPPORT_LINE_SENTENCE ships BLANK", SUPPORT_LINE_SENTENCE === "");
  const c = emergencyRail({ cls: "self_harm", tier: "emergency" }).text;
  ok("§12 row 6: rail C renders NO support line while the slot is blank", !/\n\s*\n/.test(c) && c.split("\n").length === 3);
  ok("§12 row 6: rail C contains no phone number other than 997", (c.match(/\d+/g) ?? []).every((d) => d === "997"));
  // …and rail C does NOT do the things §4.2 says it must not.
  for (const banned of ["لا تسوي كذا", "فكر في أهلك", "بيتصلون فيك خلال", "خلال دقائق"]) {
    ok(`§R rail C omits «${banned}»`, !c.includes(banned));
  }
}

// ═══ §H — THE TRIAGE HOLD (§1.5 R2), READ AT THE WRITE ══════════════════════════════════════
console.log("\n── §H  THE HOLD: read at the write, released by a person ───────");
{
  // THE ASSERTION THE FIRST DRAFT HAD NO MECHANISM FOR. Fire the rail on «صدري يعورني وأتعرق»;
  // then assert the NEXT turn's text is CORRECTLY QUIET — it is, and that is the point — and
  // that the booking write on that thread is refused anyway. If this test can be made to pass
  // by making the first assertion fail, it is measuring the detector, not the hold.
  const turn1 = detectRedFlag("صدري يعورني وأتعرق");
  ok("§H turn 1 fires", turn1 !== null && turn1.tier === "emergency");
  ok("§H turn 2 «طيب أبغى موعد قلب بكرة الساعة 10» is CORRECTLY QUIET",
    detectRedFlag("طيب أبغى موعد قلب بكرة الساعة 10") === null);

  const heldRow = { ...OPEN_TRIAGE_HOLD_PATCH };
  ok("§H the rail's patch sets BOTH fields", heldRow.triage_hold === true && heldRow.ownership_state === "SYSTEM_HOLD");
  ok("§H isTriageHeld on the patched row", isTriageHeld(heldRow));
  ok("§H isTriageHeld on ownership_state alone", isTriageHeld({ ownership_state: "SYSTEM_HOLD" }));
  ok("§H isTriageHeld on triage_hold alone", isTriageHeld({ triage_hold: true }));
  ok("§H isTriageHeld on a clean row", !isTriageHeld({ ownership_state: "BOT", triage_hold: false }));
  ok("§H isTriageHeld on null", !isTriageHeld(null));

  const readHeld = async () => ({ id: "conv1", conv: heldRow as { ownership_state: string; triage_hold: boolean } });
  const readClean = async () => ({ id: "conv2", conv: { ownership_state: "BOT", triage_hold: false } });
  const readThrows = async () => { throw new Error("supabase down"); };

  const results = await Promise.all([
    checkBookingTriageHold(readHeld, "tok", "create"),
    checkBookingTriageHold(readClean, "tok", "create"),
    checkBookingTriageHold(readThrows, "tok", "create"),
    checkBookingTriageHold(readHeld, "tok", "cancel"),
    checkBookingTriageHold(readThrows, "tok", "cancel"),
    checkBookingTriageHold(readHeld, "tok", "confirm"),
    checkBookingTriageHold(readHeld, "tok", "reschedule"),
  ]);
  ok("§H H-3 a create on a held thread is REFUSED", results[0].held && results[0].reason === "triage_hold_open");
  ok("§H a create on a clean thread proceeds", !results[1].held);
  ok("§H H-4 FAIL-CLOSED: a read error is HELD", results[2].held && results[2].reason === "triage_hold_check_failed");
  ok("§H H-6 cancellation survives the hold", !results[3].held);
  ok("§H H-6 cancellation survives even a broken read", !results[4].held);
  ok("§H confirm is refused on a held thread", results[5].held);
  ok("§H reschedule is refused on a held thread", results[6].held);
  ok("§H COMMITTED_APPOINTMENT_STATES excludes draft/pending/cancelled",
    !COMMITTED_APPOINTMENT_STATES.includes("draft") && !COMMITTED_APPOINTMENT_STATES.includes("cancelled")
    && COMMITTED_APPOINTMENT_STATES.includes("confirmed"));

  // H-5 — RELEASE IS AN EXPLICIT OPERATOR NEXT-ACTION. No timer, no message, no model output,
  // no flag. There is exactly one shape that produces a release and it needs a NAMED operator.
  ok("§H H-5 release with a named operator works",
    releaseTriageHold({ releasedBy: "sara.alqahtani", releasedAt: new Date().toISOString() })?.ownership_state === "HUMAN_ACTIVE");
  ok("§H H-5 release with NO operator is refused", releaseTriageHold({ releasedBy: "", releasedAt: new Date().toISOString() }) === null);
  ok("§H H-5 release with whitespace-only operator is refused", releaseTriageHold({ releasedBy: "   ", releasedAt: new Date().toISOString() }) === null);
  ok("§H H-5 release with no timestamp is refused", releaseTriageHold({ releasedBy: "sara", releasedAt: "" }) === null);
  ok("§H H-5 release records released_by and released_at",
    !!releaseTriageHold({ releasedBy: "sara", releasedAt: "2026-09-09T10:00:00Z" })?.released_by);
}

// ═══ §X — THE DETECTOR EXCEPTION (§1.5 R3) ══════════════════════════════════════════════════
console.log("\n── §X  A DETECTOR EXCEPTION IS AN `emergency`, NEVER AN `urgent` ");
{
  // §10 said "detector throws → fail closed: treat as `urgent`". §1.3 says `urgent` LEAVES
  // BOOKING REACHABLE. So the designated fail-closed path was fail-OPEN for the one thing the
  // rail exists to prevent, on the one turn where we have no information at all.
  const thrower = () => { throw new Error("malformed transcript"); };
  const v = isFaysalSafetyInbound("صدري يعورني وأتعرق", thrower);
  ok("§X a throw produces fired:true", v.fired);
  ok("§X a throw produces tier === 'emergency', NOT 'urgent'", v.tier === "emergency");
  ok("§X a throw produces ruleId 'detector_exception'", v.ruleId === "detector_exception");
  ok("§X a throw names NO class (we could not classify, so we cannot route)", v.class === null);
  const r = emergencyRail({ cls: v.class, tier: v.tier! });
  ok("§X the exception renders BRANCH B", r.branch === "B");
  ok("§X branch B still carries 997", r.text.includes("997"));
  ok("§X the exception turn has an empty tool set", r.toolNames.length === 0);
  ok("§X the exception turn cannot book", r.canBook === false);
  ok("§X the exception turn pages P0, not P1", r.pagerPriority === "P0");
  ok("§X the exception turn sets the hold", r.triageHold === true);
  // A NON-CONFORMING RETURN IS TREATED EXACTLY LIKE A THROW — §1.5 R3 says "any throw, timeout,
  // OR NON-CONFORMING RETURN". A stub that quietly returns the wrong shape is the realistic
  // failure, not an exception: a refactor changes a field name and every surface reads `null`.
  for (const [name, stub] of [
    ["missing tier", () => ({ fired: true, class: "cardiac", termAr: "صدري", ruleId: "x", label: "y" })],
    ["tier is 'urgent-ish' garbage", () => ({ fired: true, class: "cardiac", tier: "high", termAr: "a", ruleId: "x", label: "y" })],
    ["fired is false but an object is returned", () => ({ fired: false, class: null, tier: null, termAr: null, ruleId: null, label: null })],
    ["a bare string", () => "emergency"],
  ] as Array<[string, () => unknown]>) {
    const vv = isFaysalSafetyInbound("صدري يعورني وأتعرق", stub as () => RedFlagHit | null);
    ok(`§X non-conforming return (${name}) → emergency, not silence`, vv.fired && vv.tier === "emergency" && vv.ruleId === "detector_exception");
  }
  ok("§X the constant itself is emergency", DETECTOR_EXCEPTION.tier === "emergency");
  // …AND THE UNION IS WHAT SURFACES CALL. A guard proven in one detector is not a guard.
  ok("§X the union agrees with the detector on a hit", isFaysalSafetyInbound("ما أقدر أتنفس").class === "airway");
  ok("§X the union agrees with the detector on silence", !isFaysalSafetyInbound("أبغى موعد بكرة").fired);
}

// ═══ §W — WIRING, AND THE ONE LIST THAT MUST NOT BE A COPY ══════════════════════════════════
console.log("\n── §W  WIRING, AND THE SHARED-LEXICON BINDING ──────────────────");
{
  // §11.0 — registration in `unit-suite.json` makes a proof VISIBLE, NOT ENFORCING:
  // `core-gate.yml:112` carries `continue-on-error: true`, and the blocking workflow is
  // `paths:`-filtered with no `lib/health/**`. This assertion checks the half that is in this
  // wave's scope and PRINTS the half that is not, so nobody reads green as "gated".
  const suite = JSON.parse(readFileSync(resolve(import.meta.dirname, "unit-suite.json"), "utf8")) as string[];
  ok("§W this proof is registered in scripts/unit-suite.json",
    suite.some((c) => c.includes("proof-faysal-safety.test.ts")));

  let gate = "";
  try { gate = readFileSync(resolve(import.meta.dirname, "../.github/workflows/agent-eval.yml"), "utf8"); } catch { /* not present */ }
  const inBlockingGate = gate.includes("proof-faysal-safety.test.ts");
  const pathsCoverHealth = /paths:[\s\S]{0,800}lib\/health/.test(gate);
  console.log(`   registered in unit-suite.json : yes`);
  console.log(`   named in agent-eval.yml       : ${inBlockingGate ? "yes" : "NO  ← §12 row 13, still open"}`);
  console.log(`   lib/health/** in its paths:   : ${pathsCoverHealth ? "yes" : "NO  ← §12 row 13, still open"}`);
  if (!inBlockingGate || !pathsCoverHealth) {
    console.log("   ⚠  §11.0: a PR touching only lib/health/* triggers NEITHER blocking job today.");
    console.log("      `core-gate.yml:112` has `continue-on-error: true`, so `npm run test:unit`");
    console.log("      runs this file and CI swallows the exit code. §12 row 13 is a launch gate");
    console.log("      and it is NOT this wave's to close — the workflow files are outside the");
    console.log("      safety rail's ownership. Registration is necessary and worth nothing alone.");
  }

  // §2.9's DISEASE_OBJECT IS ENUMERATED LOCALLY AND MUST NOT DRIFT FROM THE SHARED LEXICON.
  // A copied list is how `symptom-frames.ts`'s two ancestors became a deaf spot, so every
  // member is DRIVEN through the real `lib/ai/allergen-gate.ts` rather than trusted.
  const notRecognised = SELF_HARM.sets.DISEASE_OBJECT.filter(
    (t) => detectAllergenAvoidance(`عندي حساسية من ${t}`).term === null);
  for (const t of notRecognised) ok(`§W «${t}» is in DISEASE_OBJECT but the SHARED allergen lexicon does not know it`, false);
  pass += SELF_HARM.sets.DISEASE_OBJECT.length - notRecognised.length;
  console.log(`   ${SELF_HARM.sets.DISEASE_OBJECT.length} DISEASE_OBJECT members · ${SELF_HARM.sets.DISEASE_OBJECT.length - notRecognised.length} recognised by the shared lexicon`);
  ok(`§2.9's allergy carve-out agrees with lib/ai/allergen-gate.ts (${notRecognised.length} drifted)`, notRecognised.length === 0);

  // …AND THE ALLERGY DISCLOSURE ITSELF. «بموت لو أكلت فول سوداني» is an allergy statement in
  // this repo's own avoidance lexicon, and firing a suicide rail at it is the failure §1.3
  // singles this class out for.
  for (const t of SELF_HARM.sets.DISEASE_OBJECT) {
    ok(`§W «بموت لو أكلت ${t}» is not self-harm`, detectRedFlag(`بموت لو أكلت ${t}`) === null);
  }

  // ── §11.9's WIRING PROPERTY, AS FAR AS THIS FILE CAN SEE IT ──────────────────────────────
  // A GUARD PROVEN IN ONE DETECTOR IS NOT A GUARD, and this repo has shipped that mistake
  // twice. `index.ts` exists so the EXCEPTION WRAPPER is part of the union rather than
  // something each surface remembers to add — so a surface that reaches past it to
  // `detectRedFlag` gets §1.5 R3's fail-closed behaviour only by accident.
  //
  // The full meta-proof (§11.9) reads every inbound surface and asserts the call and its
  // ORDER relative to the model. That file is not this wave's and the surfaces are another
  // agent's; what IS in scope is the half that can be checked from the module's own side:
  // whoever imports this module must import the UNION. Comments are stripped first, so a
  // mention in prose cannot satisfy a check for a call — the technique
  // `proof-phonetic-net-unwired.test.ts` uses and the reason it survived a driven mutation.
  // LINE COMMENTS FIRST, THEN BLOCK COMMENTS, AND THE ORDER IS THE WHOLE THING. Written the
  // other way round this scanner reported ZERO importers on a file that plainly imports the
  // module: `app/api/faysal/_domain/index.ts` L6 is a `//` comment containing the path glob
  // «lib/health/*», whose `/*` opened a block comment that ran to the next `*/` — a JSDoc 85
  // lines later — and swallowed the import. A scanner that is defeated by a path glob in a
  // sentence reports "no call site" and passes, which is the failure mode
  // `proof-phonetic-net-unwired.test.ts` calls "adversarially hardened" for.
  const stripComments = (src: string) =>
    src.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n").replace(/\/\*[\s\S]*?\*\//g, " ");
  const walk = (dir: string): string[] => {
    let out: string[] = [];
    let entries: Array<{ name: string; isDirectory(): boolean }> = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    for (const e of entries) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) out = out.concat(walk(full));
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
    return out;
  };
  const surfaces = [...walk(resolve(import.meta.dirname, "../app/api/faysal")), ...walk(resolve(import.meta.dirname, "../app/faysal"))];
  const importers = surfaces
    .map((f) => [f, stripComments(readFileSync(f, "utf8"))] as const)
    .filter(([, src]) => /from\s+["'](?:@\/)?lib\/health\/safety/.test(src));
  console.log(`   ${surfaces.length} Faysal surface files scanned · ${importers.length} import lib/health/safety`);
  const reachPast = importers.filter(([, src]) =>
    /\bdetectRedFlag\b/.test(src) && !/\bisFaysalSafetyInbound\b/.test(src));
  for (const [f] of reachPast) {
    ok(`§W ${f.split("/").slice(-4).join("/")} imports detectRedFlag WITHOUT the union — §1.5 R3 is bypassed`, false);
  }
  pass += importers.length - reachPast.length;
  ok(`every Faysal surface that imports the safety module imports the UNION (${reachPast.length} reach past it)`,
    reachPast.length === 0);
  // THE SCAN MUST BE REAL. A proof over an empty set passes vacuously, which is exactly how a
  // seam guard dies the day someone renames a directory — and how this check read 0/13 while
  // the import was sitting there.
  ok(`the surface scan found Faysal sources (${surfaces.length} ≥ 5)`, surfaces.length >= 5);
  if (importers.length === 0) {
    console.log("   (no Faysal surface imports lib/health/safety yet — the wiring meta-proof §11.9 is where");
    console.log("    that becomes an assertion; this file cannot prove a call site that does not exist.)");
  } else {
    ok(`at least one surface imports the module and it imports the union (${importers.length})`,
      importers.every(([, src]) => /\bisFaysalSafetyInbound\b/.test(src)));
  }

  // §3.5 / §11.10 — FAYSAL DOES NOT REWIRE THE PHONETIC NET. No fuzzy matching on typed text:
  // no edit distance, no phonetic folding, no "within 2 of a safety word". The Founder retired
  // that net after «هلا والله» became an allergy consultation in front of him.
  const src = ["normalize", "match", "lexicon", "lexicon-en", "detect", "rail", "triage-hold", "index"]
    .map((f) => readFileSync(resolve(import.meta.dirname, `../lib/health/safety/${f}.ts`), "utf8"))
    .join("\n")
    .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  for (const banned of ["phonetic-safety-net", "levenshtein", "editDistance", "fuzzy"]) {
    ok(`§W no code in lib/health/safety/ references «${banned}»`, !src.includes(banned));
  }
  // …and it is PURE: no DB, no clock, no model, no network in the detector's own path.
  const detectSrc = readFileSync(resolve(import.meta.dirname, "../lib/health/safety/detect.ts"), "utf8");
  for (const banned of ["supabase", "fetch(", "Date.now", "new Date", "process.env", "await "]) {
    ok(`§W detect.ts contains no «${banned}» — PURE and pre-model`, !detectSrc.includes(banned));
  }
}

// ═══ TOTALS ═════════════════════════════════════════════════════════════════════════════════
console.log(`\n   corpus totals: ${mustFireTotal} MUST_FIRE · ${mustQuietTotal} MUST_BE_QUIET · ${mustFireTotal + mustQuietTotal} assertions`);
const ordinaryCount = (pred: (k: string) => boolean) =>
  [...QUIET_BY_FAMILY.entries()].filter(([k]) => pred(k)).reduce((n, [, v]) => n + v.length, 0);
console.log(`   …of which ${ordinaryCount((k) => k.startsWith("Q") && !k.startsWith("QE"))} are ordinary clinic strings derived from ARABIC`);
console.log(`   and ${ordinaryCount((k) => k.startsWith("QE"))} from ENGLISH — both from a clinic inbox's own vocabulary, neither from the detector's axes`);
console.log(`\n   NOT PROVEN HERE, AND BLOCKING (§12): the clinical correctness of every threshold;`);
console.log(`   the emergency/urgent boundary; the infant-fever cut-offs; the rail's wording; the`);
console.log(`   self-harm copy and escalation; the mental-health number (ships BLANK); which sites`);
console.log(`   have a 24-hour ER on which weekday; the false-positive rate on real traffic; and`);
console.log(`   whether these proofs gate a merge at all. Seventeen rows, all unsigned.`);
console.log(`\n${fails.length ? "FAIL" : "PASS"} faysal-safety: ${pass}/${pass + fails.length} passed`);
if (fails.length) {
  if (fails.length > 40) console.log(`   … ${fails.length - 40} more failures not listed`);
  process.exit(1);
}
