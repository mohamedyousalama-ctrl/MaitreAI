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
  const ch = codePointEndingAt(text, index);
  return !!ch && /[\p{L}\p{N}\p{M}_]/u.test(ch);
}

/** The full code point ENDING at `index`, or "" — a lone surrogate half matches no
 *  \p{…} class, so reading text[index] let every astral word character through the guard:
 *  «𝟝_5_ 𝟝_10_» rendered «𝟝5 … 𝟝10», the PROMO_5 bug one Unicode plane up. */
function codePointEndingAt(text: string, index: number): string {
  if (index < 0 || index >= text.length) return "";
  const code = text.charCodeAt(index);
  if (code >= 0xdc00 && code <= 0xdfff && index > 0) {
    const hi = text.charCodeAt(index - 1);
    if (hi >= 0xd800 && hi <= 0xdbff) return text.slice(index - 1, index + 1);
  }
  return text[index] as string;
}

/** The full code point STARTING at `index`, or "". */
function codePointStartingAt(text: string, index: number): string {
  if (index < 0 || index >= text.length) return "";
  const code = text.charCodeAt(index);
  if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
    const lo = text.charCodeAt(index + 1);
    if (lo >= 0xdc00 && lo <= 0xdfff) return text.slice(index, index + 2);
  }
  return text[index] as string;
}

/** …and may not CLOSE one glued to the start of a word: «الرمز _A_5 والرمز _B_10» rendered
 *  «A5 … B10», deleting the underscores mid-token. `_` is EXCLUDED here so adjacent runs
 *  still chain — «*a*_b_~c~» must give three runs, not one and two literals. */
function isCloseGlued(text: string, index: number): boolean {
  const ch = codePointStartingAt(text, index);
  return !!ch && /[\p{L}\p{N}\p{M}]/u.test(ch);
}

/** Same test against an explicit neighbour character from OUTSIDE this segment. */
function isWordChar(ch: string): boolean {
  return !!ch && /[\p{L}\p{N}\p{M}]/u.test(ch);
}

// Trailing punctuation must not be swallowed into the URL — «شوف https://x.com/a.» ends in
// a sentence, not a dot-suffixed path. The four FORMATTING MARKERS are excluded for the
// same reason and a sharper one: «الرابط: *https://kivo.io/pay/abc*» would otherwise build
// href="…/abc*" — a live link to the WRONG url, which is exactly the class of failure the
// links-first ordering was introduced to end. Invisible bidi controls (RLM/LRM/ZWJ) are
// excluded too: on an Arabic-first product an RLM after a link is ordinary punctuation, and
// it percent-encodes into the href as %E2%80%8F and 404s.
const URL_TRAILING_EXCLUDED = "\\s<>«»؛،.,!?:؛…)*_~`\\u200E\\u200F\\u200D";
const URL_RE = new RegExp(
  `\\b(?:https?:\\/\\/|www\\.)[^\\s<>«»؛،\\u200E\\u200F\\u200D]+[^${URL_TRAILING_EXCLUDED}]`,
  "i"
);

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
  let consumedBefore = "";   // the last character already emitted, for the segment boundary
  for (;;) {
    const m = URL_RE.exec(rest);
    if (!m || m.index === undefined) break;
    const segment = rest.slice(0, m.index);
    // THE SEGMENT'S TRUE NEIGHBOURS. Splitting at every URL and formatting each piece
    // independently made a closing marker at a segment's END get tested against
    // end-of-string instead of against the URL's first character — always a letter. So
    // «اطلب من ~هنا~https://kivo.io/menu» deleted BOTH tildes, while the identical shape
    // without a link («~هنا~هناك») correctly left them literal. The guard this whole file
    // exists for simply was not consulted at a segment edge.
    pushFormatted(segment, out, consumedBefore, m[0][0] ?? "");
    const raw = m[0];
    // URL_RE is case-insensitive, so the scheme test must be too: «WWW.x» once produced a
    // RELATIVE href that resolved to /demo/WWW.x — a 404 instead of a link.
    out.push({ kind: "link", text: raw, href: /^www\./i.test(raw) ? `https://${raw}` : raw });
    rest = rest.slice(m.index + raw.length);
  }
  // The TAIL segment needs its left neighbour too — the last character of the URL that
  // preceded it. Passing nothing here left a marker at the tail's start judged against
  // an empty context, which is the same hole one position further along.
  pushFormatted(rest, out, consumedBefore, "");
  return out;
}

/** Tokenize one LINK-FREE run into text and formatting spans.
 *
 *  `before` and `after` are the real characters on either side of this run in the ORIGINAL
 *  message — the tail of whatever was already emitted, and the first character of the URL
 *  that ends the segment. Without them a run's outer edges were judged against
 *  end-of-string. */
function pushFormatted(run: string, out: MarkupToken[], before = "", after = ""): void {
  if (!run) return;
  let rest = run;
  let prev = before;
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
        const end = at + m[0].length;
        const openGlued = at === 0 ? isWordChar(prev) : isOpenGlued(rest, at - 1);
        const closeGlued = end >= rest.length ? isWordChar(after) : isCloseGlued(rest, end);
        if (!openGlued && !closeGlued) {
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
    // Reset the left neighbour: the character now before position 0 is this run's own
    // CLOSING marker, which is consumed and gone from the output — treating it as context
    // is what used to suppress «_مائل_~مشطوب~» into one run and two literals.
    prev = "";
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
