#!/usr/bin/env npx tsx
// ============================================================================
// Proof: allergen-gate-symptoms.ts — imports the REAL production module.
// Run: npx tsx scripts/proof-allergen-symptom-detector.ts
//
// Three proof sections:
//   A. Wiring assertions (source-code analysis of customer-turn.ts)
//      — escalate:true, forcedAllergenSafetyResult, respond() in else-branch,
//        BOTH flags required, absent flag = OFF
//   B. Flag-gate unit tests (isFeatureExplicitlyEnabled logic)
//   C. Detector unit tests — positives + negatives (real module, not a copy)
// ============================================================================

import { readFileSync } from "fs";
import { resolve } from "path";
import { detectAllergenSymptom } from "../lib/ai/allergen-gate-symptoms";
import { isFeatureExplicitlyEnabled } from "../lib/tenant/tier";

// ============================================================
// Harness
// ============================================================

let pass = 0, fail = 0;
const errors: string[] = [];

function ok(desc: string, result: boolean, ...details: string[]): void {
  if (result) {
    console.log(`✓ [PASS] ${desc}`);
    pass++;
  } else {
    console.log(`✗ [FAIL] ${desc}`);
    details.forEach((d) => console.log(`       ${d}`));
    errors.push(desc);
    fail++;
  }
}

function check(desc: string, text: string, expectedFired: boolean): void {
  const result = detectAllergenSymptom(text);
  const matched = result.fired === expectedFired;
  ok(
    desc,
    matched,
    `text: "${text}"`,
    `expected fired=${expectedFired}`,
    `got    fired=${result.fired} term=${result.term}`
  );
  if (matched && result.fired) console.log(`       → term: ${result.term}`);
}

// ============================================================
// SECTION A — Wiring assertions (customer-turn.ts source analysis)
// ============================================================
console.log("\n── A: Wiring assertions (customer-turn.ts source) ──");

const src = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");

function assertSrc(desc: string, re: RegExp): void {
  ok(desc, re.test(src));
}
function refuteSrc(desc: string, re: RegExp): void {
  ok(desc, !re.test(src));
}

