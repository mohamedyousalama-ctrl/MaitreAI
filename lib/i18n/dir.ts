// ============================================================================
// MaitreAI — Item 12: text-direction helper (pure; browser+server safe)
// The console is Arabic-first (RTL) with an English (LTR) surface. This is the
// ONE place that decides direction from a language tag, so components never
// hardcode `dir="rtl"`. Numbers, Latin fragments, and phone numbers still need
// per-span bidi isolation (see components/kivo Bdi/Num/Phone) — direction alone
// does not make mixed content render correctly.
// ============================================================================

export type Lang = "ar" | "en";
export type Dir = "rtl" | "ltr";

/** Languages that render right-to-left. Arabic (فصحى) is the console default. */
const RTL_LANGS = new Set<string>(["ar"]);

/** Normalize a possibly-regioned tag ("ar-SA", "EN") to the base language. */
export function baseLang(tag: string | null | undefined): Lang {
  const base = String(tag ?? "").toLowerCase().split("-")[0];
  return base === "en" ? "en" : "ar"; // Arabic-first default
}

export function isRtl(tag: string | null | undefined): boolean {
  return RTL_LANGS.has(baseLang(tag));
}

export function dirFor(tag: string | null | undefined): Dir {
  return isRtl(tag) ? "rtl" : "ltr";
}
