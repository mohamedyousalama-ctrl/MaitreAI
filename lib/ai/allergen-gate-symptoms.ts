// ============================================================================
// MaitreAI — Allergen SYMPTOM / CONDITION detector (additive layer, pure, no I/O)
//
// ⚠️  HUMAN REVIEW REQUIRED before enabling allergen_symptom_detection for Wesaya.
//     These Arabic term lists need validation by a native Egyptian-Arabic speaker
//     familiar with medical / food-allergy terminology. Recall is the design goal —
//     over-escalation is safe; under-escalation is dangerous.
//
// This module is a SEPARATE layer from lib/ai/allergen-gate.ts (which stays
// byte-identical). It fires on independent signal classes the base gate misses
// because they have no co-occurring AVOIDANCE_INTENT_RE:
//
//   SET 1 — Symptom / consequence language (choking, swelling, epipen, hospital…)
//   SET 2 — Named medical conditions (celiac, lactose, favism/G6PD)
//   SET 3 — English + Franco-Arabic (allergic, 7asas*, hasaseya, betkhane2…)
//   SET 4 — Child + strict-avoidance + allergen triple conjunction
//
// Designed to be called AFTER detectAllergenAvoidance — only when the base gate
// did NOT fire. If EITHER fires, the combined result is treated as a safety hit.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

export interface SymptomHit {
  fired: boolean;
  /** A representative term from the detected signal (for an honest acknowledgement),
   *  or null when we detected a signal but can't isolate a clean label. */
  term: string | null;
}

