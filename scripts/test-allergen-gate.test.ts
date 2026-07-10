// Unit tests for the deterministic allergen-safety detectors (pure, no LLM).
// Run: node --experimental-strip-types scripts/test-allergen-gate.ts
import { detectAllergenAvoidance, assertsAllergenSafety, shouldEscalateOnSafetyClaim } from "../lib/ai/allergen-gate.ts";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
// MUST fire — euphemisms + explicit, with/without «حساسية»
ok("live: اتعب لو اكلت بندق", detectAllergenAvoidance("انا اتعب لو اكلت بندق").fired);
ok("بيتعب من البندق (no حساسية)", detectAllergenAvoidance("صاحبي بيتعب من البندق").fired);
ok("بموت لو كلت فستق", detectAllergenAvoidance("بموت لو كلت فستق").fired);
ok("عندي مشكلة مع اللوز", detectAllergenAvoidance("عندي مشكلة مع اللوز").fired);
ok("ممنوع عليا مكسرات", detectAllergenAvoidance("ممنوع عليا مكسرات").fired);
ok("الدكتور قالي مكلش جلوتين", detectAllergenAvoidance("الدكتور قالي مكلش جلوتين").fired);
ok("مينفعش اكل بيض", detectAllergenAvoidance("مينفعش اكل بيض").fired);
ok("بتعبني الألبان", detectAllergenAvoidance("بتعبني الألبان").fired);
ok("explicit: عندي حساسية", detectAllergenAvoidance("عندي حساسية").fired);
ok("حساسية من الفول السوداني", detectAllergenAvoidance("حساسية من الفول السوداني").fired);
// TERM NAMING — the substring/boundary fix (must NAME the real allergen)
const term = (s: string) => detectAllergenAvoidance(s).term;
ok("name: البندق → بندق (NOT لبن)", term("عندي حساسية من البندق") === "بندق");
ok("name: فول سوداني (NOT سوداني)", term("حساسية من فول سوداني") === "فول سوداني");
ok("name: الفول السوداني → فول سوداني", term("عندي حساسية من الفول السوداني") === "فول سوداني");
ok("name: فستق", term("بموت لو كلت فستق") === "فستق");
ok("name: اللوز → لوز", term("عندي مشكلة مع اللوز") === "لوز");
ok("name: اللبن → لبن (real milk kept)", term("عندي حساسية من اللبن") === "لبن");
ok("name: مكسرات", term("ممنوع عليا مكسرات") === "مكسرات");
// MUST NOT fire
ok("neg: بحب البندق", !detectAllergenAvoidance("بحب البندق").fired);
ok("neg: عايز اللوز", !detectAllergenAvoidance("عايز اللوز").fired);
ok("neg: تعبان من السفر", !detectAllergenAvoidance("تعبان من السفر").fired);
ok("neg: عايز بيتزا", !detectAllergenAvoidance("عايز بيتزا").fired);
ok("neg: فيه بندق؟", !detectAllergenAvoidance("فيه بندق في الكيكة؟").fired);
// Output guard MUST catch / MUST NOT catch
ok("guard: مفيهوش بندق", assertsAllergenSafety("الصنف ده مفيهوش بندق خالص"));
ok("guard: آمن ١٠٠٪ من الحساسية", assertsAllergenSafety("الأكل ده آمن ١٠٠٪ بالنسبة للحساسية"));
ok("guard: خالي من المكسرات", assertsAllergenSafety("ده خالي من المكسرات"));
ok("guard: nut-free", assertsAllergenSafety("this one is nut-free, safe to eat"));
ok("guard neg: دفع آمن", !assertsAllergenSafety("الدفع آمن عند الاستلام"));
ok("guard neg: normal recap", !assertsAllergenSafety("طلبك: ١× برجر لحم — الإجمالي ١٤٥"));
// OUTPUT GUARD decouple — block always; escalate only on a real avoidance signal
ok("block-but-NOT-escalate: «عندكم ايه من غير بندق» (no hold)", shouldEscalateOnSafetyClaim("عندكم ايه من غير بندق", false) === false);
ok("the LLM «دي خالية من البندق» IS a claim (so it gets blocked)", assertsAllergenSafety("دي خالية من البندق") === true);
ok("block-AND-escalate: same turn but «عندي حساسية من البندق»", shouldEscalateOnSafetyClaim("عندي حساسية من البندق", false) === true);
ok("block-AND-escalate: benign msg but convo already is_safety_hold", shouldEscalateOnSafetyClaim("عندكم ايه من غير بندق", true) === true);
ok("escalate: euphemism «اتعب لو اكلت بندق»", shouldEscalateOnSafetyClaim("اتعب لو اكلت بندق", false) === true);
ok("no-escalate: «عايز صنف فيه بندق» (positive, no hold)", shouldEscalateOnSafetyClaim("عايز صنف فيه بندق", false) === false);

