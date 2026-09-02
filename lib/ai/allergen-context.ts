// ============================================================================
// MaitreAI — EXACT allergy CONTEXT: the safety words the vocabulary gate does not carry.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT THE PHONETIC NET.
//
// The retired phonetic safety net (lib/ai/phonetic-safety-net.ts) had FOUR firing modes and
// only ONE of them was guessing:
//
//   phonetic_near   — Levenshtein against the safety lexicon. THE GUESSING. «موز»→«لوز»,
//                     «كنافة بالجبن»→«لبن», and the greeting «هلا والله» read as dairy.
//                     Retired by Founder ruling, and it is not coming back here.
//   allergy_marker  — EXACT tokens: «تحسس»، «حساسيتي»، «الرجيا».
//   symptom         — EXACT tokens: «ينتفخ»، «تورم»، «طفح»، «حكه»، «كتمه».
//   allergy_context — EXACT phrases and an English regex: «ما أتحمل»، «ممنوع علي»،
//                     «الدكتور منع»، «ضيق نفس»، «gluten free»، «epipen».
//
// Retiring the module took all four out. An audit drove 110 cases across every posture and
// found the last three were covered by NOTHING else: «الدكتور منع عني الكنافة» ("the doctor
// forbade me this"), «حلقي ينتفخ» ("my throat swells up"), «ما أتحمل» ("I can't tolerate
// it"), «Is this gluten free?» — every one of them a plain, exact statement of an allergy,
// every one of them silently answered as an ordinary order, with no kitchen note, no staff
// alert and no hold, on every posture including `allergy_calm_hold`.
//
// That was not what was authorized. The ruling was to stop GUESSING, not to stop hearing
// people. So the exact halves are restored here, and the Levenshtein, the near-match budget
// and the STT-confidence tripwire are not — this file has no distance function in it and
// takes no confidence argument, deliberately, so it cannot drift back into a matcher.
//
// WHAT IT DELIBERATELY DOES NOT DO. It adds no allergen NOUNS of its own: «لبن»، «مكسرات»
// and the rest are the vocabulary gate's business (lib/ai/allergen-gate.ts) and stay there.
// The one place a noun appears here is the harm-context rule, which needs a noun AND an
// avoidance verb together — that pair is a sentence about being hurt by a food, not a
// mention of a food.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

export interface AllergyContextHit {
  fired: boolean;
  /** The exact term or phrase that matched, for the kitchen note and the audit trail. */
  term: string | null;
  /** Which of the three exact modes fired — kept distinct so a live false-positive rate is
   *  watchable per mode rather than as one number.
   *
   *  WHERE IT LANDS, AND WHERE IT DOES NOT — stated precisely, because the previous version
   *  of this paragraph was confidently wrong in two ways and a review caught both.
   *
   *  It lands on the `notify_without_hold` signal as `netReason`, written by
   *  `customer-turn.ts` and inserted into `conversation_signals.detail` — so the query is one
   *  `detail->>'netReason'` away, grouped by mode.
   *
   *  BUT ONLY ON THE FLAG-OFF BRANCH. `forcedAllergenSafetyResult` is reached when neither
   *  `allergy_companion_mode` nor `allergy_simple` is on. The one named production tenant has
   *  both, plus `allergy_calm_hold` — so on THAT tenant the calm-hold and companion writers
   *  run instead, and they record a coarse path label without the mode. The metric is real
   *  for flag-off tenants and absent for the tenant most likely to be asked about.
   *
   *  NOT ON THE DEMO, deliberately: `typed-actions.ts` skips the insert when `demoRun`, and a
   *  public demo persisting a visitor's words is a worse problem than a missing metric. */
  reason: "allergy_marker" | "symptom" | "allergy_context" | null;
}

const NO_HIT: AllergyContextHit = { fired: false, term: null, reason: null };

