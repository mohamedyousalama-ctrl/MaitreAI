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
import { detectAllergyOrDiseaseMention, mentionsDiseaseCondition } from "../lib/ai/allergy-simple";
import { isSafetyClassInbound } from "../lib/ai/safety-bridge";
import { voiceHardZeroReason } from "../lib/messaging/voice-budget";
import { demoVoiceSilenceKind } from "../lib/demo/voice-out";

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


console.log("\n── NARROWING IS THE OTHER WAY TO BREAK A SAFETY GATE ────────────");
{
  // EVERY CASE HERE WAS BROKEN BY THE COMMIT THAT FIXED THE FALSE POSITIVES ABOVE, AND WAS
  // FOUND BY AN AUDIT RATHER THAN BY THIS FILE.
  //
  // The first pass narrowed «تعب» to "an object pronoun, or the conditional «لو»" and the
  // harm verb to "an object pronoun". Both narrowed by FORM. Form is not what separates a
  // disclosure from a complaint, so the result was a gate that had stopped hearing:
  //
  //   Arabic has FIVE common conditionals and only «لو» was implemented — the sibling file
  //   lib/ai/allergen-emergency.ts already listed all five, one directory away.
  //
  //   «اللبن يتعب معدتي» — the most ordinary way a Gulf speaker states lactose intolerance —
  //   names the organ, not the person, so it carried no pronoun and went silent.
  //
  //   «اللبن يضر ابني» names the child as a separate word. A parent disclosing a child's
  //   allergy is the case this gate's ancestor was written for, and it went silent.
  //
  // The rules now ask whether the thing doing the harm is FOOD, which is the actual question.
  const MUST_HEAR = [
    // conditional on eating — all five conditionals
    "أتعب لو أكلت بندق", "أتعب إذا أكلت بندق", "اتعب اذا اكلت بندق", "أتعب إن أكلت بندق",
    "بتعب لما آكل بيض", "أتعب في حال أكلت بندق", "ولدي يتعب إذا أكل مكسرات",
    "تعبان لو شربت حليب",
    // the organ frame
    "اللبن يتعب معدتي", "الحليب يتعب بطني", "المكسرات تتعب معدتي", "الحليب يتعب صحتي",
    "الحليب يضر معدتي",
    // the food tires ME, in both word orders
    "اللبن يتعبني", "بيتعبني الحليب", "البيض بيتعبني",
    // tired FROM a food, including the two-word canonical with the article on both halves
    "صاحبي بيتعب من البندق", "بيتعب من الفول السوداني",
    // third-person harm, where the person is a separate word
    "اللبن يضر ابني", "البيض يضر الأطفال عندنا", "الفول السوداني يضر زوجتي",
    "المكسرات تضر بنتي",
    // the Gulf spelling of egg the lexicon did not carry
    "بتعبني البيظ", "البيظ يتعبني",
  ];
  for (const t of MUST_HEAR) {
    ok(`«${t}» is heard${anyDetectorFires(t) ? "" : " — NOTHING FIRED"}`, anyDetectorFires(t));
    ok(`  …and the safety bridge agrees`, isSafetyClassInbound(t));
  }

  // AND THE COURTESY THE NARROWING WAS SUPPOSED TO EXCLUDE AND DID NOT. «تعبناك» / «تعبكم
  // معنا» is Gulf for "sorry for the trouble" — and it carries the very object pronoun the
  // first narrowing asked for, so it kept firing throughout.
  for (const t of [
    "ما قصرتوا، تعبكم معنا. أبغى لبن",
    "الله يعطيكم العافية تعبناكم، وحدة حليب",
    "تعبناك معنا يا خالد، أبغى كوب حليب",
    // WITHOUT THE PUNCTUATION, which is what makes this a real test. Every courtesy case
    // above happens to carry a comma or a full stop, and the clause boundary alone keeps
    // them quiet — a driven mutation widened the object pronoun to «نا»/«كم»/«ك» and this
    // file stayed green. Spoken Arabic in a chat window rarely punctuates.
    "تعبناك معنا أبغى كوب حليب",
    "تعبكم معنا أبغى لبن",
    "تعبناكم وحدة حليب",
    // …and the clause boundary that keeps two separate complaints separate
    "تعبنا من التأخير، الحليب بارد",
    "تعبنا من الانتظار الحليب بارد",
  ]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }
}

