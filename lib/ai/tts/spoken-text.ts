// ============================================================================
// MaitreAI — TEXT FOR THE EAR, not for the screen.
//
// WHY THIS EXISTS. Every character composed for a WhatsApp bubble was being sent verbatim
// to ElevenLabs — emoji, `*bold*` markers, blank lines used as layout, `×` and `—`, and
// bare ASCII numerals. The Founder heard the result next to what the same voice produces in
// the ElevenLabs playground, where a human types clean prose, and reported the product
// voice as "lower quality" than the voice object itself. It is the same voice; it was being
// handed different text.
//
// ElevenLabs' own guidance is explicit that text structure and punctuation strongly
// influence Eleven v3's output, and that numerals should be written as words so the
// normalizer does not have to guess. Our WhatsApp formatter does the exact opposite on
// purpose: `formatCustomerVisibleNumbers` converts Arabic-Indic digits to ASCII because
// that is what reads correctly in a chat bubble, and `sanitizeWhatsAppBold` deliberately
// EMITS `*` because that is WhatsApp's bold syntax. Both are right for the eye and wrong
// for the ear.
//
// WHAT THIS MAY AND MAY NOT DO. It is SUBTRACTIVE and cosmetic by construction: it removes
// or respells presentation characters. It must never change a word, a name, a number's
// VALUE, or the meaning of anything — the authoritative business and safety text has
// already been composed, gated and SENT to the customer as text before any of this runs.
// Nothing here can reach what the customer reads.
//
// AND IT MUST NOT INVENT DELIVERY. Square brackets are Eleven v3's audio-tag syntax, so a
// `[` arriving from upstream is a delivery instruction we did not author — and one caller,
// the voice-garble confirmation, echoes the visitor's own transcribed words back into a
// speakable reply. Brackets are stripped for that reason, not for tidiness.
// ============================================================================

/** Zero-width and bidi marks: invisible on screen, and they split words for a TTS engine. */
const INVISIBLE_RE = /[­؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;

/** Emoji and pictographs. Read aloud they become a pause at best and a spoken name at
 *  worst; every persona example in this product carries at least one. */
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2900}-\u{297F}]/gu;

/** Arabic-Indic and Eastern Arabic-Indic digits, so a value can be read whichever way the
 *  customer-visible formatter happened to leave it. */
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_INDIC = "۰۱۲۳۴۵۶۷۸۹";

function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const a = ARABIC_INDIC.indexOf(d);
    if (a >= 0) return String(a);
    return String(EASTERN_INDIC.indexOf(d));
  });
}

// ── NUMBERS AS WORDS ────────────────────────────────────────────────────────
//
// A bare `32` leaves the v3 normalizer to guess the language and the grammatical form.
// Spelled out, it is unambiguous — and in Arabic the form actually matters: «ريالين» is
// not «اثنين ريال». Only integers 0-99 are spelled, which covers quantities, counts,
// minutes and prices on a restaurant menu; anything larger is left as digits rather than
// risk a wrong reading, because a wrong number spoken confidently is worse than a
// mechanical one.

const ONES = [
  "صفر", "واحد", "اثنين", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
  "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر",
  "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر",
];
const TENS = ["", "", "عشرين", "ثلاثين", "أربعين", "خمسين", "ستين", "سبعين", "ثمانين", "تسعين"];

/** 0-99 in Arabic words, or null when we will not risk a reading. */
export function arabicNumberWord(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  if (n < 20) return ONES[n]!;
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t]! : `${ONES[o]!} و${TENS[t]!}`;
}

/**
 * Render a customer-visible reply as text meant to be HEARD.
 *
 * Subtractive and cosmetic only. Returns a single-line string with no emoji, no markdown,
 * no layout characters and no bracket delivery instructions, with small integers spelled
 * out. The value of every number is preserved exactly.
 */
