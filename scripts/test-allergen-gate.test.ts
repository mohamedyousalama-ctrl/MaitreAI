// Unit tests for the deterministic allergen-safety detectors (pure, no LLM).
// Run: node --experimental-strip-types scripts/test-allergen-gate.ts
import { detectAllergenAvoidance, assertsAllergenSafety } from "../lib/ai/allergen-gate.ts";
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
console.log(`\nALLERGEN-GATE UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