assertSrc(
  "imports detectAllergenSymptom from allergen-gate-symptoms",
  /import\s*\{[^}]*detectAllergenSymptom[^}]*\}\s*from.*allergen-gate-symptoms/
);
assertSrc(
  "allergenSafetyOn gates on deterministicAllergenSafety === true",
  /allergenSafetyOn\s*=\s*ctx\.deterministicAllergenSafety\s*===\s*true/
);
assertSrc(
  "symptomDetectionOn requires allergenSafetyOn (base flag) as prerequisite",
  /symptomDetectionOn\s*=\s*allergenSafetyOn\s*&&/
);
assertSrc(
  "symptomDetectionOn checks allergen_symptom_detection flag explicitly",
  /isFeatureExplicitlyEnabled\s*\(\s*["']allergen_symptom_detection["']/
);
assertSrc(
  "symptomHit only runs when allergenHit did NOT fire",
  /!allergenHit\.fired\s*&&\s*symptomDetectionOn/
);
assertSrc(
  "combinedAllergenHit set from allergenHit or symptomHit",
  /combinedAllergenHit\s*=\s*allergenHit\.fired\s*\?\s*allergenHit\s*:\s*symptomHit/
);
assertSrc(
  "combinedAllergenHit.fired controls escalation branch",
  /combinedAllergenHit\.fired/
);
assertSrc(
  "forcedAllergenSafetyResult called with combinedAllergenHit.term",
  /forcedAllergenSafetyResult\s*\(\s*combinedAllergenHit\.term/
);
assertSrc(
  "forcedAllergenSafetyResult returns escalate: true (the literal)",
  /escalate:\s*true/
);
// respond() must NOT be called in the allergen-hit branch (it's in the else)
// Verify the structure: allergenHit branch uses forcedAllergenSafetyResult,
// respond() is only in the else.  We check that respond() call is preceded
// by an else (i.e. the function is in the non-allergen path).
assertSrc(
  "respond() is in the else branch (not called on allergen hit)",
  /}\s*else\s*\{[\s\S]{1,400}respond\s*\(/
);

// ============================================================
// SECTION B — Flag-gate unit tests
// ============================================================
console.log("\n── B: Flag-gate unit tests ──");

ok(
  "allergen_symptom_detection OFF when features=null",
  isFeatureExplicitlyEnabled("allergen_symptom_detection", null) === false
);
ok(
  "allergen_symptom_detection OFF when features={}",
  isFeatureExplicitlyEnabled("allergen_symptom_detection", {}) === false
);
ok(
  "allergen_symptom_detection OFF when set to false",
  isFeatureExplicitlyEnabled("allergen_symptom_detection", { allergen_symptom_detection: false }) === false
);
ok(
  "allergen_symptom_detection OFF when other flag is true (no leakage)",
  isFeatureExplicitlyEnabled("allergen_symptom_detection", { deterministic_allergen_safety: true }) === false
);
ok(
  "allergen_symptom_detection ON when explicitly set to true",
  isFeatureExplicitlyEnabled("allergen_symptom_detection", { allergen_symptom_detection: true }) === true
);
ok(
  "deterministic_allergen_safety also requires explicit enable",
  isFeatureExplicitlyEnabled("deterministic_allergen_safety", null) === false
);

// ============================================================
// SECTION C — Detector unit tests (REAL module)
// ============================================================

// ── SET 1 originals ──
console.log("\n── C1: SET 1 – Throat / airway (original patterns) ──");
check("throat tightening",          "حلقي بيتضيق لما باكل بندق", true);
check("throat closing (حنجرتي)",    "حنجرتي بتقفل لو اكلت جمبري", true);
check("breathing difficulty",       "بتجي ضيق في التنفس", true);
check("can't breathe (Arabic)",     "مقدرش اتنفس لو اكلت لبن", true);

console.log("\n── C2: SET 1 – Choking / airway (ADDED patterns) ──");
check("اختناق standalone",          "بيجيني اختناق لما اكل بندق", true);
check("بتخنق",                       "بتخنق لما اكل جمبري", true);
check("بيخنقني",                     "الجمبري بيخنقني", true);
check("خنقة في الصدر",              "حسيت بخنقة في صدري", true);
check("نفسي بيقف",                   "نفسي بيقف لو اكلت لوز", true);
check("نفسي بيتقطع",                 "نفسي بيتقطع من البندق", true);
check("مش لاحق نفسي",               "مش لاحق نفسي بعد ما اكلت", true);
check("كتمة في صدري",               "عندي كتمة في صدري من الفول", true);
check("صدري بيقفل",                  "صدري بيقفل لو اكلت مكسرات", true);
check("صفير في النفس",               "بيجيني صفير في النفس", true);
check("أزمة صدر",                    "عندي أزمة صدر بسبب الجمبري", true);
check("ربو",                         "عندي ربو وبخاف من الطعام", true);

console.log("\n── C3: SET 1 – Swelling / ورم (ADDED patterns) ──");
check("وشي ورم",                    "وشي ورم من البندق", true);
check("شفايفي ورمت",                "شفايفي ورمت من الجمبري", true);
check("عيني ورمت",                  "عيني ورمت لما اكلت سمك", true);
check("لساني ورم",                  "لساني ورم من اللوز", true);
check("ورمت standalone",             "ورمت لما اكلت فول سوداني", true);

console.log("\n── C4: SET 1 – Swelling / انتفاخ (originals) ──");
check("face swells (بينتفخ)",       "وشي بينتفخ لو اكلت مكسرات", true);
check("lip swelling (تورم شفايف)", "بيجيني تورم في الشفاه", true);
check("general swelling",           "بينتفخلي الوش", true);

console.log("\n── C5: SET 1 – Skin (ADDED patterns) ──");
check("احمرار",                     "بيجيني احمرار في الوش", true);
check("ارتيكاريا",                  "بيطلعلي ارتيكاريا", true);
check("ارتكاريا (alt spelling)",    "عندي ارتكاريا من الفراولة", true);
check("جسمي بيقلب",                 "جسمي بيقلب لو اكلت بيض", true);
check("جسمه بيقلب",                 "جسمه بيقلب من المكسرات", true);
check("بقع حمرا",                   "بيطلعلي بقع حمرا", true);

console.log("\n── C6: SET 1 – Skin (originals) ──");
check("skin rash (طفح جلدي)",       "بيطلعلي طفح جلدي", true);
check("itching (حكة)",              "بيجيني حكة شديدة", true);
check("hives (English)",            "I get hives when I eat nuts", true);

console.log("\n── C7: SET 1 – Emergency / anaphylaxis (original + ADDED) ──");
check("EpiPen mention",             "عندي epipen معايا", true);
check("anaphylaxis (EN)",           "حصل معايا anaphylaxis قبل كده", true);
check("severe allergy phrase",      "عندي حساسية شديدة من الفول السوداني", true);
check("ودوني المستشفى (ADDED)",    "ودوني المستشفى بعد ما اكلت", true);
check("حقنة حساسية (ADDED)",       "محتاج حقنة حساسية", true);
check("ادرينالين (ADDED)",         "بحمل معايا ادرينالين دايما", true);
check("hospital after food (orig)", "روحت مستشفى عشان اكل", true);
check("hospital after allergen (ADDED المستشفى بعد بندق)", "روحت المستشفى بعد بندق", true);
check("ER after allergen (ADDED)",  "دخلت الطوارئ بعد جمبري", true);
check("allergic reaction (EN)",     "I had an allergic reaction", true);

console.log("\n── C8: SET 2 – Named conditions (originals) ──");
check("celiac (Arabic)",            "عندي مرض السيلياك", true);
check("celiac (English)",           "I have celiac disease", true);
check("gluten sensitivity",         "عندي حساسية الجلوتين", true);
check("lactose intolerance (EN)",   "I'm lactose intolerant", true);
check("lactose intolerance (AR)",   "عندي عدم تحمل اللاكتوز", true);
check("dairy allergy",              "I have a dairy allergy", true);
check("favism (G6PD)",              "عندي g6pd", true);
check("favism keyword (فافيسم)",    "عندي فافيسم", true);
check("foul yimradhni",             "الفول بيمرضني", true);
check("foul mamnoo3",               "الفول ممنوع عليا", true);
check("mamnoo3 elfoul",             "ممنوع الفول", true);
check("nut allergy (EN)",           "I have a nut allergy", true);
check("peanut allergy (EN)",        "peanut allergy", true);

console.log("\n── C9: SET 2 – Favism (ADDED clinical terms) ──");
check("أنيميا الفول (ADDED)",       "عندي انيميا الفول", true);
check("تفول (ADDED)",               "إبني عنده تفول", true);
check("نقص الخميرة (ADDED)",        "عندي نقص الخميرة", true);
check("نقص خميرة الدم (ADDED)",    "تشخصت بنقص خميرة الدم", true);
check("بيكسر الدم (ADDED)",         "الفول بيكسر الدم عندي", true);
check("تكسير الدم (ADDED)",         "عندي حالة تكسير الدم", true);

console.log("\n── C10: SET 3 – English + Franco (originals) ──");
check("allergic (EN)",              "I'm allergic to shrimp", true);
check("allergy (EN)",               "I have a food allergy", true);
check("allergen (EN)",              "does this dish contain allergens?", true);
check("sensitive (EN)",             "I'm sensitive to gluten", true);
check("intolerant (EN)",            "I'm intolerant to dairy", true);
check("7asas (Franco)",             "ana 3andi 7asas", true);
check("7asaseya (Franco)",          "3andi 7asaseya min el 3asir", true);

console.log("\n── C11: SET 3 – English symptoms (ADDED) ──");
check("can't breathe (EN)",         "I can't breathe when I eat nuts", true);
check("throat closes (EN)",         "my throat closes after eating shrimp", true);
check("throat closing (EN)",        "my throat is closing up", true);
check("lips swell (EN)",            "my lips swell up", true);
check("face swells (EN)",           "my face swells after eating peanuts", true);
check("went to ER after (EN)",      "I went to the ER after eating", true);
check("went to hospital after (EN)","went to hospital after a meal", true);

console.log("\n── C12: SET 3 – Franco variants (ADDED) ──");
check("hasaseya (Franco)",          "3andi hasaseya mn el gambari", true);
check("hassaseya (Franco)",         "3andi hassaseya", true);
check("7saseya (Franco abbrev)",    "7saseya 3ndy", true);
check("3ndy 7asas (compact)",       "ana 3ndy 7asas", true);
check("weshy byewram (Franco)",     "weshy byewram mn el gambari", true);
check("nafasy bye2af (Franco)",     "nafasy bye2af lw akal gambari", true);
check("betkhane2 (Franco)",         "betkhane2 mn el gambari", true);

console.log("\n── C13: SET 4 – Child + strict + allergen (ADDED) ──");
check("ابني ممنوع بندق خالص",      "ابني ممنوع عليه بندق خالص", true);
check("بنتي مايقربهاش اللوز",       "بنتي مايقربهاش اللوز نهائي", true);
check("الطفل ممنوع الجمبري",        "الطفل ممنوع الجمبري", true);
check("عيالي بلاش فول",             "عيالي بلاش الفول نهائي", true);
check("الطفل ممنوع بيض نهائي",      "الطفل ممنوع من البيض نهائي", true);

// ============================================================
// NEGATIVES — must NOT fire (false-positive guard)
// ============================================================
console.log("\n── C14: Negatives (must NOT fire) ──");
check("preference: without nuts",      "عايز حاجة من غير بندق", false);
check("preference: without dairy",     "عندكم حاجة من غير لبن؟", false);
check("love nuts",                     "أنا بحب البندق جداً", false);
check("asking about ingredients",      "فيه إيه في الكيكة؟", false);
check("recommendation request",        "إيه أحسن حاجة عندكم؟", false);
check("price question",                "بكام التشيز كيك؟", false);
check("table booking",                 "عايز أحجز تربيزة الساعة 8", false);
check("foul dish (regular order)",     "عايز طبق فول بالزيت", false);
check("foul menu item (inquiry)",      "الفول ده حلو ولا لا؟", false);
check("no complaint",                  "الأكل كان تمام", false);
// Child pattern — must require ALL THREE parts
check("child only (no strict + allergen)", "ابني بيحب البندق", false);
check("strict only (no child + allergen)",  "ممنوع التأخير", false);
check("child + allergen, no strict (preference)", "بنتي عايزة من غير جوز", false);
check("child + strict, no allergen",    "ابني ممنوع الشوكولاتة نهائي", false);

// ============================================================
// Summary
// ============================================================
console.log(`\n══════════════════════════════════`);
console.log(`  Results: ${pass} passed, ${fail} failed (${pass + fail} total)`);
if (errors.length) {
  console.log(`\n  Failed tests:`);
  errors.forEach((e) => console.log(`    • ${e}`));
}
console.log(`══════════════════════════════════`);
if (fail > 0) process.exit(1);
