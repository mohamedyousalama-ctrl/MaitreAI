// Regression tests for recomputeOrderPricing — the authoritative money calculator
// (storefront checkout + WhatsApp Brain). Pins CURRENT correct behavior so any
// future change that alters a customer total fails here. Pure function, no DB.
// Run: node --conditions=react-server --experimental-strip-types scripts/test-order-pricing.test.ts
//   (--conditions=react-server resolves the `server-only` import to its no-op.)
import { recomputeOrderPricing, money } from "../lib/order-pricing.ts";
import type { MenuItem, Modifier, DeliveryArea } from "../lib/types.ts";

let pass = 0, fail = 0;
const eq = (n: string, actual: unknown, expected: unknown) => {
  if (actual === expected) pass++;
  else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
};
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const throws = (n: string, fn: () => unknown, includes: string) => {
  try { fn(); fail++; console.log(`  ❌ ${n}: expected throw containing "${includes}", got none`); }
  catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes(includes)) pass++;
    else { fail++; console.log(`  ❌ ${n}: threw "${m}", expected to contain "${includes}"`); }
  }
};

// ── fixtures ────────────────────────────────────────────────────────────────
const item = (over: Partial<MenuItem> & { id: string; name: string; price: number }): MenuItem => ({
  category: "c", available: true, description: "", imageUrl: "",
  modifierIds: [], ingredients: [], allergens: [], variants: [], choiceGroups: [],
  ...over,
});
const burger = item({ id: "burger", name: "برجر", price: 100, modifierIds: ["cheese"] });
const fries = item({ id: "fries", name: "بطاطس", price: 50 });
const water = item({ id: "water", name: "مياه", price: 10 });
const soldout = item({ id: "soldout", name: "ناقص", price: 10, available: false });
const pizza = item({ id: "pizza", name: "بيتزا", price: 80, variants: [
  { id: "v_l", name: "كبير", price: 120, sort: 0, active: true },
] });
const combo = item({ id: "combo", name: "كومبو", price: 60, choiceGroups: [
  { id: "g1", name: "حجم", minSelect: 1, maxSelect: 1, sort: 0, options: [
    { id: "o_s", label: "صغير", priceDelta: 0, sort: 0, active: true },
    { id: "o_l", label: "كبير", priceDelta: 25, sort: 1, active: true },
  ] },
] });
const cheese: Modifier = { id: "cheese", name: "جبنة", priceImpact: 15, category: "", active: true };
const penny = item({ id: "penny", name: "قرش", price: 0.1, modifierIds: ["m2"] });
const m2: Modifier = { id: "m2", name: "إضافة", priceImpact: 0.2, category: "", active: true };
const zone: DeliveryArea = { id: "z1", name: "المعادي", deliveryFee: 30, minOrder: 50, estimatedTime: "", active: true };

const MENU = [burger, fries, water, soldout, pizza, combo, penny];
const MODS = [cheese, m2];
const ZONES = [zone];

type Over = Partial<Parameters<typeof recomputeOrderPricing>[0]>;
const run = (over: Over) => recomputeOrderPricing({
  menuItems: MENU, modifiers: MODS, deliveryAreas: ZONES,
  lines: [], fulfillment: "pickup", currency: "ج.م", ...over,
});

// ── 1. money() rounding rule (Math.round(n*100)/100) — pin float quirks ───────
eq("money 1.005 → 1 (float quirk, NOT 1.01)", money(1.005), 1);
eq("money 2.675 → 2.68 (pinned actual float behavior)", money(2.675), 2.68);
eq("money 10/3 → 3.33", money(10 / 3), 3.33);
eq("money 0.1+0.2 → 0.3", money(0.1 + 0.2), 0.3);
eq("money negative-zero/empty → 0", money(undefined as unknown as number), 0);

// ── 2. single item, pickup, no tax ────────────────────────────────────────────
{
  const r = run({ lines: [{ itemId: "burger" }] });
  eq("single: subtotal", r.subtotal, 100);
  eq("single: deliveryFee", r.deliveryFee, 0);
  eq("single: total", r.total, 100);
  eq("single: qty defaulted to 1", r.lines[0].quantity, 1);
}

// ── 3. multiple items + quantities ────────────────────────────────────────────
{
  const r = run({ lines: [{ itemId: "burger", quantity: 2 }, { itemId: "fries", quantity: 3 }] });
  eq("multi: subtotal 2*100+3*50", r.subtotal, 350);
  eq("multi: total", r.total, 350);
}

