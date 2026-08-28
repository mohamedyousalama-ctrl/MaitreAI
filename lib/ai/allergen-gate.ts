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

/** Normalize Arabic so matching is robust to tashkeel, alef/ya/ta-marbuta variants,
 *  emphatic 3+ Arabic-letter runs, and spacing. Lowercases Latin too (for safe/nut-free). */
export function normalizeAr(s: string): string {
  return String(s ?? "")
    .replace(/[ً-ْـ]/g, "") // tashkeel + tatweel
    .replace(/[أإآٱ]/g, "ا") // أإآٱ → ا
    .replace(/ة/g, "ه") // ة → ه
    .replace(/ى/g, "ي") // ى → ي
    .replace(/ؤ/g, "و") // ؤ → و
    .replace(/ئ/g, "ي") // ئ → ي
    .replace(/([ء-ي])\1{2,}/g, "$1") // حساااسية → حساسيه; preserve real double letters
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// --- term sets (extensible; normalized forms) -------------------------------
/** Food / allergen trigger terms. Nuts first (the BLaban risk), then the common set. */
const ALLERGEN_TERMS = [
  "بندق", "فستق", "لوز", "كاجو", "عين جمل", "جوز", "مكسرات", "فول سوداني", "سوداني",
  "لبن", "البان", "حليب", "جلوتين", "قمح", "بيض", "سمسم", "صويا", "ماكولات بحريه", "بحريات", "سمك", "جمبري", "قشريات",
  // KSA ratified-path additions (docs/KSA_ALLERGEN_DIALECT_REVIEW.md §3c): needed
  // so «ما أتحمل اللاكتوز» / «حساس من الطحينة» name a real allergen. Mirrored in
  // allergen-vocab.ts (already aliases; now gateTerms too) — the vocab test asserts it.
  "لاكتوز", // lactose — dairy
  "طحينه",  // tahini — sesame (normalizeAr maps ة→ه, so «طحينة»→«طحينه»)
];
const ALLERGEN_TERMS_NORM = ALLERGEN_TERMS.map((t) => normalizeAr(t));

/** Escape a normalized term for use inside a RegExp. */
function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Boundary-aware matcher for a single allergen term. Tolerates the «ال» article
 *  (on the term AND on later words of a multi-word term) and Arabic word
 *  boundaries — so «البندق» matches «بندق», but «لبن» does NOT match the «لبن»
 *  that merely spans «ا‌لبن‌دق» (mid-word, preceded by a letter). */
function termRegex(t: string): RegExp {
  const flexible = t.split(" ").map(escapeReg).join(" (?:ال)?");
  return new RegExp(`(?<![ء-ي])(?:ال)?${flexible}(?![ء-ي])`);
}

/** Pick the MOST SPECIFIC allergen actually named: among boundary-aware matches,
 *  the LONGEST (so «البندق» → «بندق» not «لبن»; «الفول السوداني»/«فول سوداني» →
 *  «فول سوداني» not «سوداني»). Returns null when no clean boundary match exists —
 *  the caller then uses safe generic phrasing, never a wrong specific allergen. */
function pickAllergenTerm(n: string): string | null {
  const matched = ALLERGEN_TERMS_NORM.filter((t) => termRegex(t).test(n));
  if (!matched.length) return null;
  matched.sort((a, b) => b.length - a.length);
  return matched[0];
}

/** Boundary-aware "is a real allergen term actually named here?" — uses the SAME
 *  boundary-aware matcher as pickAllergenTerm (tolerating the «ال» article), so the
 *  FIRING/guard decision can never disagree with the NAMING. There is deliberately
 *  NO bare-alternation fast path: a bare substring scan mid-word (e.g. «لوز» inside
 *  «اللوزتين» tonsils, «بيض» inside «ابيض» white) over-triggers the gate on innocent
 *  Arabic text — \b is meaningless for Arabic in JS regex — so all detection paths
 *  go through this boundary-aware check. True iff a clean boundary match exists. */
function hasAllergenTerm(n: string): boolean {
  return pickAllergenTerm(n) !== null;
}

/** Explicit allergy word — fires on its own (escalate to identify the allergen).
 *  KSA ratified-path (docs/KSA_ALLERGEN_DIALECT_REVIEW.md §3a): adds the Najdi/Hijazi
 *  adjective «حساس/حساسة/حساسين … من/تجاه/ضد/علي» (kept high-precision by binding to the
 *  preposition, so «موضوع حساس» never fires) and the transliteration «ألرجي/ألرجيا/الرجي»
 *  (the `(?!م)` + boundary stop «الرجيم» diet, «الرجل/الراجل»). «إحساس» is blocked by the boundary. */
const EXPLICIT_ALLERGY_RE = new RegExp(
  "حساسي" + // حساسية/حساسيه/حساسيت/حساسي (existing)
    "|(?<![ء-ي])حساس(?:ه|ين)? (?:من|تجاه|ضد|علي)" + // «حساس/حساسة/حساسين من/تجاه/ضد/علي»
    "|(?<![ء-ي])الرجي(?!م)" // «ألرجي/ألرجيا/الرجي» transliteration; NOT «الرجيم» (diet)
);

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
    // KSA (Najdi/Hijazi) additions (docs/KSA_ALLERGEN_DIALECT_REVIEW.md §3b) — each
    // fires ONLY with a co-occurring allergen term (that co-occurrence is the anchor):
    "تحسس", // أتحسس/يتحسس/يجيني تحسس (reaction verb/noun)
    "(?:مو|مب) ?قادر", // مو قادر / مب قادر (Najdi "can't")
    "ما ?يصير ?اكل|ما ?يجوز ?اكل", // ما يصير/يجوز آكل (not permissible to eat)
    "تاذي|تضر", // feminine/3rd-person harm (تأذيني/تضرني)
    "ما ?اتحمل|مااتحمل", // ما أتحمل (intolerance)
    // WO-KHALID audit v2 — parent-frame 3rd-person negated-eat «بنتي ما تاكل بيض» /
    // «عيالي ما ياكلون فول سوداني». Matches ت/ي-initial (3rd-person) ONLY, so 1st-person
    // «ما آكل» (→«ما اكل», no ت/ي) can't fire «ما آكل إلا المكسرات» (I only eat nuts).
    // Still allergen-anchored (intent && hasAllergen), so «ابني ما ياكل خضار» never trips.
    "ما ?(?:ت|ي)اكل(?:ون|ين|ها|ه)?",
  ].join("|")
);

