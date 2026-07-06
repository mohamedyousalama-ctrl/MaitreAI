// ============================================================================
// MaitreAI — Fail-closed PHONETIC SAFETY NET (PURE, no LLM, no I/O).
// WO-VOICE-1, item-38 doctrine (binding, docs/WO_VOICE_0_BAKEOFF.md §fail-closed).
//
// WHY: inbound voice notes are transcribed to text and enter the existing text
// pipeline. The measured bake-off (WO-VOICE-0) showed STT safety-term recall of
// ~0.69 (whisper-1) / ~0.67 (gpt-4o-transcribe) — roughly 1 in 3 garbled spoken
// allergy disclosures passes the exact-match vocabulary gate SILENTLY, and every
// miss is a phonetic-near garble whose confidence does NOT separate it from a hit.
// So the exact gate is not enough for transcripts. This net runs UNCONDITIONALLY,
// BEFORE the LLM, on every message (typed or transcribed): a near-match against the
// full safety lexicon (Arabic-normalized + affix-stripped Levenshtein), an allergy-
// context verb even when the allergen token is garbled, and — as a SECONDARY
// tripwire only — a low STT confidence co-occurring with allergy context.
//
// A trip is a SAFETY-POSITIVE: it routes to the same deterministic allergen hold as
// a typed allergy mention (acknowledge honestly, escalate to a human, never assert
// an item is allergen-safe). Over-escalation is acceptable; under-escalation is not
// (rule C). This is never flag-gated — child safety must not depend on a flag row,
// exactly like the base allergen gate (WO-SAFE-2).
//
// SOURCE OF TRUTH for the lexicon: docs/KSA_ALLERGEN_DIALECT_REVIEW.md (the ratified
// gate + KSA additions), mirrored in scripts/voice/khalid-voice-eval-set.json
// (stt.safetyLexicon). The proof harness asserts this module's lexicon ⊇ the eval
// set's, so the two never silently drift.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

/** Below the ratified STT confidence floor, a segment is "low confidence" — a
 *  SECONDARY tripwire only (measured garbles were often MORE confident than
 *  captures, so confidence can never be the primary net). */
export const SAFETY_STT_CONFIDENCE_FLOOR = 0.66;

// --- lexicon (normalized forms mirror the eval set's stt.safetyLexicon) ------
// Single-token ALLERGEN nouns. A bare EXACT allergen noun is ordinary food ("أبغى
// لبن") and is deliberately NOT a net trip on its own — the base vocabulary gate
// owns intent+allergen. A NEAR (garbled) allergen noun IS a trip (rule B-i).
const ALLERGEN_NOUNS = [
  "مكسرات", "بندق", "فستق", "لوز", "كاجو", "جوز", "عين جمل",
  "فول سوداني", "سوداني", "لبن", "البان", "حليب", "لاكتوز", "جلوتين",
  "قمح", "بيض", "سمسم", "طحينه", "صويا", "سمك", "جمبري", "قشريات",
].map(normalizeAr);

// Single-token ALLERGY markers — an allergy context. Present (exact OR near) → trip.
const ALLERGY_MARKERS = [
  "حساسيه", "حساسيتي", "حساس", "حساسه", "حساسين", "تحسس", "اتحسس",
  "يتحسس", "الرجيا", "الرجي",
].map(normalizeAr);

// Single-token SYMPTOM markers — a medical context. Present (exact OR near) → trip.
const SYMPTOM_SINGLE = ["ينتفخ", "تورم", "طفح", "حكه", "كتمه"].map(normalizeAr);

// Multi-word phrases — matched by normalized substring containment (STT keeps these
// fairly intact when spoken; over-match here is safe). Avoidance + symptom + child.
const PHRASES = [
  // avoidance_markers
  "ما اقدر اكل", "مو قادر اكل", "مب قادر اكل", "ما يصير اكل", "ما ينفع اكل",
  "ما اتحمل", "ممنوع علي", "الدكتور منع",
  // symptom phrases
  "ضيق نفس", "ما اقدر اتنفس", "حلقي يضيق", "انيميا الفول",
].map(normalizeAr);

