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
   *  watchable per mode rather than as one number. */
  reason: "allergy_marker" | "symptom" | "allergy_context" | null;
}

const NO_HIT: AllergyContextHit = { fired: false, term: null, reason: null };

/** Single-token ALLERGY markers. EXACT only — no near budget, ever. */
const ALLERGY_MARKERS = [
  "حساسيه", "حساسيتي", "حساس", "حساسه", "حساسين", "تحسس", "اتحسس",
  "يتحسس", "الرجيا", "الرجي",
].map(normalizeAr);

/** Single-token SYMPTOM markers — a medical context stated plainly. */
const SYMPTOM_SINGLE = ["ينتفخ", "تورم", "طفح", "حكه", "كتمه"].map(normalizeAr);

/** Multi-word phrases, matched by normalized substring containment. STT keeps these fairly
 *  intact when spoken, and a phrase is long enough that containment is not a guess. */
const PHRASES = [
  // avoidance
  "ما اقدر اكل", "مو قادر اكل", "مب قادر اكل", "ما يصير اكل", "ما ينفع اكل",
  "معادر اكل", // elided Najdi «مو قادر» → «معادر»
  "ما اتحمل", "ممنوع علي", "الدكتور منع",
  // symptom
  "ضيق نفس", "ما اقدر اتنفس", "حلقي يضيق", "انيميا الفول",
].map(normalizeAr);

/** English / Franco allergy context, tested case-insensitively on the RAW text. */
const ENGLISH_ALLERGY_RE = /\b(allerg(y|ic)|anaphylax|epipen|lactose\s*intoleran|gluten\s*free)\b/i;

/** Harm verbs — «تأذيني» / «يضرني» / «يؤذيني». Only a hit ALONGSIDE an allergen noun.
 *
 *  THE OBJECT PRONOUN IS REQUIRED, AND THAT IS A BUG FIX. This read `تاذ|تضر|يضر|اذي|يوذ` —
 *  bare stems, no boundary — and the alternative «اذي» sits inside «هاذي», the ordinary Najdi
 *  word for "this". Every sentence starting «هاذي…» carried a harm verb as far as this rule
 *  was concerned, so «هاذي الرز الأبيض زين» ("this white rice is good") and «هاذي اللبن
 *  الرايب» ("this is the laban rayeb") each raised an allergy hold on a compliment about
 *  food. That is precisely the false-positive class the Founder retired the phonetic net
 *  for, reintroduced by me in the file that replaced it.
 *
 *  A real harm statement names WHO is harmed: «يضرني»، «تأذيني»، «يؤذيني» — the pronoun is
 *  not decoration, it is what makes the sentence about the speaker instead of about the
 *  world. «صحتي»/«معدتي»/«بطني» stand in for it in the other natural phrasing. */
const HARM_CONTEXT_RE =
  /(?:ضر|اذي|وذي)(?:ني|نا|ها|هم|هن|كم|ك)|(?:يضر|تضر|بيضر|يوذي|تاذي|ياذي|توذي) ?(?:صحتي|معدتي|بطني)/;

/** The nouns that turn a harm verb into a safety sentence. Not a gate of their own. */
const ALLERGEN_NOUNS = [
  "مكسرات", "بندق", "فستق", "لوز", "كاجو", "جوز", "عين جمل",
  "فول سوداني", "سوداني", "لبن", "البان", "حليب", "لاكتوز", "جلوتين",
  "قمح", "بيض", "سمسم", "طحينه", "صويا", "سمك", "جمبري", "قشريات",
].map(normalizeAr);

/** Word-boundary containment for Arabic, which `\b` cannot express. */
function hasToken(normalized: string, term: string): boolean {
  if (!term) return false;
  const i = normalized.indexOf(term);
  if (i < 0) return false;
  const before = normalized[i - 1];
  const after = normalized[i + term.length];
  const isLetter = (c: string | undefined) => !!c && /[؀-ۿ]/.test(c);
  return !isLetter(before) && !isLetter(after);
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
  for (const p of PHRASES) {
    if (p && n.includes(p)) return { fired: true, term: p, reason: "allergy_context" };
  }

  for (const m of ALLERGY_MARKERS) {
    if (hasToken(n, m)) return { fired: true, term: m, reason: "allergy_marker" };
  }
  for (const s of SYMPTOM_SINGLE) {
    if (hasToken(n, s)) return { fired: true, term: s, reason: "symptom" };
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
const EXACT_SAFETY_TOKENS: ReadonlyArray<{ term: string; cls: "allergen" | "marker" | "symptom" }> = [
  ...ALLERGEN_NOUNS.filter((t) => !t.includes(" ")).map((term) => ({ term, cls: "allergen" as const })),
  ...ALLERGY_MARKERS.map((term) => ({ term, cls: "marker" as const })),
  ...SYMPTOM_SINGLE.map((term) => ({ term, cls: "symptom" as const })),
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
