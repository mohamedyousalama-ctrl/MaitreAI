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

/** WhatsApp treats a marker as formatting only when it TOUCHES the content ON BOTH SIDES.
 *  «* hello *» is not bold; «*hello*» is. lib/util/customer-visible-format.ts states the
 *  same rule for the text it produces — "A run padded with spaces is not bold on WhatsApp".
 *
 *  An earlier version required non-space only before the CLOSING marker, so a marker
 *  followed by a space still opened a run and paired across the whole message:
 *  «التوصيل ~ 20 ريال، والطلب من 50~60 ريال» rendered «… من 5060 ريال». Same class as the
 *  original bug, and the earlier fix had quietly dropped the words "on both sides" from
 *  this very comment instead of implementing them. */
const PATTERNS: { re: RegExp; kind: MarkupToken["kind"] }[] = [
  // The triple-backtick form may contain single backticks and newlines; the others may not.
  { re: /```([^\s](?:[\s\S]*?[^\s])?)```/, kind: "mono" },
  { re: /`([^`\s\n](?:[^`\n]*[^`\s\n])?)`/, kind: "mono" },
  { re: /\*([^*\s\n](?:[^*\n]*[^*\s\n])?)\*/, kind: "bold" },
  { re: /_([^_\s\n](?:[^_\n]*[^_\s\n])?)_/, kind: "italic" },
  { re: /~([^~\s\n](?:[^~\n]*[^~\s\n])?)~/, kind: "strike" },
];

/** A marker may not OPEN a run when glued to the end of a word.
 *
 *  Without this, any two of the same marker anywhere in a message pair up, the markers are
 *  DELETED, and everything between them is formatted: «الكود PROMO_5 … PROMO_10» rendered
 *  «PROMO5 … PROMO10» — a promo code shown wrong on the sales page, and strictly worse than
 *  the raw asterisks it replaced, because before this the text was rendered verbatim.
 *
 *  `\p{M}` is in the class deliberately: without it one Arabic diacritic reopens the whole
 *  hole — «الكودُ_5 مع الكودُ_10» bypassed a class of only [\p{L}\p{N}_], on an Arabic-first
 *  product.
 *
 *  Checked by index rather than with a regex lookbehind: a lookbehind literal is a
 *  PARSE-TIME SyntaxError on Safari < 16.4, which would take this whole client module down
 *  on that browser rather than degrade. */
function isOpenGlued(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return false;
  return /[\p{L}\p{N}\p{M}_]/u.test(text[index] as string);
}

/** …and may not CLOSE one glued to the start of a word: «الرمز _A_5 والرمز _B_10» rendered
 *  «A5 … B10», deleting the underscores mid-token. `_` is EXCLUDED here so adjacent runs
 *  still chain — «*a*_b_~c~» must give three runs, not one and two literals. */
function isCloseGlued(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return false;
  return /[\p{L}\p{N}\p{M}]/u.test(text[index] as string);
}

// Trailing punctuation must not be swallowed into the URL — «شوف https://x.com/a.» ends
// in a sentence, not in a dot-suffixed path.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>«»؛،]+[^\s<>«»؛،.,!?:؛…)]/i;

/** Parse one message body into tokens. Never throws; unmatched markers stay literal.
 *
 *  LINKS ARE FOUND FIRST. Formatting used to run first, so a URL containing markers was
 *  torn apart and its href TRUNCATED — «https://getkivo.io/menu/_special_offer» produced a
 *  link to the directory «…/menu/» plus an italic run, i.e. a live link to the wrong page
 *  on a sales page. A URL is a single opaque span; nothing inside it is formatting. */
export function parseWhatsAppMarkup(input: string): MarkupToken[] {
  const src = String(input ?? "");
  if (!src) return [];
  const out: MarkupToken[] = [];
  let rest = src;
  for (;;) {
    const m = URL_RE.exec(rest);
    if (!m || m.index === undefined) break;
    pushFormatted(rest.slice(0, m.index), out);
    const raw = m[0];
    // URL_RE is case-insensitive, so the scheme test must be too: «WWW.x» once produced a
    // RELATIVE href that resolved to /demo/WWW.x — a 404 instead of a link.
    out.push({ kind: "link", text: raw, href: /^www\./i.test(raw) ? `https://${raw}` : raw });
    rest = rest.slice(m.index + raw.length);
  }
  pushFormatted(rest, out);
  return out;
}

/** Tokenize one LINK-FREE run into text and formatting spans. */
function pushFormatted(run: string, out: MarkupToken[]): void {
  if (!run) return;
  let rest = run;
  for (;;) {
    let best: { index: number; length: number; content: string; kind: MarkupToken["kind"] } | null = null;
    for (const { re, kind } of PATTERNS) {
      let from = 0;
      // Skip a candidate whose marker is glued to a word and look further on, so
      // «PROMO_5 … PROMO_10» finds nothing rather than eating both underscores.
      for (;;) {
        const m = re.exec(rest.slice(from));
        if (!m || m.index === undefined) break;
        const at = from + m.index;
        // Boundaries are read from `rest`, the CURRENT stream. Reading the original string
        // at an absolute offset made position 0 look at the previous run's closing marker —
        // a character that no longer exists in the output — which suppressed adjacent runs:
        // «_مائل_~مشطوب~» left the tildes visible.
        if (!isOpenGlued(rest, at - 1) && !isCloseGlued(rest, at + m[0].length)) {
          if (!best || at < best.index) best = { index: at, length: m[0].length, content: m[1] ?? "", kind };
          break;
        }
        from = at + 1;
      }
    }
    if (!best) break;
    if (best.index > 0) out.push({ kind: "text", text: rest.slice(0, best.index) });
    out.push({ kind: best.kind, text: best.content } as MarkupToken);
    rest = rest.slice(best.index + best.length);
  }
  if (rest) out.push({ kind: "text", text: rest });
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
  // Extended_Pictographic ALONE is too wide: «©» and «™» carry it, and WhatsApp does not
  // enlarge those — they are text-presentation characters that happen to live in the emoji
  // block. Require emoji presentation, either inherently or via an explicit U+FE0F (which
  // is how «❤️» asks to be drawn as an emoji rather than as a dingbat).
  if (/\u{FE0F}/u.test(g)) return /\p{Extended_Pictographic}/u.test(g);
  return /\p{Emoji_Presentation}/u.test(g);
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
