// ============================================================================
// WO-GRANTS-LOCKDOWN — red-first proof (source-assertion; 0090 is PREPARE-ONLY, so the
// definitive behavioral check is the founder ceremony — scripts/ceremony-0090-*.sql,
// SET ROLE, never prod). 0090 locks two SECURITY DEFINER functions, DIFFERENTLY, because
// their legit callers differ:
//   reset_restaurant  — only caller is lib/store.ts's browser _sb.rpc (the `authenticated`
//                       role), so `authenticated` is KEPT; only anon/public are revoked;
//                       the internal auth.uid() manager guard (0007) stays the control.
//   seed_demo_restaurant — ZERO app callers → locked to service_role only.
// CONTROL: the pre-migration grants were broad (0007 grants authenticated + implicit
//   PUBLIC; 0003 has no explicit grant → default PUBLIC), so 0090 is what closes the hole.
// Run: node --experimental-strip-types scripts/proof-grants-lockdown.test.ts
// ============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

const mig = read("supabase/migrations/0090_grants_lockdown.sql");
// Only the executable statements, not the header comments (so a word in prose can't
// accidentally satisfy an assertion). Every real statement here starts at column 0.
const sql = mig.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

// --- reset_restaurant: revoke anon/public, KEEP authenticated + service_role ---------
check("reset: revokes EXECUTE from public",
  /revoke\s+execute\s+on\s+function\s+public\.reset_restaurant\(uuid\)\s+from\s+public/i.test(sql));
check("reset: revokes EXECUTE from anon",
  /revoke\s+execute\s+on\s+function\s+public\.reset_restaurant\(uuid\)\s+from\s+anon/i.test(sql));
check("reset: RE-AFFIRMS grant to authenticated (the legit manager-browser caller)",
  /grant\s+execute\s+on\s+function\s+public\.reset_restaurant\(uuid\)\s+to\s+authenticated/i.test(sql));
check("reset: grants service_role",
  /grant\s+execute\s+on\s+function\s+public\.reset_restaurant\(uuid\)\s+to\s+service_role/i.test(sql));
// The pivotal divergence from 0088: authenticated must NOT be revoked for reset.
check("reset: does NOT revoke authenticated (would break resetAll())",
  !/revoke\s+execute\s+on\s+function\s+public\.reset_restaurant\(uuid\)\s+from\s+[^;]*\bauthenticated\b/i.test(sql));

// --- seed_demo_restaurant: revoke public+anon+authenticated, grant ONLY service_role -
check("seed: revokes EXECUTE from public",
  /revoke\s+execute\s+on\s+function\s+public\.seed_demo_restaurant\(uuid\)\s+from\s+public/i.test(sql));
check("seed: revokes EXECUTE from anon + authenticated",
  /revoke\s+execute\s+on\s+function\s+public\.seed_demo_restaurant\(uuid\)\s+from\s+anon,\s*authenticated/i.test(sql));
check("seed: grants service_role",
  /grant\s+execute\s+on\s+function\s+public\.seed_demo_restaurant\(uuid\)\s+to\s+service_role/i.test(sql));
check("seed: does NOT grant anon or authenticated anywhere",
  !/grant\s+execute\s+on\s+function\s+public\.seed_demo_restaurant\(uuid\)\s+to\s+[^;]*\b(anon|authenticated)\b/i.test(sql));

// --- 0090 is GRANT-ONLY: it must NOT re-emit either function body ---------------------
check("0090 is grant-only — does NOT re-create reset_restaurant's body",
  !/create\s+or\s+replace\s+function\s+public\.reset_restaurant/i.test(sql));
check("0090 is grant-only — does NOT re-create seed_demo_restaurant's body",
  !/create\s+or\s+replace\s+function\s+public\.seed_demo_restaurant/i.test(sql));

// --- reset's internal manager guard (0007) is intact — the real control kept ---------
const reset = read("supabase/migrations/0007_reset.sql");
const resetBody = reset.slice(reset.indexOf("\nbegin\n"));
check("reset guard intact: members role=manager scoped to the restaurant + auth.uid()",
  /from\s+public\.members\s+where\s+restaurant_id\s*=\s*r_id\s+and\s+user_id\s*=\s*auth\.uid\(\)\s+and\s+role\s*=\s*'manager'/i.test(resetBody));
check("reset guard intact: an unauthorized caller RAISES",
  /raise\s+exception\s+'not authorized to reset this restaurant'/i.test(resetBody));

// --- regression guard: NO application code invokes seed_demo_restaurant --------------
// (Only dev/test scripts/*.mjs may; app/lib/components must stay clean.)
function scanFor(dir: string, needle: string): string[] {
  const hits: string[] = [];
  let entries: string[] = [];
  try { entries = readdirSync(join(ROOT, dir), { recursive: true }) as string[]; } catch { return hits; }
  for (const rel of entries) {
    if (!/\.(ts|tsx)$/.test(rel)) continue;
    const body = readFileSync(join(ROOT, dir, rel), "utf8");
    if (body.includes(needle)) hits.push(join(dir, rel));
  }
  return hits;
}
const seedCallers = [...scanFor("app", "seed_demo_restaurant"), ...scanFor("lib", "seed_demo_restaurant"), ...scanFor("components", "seed_demo_restaurant")];
check("regression: NO app/lib/components file references seed_demo_restaurant", seedCallers.length === 0);

// reset's ONE legit caller is still the browser _sb.rpc in lib/store.ts (unchanged).
const store = read("lib/store.ts");
check("reset's legit caller present: lib/store.ts calls reset_restaurant via the browser _sb.rpc",
  /_sb\.rpc\("reset_restaurant",\s*\{\s*p_restaurant_id:\s*_rid\s*\}/.test(store));

// --- CONTROL: the PRE-migration state was BROAD (proves 0090 is what closes it) ------
check("CONTROL: pre-0090, reset_restaurant carried a grant to authenticated (0007:122)",
  /grant\s+execute\s+on\s+function\s+public\.reset_restaurant\(uuid\)\s+to\s+authenticated/i.test(reset));
const seed = read("supabase/migrations/0003_seed.sql");
check("CONTROL: pre-0090, seed_demo_restaurant had NO explicit grant (relied on default PUBLIC)",
  !/grant\s+execute\s+on\s+function\s+public\.seed_demo_restaurant/i.test(seed));
check("CONTROL: pre-0090, seed_demo_restaurant had NO revoke/lockdown of its own",
  !/revoke\s+execute\s+on\s+function\s+public\.seed_demo_restaurant/i.test(seed));

// --- ceremony validation script exists, is staging-only, and is not a migration ------
const ceremony = read("scripts/ceremony-0090-grants-lockdown.sql");
check("ceremony: wraps the check in BEGIN…ROLLBACK (mutates nothing)",
  /\bbegin;/i.test(ceremony) && /\brollback;/i.test(ceremony));
check("ceremony: exercises anon (denied), non-member (guard raises), and service_role/manager (succeed)",
  /set\s+role\s+anon/i.test(ceremony) && /set\s+role\s+authenticated/i.test(ceremony) && /set\s+role\s+service_role/i.test(ceremony));
check("ceremony: explicitly marked staging/never-prod", /NEVER run against the production/i.test(ceremony));

console.log(`\nGRANTS-LOCKDOWN PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
