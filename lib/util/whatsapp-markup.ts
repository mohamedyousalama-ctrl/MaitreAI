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

/** WhatsApp only treats a marker as formatting when it wraps NON-SPACE content on both
 *  sides — «5 * 3 * 2» stays literal arithmetic, «*bold*» does not. Ordered so the
 *  three-backtick monospace run wins over the single-backtick one. */
const PATTERNS: { re: RegExp; kind: MarkupToken["kind"] }[] = [
  { re: /```([^`\n]+?)```/, kind: "mono" },
  { re: /`([^`\n]+?)`/, kind: "mono" },
  { re: /\*([^*\n]*[^*\s\n])\*/, kind: "bold" },
  { re: /_([^_\n]*[^_\s\n])_/, kind: "italic" },
  { re: /~([^~\n]*[^~\s\n])~/, kind: "strike" },
];

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
      out.push({ kind: "link", text: raw, href: raw.startsWith("www.") ? `https://${raw}` : raw });
      rest = rest.slice(m.index + raw.length);
    }
    if (rest) out.push({ kind: "text", text: rest });
  };

  let rest = src;
  for (;;) {
    let best: { index: number; length: number; content: string; kind: MarkupToken["kind"] } | null = null;
    for (const { re, kind } of PATTERNS) {
      const m = re.exec(rest);
      if (!m || m.index === undefined) continue;
      // Earliest match wins; on a tie the earlier pattern (longer marker) wins.
      if (!best || m.index < best.index) best = { index: m.index, length: m[0].length, content: m[1] ?? "", kind };
    }
    if (!best) break;
    pushText(rest.slice(0, best.index));
    out.push({ kind: best.kind, text: best.content } as MarkupToken);
    rest = rest.slice(best.index + best.length);
  }
  pushText(rest);
  return out;
}

/** True when the whole body is 1–3 emoji and nothing else — WhatsApp renders those large
 *  and without a bubble. Uses Extended_Pictographic so ZWJ families and skin tones count
 *  as the single glyph a reader sees. */
export function isEmojiOnly(input: string): boolean {
  const t = String(input ?? "").trim();
  if (!t) return false;
  if (/[\p{L}\p{N}]/u.test(t)) return false;
  const glyphs = [...t.replace(/[️‍\u{1F3FB}-\u{1F3FF}\s]/gu, "")];
  if (!glyphs.length || glyphs.length > 3) return false;
  return glyphs.every((c) => /\p{Extended_Pictographic}/u.test(c));
}
