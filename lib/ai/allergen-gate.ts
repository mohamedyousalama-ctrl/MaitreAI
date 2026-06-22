// ============================================================================
// MaitreAI — Deterministic allergen-safety gate (PURE, no LLM, no I/O).
// The diagnostic proved euphemism→escalation was model-stochastic (Sonnet + Haiku
// both had to "read" «اتعب لو اكلت بندق» as medical, and the model had to write
// «حساسية» in its reason for the #84 carve-out to engage). Allergens can PHYSICALLY
// harm a customer, so escalation + never-say-safe must be code-enforced, not luck.
//
// This module is a pure detector layer (defense-in-depth UNDER the prompt rules):
//   • detectAllergenAvoidance — input gate: a customer AVOIDANCE/medical intent
//     (incl. euphemisms, NOT just «حساسية») co-occurring with a food/allergen term,
//     OR an explicit allergy word alone → force a safety escalation.
//   • assertsAllergenSafety — output guard: the OUTGOING reply asserting an item is
//     allergen-safe/«مفيهوش بندق»/«آمن» when allergen data is unknown → intercept.
// Both are flag-gated by the caller (`deterministic_allergen_safety`); OFF → no-op.
// ============================================================================

/** Normalize Arabic so matching is robust to tashkeel, alef/ya/ta-marbuta variants
 *  and spacing. Lowercases Latin too (for safe/nut-free). */
export function normalizeAr(s: string): string {
  return String(s ?? "")
    .replace(/[ً-ْـ]/g, "") // tashkeel + tatweel
    .replace(/[أإآٱ]/g, "ا") // أإآٱ → ا
    .replace(/ة/g, "ه") // ة → ه
    .replace(/ى/g, "ي") // ى → ي
    .replace(/ؤ/g, "و") // ؤ → و
    .replace(/ئ/g, "ي") // ئ → ي
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// --- term sets (extensible; normalized forms) -------------------------------
/** Food / allergen trigger terms. Nuts first (the BLaban risk), then the common set. */
const ALLERGEN_TERMS = [
  "بندق", "فستق", "لوز", "كاجو", "عين جمل", "جوز", "مكسرات", "فول سوداني", "سوداني",
  "لبن", "البان", "حليب", "جلوتين", "قمح", "بيض", "سمسم", "صويا", "ماكولات بحريه", "بحريات", "سمك", "جمبري", "قشريات",
];
const ALLERGEN_RE = new RegExp(`(?:${ALLERGEN_TERMS.map((t) => normalizeAr(t)).join("|")})`);

/** Explicit allergy word — fires on its own (escalate to identify the allergen). */
const EXPLICIT_ALLERGY_RE = /حساسي/; // covers حساسية/حساسيه/حساسيت/حساسي

/** Avoidance / medical intent markers, INCLUDING euphemisms (the whole point —
 *  these must NOT be limited to the keyword «حساسية»). Co-occur with an allergen
 *  term to fire (so «بحب البندق» / «عايز اللوز» do NOT match — no avoidance). */
const AVOIDANCE_INTENT_RE = new RegExp(
  [
    "تعب", // اتعب / بتعب / بيتعبني / تعبان لو … (medical "it makes me sick")
    "ب?موت", // بموت لو / هموت لو / بموت من
    "(?:مينفعش|ما ?اقدرش?|ماقدرش|مش ?هقدر|ما ?ينفع) ?اكل", // can't eat
    "مبيناسبنيش|مايناسبنيش|ما ?يناسبني",
    "بي?ضرني|يضرني|بي?اذي|ياذي|بي?ضره?ا?",
    "مشكل[هة]? مع", // عندي مشكلة مع
    "ب?يحسسني|يحسسني|بحسسني",
    "ممنوع علي", // ممنوع عليا / ممنوعة عليا
    "الدكتور (?:قالي|منعني|قال)",
    "ميصحش ?اكل|ما ?ينفعش ?اكل",
  ].join("|")
);

/** Allergen-safety ASSERTION verbs/claims (for the output guard). */
const SAFETY_ASSERT_RE = new RegExp(
  [
    "مفيهوش|مفيهاش|ما ?فيهوش|ما ?فيهاش|مافيهوش|مافيهاش",
    "خالي من|خاليه من|خالص من",
    "مايحتويش|ما ?يحتويش|مابيحتويش",
    "مش ?هي?اثر|مش ?هتاثر|مش ?هيضر",
    "امن(?: ?(?:تماما|خالص|١٠٠|100))?", // آمن / آمن ١٠٠٪ / آمن تماماً (آ→ا normalized)
  ].join("|")
);

/** Self-evident allergen-safety phrases that assert safety on their own (no
 *  separate allergen term needed — the phrase IS the claim). */
const SAFETY_ASSERT_STANDALONE_RE = /nut[- ]?free|allergen[- ]?free|safe to eat/;

export interface AllergenAvoidanceHit {
  fired: boolean;
  /** Best matched trigger term for an honest acknowledgement (or "الحساسية"). */
  term: string | null;
}

/** INPUT GATE (Fix 1). Force a safety escalation when the customer expresses an
 *  avoidance/medical intent toward a food/allergen term, OR states an allergy
 *  outright. Pure + deterministic — same input always yields the same verdict. */
export function detectAllergenAvoidance(text: string): AllergenAvoidanceHit {
  const n = normalizeAr(text);
  if (!n) return { fired: false, term: null };
  const explicit = EXPLICIT_ALLERGY_RE.test(n);
  const allergen = n.match(ALLERGEN_RE);
  const intent = AVOIDANCE_INTENT_RE.test(n);
  const fired = explicit || (intent && !!allergen);
  return { fired, term: allergen ? allergen[0] : explicit ? "الحساسية" : null };
}

/** OUTPUT GUARD (Fix 3). True when the reply asserts allergen-safety AND references
 *  an allergen/allergy — i.e. the agent is (wrongly, on unknown data) certifying an
 *  item is safe. Co-occurrence keeps «دفع آمن» (secure payment) from matching. */
export function assertsAllergenSafety(reply: string): boolean {
  const n = normalizeAr(reply);
  if (!n) return false;
  if (SAFETY_ASSERT_STANDALONE_RE.test(n)) return true;
  return SAFETY_ASSERT_RE.test(n) && (ALLERGEN_RE.test(n) || /حساسي|allerg/.test(n));
}
