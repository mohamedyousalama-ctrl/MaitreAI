// ============================================================================
// WO-DATA-HONESTY-1 — red-first proof for the three 🟡 fixes.
//   FIX 1 (FR-022) price-0 rejected in the change-request validator.
//   FIX 2 (FR-024) top-spenders excludes 0-order customers.
//   FIX 3 (FR-020) native <select> option lists themed dark (source assertion).
// Run: node --experimental-strip-types scripts/proof-data-honesty-1.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildPatch } from "../lib/knowledge/change-request.ts";
import { computeCustomerAggregates } from "../lib/customers/aggregates.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// --- FIX 1 (FR-022): a non-positive menu price is rejected ---------------------
check("price 0 is REJECTED (no free item can reach the live menu)", buildPatch("menu_item", "price", 0).ok === false);
check("price -50 is still rejected", buildPatch("menu_item", "price", -50).ok === false);
const p1 = buildPatch("menu_item", "price", 1);
check("price 1 is accepted (coerced to 1)", p1.ok === true && p1.ok && (p1.patch as { price: number }).price === 1);
check("price 10,000,001 is still rejected (upper bound intact)", buildPatch("menu_item", "price", 10_000_001).ok === false);
check("price 'abc' is still rejected (non-number)", buildPatch("menu_item", "price", "abc").ok === false);
// 600-char description cap untouched (correct-by-design).
check("description of 600 chars still accepted (cap untouched)", buildPatch("menu_item", "description", "x".repeat(600)).ok === true);
check("description of 601 chars still rejected (cap untouched)", buildPatch("menu_item", "description", "x".repeat(601)).ok === false);

// --- FIX 2 (FR-024): top-spenders lists only real customers --------------------
const roster = [
  { id: "A", name: "A", phone: "1", ltv: 1000, orders_count: 5, last_seen_at: null },
  { id: "B", name: "B", phone: "2", ltv: 999, orders_count: 0, last_seen_at: null }, // high ltv, ZERO orders
  { id: "C", name: "C", phone: "3", ltv: 500, orders_count: 2, last_seen_at: null },
  { id: "D", name: "D", phone: "4", ltv: 0, orders_count: 0, last_seen_at: null },
] as never[];
const agg = computeCustomerAggregates(roster, { nowMs: 0 });
const topIds = agg.topBySpend.map((r) => r.id);
check("topBySpend contains ONLY customers with orders_count >= 1", agg.topBySpend.every((r) => r.orders_count >= 1));
check("a 0-order customer (even high-ltv 'B') never appears", !topIds.includes("B") && !topIds.includes("D"));
check("ranking among REAL spenders unchanged (A before C by ltv)", topIds[0] === "A" && topIds[1] === "C" && topIds.length === 2);

// --- FIX 3 (FR-020): native <select> option lists themed dark ------------------
const css = read("app/globals.css");
check("(css) systemic rule: .kvx select forces a dark colour-scheme", /\.kvx select\s*\{[^}]*color-scheme:\s*dark/i.test(css));
check("(css) systemic rule: .kvx option carries an explicit dark bg + light text",
  /\.kvx select option[\s\S]{0,80}background-color:\s*#141924[\s\S]{0,40}color:\s*#f2f5f9/i.test(css));

const editor = read("components/console-v2/AllergyAxisEditor.tsx");
check("(editor) a themed selectStyle (opaque dark bg + colorScheme) exists", /const selectStyle[^\n]*background:\s*"#141924"[^\n]*colorScheme:\s*"dark"/.test(editor));
check("(editor) an optionStyle (dark bg + light text) exists", /const optionStyle[^\n]*backgroundColor:\s*"#141924"[^\n]*color:\s*"#f2f5f9"/.test(editor));
check("(editor) BOTH selects use selectStyle (prep-status + isolate)", (editor.match(/style=\{selectStyle\}/g) ?? []).length === 2);
check("(editor) BOTH selects' options use optionStyle", (editor.match(/style=\{optionStyle\}/g) ?? []).length === 2);

console.log(`\nDATA-HONESTY-1 PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
