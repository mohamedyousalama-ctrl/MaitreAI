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

console.log(`\nALLERGEN-GATE UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
