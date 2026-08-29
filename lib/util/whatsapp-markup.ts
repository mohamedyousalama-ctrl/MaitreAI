// ============================================================================
// MaitreAI — WhatsApp's own text conventions, parsed into renderable spans.
//
// WHY THIS EXISTS. lib/util/customer-visible-format.ts `sanitizeWhatsAppBold` is CORRECT:
// it deliberately emits WhatsApp's wire format, `*bold*`, because that is what the real
// WhatsApp client is given and what it renders bold. The demo page then printed that wire
// format raw — «خصم *15%* على أول طلب» with the asterisks visible — because the bubble
// renders the reply as a plain React text child.
//
// So the bug was never in the formatter. It is that the demo renders WhatsApp's input
// without being a WhatsApp renderer. This module is that renderer, and NOTHING here may
// change what is sent: it parses, it never rewrites.
//
// PURE and browser-safe: returns a token list, not JSX, so it stays framework-free and
// unit-testable without a DOM.
// ============================================================================

export type MarkupToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "strike"; text: string }
  | { kind: "mono"; text: string }
  | { kind: "link"; text: string; href: string };

/** WhatsApp only treats a marker as formatting when it wraps NON-SPACE content — «5 * 3 * 2»
 *  stays literal arithmetic, «*bold*» does not. Ordered so the three-backtick monospace run
 *  wins over the single-backtick one. */
const PATTERNS: { re: RegExp; kind: MarkupToken["kind"] }[] = [
  { re: /```([^`\n]+?)```/, kind: "mono" },
  { re: /`([^`\n]+?)`/, kind: "mono" },
  { re: /\*([^*\n]*[^*\s\n])\*/, kind: "bold" },
  { re: /_([^_\n]*[^_\s\n])_/, kind: "italic" },
  { re: /~([^~\n]*[^~\s\n])~/, kind: "strike" },
];

/** A marker may OPEN a formatting run only when it is not glued to the end of a word.
 *
 *  Without this, any two of the same marker anywhere in a message pair up, the markers are
 *  DELETED, and everything between them is formatted. «الكود PROMO_5 صالح مع الكود PROMO_10»
 *  rendered as «الكود PROMO5 … PROMO10» — a promo code displayed wrong on the sales page,
 *  which is the exact failure this module was written to fix, and strictly worse than the
 *  asterisks it replaced, because before this the text was at least rendered verbatim.
 *  «50~60 ريال» lost its tilde the same way, and so did the VISITOR's own typed message,
 *  which never passes through the formatter at all.
 *
 *  Checked by index against the ORIGINAL string rather than with a regex lookbehind: a
 *  lookbehind literal is a PARSE-TIME SyntaxError on Safari < 16.4, which would take this
 *  whole client module down on that browser rather than degrade. */
function isWordCharAt(src: string, index: number): boolean {
  if (index < 0 || index >= src.length) return false;
  return /[\p{L}\p{N}_]/u.test(src[index] as string);
}

// Trailing punctuation must not be swallowed into the URL — «شوف https://x.com/a.» ends
// in a sentence, not in a dot-suffixed path.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>«»؛،]+[^\s<>«»؛،.,!?:؛…)]/i;

/** Parse one message body into tokens. Never throws; unmatched markers stay literal. */
export function parseWhatsAppMarkup(input: string): MarkupToken[] {
  const src = String(input ?? "");
  if (!src) return [];
  const out: MarkupToken[] = [];

  const pushText = (text: string) => {
    if (!text) return;
    // Links are found inside plain runs only, so a URL inside `code` stays literal.
    let rest = text;
    for (;;) {
      const m = URL_RE.exec(rest);
      if (!m || m.index === undefined) break;
      if (m.index > 0) out.push({ kind: "text", text: rest.slice(0, m.index) });
      const raw = m[0];
      out.push({ kind: "link", text: raw, href: /^www\./i.test(raw) ? `https://${raw}` : raw });
      rest = rest.slice(m.index + raw.length);
    }
    if (rest) out.push({ kind: "text", text: rest });
  };

  let rest = src;
  let offset = 0; // absolute index of `rest[0]` within `src`, for the word-boundary check
  for (;;) {
    let best: { index: number; length: number; content: string; kind: MarkupToken["kind"] } | null = null;
    for (const { re, kind } of PATTERNS) {
      let from = 0;
      // Skip candidates whose opening marker is glued to a word and try again further on,
      // so «PROMO_5 … PROMO_10» finds nothing rather than eating both underscores.
      for (;;) {
        const m = re.exec(rest.slice(from));
        if (!m || m.index === undefined) break;
        const at = from + m.index;
        if (!isWordCharAt(src, offset + at - 1)) {
          if (!best || at < best.index) best = { index: at, length: m[0].length, content: m[1] ?? "", kind };
          break;
        }
        from = at + 1;
      }
    }
    if (!best) break;
    pushText(rest.slice(0, best.index));
    out.push({ kind: best.kind, text: best.content } as MarkupToken);
    const consumed = best.index + best.length;
    rest = rest.slice(consumed);
    offset += consumed;
  }
  pushText(rest);
  return out;
}