/** Single-token ALLERGY markers. EXACT only — no near budget, ever. */
// «حساس» / «حساسه» / «حساسين» ARE NOT HERE, AND THEY WERE THE WORST ENTRY IN THIS FILE.
//
// «حساس» is the everyday Arabic adjective *sensitive*. «الموضوع حساس شوي، تكلم مع المدير»
// ("it's a sensitive matter, speak to the manager") and «الطلب حساس للوقت» ("the order is
// time-sensitive") both raised an allergy hold — which on the live path also writes a kitchen
// note and fires `recordCriticalAlert`, an email and a WhatsApp to a human phone.
//
// AND NOTHING IS LOST BY REMOVING THEM, which I drove rather than assumed: «أنا حساس من
// اللبن»، «حساس من المكسرات»، «أنا حساسة من البيض»، «حساسين من الفول السوداني» are every one
// of them already caught by `detectAllergenAvoidance`, WITH the correct allergen term — which
// this file never named anyway. The bare adjective was contributing false positives and no
// recall at all. The unambiguous NOUNS stay.
const ALLERGY_MARKERS = [
  "حساسيه", "حساسيتي", "تحسس", "اتحسس", "يتحسس", "الرجيا", "الرجي",
].map(normalizeAr);

/** Single-token SYMPTOM markers — and each needs a BODY in the same breath.
 *
 *  These were bare. Bread rises, dough swells, a restaurant is stuffy, and «طفح الكيل» is the
 *  fixed idiom for "enough is enough" — the single most likely sentence from a customer who
 *  has had it with a late order. All four raised an allergy hold:
 *
 *    «الخبز ينتفخ في الفرن عندكم؟»  "does your bread rise in the oven?"
 *    «العجين تورم زيادة»            "the dough over-swelled"
 *    «كتمه في المطعم، شغلوا المكيف» "it's stuffy, turn on the AC"
 *    «طفح الكيل من التأخير هذا»     "enough of this delay"
 *
 *  A symptom is something that happens TO A PERSON, and Arabic says whose: «حلقي ينتفخ»,
 *  «وجهي متورم», «كتمة في صدري». Requiring that costs nothing real — «عندي طفح» and «عندي
 *  كتمة في صدري» are both caught by `detectAllergenSymptom` regardless, which is why bare
 *  «طفح» is gone from here entirely. */
const SYMPTOM_SINGLE = ["ينتفخ", "تنتفخ", "منتفخ", "تورم", "متورم", "حكه", "كتمه"].map(normalizeAr);

/** A body part or a first-person possessive, which is what turns a swelling into a symptom. */
const BODY_RE =
  /(?:حلق|زور|حنجر|بلعوم|لسان|شفا|شفت|وجه|وش|خد|عين|عيون|جلد|بشر|جسم|ايد|يد|رجل|رقب|صدر|بطن|معد|انف|منخار)/;

/** Multi-word phrases, matched by normalized substring containment. STT keeps these fairly
 *  intact when spoken, and a phrase is long enough that containment is not a guess. */
/** Phrases that mean an allergy ON THEIR OWN — a medical frame with no other reading.
 *
 *  MATCHED AS WHOLE PHRASES, NOT AS PREFIXES. This list was tested with a raw `includes`,
 *  and three of its entries are prefixes of ordinary sentences:
 *
 *    «ما اقدر اكل» ⊂ «ما أقدر أكلمك الحين»   "I can't call you right now"
 *    «ممنوع علي»   ⊂ «ممنوع عليكم تدخلوا»     "you may not drive in"
 *    «الدكتور منع» ⊂ «الدكتور منعنا من التدخين» "the doctor stopped us smoking"
 *
 *  The sibling rule in this same file was given exactly this treatment for «الأبيض» in the
 *  commit that introduced it; this list was left as raw containment. */
const PHRASES = [
  "ممنوع علي", "الدكتور منع",
  // symptom — unambiguous as written
  "ضيق نفس", "ما اقدر اتنفس", "حلقي يضيق", "انيميا الفول",
].map(normalizeAr);

/** The "can't eat / can't tolerate" family, which needs to know WHAT.
 *
 *  «ما اتحمل» and «ما اقدر اكل» are only about an allergy when the thing named is a food.
 *  «ما اتحمل الانتظار» ("I can't stand the waiting") and «مو قادر آكل بعد، شبعت» ("I can't
 *  eat any more, I'm full") are an angry customer and a full one, and both were answered
 *  with a safety questionnaire. So the phrase must be followed, closely, by an allergen.
 *
 *  That makes this a safety NET rather than a gate: `detectAllergenAvoidance` already
 *  catches «ما أتحمل اللبن» through its own intent list, and this catches the phrasings that
 *  list happens to miss. Which is what this whole file is — the exact half of a retired net. */