// ---------------------------------------------------------------------------
// SET 1: Symptom / physical-consequence language — fires standalone.
// Each sub-pattern covers a real phrase Egyptian customers use to describe an
// allergic reaction. No co-occurring allergen term required.
// ---------------------------------------------------------------------------
const SYMPTOM_TERMS: { re: RegExp; label: string }[] = [
  // Throat / airway — original patterns
  { re: /(?:زور|حلق|حنجر)(?:تي|ي|ه)?(?:\s+(?:بي?تضي?ق|بي?نتفخ|بي?قفل|بي?غلق|بتاثر|بت(?:ضيق|نتفخ|قفل|غلق)))/, label: "ضيق في الحلق" },
  { re: /ضيق(?:\s+في\s+|\s+)(?:التنفس|النفس|الصدر)/, label: "ضيق في التنفس" },
  { re: /صعوب[هة]\s+(?:في\s+)?(?:التنفس|النفس|البلع)/, label: "صعوبة في التنفس" },
  { re: /(?:مقدرش|مش\s+قادر|مبقدرش|ماقدرش)\s+(?:اتنفس|ابلع)/, label: "صعوبة في التنفس" },
  // Can't breathe — ADDED: Egyptian colloquial "مش عارف اتنفس" / "مبعرفش اتنفس"
  { re: /(?:مش\s+عارف|مبعرفش|مش\s+عارفه?|مبقدرش|مقدرش)\s+(?:اتنفس|انفس)/, label: "صعوبة في التنفس" },

  // Choking / airway emergency — ADDED: covers اختناق / بتخنق / بيخنق / بختنق / بخنق / نفسي بيقف / ربو etc.
  // بخنق = ب+خ+نق; بختنق = ب+خت+نق; بتخنق/بيخنق = بت/بي+خنق — covered by separate alternates.
  { re: /(?:اختناق|(?:بت|بي)خنق(?:ني)?|ب(?:خت|خ)نق(?:ني)?|خنق[هة]|نفسي\s+(?:بيقف|بيتقطع)|مش\s+لاحق\s+نفسي|كتم[هة](?:\s+في\s+صدري)?|صدري\s+بيقفل|صفير\s+في\s+النفس|ازم[هة]\s+صدر|ربو)/, label: "ضيق في التنفس" },

  // Swelling — original انتفاخ/تورم patterns
  { re: /(?:وجه|وشي?|عيني?|شفايف|شفه|لسان)(?:\s+\S+)?\s*(?:بي?نتفخ|بينتفخ|انتفخ|بتورم|اتورم|بيتورم)/, label: "تورم" },
  { re: /(?:انتفاخ|تورم)\s+(?:في\s+)?(?:الوجه|الوش|الشفاه|اللسان|العين|الحلق)/, label: "تورم" },
  { re: /بي?نتفخ(?:لي|لنا|ي)?/, label: "تورم" },

  // Swelling — ADDED: ورم/ورمت/بيورم/بيورملي forms missed by original patterns
  { re: /(?:(?:وش|وجه|شفايف|عين|لسان)(?:ي|ه)?\s+(?:ورم[ت]?|بيورم(?:لي|لنا)?)|ورم[ت]?\s+(?:في\s+)?(?:الوجه|الوش|الشفاه|اللسان|العين|الحلق)|بيورم(?:لي|لنا)?|ورمت)/, label: "تورم" },

  // Skin reaction — original طفح / حكة
  { re: /(?:طفح|حبوب|حكه|حكة|هرش|اكزيما)\s*(?:جلدي[هة]?)?/, label: "طفح جلدي" },
  { re: /جلد[ي]?\s+(?:بي?حمر|بيتاثر|بي?تبقع)/, label: "طفح جلدي" },
  { re: /(?:urticaria|hives|rash)/, label: "طفح جلدي" }, // English

  // Skin reaction — ADDED: احمرار / ارتيكاريا / جسمي بيقلب / بقع حمرا
  { re: /(?:احمرار|ارتي?كاريا|جسم[يه]\s+بيقلب|بقع\s+حمرا)/, label: "طفح جلدي" },

  // Anaphylaxis / emergency — original
  { re: /(?:epipen|epinephrine|اوتوانجكتور)/, label: "حساسية شديدة" },
  { re: /(?:anaphylaxis|anaphylactic)/, label: "حساسية شديدة" },
  { re: /حساسي[هة]\s+(?:شديد[هة]|حاد[هة]|خطير[هة])/, label: "حساسية شديدة" },

  // Emergency — ADDED: ودوني المستشفى / حقنة حساسية / ادرينالين (standalone — specific enough)
  { re: /ودوني\s+(?:ال)?(?:مستشفي|مستشفى)|حقن[هة]\s+حساسي[هة]|ادرينالين/, label: "حساسية شديدة" },

  // Hospital/ER after food — original (اكل/طعام only); طوارئ→طواري after normalizeAr (ئ→ي)
  { re: /(?:مستشفي|مستشفى|طواري|اسعاف)\s+(?:من|عشان|بسبب)\s+(?:اكل|طعام)/, label: "رد فعل تحسسي" },

  // Hospital/ER after allergen — ADDED: broader (any allergen; allows ال article)
  // Note: normalizeAr maps ئ→ي so "الطوارئ" becomes "الطواري" — pattern uses طواري.
  // سوداني / فول سوداني ADDED (peanuts — most common Egyptian term, most critical allergy).
  { re: /(?:(?:ال)?(?:مستشفي|مستشفى|طواري|اسعاف))\s+(?:من|عشان|بسبب|بعد|لما)\s+(?:ما\s+)?(?:(?:ال)?(?:اكل|طعام|بندق|فستق|لوز|كاجو|جوز|مكسرات|فول|سوداني|فول\s+سوداني|لبن|حليب|جلوتين|قمح|بيض|سمسم|صويا|سمك|جمبري|قشريات))/, label: "رد فعل تحسسي" },

  // Other anaphylaxis signals — original
  { re: /(?:رد\s+فعل|reaction)\s+(?:تحسسي|allergic)/, label: "رد فعل تحسسي" },
  { re: /بي?غمى\s+عليه|بفقد\s+وعيي?|بغيب\s+عن\s+الوعي/, label: "رد فعل تحسسي" },

  // Vomiting linked to specific food — original (narrow)
  { re: /(?:قي[ءئ]|اتقيا?[تث]|بتقيا?[تث])\s+(?:من|بعد|لما)\s+(?:ما\s+)?(?:اكل|اكلت)/, label: "رد فعل تحسسي" },

  // Lactose/dairy triggers symptom — ADDED: "اللاكتوز بيتعبني" / "اللبن بيوجعني" etc.
  { re: /(?:اللاكتوز|اللبن|الحليب|منتجات\s+الالبان)\s+(?:بيتعبني|بيوجعني|بيضرني|بياذيني|بيأذيني|بيعملي\s+مشكله?|مش\s+ماشي\s+معي)/, label: "عدم تحمل اللاكتوز" },
];

