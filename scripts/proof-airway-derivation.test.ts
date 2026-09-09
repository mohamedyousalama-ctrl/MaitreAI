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
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectAllergenEmergency } from "../lib/ai/allergen-emergency.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); if (fails.length <= 40) console.log(`  FAIL ${label}`); }
};
const fires = (t: string) => detectAllergenEmergency(t).fired;

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
const mustBeQuiet = (section: string, corpus: string[]) => {
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
  const SWELLS = ["تورم", "تتورم", "يتورم", "بيتورم", "ورم", "منتفخ", "انتفخ", "ينتفخ", "تنتفخ", "كبرت"];
  derivedTotal += mustFire("swell×poss", SWELL_BODY.flatMap((b) => POSS.flatMap((p) => SWELLS.map((v) => `${b}${p} ${v}`))));
  // «شفة» is the ONE body word that stays first-person, and it is not an oversight: «شفته» is
  // also «شفته» = "I saw it", so «الخبز شفته ينتفخ» ("I saw the bread rising") would become an
  // anaphylaxis. Nobody says «شفته» for a swelling lip; they say «شفايفه», which is covered.
  for (const v of SWELLS) ok(`«شفتي ${v}» fires`, fires(`شفتي ${v}`));
  derivedTotal += SWELLS.length;
}

console.log("\n── THE BREATH ITSELF, IN BOTH PERSONS ──────────────────────────");
{
  const TIGHT = ["ضاق", "يضيق", "بيضيق", "ضايق", "مسدود", "واقف", "بيقف", "انقطع", "مقطوع"];
  derivedTotal += mustFire("نفسي×tight", TIGHT.map((v) => `نفسي ${v}`));
  // THIRD PERSON NEEDS A PERSON NAMED — «نفسه» is "his breath" AND "itself", and «الطلب نفسه
  // واقف» is an ordinary delivery sentence (asserted quiet below). The person is the tell.
  derivedTotal += mustFire(
    "person+نفسه×tight",
    PERSON.flatMap((who) => ["ه", "ها", "هم"].flatMap((p) => TIGHT.map((v) => `${who} نفس${p} ${v}`)))
  );
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

// ── 6. THE QUIET SIDE, RE-DRIVEN FROM THE CORPUS THAT OWNS IT ────────────────
console.log("\n── EVERY «MUST STAY QUIET» STRING FROM THE FALSE-POSITIVE PROOF ─");
let quietTotal = 0;
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

console.log(`\n   corpus totals: ${derivedTotal} derived must-fire · ${quietTotal} must-be-quiet`);
console.log(`\n${fails.length ? "FAIL" : "PASS"} airway-derivation: ${pass}/${pass + fails.length} passed`);
if (fails.length) {
  if (fails.length > 40) console.log(`   … ${fails.length - 40} more failures not listed`);
  process.exit(1);
}
