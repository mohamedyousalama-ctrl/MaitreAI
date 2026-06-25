#!/usr/bin/env npx tsx
// ============================================================================
// Proof: allergen-gate-symptoms.ts — imports the REAL production module.
// Run: npx tsx scripts/proof-allergen-symptom-detector.ts
//
// Four proof sections:
//   A. Wiring assertions (source-code analysis of customer-turn.ts)
//      — escalate:true, forcedAllergenSafetyResult, respond() in else-branch,
//        BOTH flags required, absent flag = OFF
//   B. Flag-gate unit tests (isFeatureExplicitlyEnabled logic)
//   C. Detector unit tests — positives + negatives (real module, not a copy)
//   D. Runtime integration test — calls real runCustomerTurn() with a mocked
//      Supabase admin client; asserts escalate:true / zero-token / no-LLM path
//      when both flags ON, and that the absent-flag path falls through to LLM.
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

// ── v2 + v3 SET 1 originals ──
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

// ── v3 ADDITIONS ──

// ── v4 ADDITIONS ──

console.log("\n── C-v4a: SET 1 – Past-tense airway closure (v4) ──");
check("حلقي اتقفل (v4)",              "حلقي اتقفل لما اكلت جمبري", true);
check("زوري اتقفل (v4)",              "زوري اتقفل بعد ما اكلت بندق", true);
check("حنجرتي اتسدت (v4)",            "حنجرتي اتسدت من اللوز", true);
check("نفسي اتسد (v4)",               "نفسي اتسد لما اكلت مكسرات", true);
check("صدري اتقفل (v4)",              "صدري اتقفل بعد الجمبري", true);
check("اتقفل في الحلق (v4)",          "اتقفل في الحلق لما اكلت كاجو", true);
check("اتسد في الصدر (v4)",           "اتسد في الصدر من الفول", true);

console.log("\n── C-v4b: SET 1 – Past-tense choking (v4) ──");
check("اتخنقت (v4)",                  "اتخنقت لما اكلت بندق", true);
check("اتخنق (v4)",                   "اتخنق من اللبن", true);
check("باتخنق (v4)",                  "باتخنق كل ما اكل جمبري", true);
check("باتخنقت (v4)",                 "باتخنقت من الفول", true);

console.log("\n── C-v4c: SET 4 – ماينفعش ياكل/تاكل/ناكل (v4) ──");
check("ماينفعش ياكل allergen (v4)",   "ابني ماينفعش ياكل اللوز", true);
check("ماينفعش تاكل allergen (v4)",   "بنتي ماينفعش تاكل الجمبري", true);
check("ماينفعش ناكل allergen (v4)",   "عيالي ماينفعش ناكل مكسرات", true);
check("ما ينفعش ياكل spaced (v4)",    "ابني ما ينفعش ياكل بندق", true);
check("ماينفعش ياكل—no child → no fire", "ماينفعش ياكل اللوز", false);

console.log("\n── C-v4d: SET 4 – Doctor restriction for child (v4) ──");
check("الدكتور مانع ابني من اللوز",    "الدكتور مانع ابني من اللوز", true);
check("الدكتور منع بنتي من الجمبري",   "الدكتور منع بنتي من الجمبري", true);
check("الطبيب مانع الطفل من البيض",    "الطبيب مانع الطفل من البيض", true);
check("الدكتورة منع ابني اللبن",       "الدكتورة منع ابني اللبن", true);
check("الدكتور مانع من اللوز—no child → no fire", "الدكتور مانع من اللوز", false);

console.log("\n── C-v4e: SET 3 – English respiratory (v4) ──");
check("shortness of breath (v4)",      "I have shortness of breath after eating", true);
check("wheezing (v4)",                 "I start wheezing after peanuts", true);
check("wheeze (v4)",                   "I wheeze when I eat nuts", true);
check("chest tight (v4)",              "my chest gets tight", true);
check("chest tightness (v4)",          "chest tightness after eating shrimp", true);
check("tightness in my throat (v4)",   "I get tightness in my throat", true);
check("tight chest (v4)",              "tight chest after eating", true);

console.log("\n── C14: SET 1 – سوداني/فول سوداني (v3 CRITICAL) ──");
check("دخلت الطوارئ بعد السوداني",     "دخلت الطوارئ بعد السوداني", true);
check("hospital after فول سوداني",     "روحت المستشفى بسبب فول سوداني", true);
check("SET4 ابني الجوز والسوداني",     "ابني ممنوع الجوز والسوداني خالص", true);
check("severe allergy فول سوداني",     "عندي حساسية شديدة من فول سوداني", true);

