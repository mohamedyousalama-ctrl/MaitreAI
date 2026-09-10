// ============================================================================
// فيصل / Faysal — SAFETY RAIL · normalization. PURE. No I/O, no model, no clock.
//
// SPEC-4-SAFETY.md §1.1: normalization is `normalizeAr` from `lib/ai/allergen-gate.ts`,
// REUSED VERBATIM, plus one Faysal addition — Arabic-Indic and Eastern-Arabic digits are
// folded to ASCII BEFORE any temperature or age match, because «حرارته ٣٩» and «حرارته 39»
// are the same sentence and a rule that only sees one of them protects one tenant profile
// by accident.
//
// `normalizeAr` is imported, never copied. SPEC-3 §10.2 marks it SHARE with 25 importers
// under lib/ and app/; a 26th copy is how the symptom-frame lists drifted apart, which is
// the defect `lib/ai/symptom-frames.ts` exists to record.
// ============================================================================

import { normalizeAr } from "../../ai/allergen-gate";

/** Arabic-Indic ٠-٩ (U+0660-0669) and Eastern-Arabic/Persian ۰-۹ (U+06F0-06F9). */
const AR_DIGITS = /[٠-٩۰-۹]/g;
/** The Arabic decimal separator «٫» and thousands separator «٬». «٣٨٫٥» is 38.5. */
const AR_DECIMAL = /٫/g;
const AR_THOUSANDS = /٬/g;

/** Fold Arabic-Indic / Eastern-Arabic digits and separators to ASCII.
 *
 *  Exported separately so the proof can assert the fold IS APPLIED and can drive it on its
 *  own. ORDER, STATED HONESTLY BECAUSE THE OBVIOUS REASON IS WRONG: a first draft of this
 *  comment claimed `normalizeAr`'s 3+ run collapse would eat «٣٣٣» if the fold ran second.
 *  Driven, it would not — `/([ء-ي])\1{2,}/` spans U+0621..U+064A and Arabic-Indic digits
 *  start at U+0660, so `normalizeAr` does not touch them at all, and either order gives the
 *  same string today. The fold runs first so that EVERYTHING downstream — the term matcher,
 *  the clause splitter and the temperature parser — sees one digit alphabet and no rule has
 *  to carry two, which is the property the proof asserts and the property that survives a
 *  future edit to `normalizeAr`.
 *
 *  The same range fact matters for the matcher: `(?![ء-ي])` does NOT fail on a following
 *  Arabic-Indic digit, so a boundary-matched term is not silently deaf to «حرارته ٣٩». */
export function foldDigits(s: string): string {
  return String(s ?? "")
    .replace(AR_DIGITS, (d) => String(d.charCodeAt(0) & 0x0f))
    .replace(AR_DECIMAL, ".")
    .replace(AR_THOUSANDS, ",");
}

/** THE ONE NORMALIZER every Faysal safety surface uses. Digits first, then `normalizeAr`. */
export function normalizeForSafety(text: string): string {
  return normalizeAr(foldDigits(text));
}

export { normalizeAr };

// ────────────────────────────────────────────────────────────────────────────
// THE ENGLISH VIEW OF THE SAME MESSAGE. §1.1's normalizer is Arabic: it folds
// أإآ→ا, ة→ه and 3+ letter runs, none of which a Latin string has, and it leaves
// the apostrophe, the hyphen and the degree sign exactly where the patient typed
// them. That is why the English arms shipped as `raw.toLowerCase().includes(p)` —
// there was no English normal form for them to match against.
//
// WHAT AN ENGLISH NORMAL FORM HAS TO DO, AND WHY EACH STEP IS HERE:
//
//   THE APOSTROPHE IS THE WHOLE PROBLEM. «can't breathe» · «cant breathe» ·
//   «can’t breathe» (the iOS smart quote) are one sentence, and a term list that
//   spells it one way is deaf to the other two — the §2.0 L6 defect («تورم مفاجئ»,
//   «طاح على راسه») in a second script. Every apostrophe form folds to nothing, so
//   the list is written «cant breathe» and hears all three.
//
//   THE HYPHEN IS AN AGE. «3-month-old», «38-day-old», «4-year-old» are how a
//   parent writes an age in English, and §2.6's threshold is read off exactly
//   those words. A hyphen is a space.
//
//   A NON-LATIN RUN IS A CLAUSE BREAK, NOT A SPACE. «عندي ألم بس chest pain» is
//   two clauses in two scripts; folding the Arabic to a space would splice the
//   Latin fragments on either side of it into one clause and invent an adjacency
//   the patient never typed — the co-occurrence failure §2.0 L2 refuses, arriving
//   through the normalizer instead of through the rule. So the Arabic becomes a
//   clause terminator and the English arms read only what was typed in English.
//
// THE DECIMAL POINT SURVIVES: «38.5» and «102.5F» are one number, and
// `splitClausesEn` is written not to break between two digits. The Arabic splitter
// does break there and always has; it costs nothing because «38.5» truncates to 38
// and 38 ≥ 38.0 either way, and changing it would move every Arabic clause boundary
// in the corpus for no gain.
// ────────────────────────────────────────────────────────────────────────────

/** Straight, curly, modifier-letter and prime apostrophes — every form a phone keyboard emits. */
const APOSTROPHES = /['‘’ʼ′`´]/g;
/** «'s» AT A WORD END IS A WHOLE TOKEN AND IT BECOMES A SPACE, WHILE EVERY OTHER APOSTROPHE
 *  BECOMES NOTHING. Driven, and the pair is why: «my son's fever won't come down» folds to
 *  «my sons fever wont come down» under a blanket deletion, and `my son` NO LONGER MATCHES —
 *  the trailing `s` fails the English boundary exactly as a trailing `ي` fails the Arabic one
 *  in §2.1's «صدري» note. Folding it to a space gives «my son fever wont come down», where the
 *  marker matches and the fever arm reaches its own Fires entry. The same rule folds «he's not
 *  breathing» to «he not breathing» and «my baby's temperature is 102» to «my baby temperature
 *  is 102», both of which their arms still read; «can't» and «won't» carry no `s` and are
 *  untouched. */
const POSSESSIVE_S = /['‘’ʼ]s(?![a-z])/g;

/** Hyphens (ASCII and the Unicode dash block), slashes and underscores: «3-month-old», «y/o». */
const EN_JOINERS = /[-‐-―−/\\_]/g;

/** THE ONE ENGLISH NORMALIZER every Faysal English rule matches against.
 *
 *  Digits are folded first, exactly as `normalizeForSafety` does and for the same reason:
 *  «my baby is ٣٩» is a fever report typed on an Arabic keyboard by someone writing English,
 *  and a temperature rule that only sees one digit alphabet protects one keyboard by accident. */
export function normalizeEn(text: string): string {
  return foldDigits(String(text ?? ""))
    .toLowerCase()
    .replace(POSSESSIVE_S, " ")
    .replace(APOSTROPHES, "")
    .replace(EN_JOINERS, " ")
    .replace(/°/g, " ")          // «102°F» → «102 f»
    .replace(/[!?;:]/g, ".")          // one clause terminator, so the splitter reads one character
    .replace(/[^a-z0-9., ]+/g, " . ") // a non-Latin run — Arabic, emoji — is a CLAUSE BREAK
    .replace(/ +/g, " ")
    .trim();
}
