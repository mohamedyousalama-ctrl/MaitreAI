// ============================================================================
// Proof: restaurants.tax_mode can never silently mean the wrong thing.
//
// `PricingTaxMode` was declared `"inclusive" | "added" | string`, which TypeScript
// collapses to plain `string`, so the union enforced nothing and every DB read flowed
// in unchecked. `computeTax` adds VAT only on an exact `=== "added"` match, so ANY
// unrecognised value silently meant "prices already include tax" — on a KSA tenant
// charging 15% on top, that is Khalid stating a price includes VAT when it does not.
//
// Three layers are pinned here:
//   1. the narrowing gate itself (pure),
//   2. every DB read going through it rather than through a bare String(...),
//   3. migration 0122's CHECK constraints existing in the repo.
//
// Run: node --experimental-strip-types scripts/proof-tax-mode-integrity.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { asPricingTaxMode } from "../lib/pricing-tax-mode.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  FAIL", name); }
};
const eq = (name: string, actual: unknown, expected: unknown) =>
  ok(`${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`, actual === expected);

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

// ── 1. the narrowing gate ────────────────────────────────────────────────────
eq("'added' passes through", asPricingTaxMode("added"), "added");
eq("'inclusive' passes through", asPricingTaxMode("inclusive"), "inclusive");
eq("a typo falls back to inclusive", asPricingTaxMode("Added"), "inclusive");
eq("an unknown mode falls back to inclusive", asPricingTaxMode("exclusive"), "inclusive");
eq("null falls back to inclusive", asPricingTaxMode(null), "inclusive");
eq("undefined falls back to inclusive", asPricingTaxMode(undefined), "inclusive");
eq("a number falls back to inclusive", asPricingTaxMode(15), "inclusive");

// The fallback is unchanged but must no longer be SILENT: a real wrong value logs.
{
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    asPricingTaxMode("exclusive");
    asPricingTaxMode(null);       // absent, not wrong — must stay quiet
    asPricingTaxMode(undefined);  // absent, not wrong — must stay quiet
    asPricingTaxMode("");         // absent, not wrong — must stay quiet
  } finally {
    console.error = original;
  }
  eq("a wrong tax_mode is logged exactly once", errors.length, 1);
}

// ── 2. the union is real, and every DB read is narrowed ──────────────────────
{
  const pure = read("lib/pricing-tax-mode.ts");
  ok("PricingTaxMode is a closed union (no `| string` escape hatch)",
    /export type PricingTaxMode = "inclusive" \| "added";/.test(pure) && !/PricingTaxMode[^\n]*\| string/.test(pure));

  // The one place that must NOT import it from the server-only module: lib/db/brain.ts
  // is reachable from the console's client stores (lib/order-store.ts → lib/store.ts →
  // lib/db/brain.ts), and a value import of `server-only` from that chain throws at
  // bundle time. That is why lib/pricing-tax-mode.ts exists at all.
  const brain = read("lib/db/brain.ts");
  ok("brain.ts imports the narrowing from the PURE module, never from order-pricing",
    brain.includes('from "@/lib/pricing-tax-mode"') && !/import \{[^}]*\} from "@\/lib\/order-pricing"/.test(brain));

  const readers = [
    "lib/db/brain.ts",
    "lib/ai/customer-turn.ts",
    "lib/messaging/typed-actions.ts",
    "app/api/agent/suggest/route.ts",
  ];
  for (const path of readers) {
    const src = read(path);
    ok(`${path}: no bare String(tax_mode ?? "inclusive") read survives`,
      !/String\([^)]*\.tax_mode \?\? "inclusive"\)/.test(src));
    ok(`${path}: narrows tax_mode through asPricingTaxMode`,
      /asPricingTaxMode\(.*\.tax_mode\)/.test(src));
  }
}

// ── 3. the database refuses a wrong value at rest ────────────────────────────
{
  const sql = read("supabase/migrations/0122_restaurant_dialect_tax_mode_checks.sql");
  ok("0122 constrains tax_mode to the two real modes",
    /restaurants_tax_mode_valid/.test(sql) && /'inclusive'::text, 'added'::text/.test(sql));
  // dialect fails to a wrong-but-plausible default the same way: DEFAULT 'egyptian',
  // while lib/ai/dialect.ts `dialectProfile()` falls back to `saudi` for an unknown
  // value — so a typo splits the agent into an Egyptian prompt with Saudi digits.
  ok("0122 constrains dialect to the two real dialects",
    /restaurants_dialect_valid/.test(sql) && /'saudi'::text, 'egyptian'::text/.test(sql));
  ok("0122 is re-runnable (drops before adding)",
    (sql.match(/drop constraint if exists/g) ?? []).length === 2);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} tax-mode-integrity: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
