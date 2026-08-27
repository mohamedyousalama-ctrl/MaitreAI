// ============================================================================
// WO-ORDER-NUM — order numbers are allocated by the DATABASE, not by a scan.
// Run: node --experimental-strip-types scripts/proof-order-number-atomic.test.ts
// (no loader: this file imports only node builtins — matches unit-suite.json)
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

/**
 * Statements only — a word in a `--` comment must never satisfy an assertion.
 * Without this, commenting a statement OUT leaves the assertion green: the text
 * is still in the file. Caught by mutation test, and it is the reason the repo's
 * proof-grants-lockdown does the same thing.
 *
 * `*Raw` keeps the comments, for the few assertions that are ABOUT a comment.
 */
const stmts = (sql: string) => sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

const src = read("lib/db/orders-create.ts");
const migRaw = read("supabase/migrations/0113_atomic_order_numbers.sql");
const mig = stmts(migRaw);

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

// ── the fallback is reachable ONLY when the function is absent ──────────────
// Where 0113 IS applied, a fallback number is worse than no number: the scan
// does not advance the counter, so it can return a number that already exists,
// and the unique index then refuses the INSERT — the order is not persisted and
// the customer gets no confirmation. A fallback that turns a retryable blip into
// a lost order buys nothing.
ok("a non-missing RPC error THROWS instead of falling back to the scan",
  /RPC_MISSING\.has\(String\(error\.code\)\)/.test(fn) && /throw new Error\(/.test(fn));
ok("RPC_MISSING covers both the Postgres and PostgREST 'no such function' codes",
  /RPC_MISSING\s*=\s*new Set\(\[[^\]]*"42883"[^\]]*"PGRST202"[^\]]*\]\)/.test(src));
ok("the RPC call is wrapped so an injected client without .rpc cannot bypass the fallback",
  /try\s*\{[\s\S]{0,200}?\.rpc\("next_order_number"/.test(fn));
ok("the fallback scan does not swallow its own error",
  /error:\s*scanError/.test(fn) && /if \(scanError\)/.test(fn));

// ── the counter cannot fall behind the table (0115 + 0116) ─────────────────
const heal = stmts(read("supabase/migrations/0115_order_counter_self_heal.sql"));
const drift = stmts(read("supabase/migrations/0116_order_counter_cannot_drift.sql"));

// 0113 seeded a MISSING counter at a blind 1001, which collides with any tenant
// whose orders already passed it.
ok("0115 seeds a missing counter from the tenant's true max, not a constant",
  /values\s*\([\s\S]{0,200}?greatest\(\s*1000,[\s\S]{0,400}?max\(\(nullif\(regexp_replace\(o\.order_number/.test(heal));
ok("0115 preserves the historical 1000 floor (a first order is still #1001)",
  /greatest\(\s*1000,/.test(heal));
ok("0115 pulls existing counters up to the true max",
  /update public\.order_number_counters[\s\S]*?greatest\(c\.next_number, m\.true_max\)/.test(heal));

// 0116 is what stops drift RECURRING — 0115 only repairs the state at apply time.
ok("0116 makes the counter a high-water mark via a trigger on orders",
  /create trigger trg_sync_order_number_counter[\s\S]*?after insert or update of order_number on public\.orders/.test(drift));
ok("0116's trigger takes greatest(counter, inserted number) — it never lowers the counter",
  /set next_number = greatest\(c\.next_number, excluded\.next_number\)/.test(drift));
ok("0116 ignores a digit-free order_number instead of corrupting the counter",
  /if n is null then\s*\n\s*return new;/.test(drift));
ok("0116's trigger function is not executable by anon/authenticated",
  /revoke all on function public\.kv_sync_order_number_counter\(\) from anon, authenticated;/.test(drift));

// Both revoke halves are required and neither implies the other: `from public`
// misses anon/authenticated (they hold DIRECT default grants), and revoking those
// two by name leaves a PUBLIC grant intact. Verified in a rolled-back transaction.
for (const [label, text] of [["0115", heal]] as const) {
  ok(`${label} revokes the allocator from PUBLIC *and* from anon/authenticated`,
    /revoke all on function public\.next_order_number\(uuid\) from public;/.test(text) &&
    /revoke all on function public\.next_order_number\(uuid\) from anon, authenticated;/.test(text));
}

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
// A third trap, found by the auditor against the SECOND version of this block:
//
//  3. Matching only `grant execute on function <name>` is too narrow to mean
//     "nobody else". `grant ALL on function …`, a bulk `grant execute on ALL
//     FUNCTIONS IN SCHEMA public`, and a revoke followed by a re-grant later in
//     the same file all reached `authenticated` while the assertion stayed
//     green — the assertion's label promised more than it enforced, which is the
//     same defect in miniature as the migration it guards.
//
// So model the NET EFFECT instead of pattern-matching one statement shape: walk
// every grant/revoke across 0113 then 0114 IN ORDER, apply each to a set, and
// require the final set to be exactly {service_role}. Order matters — a re-grant
// after a revoke must win, exactly as Postgres would apply it.
const lockdown = stmts(read("supabase/migrations/0114_lock_down_next_order_number.sql"));

const ACL = /(grant|revoke)\s+(execute|all)(?:\s+privileges)?\s+on\s+(?:function\s+public\.next_order_number\s*\([^)]*\)|all\s+functions\s+in\s+schema\s+public)\s+(?:to|from)\s+([^;]+);/gi;

const effective = new Set<string>();
for (const m of (mig + "\n" + lockdown).matchAll(ACL)) {
  const roles = m[3].split(",").map((r) => r.trim().toLowerCase().replace(/\s+cascade$/, ""));
  for (const role of roles) {
    if (m[1].toLowerCase() === "grant") effective.add(role);
    else { effective.delete(role); if (role === "public") { effective.delete("anon"); } }
  }
}
ok("net effect of 0113+0114: EXECUTE on the allocator is service_role and nobody else",
  effective.size === 1 && effective.has("service_role"));
ok("neither migration ever grants the allocator to anon or authenticated",
  !effective.has("anon") && !effective.has("authenticated"));

const revoked = new Set<string>();
for (const m of lockdown.matchAll(/revoke\s+(?:all|execute)(?:\s+privileges)?\s+on\s+function\s+public\.next_order_number\s*\([^)]*\)\s+from\s+([^;]+);/gi)) {
  for (const role of m[1].split(",")) revoked.add(role.trim().toLowerCase());
}
ok("0114 revokes the allocator from anon AND authenticated by name",
  revoked.has("anon") && revoked.has("authenticated"));

// The counter table must not be reachable by policy either. RLS-on-with-no-policy
// is what denies anon/authenticated; a single permissive policy would undo it
// without touching a single grant statement.
ok("no RLS policy on the counter table exposes it to anon or authenticated",
  !/create\s+policy[\s\S]{0,200}?\bon\s+public\.order_number_counters[\s\S]{0,200}?\bto\s+[^;]*\b(anon|authenticated)\b/i
    .test(mig + "\n" + lockdown));
ok("0114 also strips the counter table's stock grants (RLS does not gate TRUNCATE)",
  /revoke\s+all\s+on\s+table\s+public\.order_number_counters\s+from\s+[^;]*\banon\b[^;]*;/i.test(lockdown) &&
  /revoke\s+all\s+on\s+table\s+public\.order_number_counters\s+from\s+[^;]*\bauthenticated\b[^;]*;/i.test(lockdown));
ok("0113 carries the superseded-in-part warning so its grant idiom is not copied",
  /SUPERSEDED IN PART BY 0114/.test(migRaw));

console.log(`\nORDER-NUMBER ATOMIC PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