// ── 4. variant replaces base price ────────────────────────────────────────────
{
  const r = run({ lines: [{ itemId: "pizza", variantName: "كبير" }] });
  eq("variant: unitPrice = variant price", r.lines[0].unitPrice, 120);
  eq("variant: total", r.total, 120);
}

// ── 5. modifier (add-on) adds to unit price ───────────────────────────────────
{
  const r = run({ lines: [{ itemId: "burger", modifierIds: ["cheese"] }] });
  eq("modifier: unitPrice 100+15", r.lines[0].unitPrice, 115);
  eq("modifier: total", r.total, 115);
}

// ── 6. choice option priceDelta adds to unit price ────────────────────────────
{
  const r = run({ lines: [{ itemId: "combo", choices: [{ groupName: "حجم", label: "كبير" }] }] });
  eq("choice: unitPrice 60+25", r.lines[0].unitPrice, 85);
  eq("choice: total", r.total, 85);
}
{
  const r = run({ lines: [{ itemId: "combo", choices: [{ groupName: "حجم", label: "صغير" }] }] });
  eq("choice zero-delta: unitPrice 60", r.lines[0].unitPrice, 60);
}

// ── 7. delivery fee applied by zone ───────────────────────────────────────────
{
  const r = run({ lines: [{ itemId: "burger" }], fulfillment: "delivery", deliveryZoneId: "z1" });
  eq("delivery: subtotal", r.subtotal, 100);
  eq("delivery: fee = zone fee", r.deliveryFee, 30);
  eq("delivery: total subtotal+fee", r.total, 130);
  eq("delivery: zone resolved", r.deliveryZone?.id, "z1");
}

// ── 8. pickup ignores any zone → no fee ───────────────────────────────────────
{
  const r = run({ lines: [{ itemId: "burger" }], fulfillment: "pickup", deliveryZoneId: "z1" });
  eq("pickup: no fee even with zone id", r.deliveryFee, 0);
  eq("pickup: total no fee", r.total, 100);
  eq("pickup: zone null", r.deliveryZone, null);
}

// ── 9. rounding inside a line (0.1 + 0.2 modifier) ────────────────────────────
{
  const r = run({ lines: [{ itemId: "penny", modifierIds: ["m2"] }] });
  eq("line rounding: unitPrice 0.1+0.2 → 0.3", r.lines[0].unitPrice, 0.3);
  eq("line rounding: lineTotal", r.lines[0].lineTotal, 0.3);
}

// ── 10. quantity clamping (1..99, floor) ──────────────────────────────────────
eq("qty 0 → 1", run({ lines: [{ itemId: "burger", quantity: 0 }] }).lines[0].quantity, 1);
eq("qty 200 → 99", run({ lines: [{ itemId: "burger", quantity: 200 }] }).lines[0].quantity, 99);
eq("qty 2.9 → 2 (floor)", run({ lines: [{ itemId: "burger", quantity: 2.9 }] }).lines[0].quantity, 2);
eq("qty 99-clamp total 100*99", run({ lines: [{ itemId: "burger", quantity: 200 }] }).total, 9900);

// ── 11. tax: "added" mode (tax added on top) ──────────────────────────────────
{
  const r = run({ lines: [{ itemId: "burger" }], taxMode: "added", taxRate: 14 });
  eq("tax added: taxAmount 14% of 100", r.taxAmount, 14);
  eq("tax added: taxRate echoed", r.taxRate, 14);
  eq("tax added: total subtotal+tax", r.total, 114);
}
// WO-VAT-1: delivery is part of the taxable supply → the VAT base is
// subtotal + deliveryFee, so the delivery charge bears the rate too.
{
  const r = run({ lines: [{ itemId: "burger" }], fulfillment: "delivery", deliveryZoneId: "z1", taxMode: "added", taxRate: 14 });
  // base = 100 + 30 = 130; tax = 130 * 14% = 18.2; total = 100 + 30 + 18.2.
  eq("tax added + delivery: taxAmount 14% of (100+30)", r.taxAmount, 18.2);
  eq("tax added + delivery: total 100+30+18.2", r.total, 148.2);
}
// KSA 15%, added, with delivery.
{
  const r = run({ lines: [{ itemId: "burger" }], fulfillment: "delivery", deliveryZoneId: "z1", taxMode: "added", taxRate: 15 });
  eq("KSA 15% added + delivery: taxAmount", r.taxAmount, 19.5); // 130 * 15%
  eq("KSA 15% added + delivery: total", r.total, 149.5);
}

