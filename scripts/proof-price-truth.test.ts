// WO-LIVE6-PRICE-TRUTH — RED-FIRST: the model may quote a real menu price for the WRONG
// item, and the number-level money guard (fabricatesMoney) is BLIND to it — «عرض كاديا —
// ١٥٠ ج.م» passes because ١٥٠ IS a real price for OTHER items (سوبر وصاية / عرض ميجا ميل),
// even though عرض كاديا really costs ٣٢٠. Live (conv c016a121, وصاية, 19:57:57): Karim listed
// three offers all at ١٥٠; the customer ordered ٣× عرض كاديا believing ١٥٠ each. Fix:
// repairPriceTruth extracts each item→price PAIR and repairs a mis-attributed single-valid-
// price figure in place (١٥٠→٣٢٠), never blocks; multi-price items are logged, never repaired.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-price-truth.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import { repairPriceTruth } from "../lib/ai/price-truth.ts";
import { fabricatesMoney, knownMenuPrices } from "../lib/ai/money-guard.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// وصاية menu fixture (real menu_items prices).
const ITEMS = [
  { id: "1", name: "عرض كاديا", price: 320, variants: [] },
  { id: "2", name: "عرض ميجا ميل", price: 150, variants: [] },
  { id: "3", name: "سوبر وصاية", price: 150, variants: [] },
  { id: "4", name: "بيتزا ببروني", price: 180, variants: [
    { id: "v1", name: "وسط", price: 180, sort: 0, active: true },
    { id: "v2", name: "كبير", price: 220, sort: 1, active: true },
  ] },
] as unknown as import("../lib/types.ts").MenuItem[];

// The LIVE 19:57:57 reply, verbatim.
const LIVE =
  "في حدود ١٥٠ ج.م عندك خيارات كويسة:\n\n" +
  "- **عرض كاديا** — ١٥٠ ج.م (٦ قطع بروست + كول سلو + أرز + بطاطس + صوص باربكيو + عيش) 🔥\n" +
  "- **عرض ميجا ميل** — ١٥٠ ج.م (ريزو عائلي + ٢ قطعة دجاج + عيش)\n" +
  "- **سوبر وصاية** — ١٥٠ ج.م (٢ قطعة بروست + ٢ ستربس + كول سلو)\n\n" +
  "الثلاثة بنفس السعر تماماً — تحب أي واحد منهم؟ 😊";

// ── A — THE GAP (red witness): the existing number-level guard is blind to the mis-pairing ──
const known = knownMenuPrices({ menuItems: ITEMS, modifiers: [], deliveryAreas: [], activePromotions: [] } as never);
ok("A: fabricatesMoney does NOT catch «عرض كاديا — ١٥٠» — ١٥٠ IS a real price (the blind spot)",
  fabricatesMoney(LIVE, "ج.م", known) === false);

// ── B — THE FIX: the pair guard repairs كاديا ١٥٠→٣٢٠ and leaves the two honest ١٥٠s ──────
{
  const r = repairPriceTruth(LIVE, "ج.م", ITEMS);
  const kadia = r.repairs.find((x) => x.item === "عرض كاديا");
  ok("B: عرض كاديا is repaired ١٥٠ → ٣٢٠", !!kadia && kadia.quoted === 150 && kadia.real === 320);
  ok("B: exactly ONE repair (only the mis-attributed item)", r.repairs.length === 1);
  ok("B: the repaired text now reads «عرض كاديا … ٣٢٠» in Arabic-Indic script", /عرض كاديا[^\n]*٣٢٠/.test(r.text));
  ok("B: عرض ميجا ميل ١٥٠ is UNTOUCHED (genuinely ١٥٠)", /عرض ميجا ميل[^\n]*١٥٠/.test(r.text));
  ok("B: سوبر وصاية ١٥٠ is UNTOUCHED (genuinely ١٥٠)", /سوبر وصاية[^\n]*١٥٠/.test(r.text));
  ok("B: no honest ١٥٠ was flagged (only كاديا repaired, nothing skipped)", r.skipped.length === 0);
}

// ── C — a multi-price item is LOGGED, never repaired (PM ruling 1) ───────────────────────
{
  const r = repairPriceTruth("بيتزا ببروني — ٩٩ ج.م", "ج.م", ITEMS);
  ok("C: بيتزا ببروني @٩٩ (no valid price) → NOT repaired (variant ambiguity)", r.repairs.length === 0);
  ok("C: … it is LOGGED as skipped_multi_price with {item, quoted, real}",
    r.skipped.length === 1 && r.skipped[0].reason === "skipped_multi_price" &&
    r.skipped[0].item === "بيتزا ببروني" && r.skipped[0].quoted === 99);
}
{
  const r = repairPriceTruth("بيتزا ببروني وسط — ١٨٠ ج.م، وكبير — ٢٢٠ ج.م", "ج.م", ITEMS);
  ok("C: a LEGIT variant quote (١٨٠ / ٢٢٠ both valid) → nothing repaired, nothing skipped",
    r.repairs.length === 0 && r.skipped.length === 0);
}

// ── D — a correct single-price quote is untouched; Western digits repair in Western ──────
ok("D: a CORRECT quote «عرض كاديا — ٣٢٠ ج.م» is left exactly as-is",
  repairPriceTruth("عرض كاديا — ٣٢٠ ج.م", "ج.م", ITEMS).repairs.length === 0);
{
  const r = repairPriceTruth("عرض كاديا - 150 ج.م", "ج.م", ITEMS);
  ok("D: a Western-digit mis-quote repairs in Western script (150 → 320)",
    r.repairs.length === 1 && /عرض كاديا[^\n]*320/.test(r.text) && !/٣٢٠/.test(r.text));
}
ok("D: empty / priceless prose → no-op", repairPriceTruth("تحب تطلب إيه؟ 😊", "ج.م", ITEMS).repairs.length === 0);

// ── E — source wiring: the guard runs before fabricatesMoney, flag+tool gated, emits signals ─
const rs = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
const ct = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
const fl = readFileSync(resolve(process.cwd(), "lib/tenant/tier.ts"), "utf8");
ok("E: respond.ts runs repairPriceTruth gated on the flag AND no money tool ran",
  /if \(input\.brain\.priceTruthGuard && text\.trim\(\) && !usedMoneyTool\)\s*\{[\s\S]{0,200}?repairPriceTruth\(text, currency, input\.brain\.menuItems\)/.test(rs));
ok("E: the pair repair runs BEFORE the number-level fabricatesMoney block",
  rs.indexOf("repairPriceTruth(text, currency") < rs.indexOf("fabricatesMoney(text, currency, knownPrices)") &&
  rs.indexOf("repairPriceTruth(text, currency") > 0);
ok("E: every repair AND every skip emits a money_mismatch signal {item, quoted, real}",
  /price_repaired[\s\S]{0,120}?item: r\.item, quoted: r\.quoted, real: r\.real/.test(rs) &&
  /price_repair_skipped[\s\S]{0,160}?item: s\.item, quoted: s\.quoted, real: s\.real/.test(rs));
ok("E: customer-turn sets priceTruthGuard from the price_truth_guard flag (default OFF)",
  /priceTruthGuard: isFeatureExplicitlyEnabled\("price_truth_guard", tenantFeatures\)/.test(ct));
ok("E: the flag is registered in the ProFeature union",
  /"price_truth_guard"/.test(fl));

console.log(`\n${fail === 0 ? "✅" : "❌"} price-truth: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