console.log("\n── AN EXCLUSION CANNOT TELL US WHETHER SOMEONE IS BREATHING ────");
{
  // `PAST_RE` matched «زمان» anywhere in the message and vetoed the WHOLE detector. «زمان،
  // مو قادر أتنفس» is not a history — it is "for a while now, I can't breathe" — and it
  // returned nothing. Two more said the past in one clause and an airway closing in the
  // next, and the veto read the first and threw the second away.
  for (const t of [
    "زمان، مو قادر أتنفس",
    "قبل كده صار لي كذا، الحين مو قادر أتنفس",
    "سابقا ما صار، بس الحين حلقي يقفل",
    "لساني ينتفخ",
  ]) {
    ok(`«${t}» reaches the emergency path`, detectAllergenEmergency(t).fired);
  }
  // …while a genuine history still does not. The exclusions keep their job over the softer
  // signals, where a story about last year really is the common reading.
  for (const t of [
    "قبل سنه رحت المستشفى من الفول",
    "من زمان ودوني المستشفى بسبب الفول",
    "لو أكلت بندق يصير لي تحسس؟",
    "هل ممكن يصير تحسس؟",
  ]) {
    ok(`«${t}» is not an emergency`, !detectAllergenEmergency(t).fired);
  }
  // «نفسي ضايق» is both "my breath is tight" and "I am fed up". What follows says which.
  for (const t of ["نفسي ضايق من الخدمة", "نفسي ضايق من التأخير"]) {
    ok(`«${t}» is a complaint, not an airway`, !detectAllergenEmergency(t).fired);
  }
  ok("…while «نفسي ضايق» on its own still is an airway", detectAllergenEmergency("نفسي ضايق").fired);
}

console.log("\n── THE SAUDI AMBULANCE NUMBER, IN ENGLISH AND IN ARABIC ────────");
{
  // The English arm knew «call 911» — the AMERICAN number — and not «call 997», which is the
  // one in the country this agent serves. The first number fix removed the bare digits and
  // did not notice the asymmetry it left behind.
  for (const t of ["call 997", "Call 997 now please", "call 112", "call 911", "call an ambulance"]) {
    ok(`«${t}» is heard`, detectAllergenEmergency(t).fired);
  }
  // A number alone, or with one word of urgency, or called by a verb.
  for (const t of ["997", "٩٩٧", "997 بسرعة", "997 الحين", "اتصلوا 997", "اطلبوا 997", "اتصل بالإسعاف 997"]) {
    ok(`«${t}» is heard`, detectAllergenEmergency(t).fired);
  }
  // «ودّونا الطوارئ» — the plural this list never carried, named in a comment as covered.
  ok("«ودّونا الطوارئ» is heard", detectAllergenEmergency("ودّونا الطوارئ").fired);

  // A SEPARATED PHONE NUMBER IS STILL A PHONE NUMBER. The digit boundary only saw digits, so
  // «055 997 1234» — how a Saudi actually writes it — put spaces around the 997 and fired.
  // The corpus passed because it only ever tested the unseparated form.
  for (const t of [
    "اتصل على رقمي 055 997 1234", "055-997-1234", "كلموني على 055 997 1234",
    "رقمي ٠٥٥ ٩٩٧ ١٢٣٤", "جوالي 055 911 2233",
    // WITH THE CALLING VERB RIGHT BEFORE IT — the case that actually needs the digits
    // joined. Everywhere else the verb-proximity rule already stops the message on its own,
    // so a driven mutation removed the collapse entirely and this file stayed green. "Call
    // me on 055 997 1234" puts the verb one word from a 997 the boundary would otherwise
    // accept as standing alone.
    "اتصل 055 997 1234", "اتصل علي 055 997 1234", "اتصلوا 055 911 2233", "كلمني 0559971234",
  ]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }
  // AND THE CALLING VERB HAS TO BE CALLING THE NUMBER. «اتصل» is the most ordinary verb in
  // delivery; anywhere-in-the-message was enough to re-open the whole family.
  for (const t of [
    "الطلب رقم 112 اتصل علي لما توصل", "العمارة 911 اتصل قبل ما توصل", "شقة 112 اتصل لما تجي",
    // «نجده» was listed for the rescue service «نجدة» — normalizeAr folds ة→ه, so it is also
    // the everyday verb "we find it".
    "الطلب 112 ما نجده", "رقم 911 ما نجده في السيستم",
  ]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }
}


