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

// AN ADDRESS IS NOT AN ORDER. Live on the demo: a customer answering «عطني العنوان
// بالتفصيل» typed «25 شارع جده» and was handed off with «طلبات المناسبات والكميات الكبيرة
// يرتّبها معك أحد من الفريق» — the street number 25 read as twenty-five items. So did
// «حي العليا مخرج 9» and «مبنى 12 شقة 3». This module already refuses to read a price or a
// clock time as a quantity; a house number is the same class of mistake and the address
// question is one we ASKED, so the answer is entirely predictable.
//
// ADJACENCY IS TIGHT ON PURPOSE. The number must sit directly beside the address word, so
// «٢٥ بيتزا لحي العليا» — a genuine party order that happens to name a district — still
// trips the threshold. A loose window would read «لحي» inside it and silently disable the
// bulk handoff for any order mentioning a neighbourhood.
// The two scripts need different boundaries. JS `\b` is defined on [A-Za-z0-9_], so
// Arabic letters are all "non-word" and `شارع\b` never matches «شارع جده» — the first
// version of this fix silently did nothing for the very string that prompted it. Latin
// words DO need the boundary, or «25 stuffed pizzas» matches `st` and a real party order
// stops tripping the threshold.
const ADDRESS_WORD_AR =
  "شارع|طريق|حي|مخرج|مبنى|عمارة|بناية|شقة|فيلا|دور|طابق|بلوك|وحدة|رقم|ص\\.?\\s?ب";
const ADDRESS_WORD_EN =
  "street|st|road|rd|ave|avenue|building|bldg|apt|apartment|floor|unit|block|exit|no";
/** «25 شارع» — the number, then an address word immediately after. */
const ADDRESS_AFTER_RE =
  new RegExp(`^\\s*(?:(?:${ADDRESS_WORD_AR})|(?:${ADDRESS_WORD_EN})\\b)`, "i");
/** «شارع 25» / «مخرج ٩» — an address word immediately before the number. */
const ADDRESS_BEFORE_RE =
  new RegExp(`(?:(?:${ADDRESS_WORD_AR})|\\b(?:${ADDRESS_WORD_EN}))\\s*$`, "i");

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
    if (ADDRESS_AFTER_RE.test(after) || ADDRESS_BEFORE_RE.test(before)) continue; // a house/street number
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
