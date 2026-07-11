// ============================================================================
// WO-COMPANION-W2 — two-axis coverage meter unit suite. RED-FIRST: imports the W2
// coverage helper absent on main. Proves the «٨ من ١٨» counts + labels for both axes.
//
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-companion-coverage.test.ts
// ============================================================================

import { computeAllergyCoverage, coverageLabelsAr } from "../lib/onboarding/allergy-coverage.ts";
import type { MenuItem } from "../lib/types.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

function item(over: Partial<MenuItem> = {}): MenuItem {
  return { id: Math.random().toString(36), name: "x", category: "c", price: 1, available: true, description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [], ...over } as MenuItem;
}

const items: MenuItem[] = [
  item({ allergensReviewedAt: "t", prepVerifiedAt: "t" }),   // both
  item({ allergensReviewedAt: "t" }),                        // ingredient only
  item({ prepVerifiedAt: "t" }),                             // prep only
  item({}),                                                  // neither
  item({ available: false, allergensReviewedAt: "t", prepVerifiedAt: "t" }), // excluded (86)
];

const c = computeAllergyCoverage(items);
ok("coverage: excludes 86'd items from total", c.total === 4);
ok("coverage: ingredient-verified count", c.ingredientVerified === 2);
ok("coverage: prep-verified count", c.prepVerified === 2);
ok("coverage: both-verified count", c.bothVerified === 1);

const labels = coverageLabelsAr({ total: 18, ingredientVerified: 8, prepVerified: 5, bothVerified: 4 });
ok("labels: ingredient «٨ من ١٨ صنف مؤكّدة المكونات»", labels.ingredient === "٨ من ١٨ صنف مؤكّدة المكونات");
ok("labels: prep «٥ من ١٨ صنف مؤكّدة التحضير»", labels.prep === "٥ من ١٨ صنف مؤكّدة التحضير");

// Empty menu → zeros, no crash.
const z = computeAllergyCoverage([]);
ok("coverage: empty menu → all zero", z.total === 0 && z.ingredientVerified === 0 && z.bothVerified === 0);

console.log(`\nCOMPANION-COVERAGE UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