export function toSpokenText(input: string): string {
  let s = String(input ?? "");

  // Invisibles first: they can sit inside a word and defeat everything below.
  s = s.replace(INVISIBLE_RE, "");
  s = s.replace(EMOJI_RE, " ");

  // BRACKETS ARE A DELIVERY INSTRUCTION TO THIS MODEL, not punctuation. Removed before
  // anything else can be built from this string — see the header.
  s = s.replace(/[[\]]/g, " ");

  // WhatsApp emphasis markers. `*مندي*` is bold in a bubble and a literal asterisk to a
  // TTS engine; the same for the underscore and backtick forms.
  s = s.replace(/\*{1,2}([^*\n]+)\*{1,2}/g, "$1");
  s = s.replace(/_{1,2}([^_\n]+)_{1,2}/g, "$1");
  s = s.replace(/`+([^`\n]+)`+/g, "$1");
  // Any survivors (unbalanced markers) go too.
  s = s.replace(/[*_`~]/g, "");

  // List and layout characters. A leading «•» or «-» is a bullet to the eye and noise to
  // the ear; the newline it sits on is the actual sentence break.
  s = s.replace(/^[ \t]*[-•·–—]+[ \t]+/gm, "");
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/gm, "");

  // LAYOUT BECOMES PUNCTUATION. A blank line is a paragraph to the eye and nothing at all
  // to a synthesizer, which runs the two sentences together. Ellipses are Eleven v3's
  // documented pacing lever, so a paragraph break becomes a real pause rather than a space.
  s = s.replace(/\r/g, "");
  s = s.replace(/\n{2,}/g, "... ");
  s = s.replace(/\n+/g, ". ");

  // CURRENCY IS AN ABBREVIATION, AND ABBREVIATIONS ARE READ AS LETTERS. «ر.س» is how a
  // Saudi price is WRITTEN; spoken, it is «ريال». Left alone, a price the caller can now
  // actually hear on a call came out as the two letter names, which is worse than not
  // saying it — the number sounds right and the currency sounds like noise.
  //
  // «ريال» in the singular is also the correct spoken form after the numbers this product
  // deals in: Arabic uses the singular accusative from eleven upward («ثلاثين ريال»), and
  // for the small counts below that the item name usually carries the sense anyway.
  // The trailing dot is NOT consumed. A first version swallowed it with `\.?` and took the
  // sentence break with it — «بـ ثلاثين ريال تحب أضيفه؟» ran two sentences together, which
  // is precisely the pacing this layer exists to preserve. The whitespace cleanup below
  // reattaches the period.
  s = s.replace(/\s*ر\s*\.\s*س/g, " ريال ");
  s = s.replace(/\s*ج\s*\.\s*م/g, " جنيه ");
  s = s.replace(/\bSAR\b/gi, " ريال ");

  // Symbols that have no spoken form. `×` in a recap line means "times"; read literally it
  // is a letter. Em dashes and guillemets are typography.
  s = s.replace(/\s*[×✕✖]\s*/g, " في ");
  s = s.replace(/[«»""'']/g, "");
  s = s.replace(/\s*[—–]\s*/g, "، ");
  s = s.replace(/\s*#\s*/g, " ");

  // Numbers. Normalize to ASCII first so a value written either way is treated the same,
  // then spell what we can. A decimal, a long number, a time or anything attached to
  // letters is left alone deliberately.
  s = toAsciiDigits(s);
  s = s.replace(/(?<![\d.:٠-٩])(\d{1,2})(?![\d.:%])/g, (m, d) => arabicNumberWord(Number(d)) ?? m);

  // Collapse whatever the substitutions left behind.
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\s+([،.؟!:])/g, "$1");
  // COLLAPSE REPEATS — BUT NOT THE ELLIPSIS. A first version collapsed every repeated
  // punctuation mark including `.`, which destroyed the `...` this function had just
  // written in place of a paragraph break: the pause was removed by the same pass that
  // created it. The period is handled separately, normalizing any run of two or more dots
  // to exactly three, because the ellipsis is Eleven v3's documented pacing lever.
  s = s.replace(/([،؟!])\1+/g, "$1");
  s = s.replace(/\.{2,}/g, "...");
  s = s.replace(/(?:\.\s*){4,}/g, "... ");
  return s.trim();
}