// English / Franco allergy context (tested case-insensitively on the raw text).
const ENGLISH_ALLERGY_RE = /\b(allerg(y|ic)|anaphylax|epipen|lactose\s*intoleran|gluten\s*free)\b/i;

// Harm/avoidance verbs («تأذيني» / «يضرني» / «يوذيني») — an avoidance intent that,
// co-occurring with an allergen token, is a safety context (mirrors the base gate's
// تاذي|تضر). Tested on the normalized text.
const HARM_CONTEXT_RE = /تاذ|تضر|يضر|اذي|يوذ/;

// Transliteration markers («ألرجيا»/«الرجي») are edit-near ordinary words (e.g. the
// Riyadh district «العليا») so they match EXACT-ONLY — no near budget — to keep the
// live false-positive rate down. They still fire on an exact hit (STT-05).
const EXACT_ONLY = new Set(["الرجيا", "الرجي"].map(normalizeAr));

/** Every single-token safety term with its class, for near-matching + labeling. */
type SafetyClass = "allergen" | "marker" | "symptom";
const SINGLE_TERMS: Array<{ term: string; cls: SafetyClass }> = [
  ...ALLERGEN_NOUNS.map((term) => ({ term, cls: "allergen" as const })),
  ...ALLERGY_MARKERS.map((term) => ({ term, cls: "marker" as const })),
  ...SYMPTOM_SINGLE.map((term) => ({ term, cls: "symptom" as const })),
];

/** The full flat lexicon (single terms + phrases), exported for the drift guard. */
export const SAFETY_LEXICON: string[] = [
  ...ALLERGEN_NOUNS, ...ALLERGY_MARKERS, ...SYMPTOM_SINGLE, ...PHRASES,
];

// --- normalization helpers ---------------------------------------------------
/** Strip a leading conjunction/preposition (و ف ب ك ل) and the definite article
 *  (ال), iteratively, so «والمكسرات» / «بالفستق» reduce to the bare stem before
 *  distance matching. Never strips below 2 chars. */
export function stripAffix(tok: string): string {
  let t = tok;
  // one optional leading conjunction/preposition
  if (t.length > 2 && /^[وفبكل]/.test(t)) t = t.slice(1);
  // optional definite article
  if (t.length > 3 && t.startsWith("ال")) t = t.slice(2);
  return t;
}

/** Levenshtein edit distance (iterative, O(n·m)). */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** Length-scaled max edit distance. Short terms get a tight budget so a garble
 *  net does not fire on unrelated short words (keeps the live false-positive rate
 *  in check); longer terms tolerate 2 edits (the observed garble magnitude). */
function maxDist(len: number): number {
  if (len <= 4) return 1;
  return 2;
}

/** Effective edit budget for a term: 0 for exact-only transliterations, else
 *  length-scaled. */
function budgetFor(term: string): number {
  return EXACT_ONLY.has(term) ? 0 : maxDist(term.length);
}

const MIN_NEAR_LEN = 3; // never near-match on 1–2 char tokens (too noisy)

export interface PhoneticNetHit {
  fired: boolean;
  term: string | null;
  /** Distinct from the vocabulary gate for observability (net-trip vs vocab-hit):
   *  'phonetic_near' | 'allergy_marker' | 'symptom' | 'allergy_context' |
   *  'low_confidence' | null. */
  reason: string | null;
}

const NO_HIT: PhoneticNetHit = { fired: false, term: null, reason: null };

export interface PhoneticNetOptions {
  /** STT confidence for a transcribed turn (undefined for typed text → the
   *  secondary confidence tripwire is inert). */
  sttConfidence?: number | null;
}

/** Edit distance of a token to a term, trying BOTH the raw normalized token and its
 *  affix-stripped form and taking the smaller — so «والمكسرات» reduces to match
 *  «مكسرات» (needs the strip) while «لبني»/«بيظ» match «لبن»/«بيض» via the raw form
 *  (where a naive strip would wrongly eat the stem's leading ل/ب). */