// ---------------------------------------------------------------------------
// SET 2: Named medical conditions — fire standalone.
// ---------------------------------------------------------------------------
const CONDITION_TERMS: { re: RegExp; label: string }[] = [
  // Celiac
  { re: /(?:celiac|coeliac|سيلياك|سيلياكي[هة]?|سيليك|مرض\s+الزراعي[هة]?)/, label: "مرض السيلياك" },
  { re: /حساسي[هة]\s+(?:الجلوتين|القمح|الدقيق)/, label: "حساسية الجلوتين" },

  // Lactose intolerance
  { re: /(?:lactose\s+intolerance|lactose\s+intolerant)/, label: "عدم تحمل اللاكتوز" },
  { re: /(?:عدم\s+تحمل|حساسي[هة])\s+(?:اللاكتوز|الحليب|اللبن|منتجات\s+الالبان)/, label: "عدم تحمل اللاكتوز" },
  { re: /(?:lacto(?:se)?-?intol|dairy\s+(?:free|allergy|intol))/, label: "عدم تحمل اللاكتوز" },

  // Favism / G6PD deficiency — original entries
  { re: /(?:g6pd|g\.6\.p\.d|فيفازم|فافيسم|favism)/, label: "مرض الفول" },
  { re: /نقص\s+(?:انزيم\s+)?(?:g6pd|جي\s*6\s*بي\s*دي|g\.6\.p\.d)/, label: "مرض الفول" },
  { re: /(?:(?:اكل|اتاكل|ناكل)\s+)?فول\s+(?:بي?مرضني|بي?اذيني|بي?ضرني|ممنوع\s+علي[ها]?)/, label: "مرض الفول" },
  { re: /(?:مسموحش|ممنوع)\s+(?:علي[ها]?\s+)?(?:اكل\s+)?(?:الفول|الفاصوليا)/, label: "مرض الفول" },
  { re: /الفول\s+ممنوع|ممنوع\s+الفول/, label: "مرض الفول" },

  // Favism — ADDED: clinical terminology gap (أنيميا الفول / تفول / نقص الخميرة / بيكسر الدم)
  { re: /انيميا\s+(?:ال)?فول|(?:ال)?فول\s+(?:ال)?انيميا/, label: "مرض الفول" },
  // تفول = G6PD hemolytic crisis from fava beans (Egyptian medical slang)
  { re: /تفول/, label: "مرض الفول" },
  // نقص خميرة الدم / نقص الخميرة = G6PD enzyme deficiency
  { re: /نقص\s+(?:ال)?خمير[هة](?:\s+الدم)?/, label: "مرض الفول" },
  // تكسير/بيكسر الدم = red-blood-cell destruction (G6PD hemolysis)
  { re: /(?:تكسير|بيكسر)\s+الدم/, label: "مرض الفول" },

  // Tree-nut allergy (explicit condition statement not in base gate)
  { re: /nut\s+allergy|tree[\s-]?nut\s+allergy|peanut\s+allergy/, label: "حساسية المكسرات" },
];

// ---------------------------------------------------------------------------
// SET 3: English + Franco-Arabic terms — fire standalone.
// ---------------------------------------------------------------------------

// English: allergy words (original) + English symptom-only phrases (ADDED)
const ENGLISH_FRANCO_RE = new RegExp(
  [
    // Allergy vocabulary — original
    String.raw`allerg(?:ic|y|ies|en|ens)`,
    String.raw`sensitiv(?:e|ity)`,
    String.raw`intoleran(?:t|ce)`,
    // English symptom-only — ADDED (curly apostrophe U+2019 + straight + cannot)
    String.raw`can[’']?t\s+breathe`,
    String.raw`cannot\s+breathe`,
    String.raw`throat(?:\s+\w+)?\s+(?:clos(?:es?|ing|ed)|tight(?:en(?:ing|s)?|s)?)`,
    String.raw`(?:lips?|face)\s+swells?`,
    String.raw`(?:lips?|face)\s+swelling`,
    String.raw`went\s+to\s+(?:the\s+)?(?:er|e\.r\.|hospital|emergency)\s+after`,
  ].map((p) => `\\b(?:${p})\\b`).join("|"),
  "i"
);