console.log("\n── THE SYMPTOM FILE NOBODY HAD SWEPT ───────────────────────────");
{
  // THE SAME BARE-SUBSTRING BUG, IN A FILE THIS BRANCH NEVER OPENED UNTIL A REVIEW SAID SO.
  //
  // Fifteen ordinary sentences out of fifteen fired. Arabic has no `\b`, so every alternation
  // in this file matched a run of letters wherever it appeared, and the English arm had no
  // word boundary at all:
  //
  //   «عندكم خبز حبوب كاملة؟»  whole-grain bread     «حبوب» is grains, pills AND pimples
  //   «الطبق ده محبوب عندنا»    this dish is popular  «حبوب» ⊂ «محبوب»
  //   «ضحكة حلوة»               nice laugh            «حكه» ⊂ «ضحكه»
  //   «اسمي Rasheed»            my name is Rasheed    `rash` ⊂ `Rasheed`
  //   «chives على السلطة»       chives on the salad   `hives` ⊂ `chives`
  //   «كم كربوهيدرات؟»          how many carbs        «ربو» (asthma) ⊂ «كربوهيدرات»
  //   «الطلب مربوط بالحساب»     linked to the bill    «ربو» ⊂ «مربوط»
  //   «احمرار في اللحم»         redness in the meat   the meat, not a person
  //   «ابني ما يقربش الرز الأبيض» won't eat white rice «بيض» ⊂ «الأبيض» → a CHILD allergy hold
  for (const t of [
    "عندكم خبز حبوب كاملة؟", "أبغى قهوة حبوب مطحونة", "الحبوب الكاملة صحية",
    "الطبق ده محبوب عندنا", "ضحكة حلوة", "اسمي Rasheed", "chives على السلطة",
    "كم كربوهيدرات في الكبسة؟", "الطلب مربوط بالحساب", "احمرار في اللحم يعني مو مستوي",
    "ابني ما يقربش الرز الأبيض", "sensitive to price", "ما تفولش كذا",
  ]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }
  // AND EVERY REAL SYMPTOM IS STILL HEARD.
  for (const t of [
    "عندي طفح جلدي", "طلع لي طفح", "عندي حكة في جسمي", "حبوب في وجهي من الأكل",
    "hives all over", "I have a rash", "عندي ربو", "التفول عندي", "احمرار في جلدي",
    "nut allergy", "عندي حساسية", "اكزيما", "gluten sensitivity", "sensitive to dairy",
  ]) {
    ok(`«${t}» is heard${detectAllergenSymptom(t).fired ? "" : " — NOTHING FIRED"}`,
      detectAllergenSymptom(t).fired);
  }
}

