// ============================================================================
// MaitreAI — Arabic numeral normalization (pure; browser+server safe).
//
// The reference sanitizer for numeric text typed on an Arabic keyboard. JS `\d`
// and `[0-9]` match ASCII digits ONLY, so a bare `.replace(/[^0-9.]/g,"")` strip
// silently discards Arabic-Indic digits (٠-٩) — the class of bug that persisted a
// delivery fee of 0 and a menu price of 0. Normalize FIRST, then strip.
//
// Covers: Arabic-Indic (U+0660–0669), Eastern Arabic-Indic / Persian-Urdu
// (U+06F0–06F9), the Arabic decimal separator ٫ (U+066B) → ".", and the Arabic
// thousands separator ٬ (U+066C) → "" (dropped).
// ============================================================================

/** Normalize any Arabic/Eastern-Arabic digits + separators in `s` to ASCII. */
export function arabicToAscii(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, "");
}

/** Money/decimal input: normalize, keep digits + a single decimal point. */
export function sanitizeDecimalInput(s: string): string {
  return arabicToAscii(s).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
}

/** Integer input: normalize, keep digits only. */
export function sanitizeIntInput(s: string): string {
  return arabicToAscii(s).replace(/[^\d]/g, "");
}

const AR = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
/** Render ASCII digits in `n` as Arabic-Indic, so figures match the app's writing. */
export function toArabicDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => AR[Number(d)]);
}
