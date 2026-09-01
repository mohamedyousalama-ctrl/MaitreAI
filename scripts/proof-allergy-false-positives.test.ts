// ============================================================================
// PROOF — an ordinary sentence does not become an allergy.
//
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//        scripts/proof-allergy-false-positives.test.ts
//
// THE RULING, AND WHY THIS FILE IS THE ONE THAT ENFORCES IT.
//
// The Founder retired the phonetic near-miss net because it fired on words that merely
// SOUNDED like an allergen and turned the greeting «هلا والله» into an allergy consultation.
// The ruling was "stop GUESSING", not "stop hearing people" — so the exact detectors stayed
// and `proof-phonetic-net-unwired.test.ts` asserts they are still wired.
//
// That proof answers "does the gate still fire when it should". It cannot answer the
// question the ruling was actually about, which is "does it stay quiet when it should" —
// and that question had never been asked as a corpus. When it finally was, THREE separate
// families of false positive fell out, two of them live on WhatsApp for months:
//
//   «هاذي الرز الأبيض زين»   this white rice is good      → ALLERGY HOLD
//   «رقمي 0559971234»        my phone number              → ALLERGY EMERGENCY
//   «تعبت من الانتظار…»      I'm tired of waiting         → ALLERGY HOLD + staff alert
//
// Each was a substring with no boundary: «اذي» inside «هاذي», «997» inside a phone number,
// «تعب» inside «تعبت». None was a guess in the Levenshtein sense — which is exactly why
// retiring the guessing did not remove them, and why they needed their own corpus.
//
// EVERY CASE BELOW IS A SENTENCE A REAL CUSTOMER SENDS. The quiet list is not a list of
// strings chosen to pass; it is phone numbers, addresses, order numbers, compliments about
// food, complaints about waiting, and plain orders of the most-ordered items in Saudi
// Arabia. If any of them fires, a customer gets a safety questionnaire instead of dinner.
//
// AND THE OTHER DIRECTION IS ASSERTED IN THE SAME FILE, ON PURPOSE. Narrowing a safety
// detector is the easiest way to make a false-positive proof pass, and it would be a far
// worse defect than the one it fixed. Every narrowing here is paired with the true positives
// it must not cost.
// ============================================================================

import { detectAllergenAvoidance } from "../lib/ai/allergen-gate";
import { detectAllergenSymptom } from "../lib/ai/allergen-gate-symptoms";
import { detectAllergenEmergency } from "../lib/ai/allergen-emergency";
import { detectAllergyContext } from "../lib/ai/allergen-context";
import { detectAllergyOrDiseaseMention } from "../lib/ai/allergy-simple";
import { isSafetyClassInbound } from "../lib/ai/safety-bridge";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

/** What the product actually asks: does ANY safety detector claim this turn? This is the
 *  union `lib/ai/safety-bridge.ts` and both demo routes run, so a case that is quiet here is
 *  quiet on every surface — and a case that fires anywhere fails here, whichever arm did it. */
const anyDetectorFires = (t: string) =>
  detectAllergenAvoidance(t).fired ||
  detectAllergenSymptom(t).fired ||
  detectAllergyContext(t).fired ||
  detectAllergenEmergency(t).fired;

const whichFired = (t: string) =>
  [
    detectAllergenAvoidance(t).fired ? "avoidance" : "",
    detectAllergenSymptom(t).fired ? "symptom" : "",
    detectAllergyContext(t).fired ? "context" : "",
    detectAllergenEmergency(t).fired ? "emergency" : "",
  ].filter(Boolean).join("+");

console.log("\n── «هاذي» IS THE WORD FOR «THIS», NOT A HARM VERB ──────────────");
{
  // `HARM_CONTEXT_RE` read «تاذ|تضر|يضر|اذي|يوذ». The alternative «اذي» sits inside «هاذي»,
  // the ordinary Najdi/Gulf spelling of "this" — so every «هاذي …» sentence carried a harm
  // verb, and any allergen noun anywhere in it completed the rule. Compliments about food
  // were the most common shape.
  for (const t of [
    "هاذي الرز الأبيض زين", "هاذي اللبن الرايب", "هاذي بيضاء", "هاذي القهوة",
    "هاذي الكنافة حلوة", "هاذي أحلى وجبة", "هاذي المكسرات لذيذة", "هاذي البيض طازج",
    "هاذي الحليب باردة", "هاذي أطيب من اللي قبلها",
  ]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }
  // AND THE HARM RULE STILL WORKS. It needs the object pronoun a real harm statement carries.
  for (const t of [
    "اللبن يضرني", "المكسرات تأذيني", "الفول السوداني يؤذيني", "البيض يضرها",
    "المكسرات تضرني", "الحليب يضر معدتي", "بالفستق يضرني",
  ]) {
    ok(`«${t}» still fires`, detectAllergyContext(t).fired);
  }
}