const AVOIDANCE_PHRASES = [
  "ما اقدر اكل", "مو قادر اكل", "مب قادر اكل", "ما يصير اكل", "ما ينفع اكل",
  "معادر اكل", // elided Najdi «مو قادر» → «معادر»
  "ما اتحمل",
].map(normalizeAr);

/** English / Franco allergy context, tested case-insensitively on the RAW text. */
const ENGLISH_ALLERGY_RE = /\b(allerg(y|ic)|anaphylax|epipen|lactose\s*intoleran|gluten\s*free)\b/i;

/** Harm verbs — «تأذيني» / «يضرني» / «يؤذيني». Only a hit ALONGSIDE an allergen noun.
 *
 *  ANCHORED TO THE START OF A WORD, WHICH IS THE WHOLE FIX AND THE WHOLE STORY.
 *
 *  This read `تاذ|تضر|يضر|اذي|يوذ` — bare stems, matched anywhere — and «اذي» sits inside
 *  «هاذي», the ordinary Najdi word for "this". Every «هاذي …» sentence carried a harm verb,
 *  so «هاذي اللبن الرايب» ("this is the laban rayeb") raised an allergy hold on a remark
 *  about a drink.
 *
 *  THE FIRST FIX WAS WORSE THAN THE BUG. It required an object pronoun glued to the verb —
 *  «يضرني» — on the reasoning that a real harm statement names who is harmed. It does; it
 *  just does not always glue the name on. «اللبن يضر ابني» ("laban harms my son"), «البيض
 *  يضر الأطفال عندنا», «الفول السوداني يضر زوجتي» all name the person as a separate word,
 *  and all three went silent: no hold, no kitchen note, no alert. A parent disclosing a
 *  child's allergy is the single case this file's ancestor was written for.
 *
 *  The actual difference between «يضرني» and «هاذي» is not the pronoun. It is that one is a
 *  VERB and the other is a word that merely contains its letters. So the stem is anchored to
 *  a word start, allowing only the prefixes Arabic actually puts on a verb (ي/ت/ب/ن), and
 *  the object is not required at all. «هاذي» does not match, because «ه» is not one of them. */
const HARM_CONTEXT_RE = /(?:^|[^ء-ي])[بيتن]?(?:اذي|وذي|ضر)/;

/** The nouns that turn a harm verb into a safety sentence. Not a gate of their own. */
const ALLERGEN_NOUNS = [
  "مكسرات", "بندق", "فستق", "لوز", "كاجو", "جوز", "عين جمل",
  "فول سوداني", "سوداني", "لبن", "البان", "حليب", "لاكتوز", "جلوتين",
  "قمح", "بيض", "سمسم", "طحينه", "صويا", "سمك", "جمبري", "قشريات",
].map(normalizeAr);

/** Word-boundary containment for Arabic, which `\b` cannot express.
 *
 *  TWO BUGS FIXED HERE, both found by an audit rather than by this file.
 *
 *  IT NEVER TOLERATED THE ARTICLE. `stripLeading` and `hasNoun`, twenty lines away, both do —
 *  and this did not, so «التورم في وجهي» ("the swelling in my face") matched nothing, in any
 *  detector, on any surface. A plain report of a swollen face was silent.
 *
 *  AND IT STOPPED AT THE FIRST OCCURRENCE. `indexOf` finds one position; if that one fails
 *  the boundary test the function returned false even when a later, valid occurrence existed.
 *  «العجين تورم، وجهي تورم» would have been decided by the first «تورم» alone. */
function hasToken(normalized: string, term: string): boolean {
  if (!term) return false;
  const isLetter = (c: string | undefined) => !!c && /[؀-ۿ]/.test(c);
  for (let i = normalized.indexOf(term); i >= 0; i = normalized.indexOf(term, i + 1)) {
    const after = normalized[i + term.length];
    if (isLetter(after)) continue;
    const before = normalized[i - 1];
    if (!isLetter(before)) return true;
    // …or the only thing in front of it is the article, optionally with one proclitic:
    // «التورم» → تورم, «بالتورم» → تورم. Anything else is a different word.
    const head = normalized.slice(0, i);
    if (/(?:^|[^؀-ۿ])(?:[وفبكل])?ال$/.test(head)) return true;
  }
  return false;
}

