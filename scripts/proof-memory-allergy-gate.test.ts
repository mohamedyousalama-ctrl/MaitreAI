// ============================================================================
// WO-MEMGATE proof — memory-stored allergies arm the deterministic gate.
//
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/proof-memory-allergy-gate.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import type { MenuItem } from "../lib/types.ts";
import type { OrderDraft } from "../lib/ai/tools.ts";
import { isFeatureExplicitlyEnabled } from "../lib/tenant/tier.ts";
import {
  detectMemoryAllergyDraftIntersection,
  extractMemoryAllergyLabels,
} from "../lib/ai/memory-allergy-gate.ts";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) {
    pass++;
    return;
  }
  fail++;
  console.error("  ✗", name);
};

function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "item-1",
    name: "فيليه سوبريم",
    category: "ساندويتشات",
    price: 130,
    available: true,
    description: "",
    imageUrl: "",
    modifierIds: [],
    ingredients: [],
    allergens: [],
    ...overrides,
  } as MenuItem;
}

function draft(itemId = "item-1", name = "فيليه سوبريم"): OrderDraft {
  return {
    lines: [{
      itemId,
      name,
      quantity: 1,
      unitPrice: 130,
      choices: [],
      modifiers: [],
      lineTotal: 130,
    }],
    fulfillment: "pickup",
    deliveryZone: null,
    address: null,
    deliveryFee: 0,
    subtotal: 130,
    tax: 0,
    taxRate: 0,
    total: 130,
    currency: "ج.م",
    paymentMethod: null,
    finalized: false,
  };
}

const inferredEgg = { allergy_notes: ["بيض"] };
const inferredNote = { allergy_notes: ["⚠️ حساسية: بيض، مكسرات"] };

// A — extraction from stored memory labels/notes.
ok("A1: memory label «بيض» extracts as egg label",
  JSON.stringify(extractMemoryAllergyLabels(inferredEgg)) === JSON.stringify(["بيض"]));
ok("A2: kitchen-readable memory note extracts both allergens",
  JSON.stringify(extractMemoryAllergyLabels(inferredNote)) === JSON.stringify(["بيض", "مكسرات"]));
ok("A3: generic allergy memory without a named allergen does not arm a dish intersection",
  extractMemoryAllergyLabels({ allergy_notes: ["حساسية"] }).length === 0);

// B — pure intersection behavior: stored memory allergy × current draft item data.
{
  const hit = detectMemoryAllergyDraftIntersection({
    memoryAllergens: ["بيض"],
    draft: draft(),
    menuItems: [item({ allergens: ["بيض"], allergensReviewedAt: "2026-07-19T00:00:00Z" })],
  });
  ok("B1: memory-only egg + egg item → fires", hit.fired && hit.term === "بيض");
  ok("B2: positive hit carries the draft item name", hit.itemNames.includes("فيليه سوبريم"));
  ok("B3: positive hit is a contains-state match", hit.matches[0]?.state === "contains");
}
{
  const hit = detectMemoryAllergyDraftIntersection({
    memoryAllergens: ["بيض"],
    draft: draft(),
    menuItems: [item({
      name: "بطاطس",
      ingredients: ["بطاطس", "ملح"],
      allergens: [],
      allergensReviewedAt: "2026-07-19T00:00:00Z",
      prepStatus: "controlled",
      prepVerifiedAt: "2026-07-19T00:00:00Z",
    })],
  });
  ok("B4: memory egg + verified safe item → no hold", hit.fired === false);
}
{
  const hit = detectMemoryAllergyDraftIntersection({
    memoryAllergens: ["بيض"],
    draft: draft(),
    menuItems: [item({ name: "صنف غير موثق", allergens: [], ingredients: [] })],
  });
  ok("B5: memory egg + unknown item data → no intersection hold", hit.fired === false);
}
{
  const hit = detectMemoryAllergyDraftIntersection({
    memoryAllergens: ["بيض"],
    draft: draft(),
    menuItems: [item({ crossContactRisks: ["بيض"] })],
  });
  ok("B6: memory egg + egg cross-contact risk → fires", hit.fired && hit.matches[0]?.state === "escalation_required");
}
{
  const hit = detectMemoryAllergyDraftIntersection({
    memoryAllergens: ["بيض"],
    draft: draft(),
    menuItems: [item({ allergens: ["egg"] })],
  });
  ok("B7: canonical item allergen key still intersects Arabic memory label", hit.fired);
}
{
  const hit = detectMemoryAllergyDraftIntersection({
    memoryAllergens: ["بيض"],
    draft: { ...draft(), lines: [] },
    menuItems: [item({ allergens: ["بيض"] })],
  });
  ok("B8: no current draft item → no memory gate fire", hit.fired === false);
}

// C — source wiring invariants in customer-turn.ts.
{
  const ct = readFileSync("lib/ai/customer-turn.ts", "utf8");
  const tier = readFileSync("lib/tenant/tier.ts", "utf8");
  ok("C1: memory_allergy_gate is registered as a tenant flag",
    /memory_allergy_gate/.test(tier) && isFeatureExplicitlyEnabled("memory_allergy_gate", {}) === false);
  ok("C2: flag OFF never reads customer_memory",
    /if \(memoryAllergyGateOn && conversationCustomerId\) \{[\s\S]*?\.from\("customer_memory"\)/.test(ct));
  ok("C3: memory hit is evaluated only after spoken/symptom/phonetic did not fire (single-fire de-dup)",
    /!allergenHit\.fired && !symptomHit\.fired && !phoneticHit\.fired && memoryAllergyGateOn/.test(ct));
  ok("C4: memoryAllergyHit joins the same combinedAllergenHit input",
    /const combinedAllergenHit =[\s\S]*memoryAllergyHit/.test(ct));
  ok("C5: calm hold source can record memory_allergy_gate",
    /type CalmHoldSource = [^\n]*"memory_allergy_gate"/.test(ct));
}

console.log(`\nMEMORY-ALLERGY-GATE PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
