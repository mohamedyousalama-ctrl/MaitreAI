// ============================================================================
// MaitreAI — WO-FINISH-LINE (PART C): the BULK-ORDER threshold + handoff.
//
// PURE (no I/O, no model calls). Production, DB-proven: a 20-pizza party order
// («٢٠ بيتزا … حفله») drove the model into the 6-iteration tool cap and dead-ended
// on a bare promise. A large party order is NOT a tool-building job — it needs a
// human to arrange the best price + assortment. So when a SINGLE request implies
// more than 8 items, respond.ts does NOT attempt tool-building: it short-circuits
// to the honest handoff line + the existing escalation/notify mechanisms.
//
// impliedItemCount is deliberately CONSERVATIVE: it reads a stated quantity, never
// a price (a currency-adjacent number) or a clock time — so a normal «٣ بيتزا» build
// never trips it and a «٣٢٠ ج.م» total never reads as 320 items. Read ONLY by
// respond.ts, gated on brain.finishLine — flag OFF → never invoked → byte-identical.
// ============================================================================

import { arabicToAscii } from "@/lib/util/arabic-digits";

/** More than this many implied items in ONE request → deterministic human handoff. */
export const BULK_ITEM_THRESHOLD = 8;

// A number sitting next to a currency token is a PRICE, not a quantity.
const PRICE_CONTEXT_RE = /(?:ج\.?\s*م|جنيه|جنيها|ر\.?\s*س|ريال|درهم|دينار|جم|\$|£|€)/;
// «الساعة ٩» is a clock time, never an item count.
const TIME_CONTEXT_RE = /الساع[ةه]\s*$/;

/**
 * The largest stated QUANTITY implied by the message (0 when none). Numbers adjacent
 * to a currency token (a price), 4+ digit runs (phones/ids), values > 999, and clock
 * times are excluded, so only genuine item-count figures survive. Arabic-Indic and
 * Western digits both counted.
 */
export function impliedItemCount(message: string): number {
  const s = arabicToAscii(String(message ?? ""));
  let max = 0;
  const re = /\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const digits = m[0];
    if (digits.length > 3) continue; // phone / id — never a quantity
    const val = Number(digits);
    if (!Number.isFinite(val) || val < 1 || val > 999) continue;
    const after = s.slice(m.index + digits.length, m.index + digits.length + 8);
    const before = s.slice(Math.max(0, m.index - 8), m.index);
    if (PRICE_CONTEXT_RE.test(after) || PRICE_CONTEXT_RE.test(before)) continue; // a price
    if (TIME_CONTEXT_RE.test(before)) continue; // a clock time
    if (val > max) max = val;
  }
  return max;
}

/** True iff the message implies MORE than BULK_ITEM_THRESHOLD items in one request. */
export function exceedsBulkThreshold(message: string): boolean {
  return impliedItemCount(message) > BULK_ITEM_THRESHOLD;
}

/** The honest customer-facing handoff line for a bulk/party order (DB-proven copy). */
export function bulkHandoffReply(dialect: string): string {
  return dialect === "saudi"
    ? "طلبات المناسبات والكميات الكبيرة يرتّبها معك أحد من الفريق عشان يضبط لك أحسن سعر وتشكيلة 🎉 بحوّلك الحين"
    : "طلب الحفلات والكميات الكبيرة بيظبطه معاك حد من الفريق عشان يظبطلك أحسن سعر وتشكيلة 🎉 هحوّلك دلوقتي";
}

/** The staff-facing escalation/notify reason for a bulk order handoff. */
export function bulkHandoffReason(impliedCount: number): string {
  return `طلب بكمية كبيرة (≈${impliedCount} صنف) — حُوّل لفريق المطعم لتجهيز أفضل سعر وتشكيلة`;
}
