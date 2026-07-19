import type { OrderDraft } from "@/lib/ai/tools";

export const DRAFT_REOPEN_RESTATEMENT_MS = 5 * 60 * 1000;

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

function toAr(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => AR_DIGITS[Number(digit)]);
}

function lineText(line: OrderDraft["lines"][number]): string {
  const options = [
    ...(line.variant ? [line.variant.name] : []),
    ...line.choices.map((choice) => choice.label),
    ...line.modifiers.map((modifier) => modifier.name),
  ];
  const suffix = options.length ? ` (${options.join("، ")})` : "";
  return `${toAr(line.quantity)}× ${line.name}${suffix}`;
}

export function shouldRestateRestorableDraft(draft: OrderDraft | null, ageMs: number | null): draft is OrderDraft {
  return !!draft && draft.finalized !== true && draft.lines.length > 0 && typeof ageMs === "number" && ageMs >= DRAFT_REOPEN_RESTATEMENT_MS;
}

export function buildOldDraftRestatementReply(draft: OrderDraft): string {
  const summary = draft.lines.map(lineText).join("، ");
  return `عندك طلب سابق: ${summary} — نكمله ولا نبدأ من جديد؟`;
}