/** Where a phrase starts as a WHOLE phrase, or -1. The boundary is only needed at the END:
 *  every phrase here begins at a word start already, and it is the tail that ran on —
 *  «ما اقدر اكل» into «ما اقدر اكلمك». */
function phraseIndex(normalized: string, phrase: string): number {
  const isLetter = (c: string | undefined) => !!c && /[؀-ۿ]/.test(c);
  for (let i = normalized.indexOf(phrase); i >= 0; i = normalized.indexOf(phrase, i + 1)) {
    if (!isLetter(normalized[i + phrase.length])) return i;
  }
  return -1;
}
function hasPhrase(normalized: string, phrase: string): boolean {
  return phraseIndex(normalized, phrase) >= 0;
}

/** Does a symptom word appear WITH a body part, close enough to be the same statement? */
function symptomOnABody(n: string, term: string): boolean {
  for (let i = n.indexOf(term); i >= 0; i = n.indexOf(term, i + 1)) {
    const window = n.slice(Math.max(0, i - 24), i + term.length + 24);
    if (BODY_RE.test(window)) return true;
  }
  return false;
}

/** Is this allergen noun present as a WORD (its own token, or one carrying the article and a
 *  leading conjunction/preposition)? Multi-word nouns — «فول سوداني»، «عين جمل» — are long
 *  enough that containment is not a guess and are matched whole. */
function hasNoun(normalized: string, noun: string): boolean {
  if (!noun) return false;
  if (noun.includes(" ")) return normalized.includes(noun);
  for (const tok of normalized.split(/[^\u0600-\u06FF]+/)) {
    if (!tok) continue;
    if (tok === noun || stripLeading(tok) === noun) return true;
  }
  return false;
}

/**
 * Does this message state an allergy in plain words the vocabulary gate does not carry?
 *
 * PURE. No LLM, no I/O, no distance function, no confidence input. Fires on an exact match
 * and on nothing else — which is the whole difference between this and what it replaces.
 */
export function detectAllergyContext(text: string): AllergyContextHit {
  const raw = String(text ?? "");
  if (!raw.trim()) return NO_HIT;
  const n = normalizeAr(raw);
  if (!n) return NO_HIT;

  // English first: it is tested on the RAW text, so normalization cannot eat it.
  if (ENGLISH_ALLERGY_RE.test(raw)) {
    return { fired: true, term: (raw.match(ENGLISH_ALLERGY_RE) ?? [null])[0], reason: "allergy_context" };
  }

  // Phrases before single tokens: a phrase is the more specific statement, and naming it in
  // the kitchen note is more use to a cook than the word inside it.
  //
  // AS WHOLE PHRASES. `includes` made «ممنوع علي» match «ممنوع عليكم» and «الدكتور منع» match
  // «الدكتور منعنا» — see the list's own comment.
  for (const p of PHRASES) {
    if (p && hasPhrase(n, p)) return { fired: true, term: p, reason: "allergy_context" };
  }

  // …and the "can't eat / can't tolerate" family only when a FOOD follows it closely.
  for (const p of AVOIDANCE_PHRASES) {
    if (!p) continue;
    const at = phraseIndex(n, p);
    if (at < 0) continue;
    const after = n.slice(at + p.length, at + p.length + 28);
    const noun = ALLERGEN_NOUNS.find((x) => x && hasNoun(after, x));
    if (noun) return { fired: true, term: noun, reason: "allergy_context" };
  }

  for (const m of ALLERGY_MARKERS) {
    if (hasToken(n, m)) return { fired: true, term: m, reason: "allergy_marker" };
  }
  for (const s of SYMPTOM_SINGLE) {
    if (hasToken(n, s) && symptomOnABody(n, s)) return { fired: true, term: s, reason: "symptom" };
  }

  // A harm verb ALONGSIDE an allergen noun. Either alone is ordinary language — «يضر» is a
  // common word and «لبن» is a menu item — so both are required.
  //
  // AFFIX-STRIPPED TOKENS, NOT RAW CONTAINMENT. Arabic glues the article and prepositions onto
  // the front — «اللبن يضرني» is the natural way to say it — so the match has to tolerate
  // «ال»، «بال»، «وال». It was written as plain `includes` for that reason, and plain
  // `includes` also matched «بيض» (egg) inside «الأبيض» (the white one), which is how a plate
  // of white rice became an allergy. Stripping the affixes off each token gets the tolerance
  // without the accident: «اللبن»→«لبن» matches, «الابيض»→«ابيض» does not.
  if (HARM_CONTEXT_RE.test(n)) {
    for (const noun of ALLERGEN_NOUNS) {
      if (noun && hasNoun(n, noun)) return { fired: true, term: noun, reason: "allergy_context" };
    }
  }

  return NO_HIT;
}