/** True iff the (ALREADY normalized via normalizeAr) text carries an allergy INTENT
 *  signal — an explicit allergy word OR any avoidance/medical marker. This is the
 *  base gate's own intent predicate, EXPORTED so other safety layers (e.g. the
 *  phonetic net's typed short-term near-match exception) share ONE definition of
 *  "allergy intent" instead of re-authoring it. Pass a normalizeAr'd string. */
export function hasAllergyIntent(normalized: string): boolean {
  return EXPLICIT_ALLERGY_RE.test(normalized) || AVOIDANCE_INTENT_RE.test(normalized);
}

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
  // FIRING + NAMING share ONE boundary-aware pass (was a bare-substring RE for
  // firing, boundary-aware only for naming — the two could disagree, so «التهاب في
  // اللوزتين» fired with term=null). Now `picked` is the single source of truth:
  // hasAllergen ⇔ a real term is named. Boundary-aware = precision without losing a
  // true positive (every clean «بندق/البندق/اللبن/…» still matches, tolerating «ال»).
  const picked = pickAllergenTerm(n);
  const hasAllergen = picked !== null;
  const intent = AVOIDANCE_INTENT_RE.test(n);
  const fired = explicit || (intent && hasAllergen);
  if (!fired) return { fired: false, term: null };
  // Fall back to generic «الحساسية» ONLY on an explicit-allergy hit with no clean
  // term (still escalates); never name a wrong allergen.
  return { fired: true, term: picked ?? (explicit ? "الحساسية" : null) };
}

/** OUTPUT GUARD (Fix 3). True when the reply asserts allergen-safety AND references
 *  an allergen/allergy — i.e. the agent is (wrongly, on unknown data) certifying an
 *  item is safe. Co-occurrence keeps «دفع آمن» (secure payment) from matching. */
export function assertsAllergenSafety(reply: string): boolean {
  const n = normalizeAr(reply);
  if (!n) return false;
  if (SAFETY_ASSERT_STANDALONE_RE.test(n)) return true;
  return SAFETY_ASSERT_RE.test(n) && (hasAllergenTerm(n) || /حساسي|allerg/.test(n));
}

/** Decide whether an allergen-safety claim caught by the OUTPUT guard should also
 *  ESCALATE to a human (vs just be blocked/replaced with an honest non-certifying
 *  reply). Escalate ONLY on a GENUINE avoidance/allergy signal — the customer
 *  stated avoidance/allergy THIS turn, OR the conversation is already a safety
 *  hold. A benign "without X" filter («عندكم ايه من غير بندق») where the agent
 *  merely echoed a "free-of" answer must NOT trigger a human handoff — the unsafe
 *  claim is still blocked, but the conversation keeps serving. */
export function shouldEscalateOnSafetyClaim(userMessage: string, safetyHoldActive: boolean): boolean {
  return safetyHoldActive === true || detectAllergenAvoidance(userMessage).fired;
}

/**
 * An EXPLICIT DENIAL of any allergy — «ما عندي حساسية»، «ما ذكرت حساسية»،
 * «ما تكلمت عن حساسية».
 *
 * THIS DOES NOT, AND MUST NOT, SUPPRESS THE SAFETY GATE. A false negative on an allergy
 * gate can kill someone; a false positive is only annoying. «ما عندي حساسية من الجمبري بس
 * عندي من المكسرات» is a denial AND an affirmation in one sentence, and it must still fire.
 *
 * It exists for one narrow purpose: the gate's reply opens «خذت بالي إنك ذكرت …» — "I
 * noticed you mentioned …". When the customer said the OPPOSITE, that sentence is false,
 * and a live run caught exactly that: the customer wrote «ما تكلمت عن صحة ولا حساسية» and
 * Khalid answered «خذت بالي إنك ذكرت الحساسية». The safety posture was right; the claim
 * about what they said was a lie.
 *
 * So this only ever changes WORDING. It requires a negator bound to a saying/having verb
 * AND the absence of any concrete allergen term — if a specific allergen is named
 * anywhere in the message, this returns false and the normal wording stands.
 */
const ALLERGY_DENIAL_RE =
  // negator + a saying/having verb, then up to a short run of filler («عن صحة ولا …»,
  // «أي», «اي») before the allergy word. The window is bounded so it cannot bridge two
  // unrelated clauses.
  /(?:ما|مو|مب|موب|ماني|لا)\s*(?:تكلمت|ذكرت|قلت|عندي|عندنا|فيه|في)[^.،؛\n]{0,24}?(?:حساسي|تحسس|الرجي|الرج)/;

export function isExplicitAllergyDenial(text: string, allergenTerm?: string | null): boolean {
  const n = normalizeAr(String(text ?? ""));
  if (!n) return false;
  if (!ALLERGY_DENIAL_RE.test(n)) return false;
  // A named allergen anywhere beats the denial — never soften on a concrete term.
  const t = String(allergenTerm ?? "").trim();
  if (t && t !== "الحساسية" && n.includes(normalizeAr(t))) return false;
  return true;
}
