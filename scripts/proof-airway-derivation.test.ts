// ============================================================================
// PROOF — the airway family is a CROSS PRODUCT, not a list of sentences.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-airway-derivation.test.ts
//
// WHY THIS FILE EXISTS: THE SAME BUG HAPPENED TWICE, AND A HAND-WRITTEN CORPUS FOUND NEITHER.
//
// First time: Najdi «مو» was missing from the negation list, so «مو قادر أتنفس» — the most
// natural way this agent's own core customer says "I can't breathe" — fired nothing while «ما
// أقدر أتنفس» fired. It was fixed by adding the three phrasings somebody thought of.
//
// Second time, one wave later, driven against the real module:
//
//   «ما عاد يتنفس»          he stopped breathing            SILENT
//   «ما عاد يقدر يتنفس»     he can no longer breathe        SILENT
//   «عندي صعوبة بالتنفس»    I have difficulty breathing     SILENT   ← the Gulf «ب»
//   «عندي صعوبة في التنفس»  the identical sentence, «في»    FIRED
//
// Both misses are the same shape: A SLOT WITH ONE VALUE IN IT. The negation slot had five
// particles and not «ما عاد»; the preposition slot had «في» and not «ب»; every verb in the
// family was frozen in the first person, so a father could not report his son at all.
//
// A corpus of sentences somebody thought of cannot find that, because the sentences somebody
// thinks of are the ones already in the code — the Faysal wave proved it, certifying 34/34
// while eleven strings on the spec's own must-fire list were silent. So this corpus is not
// written. It is GENERATED: the same axes the module composes its regexes from, multiplied
// out. If a slot loses a value, thousands of assertions fail at once.
//
// AND THE OTHER DIRECTION IS ASSERTED IN THE SAME FILE, ON PURPOSE. Widening a safety net is
// the easy half; a net that fires on ordinary conversation is a broken product, and that work
// is recent and deliberate. So the quiet side is generated too, and re-driven from the two
// corpora that already own it:
//
//   1. every "must stay quiet" string in `scripts/proof-allergy-false-positives.test.ts`,
//      EXTRACTED FROM ITS SOURCE at run time rather than copied — a copy is how the symptom
//      frame lists drifted apart, and a copy would not follow that file when it grows;
//   2. every utterance in the voice eval set behind `proof-voice-safety-net.test.ts`;
//   3. the near misses this widening could have taken with it — THE SAME AXES with an
//      ordinary complement («ما عاد أقدر أنتظر» = "I can no longer wait"), and the homographs
//      the new slots reach («نفسه» is also "itself", «حلقة» is also an episode).
//
// THOSE THREE WERE NOT ENOUGH, AND THE WAY THEY FAILED IS THE MOST IMPORTANT THING IN THIS
// FILE. All 6,321 of them were ALREADY GREEN on the module as it stood BEFORE the widening —
// §8 drives that, it is not a claim — so not one of them could have constrained it. They were
// derived from the module's own axes, and the false positives came from properties of ARABIC
// that no axis names: «ما» is the tail of «دايما», «نفس» is also "the same", «نفسه» is also
// "himself". The widening shipped with 3,993 ordinary Saudi restaurant strings raising a full
// allergy emergency, and this corpus read "zero false positives" the whole time, because it
// contained nothing the widening touched.
//
//   4. So §8 derives a quiet corpus from the OTHER END — ordinary restaurant vocabulary and
//      the homographs themselves — and drives it through THREE modules: the frozen
//      pre-widening one, the frozen widened one the audit blocked, and the live one. A quiet
//      corpus that reads the same on all three proves nothing. This one separates them, and
//      the file asserts by how much.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectAllergenEmergency } from "../lib/ai/allergen-emergency.ts";
// THE TWO OTHER VERSIONS OF THIS MODULE, FROZEN, SO §8 CAN DRIVE THE DIFFERENTIAL RATHER
// THAN ASSERT IT. `preWidening` is the module before the derivation work; `widened` is the
// module exactly as the audit blocked it. See `scripts/fixtures/` for why they are checked in.
import { detectAllergenEmergency as preWidening } from "./fixtures/allergen-emergency-pre-widening.ts";
import { detectAllergenEmergency as widened } from "./fixtures/allergen-emergency-widened.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); if (fails.length <= 40) console.log(`  FAIL ${label}`); }
};
const fires = (t: string) => detectAllergenEmergency(t).fired;
/** The same question, asked of the two frozen versions. `.fired` and not the hit itself — an
 *  `EmergencyHit` is an object and therefore always truthy, which is a differential that
 *  reports "everything fires everywhere" and passes its own floors. */
const firesPreWidening = (t: string) => preWidening(t).fired;
const firesWidened = (t: string) => widened(t).fired;

/** Cartesian product of the slots, joined with single spaces, empties collapsed. */
const cross = (...axes: string[][]): string[] =>
  axes
    .reduce<string[][]>((acc, ax) => acc.flatMap((p) => ax.map((v) => [...p, v])), [[]])
    .map((p) => p.filter((x) => x !== "").join(" ").replace(/\s+/g, " ").trim())
    .filter((s) => s !== "");

const mustFire = (section: string, corpus: string[]) => {
  const silent = corpus.filter((t) => !fires(t));
  for (const t of silent) ok(`${section}: «${t}» is SILENT`, false);
  pass += corpus.length - silent.length;
  console.log(`   ${corpus.length} derived · ${corpus.length - silent.length} fire · ${silent.length} silent`);
  return corpus.length;
};
/** Every string any section asserts quiet, kept so §8 can re-drive the WHOLE set against the
 *  two frozen modules rather than a sample of it. */
const everyQuietString: Array<[string, string]> = [];
const mustBeQuiet = (section: string, corpus: string[]) => {
  for (const t of corpus) everyQuietString.push([section, t]);
  const loud = corpus.filter((t) => fires(t));
  for (const t of loud) ok(`${section}: «${t}» FIRED`, false);
  pass += corpus.length - loud.length;
  console.log(`   ${corpus.length} driven · ${corpus.length - loud.length} quiet · ${loud.length} fired`);
  return corpus.length;
};

// ── THE AXES ─────────────────────────────────────────────────────────────────
// Written here in the SPELLINGS A PERSON TYPES (with «أ», «ة», «ى»), not the normalized ones
// the module matches on. That is deliberate: the detector normalizes its input, and three
// alternatives in this file's sibling were dead for years because they were written in the
// spelling a person types inside a list matched against normalized text. Driving the typed
// spelling is the only way to prove the normalizer and the pattern agree.

/** NEGATION — every particle Arabic uses for "not", across Najdi, Gulf, Hijazi and Egyptian,
 *  including the Egyptian ما…ش circumfix fused onto the verb. */
const NEG = ["ما", "مو", "موب", "مب", "مهوب", "مش", "ماني", "مانه", "ماهو", "مقدرش", "ماقدرش", "معرفش"];
/** "NO LONGER" — the slot that was missing entirely, and the one an emergency lives in: it is
 *  what you say when the state has just CHANGED. */
