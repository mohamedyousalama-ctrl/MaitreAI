// ============================================================================
// MaitreAI — WO-FINISH-LINE (PART A): the DETERMINISTIC order recap renderer.
//
// PURE (no I/O, no model calls). Production, DB-proven: model-written recaps of a
// built order exceeded the output budget and were TRUNCATED mid-word («تحب "»,
// «وكمان است»), and the recap loop cost $0.15-0.19 at 6 model calls / turn. The
// root fix: the recap (items, modifiers, fees, total, allergy line, «أجهّزلك
// الطلب؟») is RENDERED BY CODE from the draft — never model prose — so it is
// complete every time and costs zero model calls.
//
// This module reuses the existing receipt-render text pattern (tools.ts `summary`
// + draft-restatement's Arabic-Indic numerals) but produces an IDENTICAL structure
// every turn: every number is Arabic-Indic and comes from the DRAFT (already priced
// by the order tools — this file does NO money math, it only formats stored values).
//
// The model may add ONE short lead-in line; the block itself is code. Read ONLY by
// respond.ts, gated on brain.finishLine — flag OFF → never invoked → byte-identical.
// ============================================================================

import type { OrderDraft, DraftLine } from "./tools";
import { toArabicDigits } from "@/lib/util/arabic-digits";
import { optionValueOnly } from "@/lib/util/customer-visible-format";

/** Recap phase. "readback" is the pre-confirmation order readback that ends with
 *  «أجهّزلك الطلب؟». "confirmed" heads the registered-order recap (no readback ask).
 *  The CORE block (items/modifiers/fees/total/allergy) is byte-identical between them. */
export type RecapPhase = "readback" | "confirmed";

export interface RecapOptions {
  dialect: string;
  /** The kitchen-readable session allergy note, e.g. «⚠️ حساسية: بيض». Rendered as
   *  the recap's allergy line ONLY when it is a real «⚠️ حساسية …» note. */
  allergyNote?: string | null;
  phase?: RecapPhase;
  /** Override the readback trailer (used by the turn-contract next-step, «أكمل؟»). */
  trailer?: string;
}

const ar = (v: number | string): string => toArabicDigits(v);

/** The option text for one draft line (variant + choices + modifiers), value-only. */
function lineOptions(l: DraftLine): string[] {
  return [
    ...(l.variant ? [l.variant.name] : []),
    ...l.choices.map((c) => optionValueOnly(c.label)),
    ...l.modifiers.map((m) => optionValueOnly(m.name)),
  ];
}

/** One recap line: «٢× بيتزا (وسط، جبنة زيادة) — ٣٩٠ ج.م» — Arabic-Indic throughout. */
function recapLine(l: DraftLine, currency: string): string {
  const opts = lineOptions(l);
  const optText = opts.length ? ` (${opts.join("، ")})` : "";
  return `${ar(l.quantity)}× ${l.name}${optText} — ${ar(l.lineTotal)} ${currency}`;
}

/** The readback confirm ask, dialect-aware. Egyptian is the DB-proven «أجهّزلك الطلب؟». */
export function recapConfirmAsk(dialect: string): string {
  return dialect === "saudi" ? "أجهّز لك الطلب؟" : "أجهّزلك الطلب؟";
}

/** The registered-order header for the confirmed phase (the finalize reply). */
export function recapConfirmedHeader(): string {
  return "تم تسجيل الطلب بانتظار تأكيد المطعم ✅";
}

/** True iff `note` is a real kitchen allergy note («⚠️ حساسية …») safe to show. */
function allergyLine(note: string | null | undefined): string | null {
  const a = note?.trim();
  return a && a.startsWith("⚠️ حساسية") ? a : null;
}

