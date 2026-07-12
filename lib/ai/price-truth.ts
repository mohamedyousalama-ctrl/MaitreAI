// ============================================================================
// MaitreAI — WO-LIVE6-PRICE-TRUTH: deterministic outbound item→price REPAIR guard.
//
// PURE (no I/O). Live money-truth escape (conv c016a121, وصاية, 19:57:57): answering
// «عندك إيه في حدود ١٥٠؟» Karim listed «عرض كاديا — ١٥٠ ج.م» when عرض كاديا's real
// menu_items price is ٣٢٠ (سوبر وصاية & عرض ميجا ميل genuinely ARE ١٥٠). The customer
// then ordered ٣× believing ١٥٠ each. The existing money guard (money-guard.ts,
// fabricatesMoney) only asks "is this NUMBER a real menu price somewhere?" — ١٥٠ IS a real
// price (for other items), so the mis-attributed pair sailed through. The gap is item→price
// PAIR mis-attribution, a class the number-level guard structurally cannot catch.
//
// Fix (mirrors the repair-not-hold safety net — never block, never hold): extract every
// item→price pair the model wrote in free prose, verify each quoted amount against THAT
// item's real valid-price set (base + every variant/size price), and REPAIR the figure in
// place when the item has exactly ONE valid price (PM ruling 1: a multi-price item is likely
// a legit variant quote → log, never repair). Every repair AND every skipped-ambiguous bind
// emits a signal carrying {item, quoted, real} so FR-013's frequency data stays alive.
//
// SKIP-ON-DOUBT, NEVER MIS-REPAIR (PM ruling 4): an amount binds to an item only within the
// SAME LINE and only when NO other menu item name sits between the name and the amount;
// longest-name-first so a specific item wins; ambiguous binds are logged, not repaired. The
// caller runs this only when NO money tool ran (engine/tool figures are TRUTH, never touched)
// and only under the price_truth_guard flag (flag-off → byte-identical).
// ============================================================================

import type { MenuItem } from "@/lib/types";
import { toArabicDigits } from "@/lib/util/arabic-digits";

/** Arabic-Indic (٠-٩) + Eastern (۰-۹) + Western digits → Western, 1:1 length-preserving so
 *  match indices computed on a normalized copy still align with the original string. */
function toWesternDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

const TASHKEEL = "[\\u064B-\\u0652\\u0670]*";
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A regex that matches `name` in Arabic prose tolerating tashkeel after each letter and
 *  flexible internal whitespace — evaluated on the ORIGINAL text so indices stay exact. */
function nameRegex(name: string): RegExp {
  const parts = name
    .trim()
    .split(/\s+/)
    .map((w) => Array.from(w).map(escapeRe).join(TASHKEEL));
  return new RegExp(parts.join("\\s+") + TASHKEEL, "g");
}

/** The currency-token alternation (mirrors money-guard.ts). */
function curTokSource(currency: string): string {
  const cur = escapeRe(currency);
  return `(?:${cur}|ج\\.?\\s?م|ر\\.?\\s?س|ريال|جنيه|جنيهاً|جنيها)`;
}

const DIGITS = "[0-9٠-٩۰-۹]+(?:[.,][0-9٠-٩۰-۹]+)?";

export interface PriceBinding {
  item: string;
  quoted: number;
  /** For a repaired/single-price item: the real price. For a skipped multi-price item: the
   *  item's base price (representative — the full valid set rides in `validPrices`). */
  real: number;
  validPrices: number[];
  reason: "repaired" | "skipped_multi_price" | "skipped_ambiguous_bind";
}

export interface PriceGuardResult {
  text: string;
  repairs: PriceBinding[];
  skipped: PriceBinding[];
}

interface ItemPrices {
  name: string;
  valid: number[]; // base + active variant prices, deduped, >0
}

function itemValidPrices(items: MenuItem[]): ItemPrices[] {
  const out: ItemPrices[] = [];
  for (const i of items) {
    const set = new Set<number>();
    const add = (n: number) => { if (Number.isFinite(n) && n > 0) set.add(Math.round(n * 100) / 100); };
    add(i.price);
    for (const v of i.variants ?? []) if (v.active !== false) add(v.price);
    if (set.size && i.name?.trim()) out.push({ name: i.name.trim(), valid: [...set] });
  }
  // Longest name first so a specific item («عرض كاديا الكبير») wins over a shorter prefix.
  return out.sort((a, b) => b.name.length - a.name.length);
}