const NO_LONGER = ["", "عاد", "بقيت"];
/** ABILITY — the auxiliary, in every person and both genders. Empty is a value: «ما عاد يتنفس»
 *  carries no auxiliary at all, and requiring one is exactly what silenced it. */
const ABLE = ["", "أقدر", "اقدر", "يقدر", "تقدر", "نقدر", "قادر", "قادرة", "قادرين", "عارف", "عارفة", "يعرف", "أستطيع", "يستطيع"];
/** PERSON — the verb inflection. «أتنفس» is me, «يتنفس» is him, «تتنفس» is her, «نتنفس» is us. */
const BREATHE = ["أتنفس", "اتنفس", "يتنفس", "تتنفس", "نتنفس", "التنفس", "تنفس"];
/** WHO the message is about. A parent reporting a child is not an exotic case in a restaurant. */
const PERSON = ["ابني", "بنتي", "ولدي", "الطفل", "زوجتي", "أمي"];
/** PREPOSITION — «في» was hard-coded. «ب» is the Gulf one, «ف» the Najdi contraction of «في»,
 *  and «صعوبة تنفس» carries none at all. */
const PREP = ["", "في", "ب", "ف"];
/** POSSESSIVE — the same person axis, on the noun instead of the verb. */
const POSS = ["ي", "ه", "ها", "هم", "نا"];

// ── 1. THE FOUR SENTENCES THAT WERE SILENT ───────────────────────────────────
console.log("\n── THE DRIVEN DEFECT, NAMED ────────────────────────────────────");
{
  // The verbatim table from the report, plus the four third-person reports found beside it.
  for (const t of [
    "ما عاد يتنفس", "ما عاد يقدر يتنفس", "عندي صعوبة بالتنفس", "عندي صعوبة في التنفس",
    "ابني ما يقدر يتنفس", "الطفل ما يتنفس", "ابني شفايفه زرقاء", "زوجتي حلقها يتورم",
  ]) {
    ok(`«${t}» reaches the emergency path`, fires(t));
  }
  // …AND THE FIRST OCCURRENCE OF THE SAME BUG STAYS FIXED. «مو قادر أتنفس» is the case the
  // last patch was written for; a rewrite of this family is exactly how it would come back.
  for (const t of ["مو قادر أتنفس", "ما أقدر أتنفس", "مش عارف أتنفس", "ماني قادر أتنفس", "مب قادر أتنفس"]) {
    ok(`«${t}» still fires (first occurrence stays fixed)`, fires(t));
  }
}

// ── 2. NEGATION × NO-LONGER × ABILITY × PERSON ───────────────────────────────
console.log("\n── THE CROSS PRODUCT: NEGATION × ABILITY × PERSON ──────────────");
let derivedTotal = 0;
let quietTotal = 0;
{
  // Every combination of the four slots. Some combinations are person-mismatched («ماني يقدر
  // يتنفس») and nobody would type them; they are asserted anyway, because this file's own
  // header says over-escalation is acceptable and missing an active emergency is not. A
  // detector that fires on a malformed sentence about not breathing is doing its job.
  derivedTotal += mustFire("neg×able×person", cross(NEG, NO_LONGER, ABLE, BREATHE));
}

console.log("\n── …IN A CARRIER, WITH A PERSON AND WITH URGENCY ───────────────");
{
  // The same product inside the sentence shapes it actually arrives in: a subject in front
  // («ابني ما يقدر يتنفس»), an urgency word behind («الحين»، «بسرعة»), or both.
  const TAIL = ["", "الحين", "بسرعة ساعدوني", "بعد ما أكل الكيك"];
  derivedTotal += mustFire(
    "carrier",
    cross(PERSON, ["ما", "مو", "ما عاد", "مش"], ["", "يقدر", "قادر", "عارف"], BREATHE, TAIL)
  );
}

// ── 3. THE PREPOSITION AXIS ──────────────────────────────────────────────────
console.log("\n── THE PREPOSITION: «في» WAS THE ONLY VALUE ────────────────────");
{
  // «صعوبة في التنفس» fired and «صعوبة بالتنفس» — the identical sentence in Gulf Arabic —
  // did not. The head noun and the breath noun are axes too: «ضيق» is as common as «صعوبة»,
  // and «النفس» as common as «التنفس».
  const HEAD = ["صعوبة", "صعوبه", "صعوبات", "ضيق"];
  const ART = ["", "ال"];
  const BREATH_NOUN = ["تنفس", "نفس"];
  const FRAME = ["", "عندي", "عنده", "عندها", "ابني عنده", "أحس ب", "فيني"];
  // The preposition and the article are SEPARATE slots, and the joining is the point: «في»
  // stands as its own word («في التنفس»), «ب» and «ف» glue onto what follows («بالتنفس»,
  // «فالتنفس»), and either may carry the article or not.
  const nominal = FRAME.flatMap((f) =>
    HEAD.flatMap((h) =>
      PREP.flatMap((p) =>
        ART.flatMap((a) =>
          BREATH_NOUN.map((b) => `${f} ${h} ${p}${p === "في" ? " " : ""}${a}${b}`.replace(/\s+/g, " ").trim())
        )
      )
    )
  );
  derivedTotal += mustFire("preposition", nominal);
  // …and the same statement with the difficulty as a verb rather than a noun.
  derivedTotal += mustFire("صعب-verb", cross(["صعب", "يصعب"], ["", "علي", "عليه", "عليها", "علينا"], ["التنفس", "تنفس"]));
  // …and the event form, which carries no negation particle at all — so the negation axis on
  // its own would still have missed it.
  derivedTotal += mustFire(
    "stopped-breathing",
    cross(["توقف", "وقف", "بطل", "انقطع"], ["", "عن"], ["التنفس", "تنفس", "يتنفس", "أتنفس"])
  );
}

