// ============================================================================
// MaitreAI — Allergen SYMPTOM / CONDITION detector (additive layer, pure, no I/O)
//
// ⚠️  HUMAN REVIEW REQUIRED before enabling allergen_symptom_detection for Wesaya.
//     These Arabic term lists need validation by a native Egyptian-Arabic speaker
//     familiar with medical / food-allergy terminology. Recall is the design goal —
//     over-escalation is safe; under-escalation is dangerous.
//
// This module is a SEPARATE layer from lib/ai/allergen-gate.ts (which stays
// byte-identical). It fires on three independent signal classes that the base gate
// misses because they have no co-occurring AVOIDANCE_INTENT_RE:
//
//   SET 1 — Symptom / consequence language ("my throat closes", "epipen", "hospital")
//   SET 2 — Named medical conditions (celiac, lactose intolerance, favism / G6PD)
//   SET 3 — English + Franco-Arabic (allergic, allergy, 7asas/7asaseya, 3andi 7asas)
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
  // Throat / airway
  { re: /(?:زور|حلق|حنجر)(?:تي|ي|ه)?(?:\s+(?:بي?تضي?ق|بي?نتفخ|بي?قفل|بي?غلق|بتاثر|بت(?:ضيق|نتفخ|قفل|غلق)))/, label: "ضيق في الحلق" },
  { re: /ضيق(?:\s+في\s+|\s+)(?:التنفس|النفس|الصدر)/, label: "ضيق في التنفس" },
  { re: /صعوب[هة]\s+(?:في\s+)?(?:التنفس|النفس|البلع)/, label: "صعوبة في التنفس" },
  { re: /(?:مقدرش|مش\s+قادر|مبقدرش|ماقدرش)\s+(?:اتنفس|ابلع)/, label: "صعوبة في التنفس" },

  // Swelling
  { re: /(?:وجه|وشي?|عيني?|شفايف|شفه|لسان)(?:\s+\S+)?\s*(?:بي?نتفخ|بينتفخ|انتفخ|بتورم|اتورم|بيتورم)/, label: "تورم" },
  { re: /(?:انتفاخ|تورم)\s+(?:في\s+)?(?:الوجه|الوش|الشفاه|اللسان|العين|الحلق)/, label: "تورم" },
  { re: /بي?نتفخ(?:لي|لنا|ي)?/, label: "تورم" },

  // Skin reaction
  { re: /(?:طفح|حبوب|حكه|حكة|هرش|اكزيما)\s*(?:جلدي[هة]?)?/, label: "طفح جلدي" },
  { re: /جلد[ي]?\s+(?:بي?حمر|بيتاثر|بي?تبقع)/, label: "طفح جلدي" },
  { re: /(?:urticaria|hives|rash)/, label: "طفح جلدي" }, // English

  // Anaphylaxis / emergency
  { re: /(?:epipen|epinephrine|اوتوانجكتور)/, label: "حساسية شديدة" },
  { re: /(?:anaphylaxis|anaphylactic)/, label: "حساسية شديدة" },
  { re: /حساسي[هة]\s+(?:شديد[هة]|حاد[هة]|خطير[هة])/, label: "حساسية شديدة" },
  { re: /(?:مستشفي|مستشفى|طوارئ|اسعاف)\s+(?:من|عشان|بسبب)\s+(?:اكل|طعام)/, label: "رد فعل تحسسي" },
  { re: /(?:رد\s+فعل|reaction)\s+(?:تحسسي|allergic)/, label: "رد فعل تحسسي" },
  { re: /بي?غمى\s+عليه|بفقد\s+وعيي?|بغيب\s+عن\s+الوعي/, label: "رد فعل تحسسي" },

  // Vomiting / GI when linked explicitly to eating a specific thing
  // (narrow: only "اتقيات من" / "اتقيأت لما اكلت" / "قيء بعد ما اكلت")
  { re: /(?:قي[ءئ]|اتقيا?[تث]|بتقيا?[تث])\s+(?:من|بعد|لما)\s+(?:ما\s+)?(?:اكل|اكلت)/, label: "رد فعل تحسسي" },
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

  // Favism / G6PD deficiency — فول is the critical plant that kills G6PD patients
  { re: /(?:g6pd|g\.6\.p\.d|فيفازم|فافيسم|favism)/, label: "مرض الفول" },
  { re: /نقص\s+(?:انزيم\s+)?(?:g6pd|جي\s*6\s*بي\s*دي|g\.6\.p\.d)/, label: "مرض الفول" },
  { re: /(?:(?:اكل|اتاكل|ناكل)\s+)?فول\s+(?:بي?مرضني|بي?اذيني|بي?ضرني|ممنوع\s+علي[ها]?)/, label: "مرض الفول" },
  { re: /(?:مسموحش|ممنوع)\s+(?:علي[ها]?\s+)?(?:اكل\s+)?(?:الفول|الفاصوليا)/, label: "مرض الفول" },
  // broad favism catch: "الفول ممنوع" / "ممنوع الفول"
  { re: /الفول\s+ممنوع|ممنوع\s+الفول/, label: "مرض الفول" },

  // Tree-nut allergy (explicit condition statement not in base gate)
  { re: /nut\s+allergy|tree[\s-]?nut\s+allergy|peanut\s+allergy/, label: "حساسية المكسرات" },
];

// ---------------------------------------------------------------------------
// SET 3: English + Franco-Arabic terms — fire standalone.
// ---------------------------------------------------------------------------
const ENGLISH_FRANCO_RE = /\b(?:allerg(?:ic|y|ies|en|ens)|sensitiv(?:e|ity)|intoleran(?:t|ce))\b/i;
const FRANCO_AR_RE = /(?:7asas(?:eya|iya|ya|iya)?|7asas|3andi\s+7asas|عندي\s+حساسي[هة])/i;

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
 *   • English / Franco-Arabic allergen language (SET 3).
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
  if (FRANCO_AR_RE.test(n)) return { fired: true, term: "حساسية" };

  return { fired: false, term: null };
}