console.log("\n── «الأبيض» CONTAINS «بيض», AND THAT IS AN ACCIDENT ────────────");
{
  // The noun half of the harm rule used raw `includes` so it would tolerate the article
  // Arabic glues on the front («اللبن»). It also matched «بيض» (egg) inside «الأبيض» (the
  // white one) and «بيضاء» (white, fem.) — a plate of white rice, read as an egg allergy.
  // Affix-stripped tokens keep the tolerance without the accident.
  for (const t of ["الرز الأبيض حلو", "صلصة بيضاء", "القهوة البيضاء", "الشوكولاتة البيضاء"]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }
  // WITH THE HARM VERB PRESENT, which is where raw containment actually does its damage.
  // The cases above are now stopped one step earlier, by the verb rule — so on their own they
  // would let raw containment back in unnoticed (a driven mutation restored it and this file
  // stayed green). These carry a REAL harm verb, so the noun rule is genuinely reached, and
  // the only thing standing between them and a wrong kitchen note is the token boundary.
  for (const t of [
    "أنا متجوز وهذا يضرني",        // «متجوز» (married) contains «جوز» (walnut)
    "الشوكولاتة البيضاء تضرني",    // «البيضاء» (white) contains «بيض» (egg)
    "الحلا الأبيض يضرني",
    "البيتزا البيضاء تضرني",
  ]) {
    const hit = detectAllergyContext(t);
    ok(`«${t}» names no allergen${hit.fired ? ` — named «${hit.term}»` : ""}`, !hit.fired);
  }
  ok("…while «اللبن يضرني» still resolves through the article", detectAllergyContext("اللبن يضرني").term === "لبن");
  ok("…and «بالفستق يضرني» through the preposition AND the article",
    detectAllergyContext("بالفستق يضرني").term === "فستق");
}

console.log("\n── A PHONE NUMBER IS NOT AN AMBULANCE CALL ─────────────────────");
{
  // «٩٩٧|997|911|١١٢|112» were five bare alternatives with no digit boundary and no context.
  // A Saudi mobile number is ten digits; 997 or 112 lands inside a great many of them. This
  // was live on WhatsApp, and it escalated to a HUMAN as a life-threatening reaction — on the
  // single most routine message in the product.
  for (const t of [
    "رقمي 0559971234", "رقمي ٠٥٥٩٩٧١٢٣٤", "جوالي 0119112233", "رقم التواصل 0509970001",
    "الطلب رقم 112", "العنوان شارع 911", "شقة 911", "الحساب 112 ريال",
    "أبغى 997 ريال", "المبلغ 1120 ريال", "رقم 9970", "الفاتورة 9112",
  ]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }
  // A CALLING VERB *AND* A PHONE NUMBER — the case that needs the digit boundary, and the
  // only one that does. Every message above is quiet on the frame rule alone, so a driven
  // mutation dropped the boundary and this file stayed green. «اتصل على رقمي 0559971234» is
  // a customer asking to be called back: the calling verb is right there, and 997 is sitting
  // inside their own number.
  for (const t of ["اتصل على رقمي 0559971234", "كلموني على 0559112233", "اتصلوا على جوالي 0509970001"]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }

  // A NUMBER STANDING ALONE IS STILL HEARD — it is what someone types with no words left.
  for (const t of ["997", "911", "١١٢", "997!", "٩٩٧"]) {
    ok(`«${t}» alone still fires`, detectAllergenEmergency(t).fired);
  }
  // …and so is a number someone is CALLING.
  for (const t of ["اتصلوا 997", "اتصل بالإسعاف 997", "كلموا 997 بسرعة"]) {
    ok(`«${t}» still fires`, detectAllergenEmergency(t).fired);
  }
  // …and every phrasing that never needed the digits at all.
  for (const t of [
    "نبي اسعاف", "ودينا المستشفى", "طوارئ الحين", "ما أقدر أتنفس", "حلقي يقفل",
    "شفايفي تتورم", "call an ambulance", "anaphylaxis", "I can't breathe",
  ]) {
    ok(`«${t}» still fires`, detectAllergenEmergency(t).fired);
  }
}

