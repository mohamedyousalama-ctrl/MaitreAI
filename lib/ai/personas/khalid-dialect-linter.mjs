// ============================================================================
// MaitreAI — Khalid DIALECT-LEAKAGE LINTER — a pure, testable output validator.
// WO-KHALID-STEP2. Sibling to khalid-forbidden-claims.mjs (same shape + discipline):
// an exported, category-tagged banlist + findLeakage(text) → { ok, hits }.
//
// ★★ CRITICAL BOUNDARY — this is a DIALECT-QUALITY validator, NOT the safety gate.
// A dialect leak is a QUALITY miss, never a safety event. This module therefore:
//   • does NOT import, call, or resemble the allergen gate / safety-hold / escalation;
//   • does NOT block an order, trigger a hold, or go "red";
//   • is a soft signal only (detect → log/flag), so we can MEASURE the leakage rate.
// Leakage and safety live in totally separate lanes. Keep it that way.
//
// It scans Khalid's OUTBOUND Arabic text for out-of-register dialect markers
// (Egyptian / Levantine / Iraqi / caricature phrase-piles). Ported from the reference
// linter.py — SAME banlists, SAME Arabic-letter word-boundary logic — so «بدي»
// (Levantine "I want") matches ONLY as a standalone word, never inside بديل / بدون / بدأ.
//
// A plain ESM module (NOT .ts) on purpose, so BOTH the strip-types test harness and the
// plain-node eval harness import the ONE source-of-truth list with no drift.
// ============================================================================

// --- category banlists (verbatim from the vetted reference, with 1 documented change) --
// Each list is the SINGLE SOURCE OF TRUTH for its category.

/** Egyptian markers.
 *  NOTE (WO-KHALID-STEP2 banlist-sanity — FLAGGED + CHANGED from the reference):
 *  the reference listed «خالص» here (Egyptian intensifier «مش عايز خالص»), but «خالص»
 *  is a homograph of NATIVE Saudi/Gulf «خالص» = done/finished/settled — «طلبك خالص»,
 *  «الحساب خالص» — squarely in Khalid's ordering/payment domain. A bare-word match can't
 *  tell the two apart, so it would false-flag native Saudi speech (same false-ban this WO
 *  forbids, and the same reason «شلونك» was dropped). REMOVED. A narrower Egyptian-only
 *  pattern (e.g. negation + خالص) could return in a later prompt-rules step if wanted. */
export const EGYPTIAN = [
  "ازيك", "ازيّك", "عامل ايه", "عاملة ايه", "معلش", "معلهش",
  "ياريت", "دلوقتي", "اهو", "كده", "كدة", "ايوه", "ايوة",
  "يلا نشوف", "ماشي يا", "حاضر يا فندم",
  "ازاي", "ازايك", "بتاع", "بتاعك", "بتاعتك", "قوي اوي",
  "يا باشا", "يا معلم", "يا بيه", "يا افندم",
  // WO-KHALID-STEP2 (Codex P2): canonical Egyptian «want» — missing from the reference
  // list; Khalid must never use it (Najdi says «أبي/أبغى»). Plus explicit hamza spelling
  // variants of «ازيك» (listed, not normalized — see the isWordHit note about هلأ/هلا).
  "عايز", "عايزة", "عاوز", "إزيك", "أزيك",
  // WO-DIALECT-COVERAGE. Fed Khalid's ACTUAL live reply «كام كبسة لحم تبي؟» this linter
  // returned {"ok":true,"hits":[]} — it missed 42 of 51 markers an audit fed it, «كام»
  // among them. Everything below is a marker with NO Najdi/Gulf homograph, checked against
  // the Saudi persona and knowledge corpus before being added.
  //
  // «كام» is safe under isWordHit: «بالكامل» is a substring, not a word hit.
  "كام",
  "مش",            // Najdi negates with «مو» / «ما»
  "لسه",           // Najdi: «لين الحين» / «بعد»  (Levantine «لسا» is already listed)
  "برضه", "برضو",
  "أوي", "اوي",
  "جامد", "قوللي",
  "دي", "ده",       // Egyptian demonstratives; Najdi says «هذي» / «هذا»
  "النهارده",
  // The ما…ش negation circumfix, the highest-frequency Egyptian tell. Listed as whole
  // words rather than matched as a pattern, because a pattern over ما…ش also catches
  // native words and this file's rule is: never false-flag Saudi speech.
  "مفيش", "معنديش", "ماعرفش", "نقدرش", "مكانش", "ماتحددش", "متعيدش",
];

