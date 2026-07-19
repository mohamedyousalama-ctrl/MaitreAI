import { dialectProfile } from "@/lib/ai/dialect";
import { toArabicDigits } from "@/lib/util/arabic-digits";

export type CustomerDigitStyle = "western" | "arabic-indic";

export function digitStyleForDialect(dialect: string | null | undefined): CustomerDigitStyle {
  return dialectProfile(dialect).digitStyle;
}

export function sanitizeWhatsAppBold(text: string): string {
  return String(text).replace(/(^|[^*])\*\*([^*\n]+?)\*\*(?!\*)/g, "$1*$2*");
}

export function formatCustomerVisibleNumbers(
  text: string,
  digitStyle: CustomerDigitStyle,
  opts: { preserveQuotedText?: boolean } = {}
): string {
  if (digitStyle !== "arabic-indic") return String(text);
  if (opts.preserveQuotedText === false) return toArabicDigits(text);

  let out = "";
  let quoteEnd: string | null = null;
  const quotePairs: Record<string, string> = { "«": "»", "\"": "\"", "'": "'", "“": "”" };
  for (const ch of String(text)) {
    if (quoteEnd) {
      out += ch;
      if (ch === quoteEnd) quoteEnd = null;
      continue;
    }
    const end = quotePairs[ch];
    if (end) {
      quoteEnd = end;
      out += ch;
      continue;
    }
    out += toArabicDigits(ch);
  }
  return out;
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
