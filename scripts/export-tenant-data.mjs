// ============================================================================
// MaitreAI — Emergency tenant data export (S8) — OPERATOR-RUN SCRIPT, READ-ONLY.
//
// Dumps ONE restaurant's critical data (orders incl. line items, customers, COD
// ledger, menu, conversations/messages) to local JSON + CSV files, for disaster
// recovery / data portability / a pre-migration snapshot.
//
// Reuses the established service-role REST pattern (see scripts/proof-cod-ledger.mjs):
//   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, PostgREST GET only.
// This is NOT an API route — there is no live export endpoint (no new data-egress
// surface). It runs with the service-role key the operator already controls.
//
// SAFETY:
//   • READ-ONLY: issues GET (SELECT) requests only — never writes/mutates the DB.
//   • TENANT-SCOPED: every query is filtered restaurant_id=eq.<id> — one tenant only.
//   • PII: output files contain customer phones + order history. Store securely,
//     and delete when no longer needed. Secrets are never logged or written.
//
// Usage:
//   set -a; . ./.env.local; set +a
//   node scripts/export-tenant-data.mjs <restaurant_id> [output_dir]
// Output: <output_dir>/export-<restaurant_id>-<timestamp>/{<table>.json, <table>.csv, manifest.json}
// ============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The critical tables to export, all tenant-scoped by restaurant_id. orders.items
// is a JSONB snapshot, so order line items come embedded in each orders row.
const TABLES = [
  "orders",
  "customers",
  "cod_collections",
  "cod_settlements",
  "menu_categories",
  "menu_items",
  "menu_item_variants",
  "menu_item_choice_groups",
  "menu_item_choice_options",
  "modifiers",
  "menu_item_modifiers",
  "conversations",
  "messages",
];

function fail(msg, code = 1) { console.error(`✗ ${msg}`); process.exit(code); }

const restaurantId = (process.argv[2] || "").trim();
const outRoot = (process.argv[3] || "exports").trim();

// --- input-control: require a UUID restaurant_id (never default to a tenant) ---
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!restaurantId) fail("Usage: node scripts/export-tenant-data.mjs <restaurant_id> [output_dir]");
if (!UUID_RE.test(restaurantId)) fail(`restaurant_id must be a UUID, got: "${restaurantId}"`);
if (!SB || !SR) fail("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (source .env.local first).");

const H = { apikey: SR, Authorization: `Bearer ${SR}` };

/** Read-only tenant-scoped fetch of one table via PostgREST (GET = SELECT). */
async function fetchTable(table) {
  const url = `${SB}/rest/v1/${table}?restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=*`;
  const res = await fetch(url, { method: "GET", headers: H });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${table}: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`${table}: unexpected response shape`);
  return rows;
}

/** Minimal, safe CSV (RFC-4180 quoting); objects/arrays serialized as JSON. */
function toCsv(rows) {
  if (!rows.length) return "";
  const cols = [...rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set())];
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

async function main() {
  // Validate the tenant exists (read-only) so a typo'd id fails clearly, not silently empty.
  const rRes = await fetch(`${SB}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}&select=id,name,slug`, { method: "GET", headers: H });
  if (!rRes.ok) fail(`restaurant lookup failed: HTTP ${rRes.status}`);
  const rRows = await rRes.json();
  if (!Array.isArray(rRows) || rRows.length === 0) fail(`No restaurant found with id ${restaurantId} (nothing exported).`, 2);
  const restaurant = rRows[0];

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(outRoot, `export-${restaurantId}-${stamp}`);
  mkdirSync(dir, { recursive: true });

  const counts = {};
  for (const table of TABLES) {
    const rows = await fetchTable(table);
    counts[table] = rows.length;
    writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
    writeFileSync(join(dir, `${table}.csv`), toCsv(rows));
    console.log(`  ${table}: ${rows.length} rows`);
  }

  const manifest = {
    restaurantId,
    restaurantName: restaurant.name ?? null,
    slug: restaurant.slug ?? null,
    exportedAt: new Date().toISOString(),
    tables: counts,
    note: "READ-ONLY tenant-scoped export. Contains PII (customer phones, order history) — store securely; delete when no longer needed.",
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n✓ Exported ${total} rows across ${TABLES.length} tables for «${restaurant.name ?? restaurantId}» → ${dir}`);
  console.log("  ⚠ Output contains PII — handle/store securely and delete when done.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