// ── KSA ratified-path additions (docs/KSA_ALLERGEN_DIALECT_REVIEW.md §2b/§3) ──
// The 10 Najdi/Hijazi base-gap phrasings — all MUST now fire (permanent must-fire).
ok("ksa-1: أنا حساس من الفول السوداني (adjective)", detectAllergenAvoidance("أنا حساس من الفول السوداني").fired);
ok("ksa-2: أنا حساسة من البيض (fem adjective)", detectAllergenAvoidance("أنا حساسة من البيض").fired);
ok("ksa-3: أتحسس من الحليب (reaction verb)", detectAllergenAvoidance("أتحسس من الحليب").fired);
ok("ksa-4: يجيني تحسس من الفستق (reaction noun)", detectAllergenAvoidance("يجيني تحسس من الفستق").fired);
ok("ksa-5: ألرجيا من البيض (transliteration)", detectAllergenAvoidance("ألرجيا من البيض").fired);
ok("ksa-6: عندي الرجي من الجلوتين (transliteration)", detectAllergenAvoidance("عندي الرجي من الجلوتين").fired);
ok("ksa-7: مو قادر آكل جمبري (Najdi negation)", detectAllergenAvoidance("مو قادر آكل جمبري").fired);
ok("ksa-8: ما يصير آكل لبن (Najdi negation)", detectAllergenAvoidance("ما يصير آكل لبن").fired);
ok("ksa-9: المكسرات تأذيني (harm verb fem/3rd)", detectAllergenAvoidance("المكسرات تأذيني").fired);
ok("ksa-10: ما أتحمل اللاكتوز (intolerance + new term)", detectAllergenAvoidance("ما أتحمل اللاكتوز").fired);
// New-term naming (لاكتوز→dairy display; طحينة normalized طحينه).
ok("ksa-name: لاكتوز", term("ما أتحمل اللاكتوز") === "لاكتوز");
ok("ksa-name: حساس من الطحينة → طحينه", term("أنا حساس من الطحينة") === "طحينه");
// False-positive traps — MUST NOT fire (high-precision explicit patterns hold).
ok("ksa-neg: موضوع حساس (sensitive topic)", !detectAllergenAvoidance("الموضوع ده حساس شوية").fired);
ok("ksa-neg: إحساس جميل (feeling)", !detectAllergenAvoidance("عندي احساس جميل النهاردة").fired);
ok("ksa-neg: رجيم (diet)", !detectAllergenAvoidance("أنا بعمل رجيم").fired);
ok("ksa-neg: الرجيم (diet, article)", !detectAllergenAvoidance("الرجيم صعب").fired);
ok("ksa-neg: الراجل (the man)", !detectAllergenAvoidance("الراجل ده طلب بيتزا").fired);
ok("ksa-neg: الرجل (leg/man)", !detectAllergenAvoidance("الرجل تعبانة").fired);

// ── WO-ALLERGEN-BOUNDARY — Arabic boundary-aware matching (precision-only) ──
// The bug: the FIRING decision (detectAllergenAvoidance `hasAllergen`) and the OUTPUT
// guard used a BARE alternation with no word boundaries, while NAMING already used the
// boundary-aware matcher — so the gate could FIRE while NAMING nothing (`term:null`),
// over-triggering on innocent text whose letters merely CONTAIN an allergen sequence
// mid-word (\b is meaningless for Arabic in JS regex). Fix: all detection paths use the
// same boundary-aware matcher. These cases FIRED before the fix (see the `term:null`
// smoking gun) and MUST now be clean; every must-fire case above still fires unchanged.