// ── 4. THE PERSON AXIS ON THE BODY ───────────────────────────────────────────
console.log("\n── THE POSSESSIVE: EVERY BODY TERM WAS BOUND TO «ي» ────────────");
{
  // «حلقي يقفل» fired; «حلقها يقفل» — a husband reporting his wife — did not. Same slot.
  const THROAT = ["حلق", "زور", "حنجرت", "بلعوم"];
  const CLOSES = ["يقفل", "تقفل", "يتقفل", "بيقفل", "قافل", "قفل", "يضيق", "بيضيق", "ضاق",
    "يتورم", "بيتورم", "متورم", "مسدود", "انسد", "يسكر", "بيسكر", "سكر"];
  derivedTotal += mustFire("throat×poss", THROAT.flatMap((b) => POSS.flatMap((p) => CLOSES.map((v) => `${b}${p} ${v}`))));

  const SWELL_BODY = ["شفايف", "لسان", "وش", "وجه", "عين", "حلق", "بلعوم", "زور", "حنجرت"];
  const SWELLS = ["تورم", "تتورم", "يتورم", "بيتورم", "ورم", "منتفخ", "انتفخ", "ينتفخ", "تنتفخ"];
  derivedTotal += mustFire("swell×poss", SWELL_BODY.flatMap((b) => POSS.flatMap((p) => SWELLS.map((v) => `${b}${p} ${v}`))));
  // «شفة» is the ONE body word that stays first-person, and it is not an oversight: «شفته» is
  // also «شفته» = "I saw it", so «الخبز شفته ينتفخ» ("I saw the bread rising") would become an
  // anaphylaxis. Nobody says «شفته» for a swelling lip; they say «شفايفه», which is covered.
  for (const v of SWELLS) ok(`«شفتي ${v}» fires`, fires(`شفتي ${v}`));
  derivedTotal += SWELLS.length;

  // «كبر»/«كبرت» WAS IN THAT LIST AND THIS PROOF REQUIRED IT ON EVERY BODY PART. THAT WAS A
  // BUG THE PROOF HAD PROMOTED TO A SPECIFICATION, and it is removed deliberately.
  //
  // «كبر» is "grew", not "swelled" — Arabic says a swelling is «متورم» or «منتفخ». Crossed
  // with the new possessive axis it asserted «عينها كبرت» ("her eyes went WIDE with joy") and
  // «وجهه كبر» ("his face filled out from the food") as MUST-FIRE anaphylaxis. The verb was
  // first-person-only before this family gained the person axis, and the axis was added
  // without the verb list being re-read; this corpus then froze the result.
  //
  // It survives on the LIPS and the TONGUE, where "got bigger" has no ordinary reading and is
  // a real report of angioedema — and it is asserted quiet everywhere else, so the split
  // cannot silently be undone.
  const GREW = ["كبر", "كبرت"];
  derivedTotal += mustFire("grew×lips-tongue",
    ["شفايف", "شفاه", "لسان"].flatMap((b) => POSS.flatMap((p) => GREW.map((v) => `${b}${p} ${v}`))));
  for (const v of GREW) ok(`«شفتي ${v}» fires`, fires(`شفتي ${v}`));
  derivedTotal += GREW.length;
  quietTotal += mustBeQuiet("grew×face-eyes-throat",
    ["وش", "وجه", "عين", "حلق", "بلعوم", "زور", "حنجرت"].flatMap((b) =>
      POSS.flatMap((p) => GREW.flatMap((v) => ["", "من الفرح", "من الاكل", "شوي"].map((t) => `${b}${p} ${v} ${t}`.trim())))));
}

console.log("\n── THE BREATH ITSELF, IN BOTH PERSONS ──────────────────────────");
{
  const TIGHT = ["ضاق", "يضيق", "بيضيق", "ضايق", "مسدود", "واقف", "بيقف", "انقطع", "مقطوع"];
  derivedTotal += mustFire("نفسي×tight", TIGHT.map((v) => `نفسي ${v}`));

  // THIRD PERSON NEEDS A PERSON NAMED — «نفسه» is "his breath" AND "itself", and «الطلب نفسه
  // واقف» is an ordinary delivery sentence (asserted quiet below). The person is the tell, and
  // that non-widening is load-bearing: mutating it away fails this file.
  //
  // BUT THIS SECTION USED TO REQUIRE THE WHOLE TIGHT LIST IN THE THIRD PERSON, AND THAT MADE
  // THE PROOF THE SPECIFICATION FOR 3,654 FALSE POSITIVES. With a HUMAN subject «نفسه» has a
  // third reading the object reading does not — the emphatic reflexive, "himself" — so this
  // corpus was asserting «أبوي نفسه واقف» ("my dad HIMSELF is standing") and «صاحبي نفسه
  // ضايق» ("my friend is FED UP") as must-fire anaphylaxis. A proof that mandates the false
  // positive is worse than one that misses it: it converts a bug into a requirement.
  //
  // The third person now carries the CUT verbs only, masculine (نَفَس is masculine whoever it
  // belongs to, so a feminine predicate is about the person), and never with «عن», the
  // particle of ceasing an activity. The idiom and reflexive readings are asserted QUIET
  // below, from the same axes, so the narrowing cannot silently be undone either.
  const CUT_THIRD = ["مسدود", "مقطوع", "انقطع"];
  derivedTotal += mustFire(
    "person+نفسه×cut",
    PERSON.flatMap((who) => ["ه", "ها", "هم"].flatMap((p) => CUT_THIRD.map((v) => `${who} نفس${p} ${v}`)))
  );
  // WHAT THE NARROWING COSTS, ASSERTED RATHER THAN GLOSSED OVER: a parent has many ways to
  // report a child's airway and every one of them still fires. Only the bare «نفسه ضايق» is
  // gone, and these are what replace it.
  for (const t of [
    "ابني ما يقدر يتنفس", "ابني ما عاد يتنفس", "ابني عنده ضيق نفس", "ابني عنده صعوبة في التنفس",
    "ابني حلقه يقفل", "ابني حلقه مقفل", "ابني شفايفه زرقاء", "ابني يختنق", "ابني نفسه مقطوع",
  ]) {
    ok(`«${t}» — the parent's report that replaces «ابني نفسه ضايق»`, fires(t));
  }
}

console.log("\n── BLUE LIPS — THE SIGN A PARENT SENDS WHEN THE CHILD CANNOT ───");
{
  // Not a wider slot: a NEW signal, added because it was driven. «ابني شفايفه زرقاء» fired
  // nothing anywhere, and it is the textbook sign that a child has stopped getting oxygen —
  // the message you send when the person can no longer speak for themselves.
  const BLUE_BODY = ["شفايف", "شفاه", "وجه", "وش", "لسان", "أصابع"];
  const BLUE = ["زرقاء", "زرقا", "زرقة", "أزرق", "ازرق", "مزرقة", "تزرق"];
  derivedTotal += mustFire(
    "cyanosis",
    BLUE_BODY.flatMap((b) => POSS.flatMap((p) => BLUE.flatMap((c) => ["", "صار", "صارت"].map((v) => `${b}${p} ${v} ${c}`.replace(/\s+/g, " ")))))
  );
  derivedTotal += mustFire("cyanosis+person", ["ابني شفايفه زرقاء", "بنتي شفايفها زرقة", "الطفل وجهه أزرق"]);
}

// ── 5. THE SAME DERIVATION IN ENGLISH ────────────────────────────────────────
console.log("\n── ENGLISH KNEW «can't breathe» AND NOTHING ELSE ───────────────");
{
  // The English arm had the identical hole: two spellings of one phrasing. «he stopped
  // breathing» is the gloss of «ما عاد يتنفس», and it was silent here too.
  derivedTotal += mustFire("english", [
    "he can't breathe", "I cannot breathe", "she can not breathe", "he can no longer breathe",
    "he stopped breathing", "the child is not breathing", "not breathing", "he's not breathing",
    "unable to breathe", "not able to breathe", "struggling to breathe", "gasping for air",
    "hard to breathe", "difficulty breathing", "difficulty in breathing", "trouble breathing",
    "having trouble breathing", "problems breathing", "shortness of breath", "short of breath",
    "can't catch my breath", "my throat is closing", "his airway is blocked", "throat tightening",
    "lips are blue", "his lips turning blue", "her face went blue", "fingers are bluish",
    "lips swelling", "swelling up now", "anaphylaxis", "call an ambulance", "call 997",
  ]);
}