/**
 * Render the deterministic recap BLOCK from the draft. Every figure is Arabic-Indic
 * and copied from the (already-priced) draft — no arithmetic here. The structure is
 * identical on every turn:
 *   [confirmed header]
 *   {qty}× {name} ({options}) — {lineTotal} {currency}          (one per line)
 *   رسوم التوصيل: {fee} {currency}                              (delivery + fee only)
 *   ضريبة القيمة المضافة ({rate}%): {tax} {currency}            (tax > 0 only)
 *   الإجمالي: {total} {currency}
 *   ⚠️ حساسية: …                                               (real note only)
 *   [readback trailer «أجهّزلك الطلب؟»]
 * An empty draft renders the honest «السلة فارغة.» (never a fabricated total).
 */
export function renderDraftRecap(draft: OrderDraft, opts: RecapOptions): string {
  const phase: RecapPhase = opts.phase ?? "readback";
  const cur = draft.currency;
  if (!draft.lines.length) return "السلة فارغة.";

  const parts: string[] = [];
  if (phase === "confirmed") parts.push(recapConfirmedHeader());

  for (const l of draft.lines) parts.push(recapLine(l, cur));

  if (draft.fulfillment === "delivery" && draft.deliveryFee) {
    parts.push(`رسوم التوصيل: ${ar(draft.deliveryFee)} ${cur}`);
  }
  if (draft.tax > 0) {
    parts.push(`ضريبة القيمة المضافة (${ar(draft.taxRate)}%): ${ar(draft.tax)} ${cur}`);
  }
  parts.push(`الإجمالي: ${ar(draft.total)} ${cur}`);

  const allergy = allergyLine(opts.allergyNote);
  if (allergy) parts.push(allergy);

  if (phase === "readback") parts.push(opts.trailer ?? recapConfirmAsk(opts.dialect));

  return parts.join("\n");
}

/** A rendered recap block always carries the total line — the stable signature the
 *  turn contract (PART B) uses to recognize a "completed-action recap" is present. */
export const RECAP_TOTAL_RE = /الإجمالي\s*[:：]/;

/** True iff `text` contains a rendered recap (its total line). */
export function containsRenderedRecap(text: string): boolean {
  return RECAP_TOTAL_RE.test(String(text ?? ""));
}

// --- respond.ts integration decision (pure) ---------------------------------

/** Tools whose run means a recap is DUE this turn — a draft mutation or an explicit
 *  summary read. A read-only present/photo/escalate turn is NOT a recap turn. */
export const RECAP_TRIGGER_TOOLS: ReadonlySet<string> = new Set([
  "add_to_order",
  "remove_from_order",
  "set_fulfillment",
  "set_delivery_address",
  "set_payment_method",
  "get_order_summary",
]);

/**
 * Is a deterministic recap due at the end of THIS turn? Only when the finish-line
 * flag is on, ordering is allowed, the draft has lines, a recap-trigger tool ran,
 * and NO safety/handoff event fired this turn (a safety line must never be replaced
 * by a cheerful recap). Pure — the caller supplies the turn facts.
 */
export function recapDue(args: {
  flagOn: boolean;
  canOrder: boolean;
  draft: OrderDraft;
  toolNames: string[];
  safetyEvent: boolean;
}): boolean {
  const { flagOn, canOrder, draft, toolNames, safetyEvent } = args;
  if (!flagOn || !canOrder || safetyEvent) return false;
  if (!draft.lines.length) return false;
  return toolNames.some((t) => RECAP_TRIGGER_TOOLS.has(t));
}

const LEAD_IN_MAX = 60;

/** Keep at most ONE short model lead-in line, dropped if it is itself recap-like
 *  (carries a total) or too long — the code block is the source of truth. */
export function shortLeadIn(modelText: string): string {
  const first = String(modelText ?? "").split(/\n|[.!؟?]/)[0]?.trim() ?? "";
  if (!first || first.length > LEAD_IN_MAX) return "";
  if (containsRenderedRecap(first) || /×/.test(first)) return "";
  return first;
}

/**
 * Replace the model's (possibly truncated) recap prose with the deterministic recap,
 * preserving at most one short model lead-in line above the code block.
 */
export function applyDeterministicRecap(modelText: string, draft: OrderDraft, opts: RecapOptions): string {
  const block = renderDraftRecap(draft, opts);
  const lead = shortLeadIn(modelText);
  return lead ? `${lead}\n${block}` : block;
}