/** True when the whole body is 1–3 emoji and nothing else — WhatsApp renders those large
 *  and without a bubble.
 *
 *  Counts GRAPHEME CLUSTERS, so a ZWJ family (👨‍👩‍👧‍👦), a flag (🇸🇦), a keycap (1️⃣) and a
 *  skin-tone thumb (👍🏽) each count as the ONE glyph a reader sees. An earlier version
 *  stripped a hand-written character class and counted code points, which reported a lone
 *  family emoji as four glyphs and a flag as two — so exactly the messages WhatsApp
 *  renders largest were the ones it refused to enlarge. That class also embedded U+200D
 *  and U+FE0F as literal invisible characters in the source, which no reviewer can see and
 *  an editor can silently destroy. */
export function isEmojiOnly(input: string): boolean {
  const t = String(input ?? "").trim();
  if (!t) return false;
  // Whitespace BETWEEN emoji is fine — WhatsApp renders «👍 👍» large — so it is removed
  // rather than treated as disqualifying content.
  const glyphs = segmentGraphemes(t.replace(/\s+/gu, ""));
  if (!glyphs.length || glyphs.length > 3) return false;
  return glyphs.every(isEmojiGrapheme);
}

/** One grapheme cluster, judged as emoji or not.
 *
 *  Tested PER GRAPHEME rather than with one «does the whole string contain a letter or a
 *  digit?» guard, because that guard rejected keycaps: «1️⃣» is the digit 1 plus U+FE0F and
 *  U+20E3, so the very first check threw out a glyph WhatsApp renders large. */
function isEmojiGrapheme(g: string): boolean {
  if (/\u{20E3}/u.test(g)) return true;                      // keycap: 1️⃣ #️⃣ *️⃣
  if (/^\p{Regional_Indicator}{2}$/u.test(g)) return true;    // flag: 🇸🇦
  // A real letter or digit that is NOT part of a keycap disqualifies the message.
  if (/[\p{L}\p{N}]/u.test(g.replace(/[\u{FE0F}\u{200D}\u{20E3}]/gu, ""))) return false;
  return /\p{Extended_Pictographic}/u.test(g);
}

/** Grapheme clusters via Intl.Segmenter where available, else a conservative fallback that
 *  keeps ZWJ (U+200D) sequences, variation selectors (U+FE0F), keycaps and skin-tone
 *  modifiers attached to the glyph they belong to. */
function segmentGraphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return [...new Seg(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  const out: string[] = [];
  const chars = [...text];
  for (const ch of chars) {
    const isJoiner = /[\u{200D}\u{FE0F}\u{20E3}\u{1F3FB}-\u{1F3FF}]/u.test(ch);
    const prevWasZwj = out.length > 0 && (out[out.length - 1] as string).endsWith("\u200D");
    if (out.length && (isJoiner || prevWasZwj)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  // A flag is a PAIR of regional indicators; merge them.
  const merged: string[] = [];
  for (const g of out) {
    const prev = merged[merged.length - 1];
    if (prev && /^\p{Regional_Indicator}$/u.test(prev) && /^\p{Regional_Indicator}$/u.test(g)) merged[merged.length - 1] = prev + g;
    else merged.push(g);
  }
  return merged;
}
