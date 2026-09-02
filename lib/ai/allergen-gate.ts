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
  // «بيظ» — how «بيض» (egg) is written when it is spelled the way the Gulf says it, with
  // ض→ظ. Two proofs of the retired phonetic net leaned on that module's edit-distance to
  // reach it («بتعبني البيظ»), so the LIVE gate never had it: driven on both sides of this
  // change, «بتعبني البيظ» was silent before and after, on every surface. It is a real
  // spelling of a real allergen, and it belongs in the lexicon rather than in a matcher.
  "بيظ",
];
const ALLERGEN_TERMS_NORM = ALLERGEN_TERMS.map((t) => normalizeAr(t));

/** The WORDS that make up the multi-word allergen terms — «فول», «سوداني», «عين», «جمل»,
 *  «ماكولات», «بحريه». Exported because a single word of a two-word term is not an allergen
 *  by itself, so anything filtering word by word will keep it and think it is safe. The one
 *  place that matters today is the STT vocabulary retry: it kept «زبدة الفول» after dropping
 *  «السوداني», priming the recognizer toward a truncation of the peanut-butter name with the
 *  peanut word missing. See lib/ai/stt/safe-vocab.ts. */
export const MULTI_WORD_ALLERGEN_WORDS: ReadonlySet<string> = new Set(
  ALLERGEN_TERMS_NORM.filter((t) => t.includes(" ")).flatMap((t) => t.split(/\s+/)).filter((w) => w.length >= 2)
);

/** Escape a literal for embedding in a RegExp source string. */
function escapeRe(w: string): string {
  return w.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);
}

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
    // «تعب» IS NOT IN THIS LIST, DELIBERATELY. It is the ordinary word for being tired, and
    // this list only needs an allergen SOMEWHERE in the same message — so «تعبت من الانتظار،
    // أبغى لبن» ("tired of waiting, I want laban") was a hold and a staff alert. It has its
    // own predicate, `tiredByFood`, below.
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

/** Is the thing that tires this customer a FOOD?
 *
 *  THIS IS THE THIRD ATTEMPT AND THE FIRST ONE ASKED IN THE RIGHT UNITS.
 *
 *  «تعب» began as a bare alternative in the avoidance list above, which needs only an
 *  allergen somewhere in the same message — so an ordinary complaint about waiting became an
 *  allergy hold on the turn a customer was already unhappy.
 *
 *  The second attempt required the object pronoun («يتعبني») or the conditional «لو». That
 *  narrowed by FORM, and form is not what separates these sentences. It went deaf to the four
 *  other Arabic conditionals — «أتعب إذا أكلت بندق»، «بتعب لما آكل بيض»، «أتعب في حال أكلت
 *  بندق»، «ولدي يتعب إذا أكل مكسرات» — while the sibling file already listed all five
 *  (lib/ai/allergen-emergency.ts, HYPOTHETICAL_RE). It went deaf to the organ frame «اللبن
 *  يتعب معدتي», the most ordinary way a Gulf speaker states lactose intolerance. And it STILL
 *  fired on «تعبكم معنا» and «تعبناك» — Gulf courtesy for "sorry for the trouble" — because
 *  those carry the very pronoun it was asking for.
 *
 *  The question that actually separates them is whether the tiredness is predicated on FOOD.
 *  Four shapes say it is; nothing else does.
 *
 *    1. tired IF/WHEN eating      «أتعب لو/إذا/إن/لما/في حال أكلت بندق»
 *    2. tired FROM <allergen>     «صاحبي بيتعب من البندق»
 *    3. <allergen> tires …        «اللبن يتعبني»، «الحليب يتعب بطني»
 *    4. tires ME, then <allergen> «بيتعبني الحليب»
 *
 *  Shapes 3 and 4 stay inside one clause, which is what keeps «تعبنا من التأخير، الحليب
 *  بارد» quiet: there the tiredness and the milk are two separate complaints. */

/** Shape 1 — tiredness conditional on eating or drinking. All five Arabic conditionals. */
const TIRED_IF_EATING_RE =
  /تعب\S*\s+(?:لو|اذا|ان|لما|في\s+حال|يعني\s+لو)\s+(?:ما\s+)?\S{0,2}(?:اكل|كل|شرب|تناول|ذقت|ذاق)/;

/** Shape 2 — «تعب … من <allergen>», with the allergen anchored to what follows «من». */
const TIRED_FROM_RE = /تعب\S* ?من ?/;

/** One allergen alternation, article-tolerant on EVERY word of a multi-word term. «الفول
 *  السوداني» glues «ال» onto both halves of the canonical «فول سوداني», and a version that
 *  tolerated only one article missed the most consequential allergen on the list. */
const ALLERGEN_ALT = ALLERGEN_TERMS_NORM
  .map((t) => t.split(/\s+/).map(escapeRe).join(" (?:ال)?"))
  .join("|");

/** The same terms anchored to the START of a string, for shape 2's tail. */
const ALLERGEN_TERMS_ANCHORED = ALLERGEN_TERMS_NORM.map(
  (t) => new RegExp("^(?:ال)?" + t.split(/\s+/).map(escapeRe).join(" (?:ال)?"))
);

/** Shape 3 — an allergen, then a tiring verb close behind it, in the same clause. */
const ALLERGEN_THEN_TIRES_RE = new RegExp(
  "(?:ال)?(?:" + ALLERGEN_ALT + ")[^.،,؛!؟\\n]{0,12}?[بيت]?تعب"
);

/** Shape 4 — the mirror: the verb first, the food after.
 *
 *  ONLY THE FIRST-PERSON OBJECT «ني», and that restriction is load-bearing. «نا» and «كم» are
 *  what Gulf courtesy uses — «تعبناكم»، «تعبكم معنا» — and accepting any object pronoun fired
 *  on a customer apologising for taking up staff time and then ordering a laban. Someone
 *  stating their own intolerance says it tires ME. */
const TIRES_ME_THEN_ALLERGEN_RE = new RegExp(
  "[بيت]?تعبني[^.،,؛!؟\\n]{0,12}?(?:ال)?(?:" + ALLERGEN_ALT + ")"
);

function tiredByFood(n: string): boolean {
  if (TIRED_IF_EATING_RE.test(n)) return true;
  if (ALLERGEN_THEN_TIRES_RE.test(n)) return true;
  if (TIRES_ME_THEN_ALLERGEN_RE.test(n)) return true;
  const m = TIRED_FROM_RE.exec(n);
  if (!m) return false;
  const tail = n.slice(m.index + m[0].length);
  return ALLERGEN_TERMS_ANCHORED.some((re) => re.test(tail));
}

/** True iff the (ALREADY normalized via normalizeAr) text carries an allergy INTENT
 *  signal — an explicit allergy word OR any avoidance/medical marker. This is the
 *  base gate's own intent predicate, EXPORTED so other safety layers (e.g. the
 *  phonetic net's typed short-term near-match exception) share ONE definition of
 *  "allergy intent" instead of re-authoring it. Pass a normalizeAr'd string. */
export function hasAllergyIntent(normalized: string): boolean {
  return EXPLICIT_ALLERGY_RE.test(normalized) || AVOIDANCE_INTENT_RE.test(normalized) ||
    tiredByFood(normalized);
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
  const intent = AVOIDANCE_INTENT_RE.test(n) || tiredByFood(n);
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