// ── THE EXACT HALF OF THE OLD "HARD LAW", FOR THE VOICE MATCHER ──────────────────────
//
// `lib/ai/voice-aliases.ts` refuses to turn an allergen-class token into a menu candidate:
// «لوز» is a safety word, not something to look up on the menu. That law is right and it
// stays. What it was ASKING was wrong: it asked the retired near-matcher, so it suppressed
// every token WITHIN EDIT DISTANCE of a safety word too.
//
// «موز» (banana) is one edit from «لوز» (almond). So a caller ordering a banana milkshake
// had the word deleted by the matcher — and after the net was retired from the safety path,
// deleted by NOTHING ELSE either: no menu candidate, no safety hold, no kitchen note. The
// word simply vanished from the turn. That is the guessing the Founder ruled out, still
// running, in the one place nobody looked because it is not a safety file.
//
// So this is the same law asked exactly: is this token, or its affix-stripped stem, one of
// the safety words — not "near one".

/** Every single-token safety word, with its class. Exact strings only. */
/** Symptom words for TOKEN SUPPRESSION, which is a different question from firing a hold.
 *
 *  `SYMPTOM_SINGLE` above no longer carries «طفح» or «حكه», because a sentence only reports a
 *  symptom when it names a body or uses the frame Arabic reports symptoms with — bread rises
 *  and «طفح الكيل» means "enough is enough".
 *
 *  None of that applies here. This list answers "is this WORD a safety word", and it is used
 *  to keep such words out of the menu-candidate matcher and out of the speech recognizer's
 *  vocabulary bias. A menu item called «طفح» is not a dish, and biasing a transcriber toward
 *  a symptom word is how a symptom appears in a transcript nobody said. The conservative
 *  answer is right here and the specific answer is right there; conflating them broke four
 *  proofs at once, which was the tell. */
const SUPPRESSED_SYMPTOM_WORDS = ["طفح", "حكه", "هرش"].map(normalizeAr);

const EXACT_SAFETY_TOKENS: ReadonlyArray<{ term: string; cls: "allergen" | "marker" | "symptom" }> = [
  ...ALLERGEN_NOUNS.filter((t) => !t.includes(" ")).map((term) => ({ term, cls: "allergen" as const })),
  ...ALLERGY_MARKERS.map((term) => ({ term, cls: "marker" as const })),
  ...[...SYMPTOM_SINGLE, ...SUPPRESSED_SYMPTOM_WORDS].map((term) => ({ term, cls: "symptom" as const })),
];

/** Strip a leading conjunction/preposition (و ف ب ك ل) and the definite article, so
 *  «والمكسرات» reduces to «مكسرات». A COPY of the helper in the retired module, on purpose:
 *  importing from there is what let the near-matcher back into a live path last time, and
 *  this is four lines of string slicing with no lexicon and no distance function in it.
 *  Guarded against drift by proof-phonetic-net-unwired.test.ts, which asserts the two agree
 *  on every safety term. Never strips below 2 chars. */
function stripLeading(tok: string): string {
  let t = tok;
  if (t.length > 2 && /^[وفبكل]/.test(t)) t = t.slice(1);
  if (t.length > 3 && t.startsWith("ال")) t = t.slice(2);
  return t;
}

/**
 * Is this single token EXACTLY a safety word (or an affix-stripped form of one)?
 *
 * PURE, and there is no distance function in it — which is the whole point. Used by the
 * voice matcher to keep safety words out of the menu-candidate list without swallowing
 * every word that merely rhymes with one.
 */
export function exactSafetyToken(
  token: string
): { term: string; cls: "allergen" | "marker" | "symptom" } | null {
  const tok = normalizeAr(String(token ?? ""));
  if (!tok) return null;
  const stem = stripLeading(tok);
  for (const e of EXACT_SAFETY_TOKENS) {
    if (tok === e.term || stem === e.term) return e;
  }
  return null;
}