// ── 5b. THE DEAF SPOTS THE DERIVATION LEFT BEHIND ────────────────────────────
console.log("\n── VALUES THAT WERE MISSING FROM BOTH LISTS ────────────────────");
{
  // These were silent before this change AND silent after it — which is the failure mode the
  // derivation was meant to end, and the one thing a cross product cannot catch: a value
  // missing from the module's axis and from this file's axis at the same time. They were
  // found by reading the language, not by multiplying the lists, and they are asserted here
  // in the shape they were found so the next reader inherits the finding rather than the
  // method. Each is driven against BOTH frozen modules below, so "new hearing" is a measured
  // claim and not a description.
  const DEAF_SPOTS = [
    // The Egyptian verb. The ما…ش circumfix was a covered axis; «اخد» with a DAL was not, so
    // the whole Egyptian phrasing of "I can't take a breath" was silent.
    "مش قادر آخد نفسي", "ما بقدر اخد نفسي", "مقدرش آخد نفسي", "ما عاد أقدر آخد نفسي",
    // The Levantine ability auxiliary. «فيني» is how the Levant says "I can".
    "ما فيني اتنفس", "ما فيني آخذ نفس", "ما فينا نتنفس",
    // THE ENTIRE CHOKING FAMILY, absent in both languages. This is the sentence a parent
    // types when a child's airway is closing, and no detector on any surface heard it.
    "ابني يختنق", "بنتي تختنق", "الطفل مختنق", "ابني بيختنق", "ولدي اختنق", "أنا اختنق",
    "أحس إني بختنق", "he is choking", "my son is suffocating", "she is choking",
    // The ordinary Gulf passive participles for a throat that has shut. The list had the
    // active «قافل» and the Standard «مسدود» and neither of the two forms people type.
    "حلقي مقفل", "حلقي مسكر", "ابني حلقه مقفل", "زوري مسكر", "بلعومه مقفل",
    // «كتمة» — which this file's own `namesAnAirway()` helper already treated as an airway
    // word while the module could not detect it at all.
    "عندي كتمة", "فيني كتمة", "جاتني كتمة", "كتمة نفس", "عندي كتمة وضيق نفس",
  ];
  derivedTotal += mustFire("deaf-spots", DEAF_SPOTS);
  // …AND THEY ARE NEW. Every one was silent on the pre-widening module AND on the widened
  // module the audit blocked — that is what "a value missing from BOTH lists" means, and it
  // is the one class of defect the cross product provably cannot find. Driven, so that if a
  // later edit makes one of these fire for some unrelated reason, the claim stops being true
  // out loud instead of quietly.
  const heardPre = DEAF_SPOTS.filter(firesPreWidening);
  const heardWide = DEAF_SPOTS.filter(firesWidened);
  const brandNew = DEAF_SPOTS.filter((t) => !firesPreWidening(t) && !firesWidened(t));
  console.log(`   ${brandNew.length}/${DEAF_SPOTS.length} silent on BOTH earlier modules · pre-widening heard ${heardPre.length} · the widened module heard ${heardWide.length}`);
  // NOT ONE of them was audible before the derivation work started. That is the claim.
  ok(`all ${DEAF_SPOTS.length} deaf spots were silent on the pre-widening module`, heardPre.length === 0);
  // The widened module reaches a couple of them, and NAMING WHICH is the point of driving it
  // rather than asserting it: «عندي كتمة وضيق نفس» carries «ضيق نفس» beside the «كتمة», and
  // «ما عاد أقدر آخذ نفسي» was caught by the bare `(?:ال)?نفس` that this change had to guard.
  // Both are heard here for a reason the OTHER half of the string supplies, so neither is
  // evidence that «كتمة» or the Egyptian verb was ever covered.
  ok(`at most 2 deaf spots overlap a signal the widened module already had (${heardWide.length}: ${heardWide.map((t) => `«${t}»`).join(" ")})`,
    heardWide.length <= 2);
  // …AND THE HOMOGRAPHS THEY ARRIVE WITH. Every one of the words above is also an ordinary
  // word, and admitting it without driving its other meaning is how this file got here.
  quietTotal += mustBeQuiet("deaf-spots×homograph", [
    // «اختنق» is what traffic and stuffy rooms do. Without a person in front it is not a body.
    "اختنقت الشوارع", "الجو مختنق", "المكان مختنق بالزحمة", "المطعم مختنق اليوم",
    "الشارع مختنق من الزحمة", "choking hazard for kids", "the kitchen is suffocating",
    // «كتمة» is stuffy weather before it is a chest — which is why it needs a personal frame.
    "الجو فيه كتمة", "أحس بالجو كتمة", "كتمة الحر", "القاعة فيها كتمة",
    // «مقفل»/«مسكر» describe shops and roads all day long.
    "المحل مقفل", "الفرع مسكر اليوم", "الطريق مقفل", "المطعم مسكر بدري",
    // «اخد»/«فيني» in their ordinary senses.
    "ما اخد الطلب", "ما فيني أنتظر أكثر", "فيني أجي بكرة", "ماخذ نفس الشي",
  ]);
}