console.log("\n── «تعبت» IS BEING TIRED, NOT BEING POISONED ───────────────────");
{
  // «تعب» was a bare stem in the avoidance-intent list, so it matched «تعبت» ("I am tired")
  // and «تعبان» ("tired"). Paired with any allergen noun — and «لبن»/«حليب» are among the
  // most-ordered items in the country — an ordinary complaint about waiting became an allergy
  // hold AND a staff alert, at the exact moment the customer was already unhappy.
  for (const t of [
    "تعبت من الانتظار، أبغى لبن", "أنا تعبان اليوم، أبغى حليب",
    "متعب من الشغل، أبغى قهوة بالحليب", "تعبت من كثر ما أطلب لبن",
    "تعبنا من التأخير والحليب بارد",
  ]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }
  // THE MEDICAL SENSE NAMES WHO IT TIRES, OR PUTS IT UNDER A CONDITION.
  for (const t of [
    "اتعب لو اكلت بندق", "اللبن يتعبني", "بيتعبني الحليب", "تعبان لو شربت حليب",
    "البيض بيتعبني",
  ]) {
    ok(`«${t}» still fires`, detectAllergenAvoidance(t).fired);
  }
}

console.log("\n── ORDINARY ORDERS AND GREETINGS, THE ORIGINAL COMPLAINT ───────");
{
  // The incident that started all of this: a greeting answered as an allergy consultation.
  // These are the sound-alikes and the plain orders — every one of them must be silent.
  for (const t of [
    "هلا والله", "السلام عليكم", "مرحبا", "مساء الخير", "وش اسمك", "اسمك خالد؟",
    "موز", "أبي عصير موز", "كنافة بالجبن", "رز أبيض", "لبن بارد", "أبغى حليب",
    "أبغى كوب حليب", "الجوز حلو", "متجوز من سنة", "ولو سمحت", "أبغى الحساب",
    "كم الحساب؟", "وش عندكم أطباق اليوم؟", "أنا بالبيت", "لا تضر نفسك",
    "بغيت كنافة بالفستق", "عطني بيض مسلوق",
  ]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }
}

console.log("\n── THE REAL DISCLOSURES, EVERY ONE STILL HEARD ─────────────────");
{
  // The whole risk of a false-positive proof is that it passes by making the gate deaf.
  // Every posture the product supports, asserted through the SAME union the routes run.
  const MUST_FIRE = [
    "عندي حساسية من المكسرات", "حساسيتي من اللبن", "أتحسس من الفول السوداني",
    "ما أقدر آكل لبن", "ما أتحمل اللبن", "ممنوع علي البيض", "الدكتور منع عني الكنافة",
    "حلقي ينتفخ", "عندي طفح", "ضيق نفس", "ما أقدر أتنفس", "شفايفي تتورم",
    "Is this gluten free?", "I'm allergic to peanuts", "lactose intolerant",
    "بنتي ما تاكل بيض", "بموت لو أكلت فول سوداني", "المكسرات تضرني", "اتصلوا الإسعاف",
  ];
  for (const t of MUST_FIRE) {
    ok(`«${t}» is heard${anyDetectorFires(t) ? "" : " — NOTHING FIRED"}`, anyDetectorFires(t));
    // …and through the two composed readers the rest of the engine actually calls.
    ok(`  …and the safety bridge agrees`, isSafetyClassInbound(t));
    ok(`  …and the composed union calls it an allergy`,
      detectAllergyOrDiseaseMention(t).kind === "allergy");
  }
}

console.log("\n── THE QUIET CASES ARE QUIET THROUGH THE COMPOSED READERS TOO ──");
{
  // A detector can be quiet while a wrapper still holds the turn. Both composed readers are
  // asserted on the same corpus, because those are what `respond-and-send.ts` and the demo
  // routes actually call.
  for (const t of [
    "هاذي الرز الأبيض زين", "رقمي 0559971234", "تعبت من الانتظار، أبغى لبن",
    "هلا والله", "الطلب رقم 112", "أبغى الحساب", "صلصة بيضاء",
  ]) {
    ok(`«${t}» — the safety bridge stays quiet`, !isSafetyClassInbound(t));
    ok(`  …and the composed union does not call it an allergy`,
      detectAllergyOrDiseaseMention(t).kind !== "allergy");
  }
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} allergy-false-positives: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
