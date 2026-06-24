#!/usr/bin/env node
// ============================================================================
// Proof: allergen-gate-symptoms.ts — pure logic test (no HTTP, no DB)
// Tests every bypass example from the design spec plus regressions.
// Run: node --experimental-vm-modules scripts/proof-allergen-symptom-detector.mjs
// (or: npx tsx scripts/proof-allergen-symptom-detector.mjs)
// ============================================================================

// ---- inline the module so this script runs without tsx/tsconfig ----

function normalizeAr(s) {
  return String(s ?? "")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const SYMPTOM_TERMS = [
  { re: /(?:زور|حلق|حنجر)(?:تي|ي|ه)?(?:\s+(?:بي?تضي?ق|بي?نتفخ|بي?قفل|بي?غلق|بتاثر|بت(?:ضيق|نتفخ|قفل|غلق)))/, label: "ضيق في الحلق" },
  { re: /ضيق(?:\s+في\s+|\s+)(?:التنفس|النفس|الصدر)/, label: "ضيق في التنفس" },
  { re: /صعوب[هة]\s+(?:في\s+)?(?:التنفس|النفس|البلع)/, label: "صعوبة في التنفس" },
  { re: /(?:مقدرش|مش\s+قادر|مبقدرش|ماقدرش)\s+(?:اتنفس|ابلع)/, label: "صعوبة في التنفس" },
  { re: /(?:وجه|وشي?|عيني?|شفايف|شفه|لسان)(?:\s+\S+)?\s*(?:بي?نتفخ|بينتفخ|انتفخ|بتورم|اتورم|بيتورم)/, label: "تورم" },
  { re: /(?:انتفاخ|تورم)\s+(?:في\s+)?(?:الوجه|الوش|الشفاه|اللسان|العين|الحلق)/, label: "تورم" },
  { re: /بي?نتفخ(?:لي|لنا|ي)?/, label: "تورم" },
  { re: /(?:طفح|حبوب|حكه|حكة|هرش|اكزيما)\s*(?:جلدي[هة]?)?/, label: "طفح جلدي" },
  { re: /جلد[ي]?\s+(?:بي?حمر|بيتاثر|بي?تبقع)/, label: "طفح جلدي" },
  { re: /(?:urticaria|hives|rash)/, label: "طفح جلدي" },
  { re: /(?:epipen|epinephrine|اوتوانجكتور)/, label: "حساسية شديدة" },
  { re: /(?:anaphylaxis|anaphylactic)/, label: "حساسية شديدة" },
  { re: /حساسي[هة]\s+(?:شديد[هة]|حاد[هة]|خطير[هة])/, label: "حساسية شديدة" },
  { re: /(?:مستشفي|مستشفى|طوارئ|اسعاف)\s+(?:من|عشان|بسبب)\s+(?:اكل|طعام)/, label: "رد فعل تحسسي" },
  { re: /(?:رد\s+فعل|reaction)\s+(?:تحسسي|allergic)/, label: "رد فعل تحسسي" },
  { re: /بي?غمى\s+عليه|بفقد\s+وعيي?|بغيب\s+عن\s+الوعي/, label: "رد فعل تحسسي" },
  { re: /(?:قي[ءئ]|اتقيا?[تث]|بتقيا?[تث])\s+(?:من|بعد|لما)\s+(?:ما\s+)?(?:اكل|اكلت)/, label: "رد فعل تحسسي" },
];

const CONDITION_TERMS = [
  { re: /(?:celiac|coeliac|سيلياك|سيلياكي[هة]?|سيليك|مرض\s+الزراعي[هة]?)/, label: "مرض السيلياك" },
  { re: /حساسي[هة]\s+(?:الجلوتين|القمح|الدقيق)/, label: "حساسية الجلوتين" },
  { re: /(?:lactose\s+intolerance|lactose\s+intolerant)/, label: "عدم تحمل اللاكتوز" },
  { re: /(?:عدم\s+تحمل|حساسي[هة])\s+(?:اللاكتوز|الحليب|اللبن|منتجات\s+الالبان)/, label: "عدم تحمل اللاكتوز" },
  { re: /(?:lacto(?:se)?-?intol|dairy\s+(?:free|allergy|intol))/, label: "عدم تحمل اللاكتوز" },
  { re: /(?:g6pd|g\.6\.p\.d|فيفازم|فافيسم|favism)/, label: "مرض الفول" },
  { re: /نقص\s+(?:انزيم\s+)?(?:g6pd|جي\s*6\s*بي\s*دي|g\.6\.p\.d)/, label: "مرض الفول" },
  { re: /(?:(?:اكل|اتاكل|ناكل)\s+)?فول\s+(?:بي?مرضني|بي?اذيني|بي?ضرني|ممنوع\s+علي[ها]?)/, label: "مرض الفول" },
  { re: /(?:مسموحش|ممنوع)\s+(?:علي[ها]?\s+)?(?:اكل\s+)?(?:الفول|الفاصوليا)/, label: "مرض الفول" },
  { re: /الفول\s+ممنوع|ممنوع\s+الفول/, label: "مرض الفول" },
  { re: /nut\s+allergy|tree[\s-]?nut\s+allergy|peanut\s+allergy/, label: "حساسية المكسرات" },
];

const ENGLISH_FRANCO_RE = /\b(?:allerg(?:ic|y|ies|en|ens)|sensitiv(?:e|ity)|intoleran(?:t|ce))\b/i;
const FRANCO_AR_RE = /(?:7asas(?:eya|iya|ya|iya)?|7asas|3andi\s+7asas|عندي\s+حساسي[هة])/i;

function detectAllergenSymptom(text) {
  const n = normalizeAr(text);
  if (!n) return { fired: false, term: null };
  for (const { re, label } of SYMPTOM_TERMS) {
    if (re.test(n)) return { fired: true, term: label };
  }
  for (const { re, label } of CONDITION_TERMS) {
    if (re.test(n)) return { fired: true, term: label };
  }
  if (ENGLISH_FRANCO_RE.test(text)) return { fired: true, term: "حساسية" };
  if (FRANCO_AR_RE.test(n)) return { fired: true, term: "حساسية" };
  return { fired: false, term: null };
}

// ---- test harness ----

let pass = 0, fail = 0;

function check(desc, text, expectedFired) {
  const result = detectAllergenSymptom(text);
  const ok = result.fired === expectedFired;
  const icon = ok ? "✓" : "✗";
  const status = ok ? "PASS" : "FAIL";
  console.log(`${icon} [${status}] ${desc}`);
  if (!ok) {
    console.log(`       text:     "${text}"`);
    console.log(`       expected: fired=${expectedFired}`);
    console.log(`       got:      fired=${result.fired} term=${result.term}`);
  } else if (result.fired) {
    console.log(`       → term: ${result.term}`);
  }
  ok ? pass++ : fail++;
}

// ============================================================
// POSITIVES — every pattern MUST fire
// ============================================================
console.log("\n── SET 1: Symptoms / physical consequences ──");
check("throat tightening",          "حلقي بيتضيق لما باكل بندق", true);
check("throat closing",             "حنجرتي بتقفل لو اكلت جمبري", true);
check("breathing difficulty",       "بتجي ضيق في التنفس", true);
check("can't breathe",              "مقدرش اتنفس لو اكلت لبن", true);
check("face swells (بينتفخ)",       "وشي بينتفخ لو اكلت مكسرات", true);
check("lip swelling (تورم شفايف)", "بيجيني تورم في الشفاه", true);
check("general swelling",           "بينتفخلي الوش", true);
check("skin rash (طفح جلدي)",       "بيطلعلي طفح جلدي", true);
check("itching (حكة)",              "بيجيني حكة شديدة", true);
check("hives (English)",            "I get hives when I eat nuts", true);
check("EpiPen mention",             "عندي epipen معايا", true);
check("anaphylaxis",                "حصل معايا anaphylaxis قبل كده", true);
check("severe allergy phrase",      "عندي حساسية شديدة من الفول السوداني", true);
check("went to hospital after food","روحت مستشفى عشان اكل", true);
check("allergic reaction (EN)",     "I had an allergic reaction", true);

console.log("\n── SET 2: Named medical conditions ──");
check("celiac (Arabic)",            "عندي مرض السيلياك", true);
check("celiac (English)",           "I have celiac disease", true);
check("gluten sensitivity",         "عندي حساسية الجلوتين", true);
check("lactose intolerance (EN)",   "I'm lactose intolerant", true);
check("lactose intolerance (AR)",   "عندي عدم تحمل اللاكتوز", true);
check("dairy allergy",              "I have a dairy allergy", true);
check("favism (G6PD)",              "عندي g6pd", true);
check("favism keyword",             "عندي فافيسم", true);
check("foul yimradhni",             "الفول بيمرضني", true);
check("foul mamnoo3",               "الفول ممنوع عليا", true);
check("mamnoo3 elfoul",             "ممنوع الفول", true);
check("nut allergy (EN)",           "I have a nut allergy", true);
check("peanut allergy (EN)",        "peanut allergy", true);

console.log("\n── SET 3: English + Franco-Arabic ──");
check("allergic (English)",         "I'm allergic to shrimp", true);
check("allergy (English)",          "I have a food allergy", true);
check("allergen (English)",         "does this dish contain allergens?", true);
check("sensitive (English)",        "I'm sensitive to gluten", true);
check("intolerant (English)",       "I'm intolerant to dairy", true);
check("7asas (Franco)",             "ana 3andi 7asas", true);
check("7asaseya (Franco)",          "3andi 7asaseya min el 3asir", true);

// ============================================================
// NEGATIVES — must NOT fire (false-positive check)
// ============================================================
console.log("\n── Negatives (must NOT fire) ──");
check("preference: without nuts",   "عايز حاجة من غير بندق", false);
check("preference: without dairy",  "عندكم حاجة من غير لبن؟", false);
check("love nuts",                  "أنا بحب البندق جداً", false);
check("asking about ingredients",   "فيه إيه في الكيكة؟", false);
check("recommendation request",     "إيه أحسن حاجة عندكم؟", false);
check("price question",             "بكام التشيز كيك؟", false);
check("table booking",              "عايز أحجز تربيزة الساعة 8", false);
check("foul dish (regular order)",  "عايز طبق فول بالزيت", false);
check("foul menu item",             "الفول ده حلو ولا لا؟", false);
check("no complaint",               "الأكل كان تمام", false);

// ============================================================
// Summary
// ============================================================
console.log(`\n══════════════════════════════════`);
console.log(`  Results: ${pass} passed, ${fail} failed (${pass + fail} total)`);
console.log(`══════════════════════════════════`);
if (fail > 0) process.exit(1);