// 1) RED-FIRST false-positive regressions — innocent phrases whose letters embed an
//    allergen sequence mid-word. All FIRED (fired:true, term:null) before the fix.
ok("boundary-neg: اللوزتين (tonsils ⊃ لوز) + الدكتور قالي", !detectAllergenAvoidance("الدكتور قالي عندي التهاب في اللوزتين").fired);
ok("boundary-neg: اللوزتين (tonsils) + تعب", !detectAllergenAvoidance("تعبان من كتر اللوزتين الملتهبة").fired);
ok("boundary-neg: الأبيض (white ⊃ بيض) + بيضرني", !detectAllergenAvoidance("القميص الأبيض ده بيضرني للعين").fired);
ok("boundary-neg: السمكري (plumber ⊃ سمك) + تعب", !detectAllergenAvoidance("عايز اكلم السمكري بيتعبني الحنفية").fired);

// 2) FIRING⇔NAMING agreement invariant — after the fix, firing and naming share ONE
//    boundary-aware pass, so a fire can NEVER produce a null term (the pre-fix bug).
const firingCases = [
  "عندي حساسية", "عندي حساسية من البندق", "الدكتور قالي بلاش لوز",
  "ممنوع عليا مكسرات", "اتعب لو اكلت بندق", "ألرجيا من البيض",
];
for (const s of firingCases) {
  const h = detectAllergenAvoidance(s);
  ok(`agreement: fired ⇒ term≠null «${s}»`, h.fired && h.term !== null);
}

// 3) OUTPUT-GUARD false-positive regression — «آمن» (safe) next to an embedded
//    allergen sequence must NOT be read as an allergen-safety certification.
ok("guard boundary-neg: آمن + دقيق أبيض (⊃ بيض)", !assertsAllergenSafety("المنتج ده آمن ومصنوع من دقيق أبيض"));
ok("guard boundary-neg: آمن تماماً (delivery, no allergen)", !assertsAllergenSafety("الطلب آمن تماماً عند التوصيل"));

// 4) ADVERSARIAL boundary true-positives — boundaries must NOT clip real mentions:
//    «ال» article, tashkeel, ta-marbuta, sentence edges, punctuation, emoji.
ok("boundary-pos: البيض + emoji", detectAllergenAvoidance("عندي حساسية من البيض 🥚").fired);
ok("boundary-pos: name البيض → بيض", term("عندي حساسية من البيض 🥚") === "بيض");
ok("boundary-pos: البيض at start (البيض بيتعبني)", detectAllergenAvoidance("البيض بيتعبني").fired);
ok("boundary-pos: بيض at end + punctuation", detectAllergenAvoidance("مينفعش اكل بيض.").fired);
ok("boundary-pos: بيض at string start", detectAllergenAvoidance("بيض ممنوع عليا").fired);
ok("boundary-pos: tashkeel البِيْض → fires", detectAllergenAvoidance("عندي حساسية من البِيْض").fired);
ok("boundary-pos: ta-marbuta الطحينة → طحينه", term("حساس من الطحينة") === "طحينه");
ok("boundary-pos: الحليب + '!' (بموت لو)", detectAllergenAvoidance("بموت لو كلت الحليب!").fired);
ok("boundary-pos: اللبن + comma", detectAllergenAvoidance("عندي حساسية من اللبن، بجد").fired);
ok("boundary-pos: multi-word ماكولات بحرية", detectAllergenAvoidance("حساسية من ماكولات بحرية").fired);
ok("guard boundary-pos: خالي من البيض + emoji", assertsAllergenSafety("ده خالي من البيض 🥚"));
ok("guard boundary-pos: مفيهوش لبن + punctuation", assertsAllergenSafety("الصنف ده مفيهوش لبن."));

// 5) The WO's two MIZAN capture strings — the base gate NEVER fired on these (they carry
//    no avoidance/explicit signal). Pinned as must-stay-clean regressions. (The real MIZAN
//    handoff came from the phonetic near-matcher — a separate module, out of this WO's scope.)
ok("mizan-neg: «هلا، إيش عندكم أطباق اليوم؟» clean via base gate", !detectAllergenAvoidance("هلا، إيش عندكم أطباق اليوم؟").fired);
ok("mizan-neg: «خلص طلبي، شي ثاني؟» clean via base gate", !detectAllergenAvoidance("خلص طلبي، شي ثاني؟").fired);

console.log(`\nALLERGEN-GATE UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