// Franco-Arabic variants (original + ADDED: hasaseya / 7saseya / betkhane2 / weshy byewram etc.)
const FRANCO_AR_RE = new RegExp(
  [
    // Original
    String.raw`7asas(?:eya|iya|ya)?`,
    String.raw`3andi\s+7asas`,
    String.raw`عندي\s+حساسي[هة]`,
    // ADDED: spelling variants and Franco symptom phrases
    String.raw`has{1,2}aseya`,                // hasaseya / hassaseya
    String.raw`7saseya`,                       // abbreviated (no initial vowel)
    String.raw`(?:3ndy|3andi)\s+(?:7asas|has+aseya)`, // 3ndy 7asas / 3andi hasaseya
    String.raw`weshy?\s+bye?wram`,             // وشي بيورم in Franco
    String.raw`nafasy?\s+bye?2af`,             // نفسي بيقف (2=ق in Egyptian Franco)
    String.raw`betkhane?2`,                    // بتخنق (2=ق)
    String.raw`betkhana2`,
    String.raw`m[e]?sh\s+ba3raf\s+atnafas`,   // مش عارف اتنفس in Franco
  ].join("|"),
  "i"
);

// ---------------------------------------------------------------------------
// SET 4: Child + strict-avoidance + allergen triple conjunction.
// ALL THREE must be present. Over-escalation is acceptable; under-escalation
// can harm a child. Does NOT fire on a simple «من غير X» preference.
// ---------------------------------------------------------------------------

/** All allergens known to the system (union of base gate + condition terms).
 *  سوداني ADDED: peanuts (فول سوداني) — most common Egyptian peanut term, highest anaphylaxis risk. */
const ALLERGEN_COMBINED_RE =
  /بندق|فستق|لوز|كاجو|جوز|مكسرات|فول|سوداني|لبن|البان|حليب|جلوتين|قمح|بيض|سمسم|صويا|سمك|جمبري|قشريات/;

/** Possessive child / family markers (normalized). */
const CHILD_MARKER_RE =
  /(?:ابني|ابنتي|بنتي|ولادي|عيالي|طفلي|الطفل|البيبي|بيبي|ابنهم|ابنها|بنتها|رضيع)/;

/** Strict-avoidance words (خالص/نهائي/بلاش/مايقربش/ممنوع etc.).
 *  - نهايي (NOT نهائي): normalizeAr maps ئ→ي so نهائي→نهايي in normalized text.
 *  - ما\s*يقرب covers both spaced (ما يقربش) and unspaced (مايقربش) forms.
 *  - ما\s*ينفعش covers both spaced (ما ينفعش يقرب) and unspaced (ماينفعش يقرب). */
const STRICT_AVOIDANCE_CHILD_RE =
  /(?:خالص|نهايي|بلاش|ما\s*يقرب(?:ها|هو|ني|و)?ش|ما\s*ينفعش\s+يقرب|ممنوع)/;

/**
 * Returns true only when ALL THREE signals co-occur in the same message:
 * child marker + strict avoidance + a known allergen term.
 */
function detectChildAllergenPattern(n: string): boolean {
  return CHILD_MARKER_RE.test(n) && STRICT_AVOIDANCE_CHILD_RE.test(n) && ALLERGEN_COMBINED_RE.test(n);
}

// ---------------------------------------------------------------------------
// Exported detector
// ---------------------------------------------------------------------------

/** Return the label of the first matching SYMPTOM_TERMS entry, or null. */
function matchSymptom(n: string): string | null {
  for (const { re, label } of SYMPTOM_TERMS) {
    if (re.test(n)) return label;
  }
  return null;
}

/** Return the label of the first matching CONDITION_TERMS entry, or null. */
function matchCondition(n: string): string | null {
  for (const { re, label } of CONDITION_TERMS) {
    if (re.test(n)) return label;
  }
  return null;
}

/**
 * INPUT GATE (supplement to detectAllergenAvoidance).
 * Fires when the customer's message contains:
 *   • A physical symptom / anaphylaxis signal (SET 1), OR
 *   • A named medical condition (celiac, lactose, favism, nut allergy) (SET 2), OR
 *   • English / Franco-Arabic allergen language (SET 3), OR
 *   • Child + strict-avoidance + allergen triple conjunction (SET 4).
 *
 * NEVER reads menu data. Pure + deterministic.
 */
export function detectAllergenSymptom(text: string): SymptomHit {
  const n = normalizeAr(text);
  if (!n) return { fired: false, term: null };

  const symptom = matchSymptom(n);
  if (symptom) return { fired: true, term: symptom };

  const condition = matchCondition(n);
  if (condition) return { fired: true, term: condition };

  if (ENGLISH_FRANCO_RE.test(text)) return { fired: true, term: "حساسية" };
  if (FRANCO_AR_RE.test(text)) return { fired: true, term: "حساسية" };

  if (detectChildAllergenPattern(n)) return { fired: true, term: "حساسية الطفل" };

  return { fired: false, term: null };
}
