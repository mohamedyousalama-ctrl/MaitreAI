// ============================================================================
// WO-ORDER-NUM — order numbers are allocated by the DATABASE, not by a scan.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-order-number-atomic.test.ts
//
// The old nextOrderNumber read every order row for the tenant, took the numeric
// max and returned max+1. Read-then-write with no lock, and no unique constraint
// on (restaurant_id, order_number) — so two concurrent orders took the SAME
// number and both persisted. Migration 0113 adds an atomic per-tenant counter
// and a unique index; this pins the application half.
//
// Structural, not behavioural: exercising the real allocator needs a database.
// What it guarantees is that the RPC is the primary path and the scan cannot
// quietly become the default again.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const src = read("lib/db/orders-create.ts");
const mig = read("supabase/migrations/0113_atomic_order_numbers.sql");

// ── the application calls the database allocator FIRST ──────────────────────
const fn = /export async function nextOrderNumber[\s\S]*?\n\}/.exec(src)?.[0] ?? "";
ok("nextOrderNumber exists", fn.length > 0);
ok("it calls the next_order_number RPC", /\.rpc\("next_order_number", \{ p_restaurant_id: restaurantId \}\)/.test(fn));

// The RPC must be attempted BEFORE any table scan — otherwise the atomic path is
// decorative and the race is still live.
const rpcAt = fn.indexOf('.rpc("next_order_number"');
const scanAt = fn.indexOf('.from("orders")');
ok("the RPC is attempted BEFORE the fallback scan", rpcAt > 0 && (scanAt === -1 || rpcAt < scanAt));
ok("a successful RPC returns immediately (the scan is not also run)",
  /if \(!error && data != null\) return String\(data\);/.test(fn));

// The scan survives only as a fallback for an environment without 0113, and it
// must be loud — a silent fallback is how a race returns unnoticed.
ok("the fallback warns and names the migration",
  /console\.warn\(/.test(fn) && /0113_atomic_order_numbers/.test(fn));

// ── the migration provides both halves ──────────────────────────────────────
ok("0113 creates the per-tenant counter table",
  /create table if not exists public\.order_number_counters/.test(mig));
ok("allocation is a single atomic INSERT … ON CONFLICT DO UPDATE",
  /insert into public\.order_number_counters[\s\S]*?on conflict \(restaurant_id\) do update[\s\S]*?returning/.test(mig));
ok("0113 adds the unique backstop index on (restaurant_id, order_number)",
  /create unique index if not exists orders_restaurant_order_number_key[\s\S]*?\(restaurant_id, order_number\)/.test(mig));
ok("the counter table is RLS-enabled (service-role only, no browser reads)",
  /alter table public\.order_number_counters enable row level security/.test(mig));
// ── the allocator is reachable ONLY from the server ─────────────────────────
// This assertion is deliberately about the NET EFFECT of 0113 + 0114, not the
// text of either alone. Two traps, both hit for real:
//
//  1. An unanchored /… to service_role/ also matches "to service_role,
//     authenticated". A mutation test granting `authenticated` left the first
//     version of this line green — security coverage that proved nothing.
//  2. 0113's `revoke … from public` LOOKED exclusive and was not. Supabase's
//     default privileges grant anon/authenticated EXECUTE directly, so the
//     function shipped callable with the public browser key. Verified against
//     production by impersonating anon; 0114 revokes them by name.
//
// So: parse the grantee list, and require the by-name revoke to exist.
const grantees = new Set<string>();
for (const m of mig.matchAll(/grant\s+execute\s+on\s+function\s+public\.next_order_number\(uuid\)\s+to\s+([^;]+);/gi)) {
  for (const role of m[1].split(",")) grantees.add(role.trim().toLowerCase());
}
ok("0113 grants EXECUTE to service_role and nobody else",
  grantees.size === 1 && grantees.has("service_role"));

const lockdown = read("supabase/migrations/0114_lock_down_next_order_number.sql");
const revoked = new Set<string>();
for (const m of lockdown.matchAll(/revoke\s+all\s+on\s+function\s+public\.next_order_number\(uuid\)\s+from\s+([^;]+);/gi)) {
  for (const role of m[1].split(",")) revoked.add(role.trim().toLowerCase());
}
ok("0114 revokes the allocator from anon AND authenticated by name",
  revoked.has("anon") && revoked.has("authenticated"));
ok("0114 also strips the counter table's stock grants (RLS does not gate TRUNCATE)",
  /revoke\s+all\s+on\s+table\s+public\.order_number_counters\s+from\s+[^;]*\banon\b[^;]*;/i.test(lockdown) &&
  /revoke\s+all\s+on\s+table\s+public\.order_number_counters\s+from\s+[^;]*\bauthenticated\b[^;]*;/i.test(lockdown));
ok("0113 carries the superseded-in-part warning so its grant idiom is not copied",
  /SUPERSEDED IN PART BY 0114/.test(mig));

console.log(`\nORDER-NUMBER ATOMIC PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
