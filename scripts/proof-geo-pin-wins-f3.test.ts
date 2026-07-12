// WO-LIVE4-F3 — RED-FIRST: a routed delivery PIN's zone must WIN over the typed area
// name. Live #1004 (conv 1c551e6d): the customer's pin fell inside the geo zone
// «الجيزه كلها» (fee 30), but the order priced the text-only look-alike zone «العشرين»
// (fee 41) — the money engine resolved the zone by the model-supplied NAME and ignored
// the pin's geometry. Fix: recomputeOrderPricing gives a present deliveryPin precedence
// over deliveryZoneName/Id (money law intact — the fee is still copied off the pinned
// zone's row). A pin-less input prices EXACTLY as before → flag-off byte-identical.
// Run: node --conditions=react-server --experimental-strip-types scripts/proof-geo-pin-wins-f3.test.ts
//   (--conditions=react-server resolves the `server-only` import to its no-op.)
import { recomputeOrderPricing } from "../lib/order-pricing.ts";
import type { MenuItem, Modifier, DeliveryArea, Branch } from "../lib/types.ts";

let pass = 0, fail = 0;
const eq = (n: string, actual: unknown, expected: unknown) => {
  if (actual === expected) pass++;
  else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
};
const throws = (n: string, fn: () => unknown, includes: string) => {
  try { fn(); fail++; console.log(`  ❌ ${n}: expected throw containing "${includes}", got none`); }
  catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes(includes)) pass++;
    else { fail++; console.log(`  ❌ ${n}: threw "${m}", expected to contain "${includes}"`); }
  }
};

// ── fixtures ────────────────────────────────────────────────────────────────
const burger: MenuItem = {
  id: "burger", name: "برجر", price: 100, category: "c", available: true, description: "", imageUrl: "",
  modifierIds: [], ingredients: [], allergens: [], variants: [], choiceGroups: [],
};
const water: MenuItem = {
  id: "water", name: "مياه", price: 10, category: "c", available: true, description: "", imageUrl: "",
  modifierIds: [], ingredients: [], allergens: [], variants: [], choiceGroups: [],
};
const MENU = [burger, water];
const MODS: Modifier[] = [];

// Zone A «الجيزه كلها» — a REAL geo zone (center + radius), fee 30, branch bA.
const zoneGeo: DeliveryArea = {
  id: "zA", name: "الجيزه كلها", branchId: "bA", deliveryFee: 30, minOrder: 50, estimatedTime: "",
  active: true, centerLat: 30.0, centerLng: 31.2, radiusKm: 5,
};
// Zone B «العشرين» — a legacy TEXT-ONLY zone (no geometry), fee 41, branch bB.
const zoneText: DeliveryArea = {
  id: "zB", name: "العشرين", branchId: "bB", deliveryFee: 41, minOrder: 50, estimatedTime: "", active: true,
};
const ZONES = [zoneGeo, zoneText];
const BRANCHES: Branch[] = [
  { id: "bA", name: "فرع أ", address: "", hours: "", whatsappNumber: "", open: true, notes: "", whatsappConnected: true, phone: "", lat: 30.0, lng: 31.2 },
  { id: "bB", name: "فرع ب", address: "", hours: "", whatsappNumber: "", open: true, notes: "", whatsappConnected: true, phone: "", lat: 29.5, lng: 30.5 },
];

const insideGeo = { lat: 30.0, lng: 31.2 };   // dead-centre of zone A
const farOutside = { lat: 31.9, lng: 33.9 };   // outside every zone

type Over = Partial<Parameters<typeof recomputeOrderPricing>[0]>;
const run = (over: Over) => recomputeOrderPricing({
  menuItems: MENU, modifiers: MODS, deliveryAreas: ZONES, branches: BRANCHES,
  lines: [{ itemId: "burger" }], fulfillment: "delivery", currency: "ج.م", ...over,
});

// ── THE FIX (red→green): pin inside A + model typed B → A wins, fee 30 ─────────
{
  const r = run({ deliveryPin: insideGeo, deliveryZoneName: "العشرين" });
  eq("geo-pin-wins: zone resolved to the PINNED zone A (not the typed B)", r.deliveryZone?.id, "zA");
  eq("geo-pin-wins: fee is A's engine fee 30 (money law), NOT the typed B's 41", r.deliveryFee, 30);
  eq("geo-pin-wins: total = 100 + 30", r.total, 130);
  eq("geo-pin-wins: branch is A's branch (routing corrected too)", r.deliveryZone?.branchId, "bA");
}
// deliveryZoneId also loses to the pin (the pin is the source of truth).
{
  const r = run({ deliveryPin: insideGeo, deliveryZoneId: "zB" });
  eq("geo-pin-wins: even an explicit zoneId=B loses to the pin", r.deliveryZone?.id, "zA");
  eq("geo-pin-wins: fee still 30", r.deliveryFee, 30);
}

// ── PIN-LESS byte-identical: no pin → the typed name resolves EXACTLY as before ─
{
  const r = run({ deliveryZoneName: "العشرين" });
  eq("pin-less: typed name B resolves to B (unchanged)", r.deliveryZone?.id, "zB");
  eq("pin-less: fee is B's 41 (name path untouched)", r.deliveryFee, 41);
}
{
  const r = run({ deliveryZoneId: "zB" });
  eq("pin-less: explicit zoneId=B resolves to B (unchanged)", r.deliveryZone?.id, "zB");
  eq("pin-less: fee 41", r.deliveryFee, 41);
}

// ── OUTSIDE pin → no geometric match → fall through to the typed name (no crash) ─
{
  const r = run({ deliveryPin: farOutside, deliveryZoneName: "العشرين" });
  eq("outside pin: falls back to the typed name B", r.deliveryZone?.id, "zB");
  eq("outside pin: fee 41 (name resolution)", r.deliveryFee, 41);
}

// ── MONEY LAW still enforced on the pinned zone: min-order throws gracefully ────
throws("pinned zone min-order still enforced",
  () => run({ lines: [{ itemId: "water" }], deliveryPin: insideGeo, deliveryZoneName: "العشرين" }),
  "delivery_min_order");

// ── PICKUP ignores the pin entirely (no fee, no zone) ─────────────────────────
{
  const r = run({ fulfillment: "pickup", deliveryPin: insideGeo, deliveryZoneName: "العشرين" });
  eq("pickup: no fee even with a pin", r.deliveryFee, 0);
  eq("pickup: zone null", r.deliveryZone, null);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} geo-pin-wins-f3: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