// ── 12. tax: "inclusive" mode (tax NOT added to total; informational only) ─────
{
  const r = run({ lines: [{ itemId: "burger" }], taxMode: "inclusive", taxRate: 14 });
  eq("tax inclusive: taxAmount 100*14/114", r.taxAmount, 12.28);
  eq("tax inclusive: total NOT increased", r.total, 100);
}
// WO-VAT-1: inclusive base also includes delivery; total stays subtotal+delivery.
{
  const r = run({ lines: [{ itemId: "burger" }], fulfillment: "delivery", deliveryZoneId: "z1", taxMode: "inclusive", taxRate: 14 });
  // base = 130; embedded VAT = 130*14/114 = 15.9649… → 15.96 (halala rounding).
  eq("tax inclusive + delivery: taxAmount 130*14/114 rounded", r.taxAmount, 15.96);
  eq("tax inclusive + delivery: total = subtotal+delivery", r.total, 130);
}
// KSA 15%, inclusive, with delivery — rounding at halala precision.
{
  const r = run({ lines: [{ itemId: "burger" }], fulfillment: "delivery", deliveryZoneId: "z1", taxMode: "inclusive", taxRate: 15 });
  // 130*15/115 = 16.9565… → 16.96 (rounds up at the 3rd decimal).
  eq("KSA 15% inclusive + delivery: taxAmount rounded to halala", r.taxAmount, 16.96);
  eq("KSA 15% inclusive + delivery: total unchanged", r.total, 130);
}
// Zero-rate (EG) unaffected — even with delivery, no tax, total = subtotal+fee.
{
  const r = run({ lines: [{ itemId: "burger" }], fulfillment: "delivery", deliveryZoneId: "z1", taxRate: 0 });
  eq("tax rate 0 + delivery: taxAmount 0", r.taxAmount, 0);
  eq("tax rate 0 + delivery: total = subtotal+fee only", r.total, 130);
}
{
  const r = run({ lines: [{ itemId: "burger" }], taxRate: 0 });
  eq("tax rate 0: taxAmount 0", r.taxAmount, 0);
  eq("tax rate 0: total unchanged", r.total, 100);
}

// ── 13. empty order ───────────────────────────────────────────────────────────
{
  const r = run({ lines: [] });
  eq("empty: subtotal 0", r.subtotal, 0);
  eq("empty: total 0", r.total, 0);
  eq("empty: fee 0", r.deliveryFee, 0);
}

// ── 14. money ≥ 0 invariant across representative cases ───────────────────────
{
  const cases = [
    run({ lines: [{ itemId: "burger", quantity: 2 }, { itemId: "fries" }] }),
    run({ lines: [{ itemId: "burger" }], fulfillment: "delivery", deliveryZoneId: "z1", taxMode: "added", taxRate: 14 }),
    run({ lines: [{ itemId: "combo", choices: [{ groupName: "حجم", label: "كبير" }] }] }),
  ];
  ok("invariant: all subtotals ≥ 0", cases.every((c) => c.subtotal >= 0));
  ok("invariant: all fees ≥ 0", cases.every((c) => c.deliveryFee >= 0));
  ok("invariant: all taxAmounts ≥ 0", cases.every((c) => c.taxAmount >= 0));
  ok("invariant: all totals ≥ 0", cases.every((c) => c.total >= 0));
}

// ── 15. error branches (characterize current throw behavior) ──────────────────
throws("unavailable item throws", () => run({ lines: [{ itemId: "soldout" }] }), "menu_item_unavailable");
throws("missing item throws", () => run({ lines: [{ itemId: "ghost" }] }), "menu_item_missing");
throws("variant required throws", () => run({ lines: [{ itemId: "pizza" }] }), "variant_required");
throws("choice count invalid (0 of min 1) throws", () => run({ lines: [{ itemId: "combo" }] }), "choice_count_invalid");
throws("modifier invalid name throws", () => run({ lines: [{ itemId: "burger", modifierNames: ["لا يوجد"] }] }), "modifier_invalid");
throws("delivery min order not met throws", () => run({ lines: [{ itemId: "water" }], fulfillment: "delivery", deliveryZoneId: "z1" }), "delivery_min_order");
throws("delivery unknown zone throws", () => run({ lines: [{ itemId: "burger" }], fulfillment: "delivery", deliveryZoneId: "nope" }), "delivery_zone_invalid");

console.log(`\nORDER-PRICING UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
