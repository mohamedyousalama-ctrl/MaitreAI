import { dialectProfile } from "@/lib/ai/dialect";
import { arabicToAscii, toArabicDigits } from "@/lib/util/arabic-digits";

export type CustomerDigitStyle = "western" | "arabic-indic";

export function digitStyleForDialect(dialect: string | null | undefined): CustomerDigitStyle {
  return dialectProfile(dialect).digitStyle;
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}]/u.test(ch);
}

export function sanitizeWhatsAppBold(text: string): string {
  const markdownNormalized = String(text).replace(/(^|[^*])\*\*([^*\n]+?)\*\*(?!\*)/g, "$1*$2*");
  let out = "";
  let lastIndex = 0;
  const pairRe = /\*([^*\n]+?)\*/g;
  let match: RegExpExecArray | null;

  while ((match = pairRe.exec(markdownNormalized))) {
    out += markdownNormalized.slice(lastIndex, match.index).replace(/\*/g, "");

    const content = match[1] ?? "";
    const trimmed = content.trim();
    if (!trimmed || trimmed !== content) {
      out += trimmed;
    } else {
      const next = markdownNormalized[match.index + match[0].length];
      if (isWordChar(out.at(-1))) out += " ";
      out += `*${content}*`;
      if (isWordChar(next)) out += " ";
    }

    lastIndex = pairRe.lastIndex;
  }

  out += markdownNormalized.slice(lastIndex).replace(/\*/g, "");
  return out;
}

/** Apply `convert` to every character that is NOT inside a quoted run.
 *
 *  Quoted text is the customer's own words being read back to them, so its figures are
 *  left exactly as they were typed in either direction. Shared by both digit styles so
 *  the two directions cannot drift apart. */
function convertOutsideQuotes(text: string, convert: (ch: string) => string): string {
  // The apostrophe is deliberately NOT a quote character. It used to be, and «don't»
  // — or any Arabic transliteration carrying one — opened a "quoted run" that never
  // closed, silently disabling normalisation for the whole rest of the message.
  const quotePairs: Record<string, string> = { "«": "»", "\"": "\"", "“": "”" };
  const chars = [...String(text)];
  let out = "";
  let quoteEnd: string | null = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    if (quoteEnd) {
      out += ch;
      if (ch === quoteEnd) quoteEnd = null;
      continue;
    }
    const end = quotePairs[ch];
    // FAIL CLOSED, NOT OPEN. A quote only protects a run that actually CLOSES. Before,
    // a single unmatched opener — one stray « or " anywhere in the model's prose — left
    // every figure after it in the wrong digit style, with no error and no sign.
    if (end && chars.indexOf(end, i + 1) !== -1) {
      quoteEnd = end;
      out += ch;
      continue;
    }
    out += convert(ch);
  }
  return out;
}

/** Render every figure in `text` in the tenant's declared digit style — BOTH WAYS.
 *
 *  This used to be one-way: `western` returned the text untouched, on the assumption
 *  that ASCII digits were the only thing that could arrive. They are not. The model
 *  writes Arabic prose and freely emits Arabic-Indic digits inside it, so a tenant whose
 *  profile declares digitStyle:"western" was being answered «الإجمالي: ٧٠.١٥ ر.س» — seen live on demo
 *  order #1001. A digit style the tenant bans is a bug in either direction, so `western`
 *  now normalizes Arabic-Indic (and Persian) digits to ASCII rather than passing them
 *  through. `arabicToAscii` also folds the Arabic decimal separator ٫ to "." and drops
 *  the thousands separator ٬, which is what a Western-digit reader expects to see. */
export function formatCustomerVisibleNumbers(
  text: string,
  digitStyle: CustomerDigitStyle,
  opts: { preserveQuotedText?: boolean } = {}
): string {
  const convert = digitStyle === "arabic-indic" ? toArabicDigits : arabicToAscii;
  if (opts.preserveQuotedText === false) return convert(String(text));
  return convertOutsideQuotes(String(text), convert);
}

export function formatCustomerVisibleText(text: string, dialect: string | null | undefined): string {
  return sanitizeWhatsAppBold(formatCustomerVisibleNumbers(String(text), digitStyleForDialect(dialect)));
}

export type CustomerVisiblePresentation =
  | { kind: "buttons"; buttons: { id: string; title: string }[]; header?: string }
  | {
      kind: "list";
      button: string;
      sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
      header?: string;
    };

export function formatCustomerVisiblePresentation<T extends CustomerVisiblePresentation>(
  presentation: T,
  dialect: string | null | undefined
): T {
  const fmt = (value: string) => formatCustomerVisibleText(value, dialect);
  if (presentation.kind === "buttons") {
    return {
      ...presentation,
      ...(presentation.header !== undefined ? { header: fmt(presentation.header) } : {}),
      buttons: presentation.buttons.map((button) => ({ ...button, title: fmt(button.title) })),
    } as T;
  }
  return {
    ...presentation,
    ...(presentation.header !== undefined ? { header: fmt(presentation.header) } : {}),
    button: fmt(presentation.button),
    sections: presentation.sections.map((section) => ({
      ...(section.title !== undefined ? { title: fmt(section.title) } : {}),
      rows: section.rows.map((row) => ({
        ...row,
        title: fmt(row.title),
        ...(row.description !== undefined ? { description: fmt(row.description) } : {}),
      })),
    })),
  } as T;
}

export function optionValueOnly(label: string): string {
  const trimmed = String(label).trim();
  const idx = trimmed.indexOf(":");
  if (idx < 0) return trimmed;
  return trimmed.slice(idx + 1).trim() || trimmed;
}