console.log("\n── C15: SET 1 – بيورم/بيورملي swelling (v3) ──");
check("وشي بيورم (v3)",               "وشي بيورم من الجمبري", true);
check("شفايفي بيورملي (v3)",          "شفايفي بيورملي من البندق", true);
check("بيورملي standalone (v3)",      "بيورملي لما اكل مكسرات", true);

console.log("\n── C16: SET 1 – بختنق/بخنق choking (v3) ──");
check("بختنق (v3)",                   "بختنق لما اكل جمبري", true);
check("بخنق (v3)",                    "بخنق من اللبن", true);

console.log("\n── C17: SET 1 – مش عارف اتنفس breathing (v3) ──");
check("مش عارف اتنفس (v3)",          "مش عارف اتنفس لو اكلت فول", true);
check("مبعرفش اتنفس (v3)",           "مبعرفش اتنفس بعد ما اكلت", true);

console.log("\n── C18: SET 1 – Lactose symptom phrasing (v3) ──");
check("اللاكتوز بيتعبني (v3)",       "اللاكتوز بيتعبني", true);
check("اللبن بيوجعني (v3)",          "اللبن بيوجعني", true);
check("الحليب بيضرني (v3)",          "الحليب بيضرني", true);

console.log("\n── C19: SET 3 – Curly apostrophe + cannot breathe (v3) ──");
check("can’t breathe (curly apostrophe)", "I can’t breathe when I eat nuts", true);
check("cannot breathe (v3)",                   "I cannot breathe after eating", true);
check("msh ba3raf atnafas (v3)",               "msh ba3raf atnafas", true);
check("mesh ba3raf atnafas (v3)",              "mesh ba3raf atnafas", true);

console.log("\n── C20: SET 4 – Normalization + spacing fixes (v3) ──");
// نهائي→نهايي: نهائي is the ONLY strict-avoidance word (tests the normalization fix)
check("ابني الفول نهائي (normalizeAr fix)",   "ابني الفول نهائي", true);
check("ما يقربش spaced (v3)",                  "ابني ما يقربش الجمبري", true);
check("ما ينفعش يقرب spaced (v3)",            "الطفل ما ينفعش يقرب اللبن", true);

// ============================================================
// NEGATIVES — must NOT fire (false-positive guard)
// ============================================================
console.log("\n── C21: Negatives (must NOT fire) ──");
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
// سوداني as nationality: SET 1/2/3 have no match; SET 4 needs child+strict+allergen (no child here)
check("سوداني as nationality (no child/strict/symptom)", "أنا سوداني الجنسية", false);
// Standalone بيورملي DOES fire (swelling fires standalone; over-escalation is safe by design)
check("بيورملي standalone fires (intended)", "ايدي بيورملي بسبب الكيبورد", true);


// ============================================================
// SECTION D — Runtime integration test
// Calls the real runCustomerTurn() with a mocked Supabase admin
// client.  No Anthropic API key required for the allergen-gate
// path (respond() is never called when the gate fires).
// ============================================================
console.log("\n── D: Runtime integration (runCustomerTurn with mock admin) ──");

// ---------------------------------------------------------------------------
// Mock Supabase admin builder
// A fluent chain that:
//   • resolves to { data: listData, error: null } when awaited directly
//   • resolves to { data: singleData, error: null } on .single()
//   • returns itself on select / eq / order / limit / insert / update
// ---------------------------------------------------------------------------
function buildChain(singleData: unknown, listData: unknown = []) {
  const listPromise = Promise.resolve({ data: listData, error: null });
  const singlePromise = Promise.resolve({ data: singleData, error: null });

  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "insert", "update"]) {
    chain[m] = () => chain;
  }
  chain["single"] = () => singlePromise;
  // Thenable so `await admin.from("conversation_signals").insert(...)` resolves
  chain["then"] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => listPromise.then(res, rej);
  chain["catch"] = (rej: (e: unknown) => unknown) => listPromise.catch(rej);
  return chain;
}

function createMockAdmin(featureFlags: Record<string, unknown>) {
  // Row returned by both customer-turn.ts restaurants query AND loadBrain restaurants query.
  const restaurantRow = {
    agent_mode: "active", is_open: true, ai_tone: null, dialect: "egyptian",
    name: "Test Restaurant", currency: "EGP", timezone: "Africa/Cairo",
    business_type: "restaurant", tier: "standard", feature_flags: featureFlags,
    auto_accept_orders: false, agent_persona_name: null, tax_mode: "inclusive", tax_rate: 0,
    logo_url: null, phone: null, email: null, default_language: "ar",
  };

  return {
    from: (table: string) => {
      if (table === "restaurants") return buildChain(restaurantRow);
      if (table === "agent_runs") return buildChain({ id: "mock-run-id" });
      // branches, menu_items, modifiers, etc. → empty list
      return buildChain(null, []);
    },
  } as unknown;
}