function matchesAnyValid(quoted: number, valid: number[]): boolean {
  return valid.some((p) => Math.abs(p - quoted) < 0.5);
}

/** Render `n` in the same digit script as the quoted token (Arabic-Indic vs Western), with
 *  trailing .00 trimmed so «٣٢٠.٠٠» never appears. */
function renderPrice(n: number, arabicScript: boolean): string {
  let s = (Math.round(n * 100) / 100).toString();
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return arabicScript ? toArabicDigits(s) : s;
}

/**
 * Verify + repair item→price pairs in `text`. Returns the (possibly repaired) text plus the
 * repairs applied and the ambiguous/multi-price binds skipped (both carry {item, quoted,
 * real}). Pure; the caller gates on the flag + !usedMoneyTool and emits the signals.
 */
export function repairPriceTruth(text: string, currency: string, items: MenuItem[]): PriceGuardResult {
  const repairs: PriceBinding[] = [];
  const skipped: PriceBinding[] = [];
  if (!text || !text.trim()) return { text, repairs, skipped };

  const priced = itemValidPrices(items);
  if (!priced.length) return { text, repairs, skipped };

  const west = toWesternDigits(text); // indices align 1:1 with `text`
  const curTok = curTokSource(currency);
  // amount = a digit run adjacent to a currency token (number before OR after the token).
  const amountRe = new RegExp(`(${DIGITS})\\s*${curTok}|${curTok}\\s*(${DIGITS})`, "giu");
  const names = priced.map((p) => ({ p, re: nameRegex(p.name) }));

  // Collect repair edits as [start,end,replacement] on the ORIGINAL string; apply last→first.
  const edits: { start: number; end: number; repl: string }[] = [];

  for (const { p, re } of names) {
    re.lastIndex = 0;
    let nm: RegExpExecArray | null;
    while ((nm = re.exec(text))) {
      const nameEnd = nm.index + nm[0].length;
      if (re.lastIndex === nm.index) re.lastIndex++; // zero-width guard
      // Bind within the SAME LINE only.
      const nl = text.indexOf("\n", nameEnd);
      const lineEnd = nl === -1 ? text.length : nl;
      // First currency-adjacent amount after the name on this line (search the west copy).
      amountRe.lastIndex = nameEnd;
      const am = amountRe.exec(west);
      if (!am || am.index >= lineEnd) continue; // no price bound to this item on its line

      const numStr = am[1] ?? am[2] ?? "";
      // Absolute span of the numeric token within the full match.
      const numLocal = am[0].indexOf(numStr);
      const numStart = am.index + numLocal;
      const numEnd = numStart + numStr.length;
      const quoted = parseFloat(toWesternDigits(numStr).replace(",", "."));
      if (!Number.isFinite(quoted)) continue;

      // Ambiguity: another item name sitting between this name and the bound amount → skip.
      const between = text.slice(nameEnd, numStart);
      const ambiguous = names.some(
        (o) => o.p.name !== p.name && new RegExp(o.re.source, "u").test(between)
      );
      if (ambiguous) {
        skipped.push({ item: p.name, quoted, real: p.valid[0], validPrices: p.valid, reason: "skipped_ambiguous_bind" });
        continue;
      }

      if (matchesAnyValid(quoted, p.valid)) continue; // honest quote — leave it

      if (p.valid.length === 1) {
        const real = p.valid[0];
        // Detect the script from the ORIGINAL token (numStr came from the west-normalized
        // copy, so it is always Western) — so a repaired «١٥٠» is rewritten «٣٢٠», not «320».
        const arabicScript = /[٠-٩۰-۹]/.test(text.slice(numStart, numEnd));
        edits.push({ start: numStart, end: numEnd, repl: renderPrice(real, arabicScript) });
        repairs.push({ item: p.name, quoted, real, validPrices: p.valid, reason: "repaired" });
      } else {
        // Multi-price item, matches no valid price → likely a wrong figure but the correct one
        // is ambiguous (which variant?). Log, never repair (PM ruling 1).
        skipped.push({ item: p.name, quoted, real: p.valid[0], validPrices: p.valid, reason: "skipped_multi_price" });
      }
    }
  }

  if (!edits.length) return { text, repairs, skipped };
  // Apply right→left so earlier indices remain valid across length changes.
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.repl + out.slice(e.end);
  return { text: out, repairs, skipped };
}
