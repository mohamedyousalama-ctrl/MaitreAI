// WO-ADDR provenance proof: address matching selects a zone; money remains copied
// from the selected zone row by the pricing engine.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-provenance.test.ts
import { recomputeOrderPricing } from "../lib/order-pricing.ts";
import { matchAddressToZones } from "../lib/delivery/address.ts";
import type { Branch, DeliveryArea, MenuItem, Modifier } from "../lib/types.ts";

let pass = 0, fail = 0;
const eq = (name: string, actual: unknown, expected: unknown) => {
  if (actual === expected) pass++;
  else { fail++; console.log(`  ❌ ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
};
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  ❌", name); }
};

const menu: MenuItem[] = [
  {
    id: "meal",
    name: "وجبة اختبار",
    price: 100,
    category: "اختبار",
    available: true,
    description: "",
    imageUrl: "",
    modifierIds: [],
    ingredients: [],
    allergens: [],
    variants: [],
    choiceGroups: [],
  },
];
const modifiers: Modifier[] = [];
const zones: DeliveryArea[] = [
  { id: "catch", name: "الجيزه كلها", deliveryFee: 30, minOrder: 0, estimatedTime: "", active: true },
  { id: "coop", name: "التعاون هرم", deliveryFee: 31, minOrder: 0, estimatedTime: "", active: true },
  { id: "talbeya", name: "الطالبية هرم", deliveryFee: 55, minOrder: 0, estimatedTime: "", active: true },
];
const branches: Branch[] = [];

const match = matchAddressToZones("شارع التعاون هرم", zones);
ok("address matcher produces one zone before pricing", match.kind === "unique");
if (match.kind !== "unique") process.exit(1);

const priced = recomputeOrderPricing({
  menuItems: menu,
  modifiers,
  deliveryAreas: zones,
  branches,
  lines: [{ itemId: "meal", quantity: 1 }],
  fulfillment: "delivery",
  deliveryZoneName: match.zone.name,
  currency: "ج",
});

eq("pricing resolves the same matched zone id", priced.deliveryZone?.id, "coop");
eq("delivery fee comes from matched zone row", priced.deliveryFee, 31);
eq("total is subtotal plus selected zone fee", priced.total, 131);

zones[1] = { ...zones[1], deliveryFee: 44 };
const repriced = recomputeOrderPricing({
  menuItems: menu,
  modifiers,
  deliveryAreas: zones,
  branches,
  lines: [{ itemId: "meal", quantity: 1 }],
  fulfillment: "delivery",
  deliveryZoneName: match.zone.name,
  currency: "ج",
});
eq("changing the zone row changes the fee without address-code math", repriced.deliveryFee, 44);
eq("repriced total follows the zone row", repriced.total, 144);

console.log(`\n${fail === 0 ? "✅" : "❌"} proof-provenance: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
