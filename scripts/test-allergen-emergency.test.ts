// Unit tests for the §5 allergy EMERGENCY detector (pure, no LLM).
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/test-allergen-emergency.test.ts
import { detectAllergenEmergency } from "../lib/ai/allergen-emergency.ts";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const fires = (s: string) => detectAllergenEmergency(s).fired;

// ── MUST FIRE — §5 verbatim includes ──
// Gulf
ok("حلقي يتورم", fires("حلقي يتورم فجأة"));
ok("حلقي يقفل", fires("حلقي يقفل"));
ok("ما أقدر أتنفس", fires("ما أقدر أتنفس"));
ok("نفسي ضاق", fires("نفسي ضاق"));
ok("شفايفي تورم", fires("شفايفي تورم"));
ok("لساني تورم", fires("لساني تورم"));
ok("صار لي تحسس الحين", fires("صار لي تحسس الحين"));
ok("صار لولدي تحسس الحين", fires("صار لولدي تحسس الحين"));
ok("نحتاج إسعاف", fires("نحتاج إسعاف"));
ok("وديناه المستشفى", fires("وديناه المستشفى"));
// Egyptian
ok("زوري بيقفل", fires("زوري بيقفل"));
ok("مش عارف أتنفس", fires("مش عارف أتنفس"));
ok("وشي ورم", fires("وشي ورم"));
ok("جاله حساسية دلوقتي", fires("جاله حساسية دلوقتي"));
ok("عايزين إسعاف", fires("عايزين إسعاف"));
// English / mixed
ok("can't breathe", fires("I can't breathe"));
ok("throat closing", fires("my throat is closing"));
ok("swelling now", fires("lips swelling now"));
ok("anaphylaxis", fires("this looks like anaphylaxis"));
ok("emergency now", fires("emergency now please"));

// ── MUST NOT FIRE — §5 excludes ──
ok("neg plain: عندي حساسية من المكسرات", !fires("عندي حساسية من المكسرات"));
ok("neg plain: أنا حساس من البيض", !fires("أنا حساس من البيض"));
ok("neg past: تحسس قبل سنة", !fires("صار لي تحسس قبل سنة"));
ok("neg past: من زمان", !fires("جاني تحسس من زمان"));
ok("neg hypothetical: لو أكلت مكسرات", !fires("لو أكلت مكسرات بيصير لي تحسس"));
ok("neg hypothetical: إذا أكلت بيض", !fires("إذا أكلت بيض يجيني طفح"));
ok("neg question: ممكن يصير تحسس؟", !fires("ممكن يصير لي تحسس؟"));
ok("neg question: فيه مكسرات؟", !fires("فيه مكسرات في الطبق؟"));
ok("neg idiom: حساسية من الأسعار", !fires("عندي حساسية من الأسعار"));
ok("neg idiom: حساسية من الزحمة", !fires("حساسية من الزحمة الصراحة"));
ok("neg: normal order", !fires("أبغى كبسة دجاج وبيبسي"));
ok("neg: empty", !fires(""));

console.log(`\nALLERGEN-EMERGENCY UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