console.log("\n── \"NO\" IS AN ANSWER, NOT A DISCLOSURE ─────────────────────────");
{
  // The English arm matched `allerg…` and never looked left of it, so a customer ANSWERING
  // the allergy question was held as if they had said yes. The Arabic denial paths
  // (`isExplicitAllergyDenial`, `detectAllergyRetraction`) had no English counterpart at all.
  for (const t of [
    "I am not allergic to anything", "no nut allergy here", "not allergic", "no allergies",
    "nut free please", "without any allergy",
  ]) {
    ok(`«${t}» is a denial`, !detectAllergenSymptom(t).fired);
  }
  // …AND A DENIAL SILENCES THE VOCABULARY ONLY, NEVER A SYMPTOM. The first version of this
  // guard covered the whole English arm and shipped with a comment claiming this case still
  // fired. It did not: a sentence that denies one thing and reports an airway went quiet.
  ok("«I'm not allergic to nuts but my throat is closing» is still heard",
    detectAllergenSymptom("I'm not allergic to nuts but my throat is closing").fired);
  ok("…and so is «no allergies, but I can't breathe»",
    detectAllergenSymptom("no allergies, but I can't breathe").fired);
}

console.log("\n── «سكر» IS ALSO THE WORD FOR SUGAR ────────────────────────────");
{
  // `DISEASE_INPUT_RE` was careful and boundary-aware; `DISEASE_CONTEXT_RE` was a bare
  // alternation containing «عندي», and the two were tested independently anywhere in the
  // message. «الشاي عندي بدون سكر» — how a Saudi orders tea — was a diabetes disclosure that
  // fed the durable kitchen ticket.
  for (const t of [
    "الشاي عندي بدون سكر لو سمحت", "القهوة عندي بدون سكر", "ابغى شاي بدون سكر",
    "عندي سكر زيادة في القهوة، خففه", "عندي قلبي يشتهي كبسة لحم",
    "عندي ضغط وقت، أبغى الطلب بسرعة", "عندي طلب سابق",
  ]) {
    ok(`«${t}» is not a diagnosis`, !mentionsDiseaseCondition(t));
  }
  // A STATED CONDITION PUTS THE WORDS TOGETHER.
  for (const t of [
    "عندي سكري", "عندي سكر", "مريض ضغط", "عندي ضغط", "عندي كوليسترول", "حالتي سكري",
    "عندي قولون",
  ]) {
    ok(`«${t}» is a condition`, mentionsDiseaseCondition(t));
  }
  // …AND THESE TWO NEVER MATCHED AT ALL, BECAUSE THE ARTICLE DEFEATED THE BOUNDARY.
  for (const t of ["انا مصاب بالسكري", "بعاني من القولون", "عندي مشكلة بالقولون"]) {
    ok(`«${t}» is a condition (article tolerated)`, mentionsDiseaseCondition(t));
  }
  // Pregnancy states itself with no context word at all.
  ok("«أنا حامل» is a condition", mentionsDiseaseCondition("أنا حامل"));
  ok("…while «أنا أبغى سكر» is an order", !mentionsDiseaseCondition("أنا أبغى سكر"));
}