// ── 6. THE QUIET SIDE, RE-DRIVEN FROM THE CORPUS THAT OWNS IT ────────────────
console.log("\n── EVERY «MUST STAY QUIET» STRING FROM THE FALSE-POSITIVE PROOF ─");
{
  // EXTRACTED FROM THAT FILE'S SOURCE, NOT COPIED. A copy stops following the original the
  // moment somebody adds a case to it, and this repo already has a file (`symptom-frames.ts`)
  // that exists solely because two copies of a list drifted apart.
  const src = readFileSync(resolve(process.cwd(), "scripts/proof-allergy-false-positives.test.ts"), "utf8");
  // `[^\]]` and not `[\s\S]`: a lazy any-char body silently RUNS PAST its own block when the
  // next `ok(` does not match the expected shape, swallowing the code in between — the
  // extracted "corpus" then contains fragments of source rather than sentences.
  const blocks = /for \(const t of \[([^\]]*?)\]\) \{\s*\n\s*ok\(`«\$\{t\}» ([^`]*?)`/g;
  const quiet: string[] = [];
  for (const m of src.matchAll(blocks)) {
    if (!/is quiet|is not an emergency|is a complaint|is a denial|is not a diagnosis/.test(m[2])) continue;
    for (const lit of m[1].matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) quiet.push(JSON.parse(`"${lit[1]}"`));
  }
  // A FLOOR, so a rename over there cannot quietly turn this section into zero assertions —
  // which is the failure mode of every proof that reads another file.
  ok(`extracted ${quiet.length} quiet strings from the false-positive corpus (floor 150)`, quiet.length >= 150);
  quietTotal += mustBeQuiet("fp-corpus", quiet);
}

console.log("\n── THE VOICE EVAL SET, THROUGH THE EMERGENCY DETECTOR ──────────");
{
  // `proof-voice-safety-net.test.ts` drives these through the phonetic net. They are also
  // twenty real spoken allergy turns, and a DISCLOSURE IS NOT AN EMERGENCY: every one of them
  // must stay out of the ambulance path except the one that names a present-tense airway.
  const evalSet = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/voice/khalid-voice-eval-set.json"), "utf8")) as {
    stt: { items: Array<{ id: string; spoken: string }> };
  };
  const namesAnAirway = (s: string) => /ضيق ?نفس|كتمة|كتمه|ما أقدر أتنفس/.test(s);
  const disclosures = evalSet.stt.items.filter((i) => !namesAnAirway(i.spoken));
  ok(`exactly one eval utterance names an active airway (${evalSet.stt.items.length - disclosures.length})`,
    evalSet.stt.items.length - disclosures.length === 1);
  quietTotal += mustBeQuiet("voice-eval", disclosures.map((i) => i.spoken));
  const airway = evalSet.stt.items.find((i) => namesAnAirway(i.spoken));
  ok(`…and that one IS an emergency: «${airway?.spoken}»`, !!airway && fires(airway.spoken));
}

// ── 7. THE NEAR MISSES THE WIDENING MUST NOT TAKE WITH IT ────────────────────
console.log("\n── THE SAME AXES WITH AN ORDINARY COMPLEMENT ───────────────────");
{
  // Generated the same way the must-fire corpus is: every negation and every auxiliary, with
  // a complement from the restaurant instead of the airway. «ما عاد أقدر أنتظر» is "I can no
  // longer wait" — the exact new slot, and a complaint. If the family ever widens to "a
  // negation plus anything", these are what break first.
  const ORDINARY = [
    "آكل بعد", "أنتظر أكثر", "أدفع الحين", "أجي اليوم", "ألغي الطلب", "أكلمك الحين",
    "أتحمل الانتظار", "أشوف المنيو", "أطلب الحين", "أوصل قبل ساعة", "أحدد الموقع", "أتحمل الأكل الحار",
  ];
  quietTotal += mustBeQuiet("neg×ordinary", cross(NEG, NO_LONGER, ABLE, ORDINARY));
}

console.log("\n── THE HOMOGRAPHS THE NEW SLOTS REACH ──────────────────────────");
{
  // Each of these is a word the widening now touches, in its OTHER meaning. This is the shape
  // of every false positive this repo has had — «اذي» inside «هاذي», «997» inside a phone
  // number, «يد» inside «أكيد» — so each new slot gets its collision named and driven.
  quietTotal += mustBeQuiet("homographs", [
    // «نفسه» is "his breath" AND "itself". This is why the third-person breath needs a person.
    "الطلب نفسه واقف", "الحساب نفسه مسدود", "نفس الطلب", "أبغى نفس الطلب اللي قبل",
    "بنفس الوقت", "نفس الشي", "مشكلة بنفس الطلب", "خذ نفس اللي طلبته", "أبغى أخذ نفس الكمية",
    // «حلقه» is a throat AND an episode/ring.
    "الحلقة الجديدة", "حلقة الفيديو", "الحلقة الأخيرة حلوة",
    // «شفته» is a lip AND "I saw it" — the reason «شفة» stays first-person.
    "الخبز شفته ينتفخ", "العجين شفته تورم", "شفته من بعيد",
    // «صعب» and «ضيق» are ordinary adjectives before they are symptoms.
    "صعب أوصل الحين", "الوضع صعب", "ضيق الوقت", "المكان ضيق شوي", "الشارع ضيق",
    // blue is a colour before it is cyanosis — which is why it is bound to lips and faces.
    "العصير لونه أزرق", "الكيك أزرق", "عينه زرقاء", "السيارة زرقاء", "الكيس الأزرق",
    // «ما عاد» / «وقف» / «انقطع» outside the airway.
    "ما عاد فيه رز", "ما عاد عندكم كنافة؟", "وقف الطلب", "توقف عن الاتصال", "بطل الطلب",
    "انقطع النت", "ما أقدر آخذ الطلب",
    // the idiom the first-person breath rule already guarded, in every person.
    "نفسي ضايق من الخدمة", "نفسي ضايق من التأخير", "نفسي ضاق من الانتظار",
    // the body words in their non-body senses: «حلق» is also to shave, «زور» also to visit,
    // «ودّى»/«راح» also to send an order somewhere.
    "حلقت شعري اليوم", "زورت المطعم أمس", "ودّينا الطلب للعميل", "راح الطلب لعنوان غلط",
    "شفايفها حلوة", "لسانه طويل شوي", "وجهه معروف عندنا", "حلقة نقاش عن التوصيل",
    // «مسدود»/«واقف» describe roads and queues long before they describe an airway.
    "الشارع مسدود", "الطريق واقف زحمة", "الدور واقف", "ضيق في المواقف عندكم",
    "المكان ضيق على ١٠ أشخاص", "صعب أوصل قبل ٩", "ما عاد عندي وقت", "الطلب ما وصل",
    "الرز الأبيض انتفخ في القدر", "وقف الطلب لا تجهزه", "توقف عن إرسال الرسائل",
    // and the English near misses the widened arm now has to step around.
    "blue cheese burger", "the blue drink please", "I can't wait any longer",
    "trouble with the app", "difficulty finding the address", "he stopped answering",
    "not delivering", "my order is not arriving", "the delivery is blocked",
  ]);
}

console.log("\n── AND THE EXCLUSIONS STILL DO THEIR JOB, IN THE NEW FORMS ─────");
{
  // A CONDITIONAL IS NEVER A REPORT. The hard families were briefly exempted from the
  // hypothetical veto and «لو أكلت مكسرات حلقي يقفل» became an active anaphylaxis — a staff
  // page and an ambulance line to a calm customer. The new phrasings must obey the same rule.
  quietTotal += mustBeQuiet("hypothetical", [
    "لو أكلت مكسرات ما عاد أقدر أتنفس", "إذا أكلت بيض ابني ما يقدر يتنفس",
    "لو أكلت لوز يصير عندي صعوبة بالتنفس", "إن أكلت بندق حلقه يقفل",
    "ممكن لو أكلت لوز ما أقدر أتنفس؟", "لو أكلت مكسرات حلقي يقفل", "إذا أكلت بيض وجهي يتورم",
  ]);
  // …AND A HISTORY IS STILL A HISTORY, over the soft families where that is the common reading.
  quietTotal += mustBeQuiet("past", [
    "قبل سنة ودّوه المستشفى من الفول", "من زمان ودّوها الطوارئ", "قبل كده رحنا المستشفى",
  ]);
  // …while a past word in ONE clause still cannot eat an airway in the NEXT.
  for (const t of [
    "زمان، مو قادر أتنفس", "قبل كده صار لي كذا، الحين ما عاد يقدر يتنفس",
    "سابقا ما صار، بس الحين حلقها يقفل",
  ]) {
    ok(`«${t}» is still an emergency`, fires(t));
  }
  // …and the third person reaches the SOFT hospital family too, which was first-person-only
  // for the same reason: the person being taken to hospital is not the one typing.
  for (const t of ["ودّوه المستشفى", "ودّوها الطوارئ", "خذوه المستشفى الحين"]) {
    ok(`«${t}» is heard`, fires(t));
  }
}

// ── 8. THE QUIET CORPUS, DERIVED INDEPENDENTLY — AND DRIVEN AGAINST BOTH ─────
console.log("\n── ORDINARY RESTAURANT ARABIC, DERIVED FROM ITS OWN VOCABULARY ─");
//
// THE PREVIOUS QUIET CORPUS COULD NOT HAVE CONSTRAINED THIS CHANGE, AND THAT IS THE REAL BUG
// IN THIS FILE — bigger than either false-positive family it missed.
//
// Every one of the 6,321 must-be-quiet assertions above was ALREADY GREEN on the pre-widening
// module — AND on the widened module that shipped the false positives. Driven, not argued:
// §8c re-runs the whole set through both frozen versions and the count does not move.
// A corpus that reads the same before and after a change is incapable of having
// constrained it; it can only catch a future regression. So "the widening cost zero false
// positives" was measured against a corpus that would have said zero whatever the widening
// did — and 3,993 ordinary Saudi restaurant strings were firing while it said so.
//
// THE CAUSE IS THAT THE QUIET SIDE WAS DERIVED FROM THE SAME AXES AS THE FIRING SIDE. Sections
// 6 and 7 take the module's own slots and put an ordinary complement in the last one. That
// proves the slots do not leak sideways. It cannot prove anything about a word the module now
// matches for a REASON THE AXES DO NOT NAME — «ما» hiding inside «دايما», «نفس» meaning "the
// same", «نفسه» meaning "himself". Those are properties of ARABIC, not of the axis list, so
// they can only be found by a corpus generated from Arabic.
//
// So this corpus starts from the other end: ordinary restaurant vocabulary — dishes, orders,
// prices, delivery, complaints, compliments, idioms — crossed the same mechanical way, and
// crossed DELIBERATELY THROUGH THE HOMOGRAPHS THAT CAUSED THE FALSE POSITIVES:
//
//   «نفس»    self · the same · breath      «شاف»/«شفة»   I saw it · a lip
//   «ضاق»    fed up · a tight airway       «مات»/«أموت»  died · loves it
//   «كتمة»   stuffy weather · chest         «حلقة»       an episode · his throat
//   «كبر»    grew up · swelled              «ما»         not · the tail of «دايما»
//
// AND THEN IT IS DRIVEN THREE WAYS (§8b), against the frozen pre-widening module, the frozen
// widened module the audit blocked, and the live one — so the file states, as a number a
// reader can re-derive, both that these strings were quiet before and that they are the
// strings the widening broke. That is the difference between a corpus that constrains a
// change and a corpus that decorates it.
let ordinaryTotal = 0;
const ORDINARY: string[] = [];
/** Which homograph each ordinary string was generated from, so §8b can assert that the
 *  corpus separates the modules IN EVERY FAMILY and not just on aggregate — an aggregate
 *  that passes while one homograph contributes nothing is the same blind spot one level up. */
const ORDINARY_BY_FAMILY = new Map<string, string[]>();
const add = (family: string, ...items: string[]) => {
  const bucket = ORDINARY_BY_FAMILY.get(family) ?? [];
  bucket.push(...items);
  ORDINARY_BY_FAMILY.set(family, bucket);
  ORDINARY.push(...items);
};
{
  // ── ordinary restaurant vocabulary, written as vocabulary and not as sentences ──
  const DISH = ["الكبسة", "المندي", "البرياني", "الشاورما", "البرجر", "المشاوي", "الكنافة", "الحلا", "الشوربة", "السلطة"];
  const THING = ["الطلب", "الوجبة", "الحساب", "التوصيل", "السعر", "الفرع", "الطاولة", "الوقت", "الكمية", "الشي", "الطريقة", "اليوم"];
  const TAKE = ["ناخذ", "نأخذ", "ياخذ", "تاخذ", "آخذ", "نطلب"];
  /** Every ordinary word that ENDS in «ما». None of them is a negation, and all of them were. */
  const MA_FINAL = ["دايما", "دائما", "عموما", "لما", "كما", "بينما", "طالما", "عندما", "مهما", "حينما", "ريثما", "قلما"];
  /** WHO an ordinary sentence is about — the same people the firing corpus uses, on purpose:
   *  the person axis is what carried the idiom in, so the quiet side must cross it too. */
  const WHO = ["ابني", "بنتي", "ولدي", "زوجتي", "زوجي", "أمي", "أبوي", "الوالدة", "أخوي", "أختي",
    "صاحبي", "صاحبتي", "رفيجي", "الطفل", "الطفلة", "جوزي", "مرتي", "العميل", "الكابتن", "المدير"];
  const ANNOY = ["من الأسعار", "من الزحمة", "من التوصيل", "من الانتظار", "اليوم", "شوي"];

  // 8a-i. «نفس» = THE SAME, with «ما» hiding inside the adverb in front of it.
  //       «دايما ناخذ نفس الطلب» — a returning customer's most ordinary sentence.
  add("«نفس»=the same · «ما» inside a word", ...cross(["", "احنا", "كنا"], MA_FINAL, TAKE, ["نفس"], THING));
  // 8a-ii. …and after a difficulty word, which is the other half of the same homograph.
  add("«نفس»=the same after a difficulty word", ...["عندي صعوبة", "صعوبة", "فيه صعوبة", "صعوبات", "المحل ضيق", "الشارع ضيق", "الوقت ضيق"]
    .flatMap((h) => ["في ", "ب", "ف", ""].flatMap((p) => THING.map((t) => `${h} ${p}نفس ${t}`.replace(/\s+/g, " ").trim()))));
  // 8b-i. «نفسه» = HIMSELF / the fed-up idiom. A human subject makes both readings available,
  //       and neither of them is an airway.
  add("«نفسه»=himself · the fed-up idiom", ...WHO.flatMap((w) => ["ه", "ها", "هم"].flatMap((v) =>
    ["ضايق", "ضايقة", "ضاق", "واقف", "واقفة", "زعلان"].flatMap((a) => ANNOY.map((c) => `${w} نفس${v} ${a} ${c}`)))));
  // 8b-ii. …and the emphatic reflexive on an object, which is why the person anchor exists.
  add("«نفسه»=itself, on an object", ...THING.flatMap((t) => ["واقف", "مسدود", "متأخر", "نفسه"].map((v) => `${t} نفسه ${v}`)));

  // 8c. «شاف» = I saw it, «شفة» = a lip.
  add("«شاف»=I saw it", ...cross(["شفته", "شفتها", "شفناه", "شفتهم"], ["من بعيد", "أمس", "في الفرع", "على الطاولة"]));
  add("body words, ordinary sense", ...cross(["شفايفها", "شفايفه", "لسانه", "وجهها"], ["حلوة", "حلو", "طويل شوي", "معروف عندنا"]));
  // 8d. «ضاق»/«ضايق» = annoyed. The commonest idiom in a complaints inbox.
  add("«ضاق»=annoyed", ...cross(["ضاق صدري", "ضاقت نفسيتي", "أنا ضايق", "احنا ضايقين", "المدير ضايق"], ANNOY));
  // 8e. «مات»/«أموت» = loves it. Enthusiasm, in the vocabulary of dying.
  add("«مات»=loves it", ...cross(["أموت على", "بموت على", "يموت على", "نموت على", "متنا على"], DISH));
  add("«مات»=loves it", ...cross(["مت من الجوع", "مايت من الجوع", "الحلا يموت", "الكبسة تموت"], ["", "والله", "بصراحة"]));
  // 8f. «كتمة» = stuffy weather. The word the module now hears — about a ROOM, not a chest.
  add("«كتمة»=stuffy weather", ...cross(["الجو", "المحل", "المطعم", "القاعة", "الغرفة"], ["فيه كتمة", "كتمة", "فيه كتمة اليوم"]));
  add("«كتمة»=stuffy weather", "كتمة الحر", "أحس بالجو كتمة", "المكان فيه كتمة من الفرن", "كتمة الجو تعبتنا");
  // 8g. «حلقة» = an episode or a ring; «حلق» = to shave; «زور» = to visit.
  add("«حلقة»=an episode", ...cross(["الحلقة", "حلقة البرنامج", "الحلقة الأخيرة", "حلقة اليوم", "حلقات البصل"],
    ["قفلت", "انسدت", "ضاقت", "سكرت", "حلوة", "الجديدة"]));
  add("«حلق»=to shave, «زور»=to visit", "حلقت شعري اليوم", "زورت المطعم أمس", "نزور الفرع الجديد", "حلق الذهب غالي");
  // 8h. «كبر» = grew up / got bigger, on the parts where that is all it means.
  add("«كبر»=grew", ...cross(["عينها", "عينه", "وجهه", "وشها"], ["كبرت", "كبر"], ["من الفرح", "من الأكل", "شوي", ""]));
  add("«كبر»=grew", "ابني كبر وصار يطلب بنفسه", "المحل كبر عن قبل");
  // 8i. blue is a colour before it is cyanosis.
  add("blue=a colour", ...cross(["العصير", "الكيك", "الكيس", "السيارة", "الجبن"], ["لونه أزرق", "أزرق", "زرقاء"]));
  // 8j. the ordinary traffic of a restaurant inbox: menu, order, delivery, complaint, praise.
  add("ordinary inbox traffic", ...cross(["عندكم", "فيه", "متوفر", "كم سعر", "وش سعر"], DISH, ["؟", "اليوم؟", "الحين؟"]));
  add("ordinary inbox traffic", ...cross(["أبغى", "نبي", "عطني", "جهزوا لنا"], DISH, ["", "بسرعة", "لو سمحت"]));
  add("ordinary inbox traffic", ...cross(["وين", "متى يوصل", "تأخر", "ما وصل"], ["الطلب", "السواق", "التوصيل"], ["", "الحين", "؟"]));
  add("ordinary inbox traffic", ...cross(["الطلب", "الأكل", "التوصيل", "الخدمة"], ["بارد", "متأخر", "ممتاز", "ما عجبني", "حلو"]));
}

console.log("\n── …AND THE SAME CORPUS THROUGH ALL THREE MODULES ─────────────");
{
  const uniq = [...new Set(ORDINARY)];
  ordinaryTotal += mustBeQuiet("ordinary-restaurant", uniq);

  // THE DIFFERENTIAL. These three numbers are the claim, and they are re-derived on every run.
  const quietBefore = uniq.filter((t) => !firesPreWidening(t));
  const quietBeforeAndAfter = uniq.filter((t) => !firesPreWidening(t) && !fires(t));
  const loudOnWidened = uniq.filter((t) => firesWidened(t));
  const caught = uniq.filter((t) => firesWidened(t) && !fires(t) && !firesPreWidening(t));
  console.log(`   pre-widening: ${quietBefore.length}/${uniq.length} quiet · widened: ${loudOnWidened.length} FIRED · live: ${uniq.length - uniq.filter(fires).length} quiet`);

  // 1. The claim the blocked commit made and could not support, now supported: these strings
  //    were quiet before the widening and they are quiet after it.
  ok(`${quietBeforeAndAfter.length} ordinary strings are quiet BEFORE the widening and quiet NOW (floor 3000)`,
    quietBeforeAndAfter.length >= 3000);
  // 2. The property the old quiet corpus did not have: this one SEPARATES the two modules, so
  //    it is capable of failing. A corpus that cannot fail is not evidence.
  ok(`${caught.length} of them FIRED on the widened module this proof used to certify (floor 3000)`,
    caught.length >= 3000);
  // 3. …and it is not an accident of one family. An aggregate that clears its floor while the
  //    family it was written for contributes nothing is the same blind spot one level up, so
  //    each homograph is reported separately and the ones that MUST bite are asserted.
  //
  //    THE SPLIT IS ITSELF THE FINDING. Only five of these families constrain THIS change —
  //    they are the ones the audit found firing. The other nine are quiet on the widened
  //    module too, which means they are REGRESSION GUARDS for a widening that has not
  //    happened yet, not evidence about this one. Both are worth having; calling them the
  //    same thing is exactly the arithmetic that produced "zero false positives".
  const MUST_BITE = ["«نفس»=the same · «ما» inside a word", "«نفس»=the same after a difficulty word",
    "«نفسه»=himself · the fed-up idiom", "«حلقة»=an episode", "«كبر»=grew"];
  const inert: string[] = [];
  let guardOnly = 0;
  for (const [family, items] of ORDINARY_BY_FAMILY) {
    const uniqItems = [...new Set(items)];
    const sep = uniqItems.filter((t) => firesWidened(t) && !fires(t)).length;
    const role = MUST_BITE.includes(family) ? "constrains this change" : "future-regression guard";
    console.log(`      ${String(sep).padStart(4)} / ${String(uniqItems.length).padStart(4)}  ${family}  — ${role}`);
    if (sep === 0) { if (MUST_BITE.includes(family)) inert.push(family); else guardOnly++; }
  }
  ok(`each of the ${MUST_BITE.length} families the audit found firing separates the widened module from the live one (inert: ${inert.join(", ") || "none"})`,
    inert.length === 0);
  console.log(`   ${guardOnly} further homograph families are quiet on BOTH modules — regression guards, not evidence about this change`);
}

console.log("\n── THE AUDIT'S OWN TABLE, VERBATIM, IN BOTH DIRECTIONS ─────────");
{
  // `docs/audits/AUDIT-airway-derivation.md` §1 — every string it drove, copied exactly. A
  // corpus generated from vocabulary can still miss the one sentence a human noticed, so the
  // human's sentences are asserted beside it rather than instead of it.
  quietTotal += mustBeQuiet("audit-§1-verbatim", [
    // A — «ما» with no left word boundary
    "دايما ناخذ نفس الطلب", "كنا دايما ناخذ نفس الطلب", "عندما ناخذ نفس الطلب",
    "عموما ناخذ نفس الوجبة", "لما ياخذ نفس الطلب يزعل", "ماخذ نفس الشي",
    "ما عاد أقدر آخذ نفس الطلب", "احنا ناخذ نفس الطلب", "عموما نتنفس هواء نظيف",
    // B — the bare breath noun
    "عندي صعوبة في نفس الطلب", "عندي صعوبة بنفس الطلب", "فيه صعوبة في نفس الوقت",
    "المحل ضيق نفس الفرع الثاني", "الشارع ضيق بنفس الطريقة",
    // C — «نفسه ضايق» = he is fed up, and «نفسه» = himself
    "صاحبي نفسه ضايق", "أمي نفسها ضايقة من الأسعار", "زوجتي نفسها ضايقة اليوم",
    "أبوي نفسه واقف معنا بالمحل", "أخوي نفسه انقطع عن الدوام", "أختي نفسها مقطوعة من الشغل",
    "ابني نفسه ضايق لأن الطلب تأخر",
    // D — «كبر» = grew
    "عينها كبرت من الفرح", "وجهه كبر من الأكل", "وشها كبرت",
    // E — «حلقة» = an episode
    "الحلقة قفلت", "الحلقة الجديدة", "حلقة الفيديو",
    // F — the English ventilation complaints
    "it was hard to breathe inside", "customers complain it is hard to breathe in the hall",
    "we had issues with breathing space in the kitchen",
    "having trouble breathing in the smoking section", "the skin looks blue on the chicken",
  ]);
  // …AND THE RUN-ON EMERGENCIES THAT THE OBVIOUS FIX FOR THEM SILENCES. The audit proposed
  // `(?! ?ال[ء-ي])` on the breath noun. Driven over 2,496 airway strings it takes 420 of them
  // with it — «عندي صعوبة في التنفس الحين» among them — and 84 of those the PRE-widening
  // module already heard, so it is a regression and not a narrowing. THE PROOF AS IT STOOD
  // PASSED 14,696/14,696 WITH THAT FIX APPLIED, because no assertion in it ever put a word
  // after the breath noun: the same "green because the corpus cannot say otherwise" that §8
  // exists to end, one layer down, in the remedy rather than the bug.
  // A guard is not correct because it closes the family it was written for. It is correct
  // when it closes that family AND leaves these.
  for (const t of [
    "عندي صعوبة في التنفس الحين", "عندي صعوبة بالتنفس الحين", "عندي صعوبة في التنفس الان",
    "ضيق نفس الحين", "عندي ضيق نفس الحين", "ضيق نفس اليوم", "عندي ضيق نفس الله يخليكم",
    "ضيق نفس الطفل تعبان", "السلام عليكم ضيق نفس اليوم", "لو سمحت عندي ضيق نفس",
    "ما أقدر آخذ نفس الحين", "ما اقدر اخذ نفس الان", "ما أقدر آخذ نفس اليوم",
    "ما أقدر آخذ نفس الطفل تعبان", "ما أقدر آخذ نفس الوضع سيء",
    "عندي صعوبة في التنفس الحين ساعدوني", "ابني عنده صعوبة في التنفس الحين",
    "فيني ضيق نفس الحين بسرعة", "ضيق في التنفس الشديد", "عندي ضيق في نفس", "ضيق بنفس",
  ]) {
    ok(`«${t}» — a run-on the homograph guard must not eat`, fires(t));
  }
}

console.log("\n── AND WHY THE OLD QUIET CORPUS COULD NOT HAVE DONE THAT ──────");
{
  // §3c of the audit, made permanent and made COMPLETE: every quiet string this file asserted
  // before §8 existed, re-driven through both frozen modules. It reads identically on all
  // three, which is the definition of an assertion that constrains nothing. Asserted rather
  // than narrated, so nobody has to take the sentence on trust — and so that the day somebody
  // DOES make those sections sensitive, this assertion fails and has to be rewritten.
  // The sections that existed when the widening was certified 14,696/14,696.
  const WAS_THERE = ["fp-corpus", "voice-eval", "neg×ordinary", "homographs", "hypothetical", "past"];
  const axisDerived = [...new Set(everyQuietString.filter(([sec]) => WAS_THERE.includes(sec)).map(([, t]) => t))];
  const onPre = axisDerived.filter(firesPreWidening).length;
  const onWidened = axisDerived.filter(firesWidened).length;
  console.log(`   ${axisDerived.length} strings in the sections that certified the widening · fired on pre-widening: ${onPre} · on the widened module: ${onWidened}`);
  ok(`all ${axisDerived.length} of them read the same on both (${onPre}/${onWidened} fired) — not one could have constrained the widening`,
    onPre === 0 && onWidened === 0);

  // …AND THE SECTIONS ADDED WITH THIS FIX ARE THE OPPOSITE, WHICH IS THE WHOLE POINT. Every
  // quiet section written since — the audit's verbatim table, the homographs the new signals
  // arrive with, «كبر» on the parts where it means "grew", and §8's ordinary corpus — is
  // asserted to SEPARATE the widened module from the live one. A quiet section that cannot
  // tell them apart is decoration, and this is the assertion that says which is which.
  const added = [...new Set(everyQuietString.filter(([sec]) => !WAS_THERE.includes(sec)).map(([, t]) => t))];
  const addedCatch = added.filter((t) => firesWidened(t) && !fires(t)).length;
  const addedPre = added.filter(firesPreWidening);
  console.log(`   ${added.length} strings added with this fix · ${addedCatch} of them catch the widened module`);
  ok(`${addedCatch}/${added.length} of the sections added with this fix separate the widened module from the live one (floor 3000)`,
    addedCatch >= 3000);
  // A few of them the PRE-widening module fired on too: false positives older than the
  // widening, closed by the same guards. Named rather than rounded away.
  console.log(`   …and ${addedPre.length} were already false positives BEFORE the widening: ${addedPre.slice(0, 6).map((t) => `«${t}»`).join(" ")}`);
}

console.log(`\n   corpus totals: ${derivedTotal} derived must-fire · ${quietTotal + ordinaryTotal} must-be-quiet`);
console.log(`   …of which ${ordinaryTotal} are ordinary restaurant strings derived from Arabic, not from the module's axes`);
console.log(`\n${fails.length ? "FAIL" : "PASS"} airway-derivation: ${pass}/${pass + fails.length} passed`);
if (fails.length) {
  if (fails.length > 40) console.log(`   … ${fails.length - 40} more failures not listed`);
  process.exit(1);
}