/** DELIBERATELY NOT LISTED, and why — each one would false-flag native Saudi speech, the
 *  same false-ban that removed «خالص» and «شلونك» above:
 *    «ايه»   — Egyptian "what", but ALSO the Gulf "yes / uh-huh". A bare-word match
 *              cannot tell them apart.
 *    «حاجة»  — Egyptian "thing", but «حاجة» = "need" in Saudi («ما فيه حاجة»).
 *    «ماشي»  — Egyptian "ok", also ordinary Gulf assent.
 *    «عشان» / «علشان» — pan-Arabic colloquial; this repo's own Saudi prompt branches use
 *              «عشان» correctly.
 *    «شوية»، «كمان»، «تاني»، «بقى»، «تمن» — all current in Gulf writing or homographs of
 *              native words («بقي» = remained, «ثمن» = price).
 *  A narrower context-aware pattern could reclaim some of these later; a bare word match
 *  cannot. */

/** HIJAZI markers — WRONG ONLY FOR A NAJDI TENANT, and right for a Hijazi one.
 *
 *  The linter had no Saudi-internal axis at all: its categories were Egyptian, Levantine,
 *  Iraqi and caricature, so a Hijazi word inside a Najdi tenant's reply was invisible BY
 *  DESIGN. Live output «كم حبة تبغى؟» on a `khalid_region: najd` tenant returned clean.
 *  khalid.ts itself names these as Hijazi cues a Najdi Khalid should mirror at most once
 *  or twice — so they are only checked when a region is supplied and it is Najdi. */
export const HIJAZI = ["تبغى", "تبغون", "يبغى", "نبغى", "أبغى", "ابغى", "إيش", "ايش", "دحين"];

/** Levantine markers.
 *  NOTE (WO-KHALID-STEP2 banlist-sanity — FLAGGED + CHANGED from the reference):
 *  the reference listed «شلونك» here, but «شلون/شلونك» is NATIVE Eastern-Saudi / Gulf
 *  register — it is Khalid's OWN eastern voice (see khalid.ts REGION_VOICE.eastern:
 *  «هلا وغلا، شلونك، حيّاك»). Banning it would false-flag native Saudi speech, which is
 *  exactly the false-ban this WO forbids — so it is REMOVED here. The Iraqi-marked
 *  variant «اشلونك» (initial alif) stays in OTHER below. */
export const LEVANTINE = [
  "كيفك", "شو اخبارك", "شو الاخبار",
  "هلق", "هلأ", "منيح", "كتير", "لسا",
  "بدي", "بدك", "بدنا", "شو رايك", "شو بدك",
  "تكرم عينك", "منيحة", "زلمة",
];

/** Other (mainly Iraqi) markers. */
export const OTHER = ["شكو ماكو", "هواي", "زين هواي", "شنو", "اشلونك"];

/** Caricature / over-religious-tribal phrase-piles (the WHOLE pile is the marker;
 *  the native short forms «على راسي», «الله يحفظك», «الله يعطيك العافية» are NOT here
 *  and never trip, because the needle is the full multi-word phrase). */
export const CARICATURE = [
  "يا بعد عمري", "يا بعد قلبي", "يا بعد روحي",
  "على راسي وعيني وعيوني",
  "الله يخليك يا غالي يا حبيبي",
  "يا شيخ الشيوخ", "يا طويل العمر",
  "بسم الله ما شاء الله تبارك الرحمن",
  "الله يحفظك ويرعاك ويطول عمرك",
];

/** @typedef {"egyptian" | "levantine" | "other" | "caricature" | "hijazi"} LeakCategory */
/** @typedef {{ marker: string, category: LeakCategory }} LeakHit */

