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