// Dangerous symptom phrase — would normally fire detectAllergenSymptom
const SYMPTOM_MSG = "دخلت الطوارئ بعد السوداني";
const RESTAURANT_ID = "00000000-0000-0000-0000-000000000001";

async function runIntegrationTests(): Promise<void> {
  // Polyfill `server-only` for Node.js/tsx: the package always throws outside Next.js.
  // We intercept the require() call and return an empty module instead.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const Module = require("module") as { _load: (...a: any[]) => unknown };
  const orig = Module._load;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Module._load = function (request: string, ...args: any[]) {
    if (request === "server-only") return {};
    return orig.call(Module, request, ...args);
  };

  // Import here so tsx resolves path aliases at runtime
  const { runCustomerTurn, CustomerTurnError } =
    await import("../lib/ai/customer-turn");

  // ─── Test D1: BOTH flags ON → deterministic gate fires, respond() not called ──
  const bothFlagsAdmin = createMockAdmin({
    deterministic_allergen_safety: true,
    allergen_symptom_detection: true,
  });
  try {
    const outcome = await runCustomerTurn(bothFlagsAdmin as never, {
      restaurantId: RESTAURANT_ID,
      conversationId: null,
      history: [],
      userMessage: SYMPTOM_MSG,
      persistReply: false,
    });
    ok("D1: escalate=true (gate fired)", outcome.escalate === true);
    ok("D1: model=deterministic_allergen_gate", outcome.model === "deterministic_allergen_gate");
    ok("D1: adapter=mock (no LLM)", outcome.adapter === "mock");
    ok("D1: inputTokens=0 (no LLM call)", outcome.usage.inputTokens === 0);
    ok("D1: outputTokens=0 (no LLM call)", outcome.usage.outputTokens === 0);
  } catch (e) {
    ok("D1: should NOT throw for allergen gate path", false,
      `unexpected throw: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ─── Test D2: base flag OFF → symptom detector never evaluated → falls through to LLM ──
  // NOTE: when ANTHROPIC_API_KEY is absent, the system uses a mock LLM adapter that
  // returns successfully (no throw). So "falls through" means model ≠ deterministic_allergen_gate.
  const baseFlagOffAdmin = createMockAdmin({
    // deterministic_allergen_safety: absent (false by default)
    allergen_symptom_detection: true, // irrelevant when base is off
  });
  try {
    const outcome = await runCustomerTurn(baseFlagOffAdmin as never, {
      restaurantId: RESTAURANT_ID,
      conversationId: null,
      history: [],
      userMessage: SYMPTOM_MSG,
      persistReply: false,
    });
    ok("D2: absent base flag → falls through to LLM (model ≠ allergen_gate)",
      outcome.model !== "deterministic_allergen_gate",
      `got model: ${outcome.model}`);
    ok("D2: absent base flag → escalate should be false (LLM, not gate)",
      outcome.escalate === false,
      `got escalate: ${outcome.escalate}`);
  } catch (e) {
    ok("D2: unexpected throw (flag-off should succeed via LLM mock)", false,
      `got: ${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)}`);
  }

  // ─── Test D3: base ON but symptom flag OFF → same fall-through ──
  const symptomFlagOffAdmin = createMockAdmin({
    deterministic_allergen_safety: true,
    allergen_symptom_detection: false,
  });
  try {
    const outcome = await runCustomerTurn(symptomFlagOffAdmin as never, {
      restaurantId: RESTAURANT_ID,
      conversationId: null,
      history: [],
      userMessage: SYMPTOM_MSG,
      persistReply: false,
    });
    ok("D3: symptom flag OFF → falls through to LLM (model ≠ allergen_gate)",
      outcome.model !== "deterministic_allergen_gate",
      `got model: ${outcome.model}`);
  } catch (e) {
    ok("D3: unexpected throw (symptom-flag-off should succeed via LLM mock)", false,
      `got: ${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)}`);
  }
}

// Wrap in async IIFE — top-level await not available in cjs output
(async () => {
  await runIntegrationTests();
  // ============================================================
  // Summary (moved inside so it prints after async tests complete)
  // ============================================================
  console.log(`\n══════════════════════════════════`);
  console.log(`  Results: ${pass} passed, ${fail} failed (${pass + fail} total)`);
  if (errors.length) {
    console.log(`\n  Failed tests:`);
    errors.forEach((e) => console.log(`    • ${e}`));
  }
  console.log(`══════════════════════════════════`);
  if (fail > 0) process.exit(1);
})();

