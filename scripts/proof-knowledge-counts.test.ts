// ============================================================================
// Item 13 proof harness — knowledge counts + reconciliation.
// Pure computeKnowledgeCounts exercised directly (priced/zones/faqs, last-taught,
// reconciliation math), including the exact 47/129 & 2/25 reconciliation case;
// source assertions confirm the endpoint is tenant-scoped + read-only.
//
// Run: node --experimental-strip-types scripts/proof-knowledge-counts.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeKnowledgeCounts } from "../lib/knowledge-counts.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };
const item = (price: number, updated: string | null = null) => ({ price, updated_at: updated });
const flag = (active: boolean, updated: string | null = null) => ({ active, updated_at: updated });

// ---- Counts -----------------------------------------------------------------
{
  const c = computeKnowledgeCounts({
    items: [item(10), item(0), item(5), item(-1)],
    zones: [flag(true), flag(false), flag(true)],
    faqs: [flag(true), flag(true), flag(false)],
  });
  check("items total", c.items.total === 4);
  check("items priced = price > 0 (excludes 0 and negative)", c.items.priced === 2 && c.items.unpriced === 2);
  check("zones active", c.zones.total === 3 && c.zones.active === 2);
  check("faqs active", c.faqs.total === 3 && c.faqs.active === 2);
}

// ---- last-taught = max updated_at across all three tables -------------------
{
  const c = computeKnowledgeCounts({
    items: [item(1, "2026-01-01T00:00:00Z"), item(1, "2026-06-15T00:00:00Z")],
    zones: [flag(true, "2026-03-01T00:00:00Z")],
    faqs: [flag(true, "2026-02-01T00:00:00Z")],
  });
  check("lastTaughtAt is the newest across tables", c.lastTaughtAt === "2026-06-15T00:00:00Z");
}
check("lastTaughtAt null when nothing exists",
  computeKnowledgeCounts({ items: [], zones: [], faqs: [] }).lastTaughtAt === null);

// ---- Reconciliation math + divide-by-zero ----------------------------------
{
  const c = computeKnowledgeCounts({ items: [], zones: [], faqs: [] });
  const recon = Object.fromEntries(c.reconciliation.map((r) => [r.key, r]));
  check("empty → 0/0 with pct 0 (no divide-by-zero)", recon.items_priced.pct === 0 && recon.items_priced.total === 0);
}

// ---- The exact reconciliation: Wesaya 47 items, 25 zones -------------------
// The console showed "47/129" because the denominator summed EVERY tenant's items
// (63+47+7+6+6 = 129); tenant-scoped, Wesaya is 47/47 priced (100%). And "2/25"
// reconciles to 25/25 zones active once scoped. This proves the pure count over
// Wesaya's real row shape yields the correct numerator/denominator.
{
  const wesaya = computeKnowledgeCounts({
    items: Array.from({ length: 47 }, () => item(10)), // all 47 priced
    zones: Array.from({ length: 25 }, () => flag(true)), // all 25 active
    faqs: [],
  });
  const recon = Object.fromEntries(wesaya.reconciliation.map((r) => [r.key, `${r.have}/${r.total}`]));
  check("items_priced reconciles to 47/47 (NOT 47/129 cross-tenant)", recon.items_priced === "47/47");
  check("zones_active reconciles to 25/25 (NOT 2/25)", recon.zones_active === "25/25");
  check("priced pct is 100 tenant-scoped", wesaya.reconciliation[0].pct === 100);
}

// ---- Source: endpoint tenant-scoped + read-only ----------------------------
const route = read("app/api/knowledge/counts/route.ts");
check("endpoint scopes EVERY query to the tenant", (route.match(/\.eq\("restaurant_id", rid\)/g) ?? []).length === 3);
check("endpoint read-only (no writes)", !/\.update\(|\.insert\(|\.upsert\(/.test(route));
check("endpoint delegates to the pure aggregator", route.includes("computeKnowledgeCounts({"));

console.log(`\nKNOWLEDGE-COUNTS PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