/** The single, flat, category-tagged banlist — the source of truth. */
/** @type {LeakHit[]} */
export const BANLIST = [
  ...EGYPTIAN.map((marker) => ({ marker, category: /** @type {LeakCategory} */ ("egyptian") })),
  ...LEVANTINE.map((marker) => ({ marker, category: /** @type {LeakCategory} */ ("levantine") })),
  ...OTHER.map((marker) => ({ marker, category: /** @type {LeakCategory} */ ("other") })),
  ...CARICATURE.map((marker) => ({ marker, category: /** @type {LeakCategory} */ ("caricature") })),
];

// --- Arabic-letter word-boundary logic (ported EXACTLY from linter.py) --------
// A single-char class matching an Arabic letter. Mirrors linter.py's _AR_LETTER:
//   [ء-يٮ-ۓۺ-ۿ]
// Used to decide whether a match is a standalone WORD (both sides non-Arabic-letter)
// rather than a substring inside a larger Arabic word. THIS is what stops «بدي» from
// tripping inside بديل / بدون / بدأ. Do not "simplify" to a substring includes().
const AR_LETTER = /[ء-يٮ-ۓۺ-ۿ]/;

// NOTE (WO-KHALID-STEP2): we deliberately do NOT alef/hamza-normalize here. A blanket
// [أإآٱ]→ا collapse makes Levantine «هلأ» (now) collide with NATIVE Saudi «هلا» (hi) and
// false-flag it — the exact false-ban this WO forbids. So the boundary logic is the EXACT
// port of linter.py, and hamza spelling variants are covered by LISTING them explicitly
// (the reference's own style, e.g. «إزيك»/«أزيك» below). A collision-safe word-initial
// normalization could be revisited in a later step with its own tests.

/**
 * True iff `needle` occurs in `text` as a standalone word (Arabic-letter boundaries on
 * both sides). Faithful port of linter.py `_is_word_hit`.
 * @param {string} text
 * @param {string} needle
 * @returns {boolean}
 */
export function isWordHit(text, needle) {
  if (!needle) return false;
  let idx = 0;
  for (;;) {
    const pos = text.indexOf(needle, idx);
    if (pos < 0) return false;
    const leftOk = pos === 0 || !AR_LETTER.test(text[pos - 1]);
    const end = pos + needle.length;
    const rightOk = end === text.length || !AR_LETTER.test(text[end]);
    if (leftOk && rightOk) return true;
    idx = pos + 1;
  }
}

/**
 * Scan outbound text for dialect leakage. Pure + deterministic.
 * @param {string} text
 * @param {{ region?: string }} [opts] Tenant KSA region. Supply it to also check the
 *   HIJAZI list, which is out-of-register ONLY for `najd`. Omitted → unchanged behaviour.
 * @returns {{ ok: boolean, hits: LeakHit[] }} ok=true means NO leakage; hits are the
 *   markers found (each tagged with its category). NEVER a safety verdict.
 */
export function findLeakage(text, opts = {}) {
  const src = String(text ?? "");
  /** @type {LeakHit[]} */
  const hits = [];
  for (const { marker, category } of BANLIST) {
    if (isWordHit(src, marker)) hits.push({ marker, category });
  }
  // Saudi-internal register. Only for a NAJDI tenant: on a Hijazi tenant these words are
  // the house voice, and flagging them would be the very false-ban this module forbids.
  // Absent `region`, nothing here runs, so every existing caller is unchanged.
  if (opts && opts.region === "najd") {
    for (const marker of HIJAZI) {
      if (isWordHit(src, marker)) hits.push({ marker, category: /** @type {LeakCategory} */ ("hijazi") });
    }
  }
  return { ok: hits.length === 0, hits };
}

// --- optional soft, advisory-only guards (ported from linter.py) -------------
// Advisory ONLY — never wired into safety, never a block. Present for observability.
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu;

/** Count emoji in a string (advisory over-decoration signal). */
export function emojiCount(text) {
  return (String(text ?? "").match(EMOJI_RE) || []).length;
}

/** True if the text exceeds `limit` characters (advisory over-length signal). */
export function overLength(text, limit) {
  return String(text ?? "").length > limit;
}