function bestDist(rawNorm: string, term: string): number {
  const stripped = stripAffix(rawNorm);
  const d1 = levenshtein(rawNorm, term);
  if (stripped === rawNorm) return d1;
  return Math.min(d1, levenshtein(stripped, term));
}

/** Return the nearest single safety term to a token within the length-scaled
 *  budget, or null. Exported for the proof harness's phonetic-coverage assertion. */
export function nearestSafetyTerm(token: string): { term: string; cls: SafetyClass; dist: number } | null {
  const tok = normalizeAr(token);
  if (tok.length < MIN_NEAR_LEN) return null;
  let best: { term: string; cls: SafetyClass; dist: number } | null = null;
  for (const { term, cls } of SINGLE_TERMS) {
    const d = bestDist(tok, term);
    if (d <= budgetFor(term) && (best === null || d < best.dist)) {
      best = { term, cls, dist: d };
    }
  }
  return best;
}

/**
 * The fail-closed phonetic safety net. Runs UNCONDITIONALLY on every message.
 * Fires (safety-positive) when ANY of:
 *   • an allergy MARKER or SYMPTOM term is present (exact or near)          → context
 *   • an allergen noun is present NEAR (garbled, not exact)                 → rule B-i
 *   • an English/Franco allergy context is present                          → context
 *   • [secondary] STT confidence < floor co-occurs with any allergen/marker → rule B-ii
 * A bare EXACT allergen noun with no context does NOT fire (ordinary food order).
 */
export function detectPhoneticSafetyNet(text: string, opts: PhoneticNetOptions = {}): PhoneticNetHit {
  const raw = String(text ?? "");
  if (!raw.trim()) return NO_HIT;
  const n = normalizeAr(raw);

  // 1) English / Franco allergy context (raw text, case-insensitive).
  if (ENGLISH_ALLERGY_RE.test(raw)) {
    return { fired: true, term: "allergy", reason: "allergy_context" };
  }

  // 2) Multi-word phrases — normalized substring containment.
  for (const p of PHRASES) {
    if (p && n.includes(p)) {
      return { fired: true, term: p, reason: "allergy_context" };
    }
  }

  // 3) Single-token scan: exact or near against the lexicon (raw + affix-stripped).
  const tokens = n.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let sawExactAllergen = false;
  let sawAnyAllergyToken = false; // allergen (exact/near) or marker/symptom — for the confidence tripwire
  for (const tok of tokens) {
    if (tok.length < MIN_NEAR_LEN) continue;
    for (const { term, cls } of SINGLE_TERMS) {
      const d = bestDist(tok, term);
      if (d > budgetFor(term)) continue;
      sawAnyAllergyToken = true;
      if (cls === "marker") return { fired: true, term, reason: d === 0 ? "allergy_marker" : "phonetic_near" };
      if (cls === "symptom") return { fired: true, term, reason: d === 0 ? "symptom" : "phonetic_near" };
      // allergen noun
      if (d === 0) { sawExactAllergen = true; continue; } // ordinary food — needs context/garble
      return { fired: true, term, reason: "phonetic_near" }; // garbled allergen → rule B-i
    }
  }

  // 3b) Harm/avoidance verb co-occurring with an allergen token → avoidance intent
  //     («المكسرات تأذيني»). Mirrors the base gate's intent+allergen rule.
  if (HARM_CONTEXT_RE.test(n) && (sawExactAllergen || sawAnyAllergyToken)) {
    return { fired: true, term: null, reason: "allergy_context" };
  }

  // 4) SECONDARY confidence tripwire (rule B-ii): a low-confidence transcript that
  //    co-occurs with an allergen/allergy token may have garbled the rest → verify.
  const conf = opts.sttConfidence;
  if (typeof conf === "number" && conf < SAFETY_STT_CONFIDENCE_FLOOR && (sawExactAllergen || sawAnyAllergyToken)) {
    return { fired: true, term: null, reason: "low_confidence" };
  }

  return NO_HIT;
}