console.log("\n── THE SENTENCES THE CORPUS ITSELF DID NOT COVER ────────────────");
{
  // THIS FILE'S HEADER READ AS A COMPLETED SWEEP AND IT HAD SWEPT TWO FILES OF FOUR.
  //
  // A review drove thirty ordinary restaurant sentences through the same union the routes
  // run and fourteen raised an allergy safety turn — on EVERY tenant, because the same branch
  // had just been unflagged. Three separate bugs, each the bare-substring shape this corpus
  // was written to catch, in the file that replaced the retired net:
  //
  //   «حساس» is the ordinary adjective SENSITIVE, listed as an allergy marker.
  //   `PHRASES` used raw `includes`, so three entries matched as PREFIXES.
  //   `SYMPTOM_SINGLE` was bare, so bread rises, dough swells and a room is stuffy.
  //
  // It matters more than a wrong answer: `customer-turn.ts` fires `recordCriticalAlert` on
  // every notify-without-hold, which emails and WhatsApps a human phone. «طفح الكيل من
  // التأخير» — the most likely sentence from a customer who has had enough — paged a person.
  for (const t of [
    "ما اتحمل الانتظار، أبغى ألغي",
    "ما أقدر أكلمك الحين، أرسل لي رسالة",
    "الموضوع حساس شوي، تكلم مع المدير",
    "الطلب حساس للوقت لأني مسافر",
    "طفح الكيل من التأخير هذا",
    "طفح الكيل",
    "الخبز ينتفخ في الفرن عندكم؟",
    "العجين تورم زيادة",
    "كتمه في المطعم، شغلوا المكيف",
    "الجو فيه كتمة",
    "ممنوع عليكم تدخلوا السيارة داخل الحي",
    "الدكتور منعنا من التدخين جوه المطعم",
    "ما اتحمل الأكل الحار",
    "مو قادر آكل بعد، شبعت",
    "حكة الرأس من الشعر؟",
  ]) {
    ok(`«${t}» is quiet${anyDetectorFires(t) ? ` — ${whichFired(t)} fired` : ""}`, !anyDetectorFires(t));
  }

  // AND REMOVING THE BARE ADJECTIVE COSTS NOTHING, which is why it could go. Every «حساس»
  // disclosure is caught by the vocabulary gate — WITH the allergen named, which the context
  // file never did.
  for (const [t, term] of [
    ["أنا حساس من اللبن", "لبن"], ["حساس من المكسرات", "مكسرات"],
    ["أنا حساسة من البيض", "بيض"], ["حساسين من الفول السوداني", "فول سوداني"],
  ] as Array<[string, string]>) {
    ok(`«${t}» is still heard, and names «${term}»`, detectAllergenAvoidance(t).term === term);
  }

  // A SYMPTOM NEEDS A BODY, and these are the ones that have one.
  for (const t of [
    "حلقي ينتفخ", "لساني ينتفخ", "وجهي متورم", "عندي طفح", "طلع لي طفح",
    "جاني طفح من الأكل", "عندي حكة في جسمي", "عندي كتمة في صدري", "اكزيما", "عندي هرش",
  ]) {
    ok(`«${t}» is heard${anyDetectorFires(t) ? "" : " — NOTHING FIRED"}`, anyDetectorFires(t));
  }
  // …INCLUDING THE ONE THAT WAS SILENT EVERYWHERE. `hasToken` never tolerated the article, so
  // «التورم في وجهي» ("the swelling in my face") matched nothing, in any detector, on any
  // surface — a plain report of a swollen face.
  ok("«التورم في وجهي» is heard at last", anyDetectorFires("التورم في وجهي"));

  // The medical phrases still work, whole.
  for (const t of ["ما أتحمل اللبن", "ممنوع علي البيض", "ما أقدر آكل لبن", "الدكتور منع عني الكنافة"]) {
    ok(`«${t}» is heard`, anyDetectorFires(t));
  }
}

console.log("\n── A PRICE IS NOT AN AMBULANCE NUMBER ──────────────────────────");
{
  // The `emergency_number` hard-zero fired on «تمام، المجموع 112 ريال» — an ordinary Saudi
  // total — and `demoVoiceSilenceKind` had never been told the reason existed, so it fell
  // through to "unavailable" and `callResponseAction` ENDED THE CALL saying the voice was
  // broken. A deliberate product rule, reported to a prospect as a product failure, on a
  // normal bill. Prices are SPOKEN on a call now, so the money rule no longer caught it first.
  const CALL = {
    safetyHold: false, isReceipt: false,
    spokenPricesAllowed: true, spokenSafetyAllowed: true, stopReason: "end_turn",
  } as const;
  for (const t of ["تمام، المجموع 112 ريال 👍", "الإجمالي 997 ريال", "صار 911 ريال", "السعر 112 ر.س"]) {
    ok(`«${t}» is spoken`, voiceHardZeroReason(t, CALL) === null);
  }
  // …and a number someone could DIAL is still refused, as a RULE (text shown, call continues),
  // never as "the voice is not working".
  for (const t of ["اتصل 997", "الرقم 911 للطوارئ", "لو صار شي اتصل بالإسعاف 997"]) {
    ok(`«${t}» is refused`, voiceHardZeroReason(t, CALL) === "emergency_number");
    ok(`  …and as a rule, not a failure`, demoVoiceSilenceKind("emergency_number" as never) === "rule");
  }
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} allergy-false-positives: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
