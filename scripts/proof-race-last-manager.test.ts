// ============================================================================
// WO-RACE-1 FIX 1 (FR-013-stress) — RED-FIRST: asserts migration 0089 (the ≥1-manager
// trigger) exists with its atomic properties, and the route maps the trigger exception to
// 409. The route's count-then-update is not atomic — two concurrent demotions on a
// 2-manager tenant both read count=2 and both write → 0 managers (self-lockout). The DB
// trigger LOCKS the tenant's manager rows FOR UPDATE (serializing demotions), re-counts, and
// REJECTS a demotion that would leave zero. (The live concurrency guarantee — two demotions
// leave exactly 1 — is verified against the DB at the 0089 apply ceremony, like other DB proofs.)
//
// Red-first: 0089 does not exist on the pre-WO tree → readFileSync throws → red.
//
// Run: node --experimental-strip-types scripts/proof-race-last-manager.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// ══ LEG 1 — migration 0089: the atomic ≥1-manager trigger function ═══════════
{
  const m = read("supabase/migrations/0089_enforce_min_one_manager.sql");
  ok("LEG1: fires only on a manager → non-manager transition",
    /old\.role = 'manager' and new\.role is distinct from 'manager'/.test(m));
  ok("LEG1: LOCKS the tenant's manager rows FOR UPDATE (serializes concurrent demotions)",
    /from public\.members[\s\S]*?where restaurant_id = old\.restaurant_id and role = 'manager'[\s\S]*?for update/.test(m));
  ok("LEG1: re-counts AFTER the lock and REJECTS when it would leave ≤1 manager",
    /select count\(\*\) into v_mgr_count[\s\S]*?if v_mgr_count <= 1 then[\s\S]*?raise exception 'last_manager/.test(m));
}

// ══ LEG 2 — the BEFORE UPDATE trigger is bound to members ════════════════════
{
  const m = read("supabase/migrations/0089_enforce_min_one_manager.sql");
  ok("LEG2: a BEFORE UPDATE per-row trigger on members runs the guard",
    /create trigger trg_enforce_min_one_manager\s*before update on public\.members\s*for each row\s*execute function public\.enforce_min_one_manager\(\)/.test(m));
  ok("LEG2: PREPARE-ONLY + idempotent (create or replace, drop trigger if exists)",
    /create or replace function public\.enforce_min_one_manager/.test(m) && /drop trigger if exists trg_enforce_min_one_manager/.test(m));
}

// ══ LEG 3 — the route maps the trigger exception → 409 (never 502) ═══════════
{
  const r = read("app/api/members/[id]/route.ts");
  // Re-pinned 2026-08-26. The route was refactored — the inline
  //   if (error.message?.includes("last_manager") || error.code === "23514")
  // became the named helper isLastManagerError(). The BEHAVIOUR is unchanged, so
  // this asserts the behaviour rather than the old expression's exact shape:
  //   (a) the detection still recognises BOTH signals, the message and 23514, and
  //   (b) the catch block still maps a recognised error to 409 last_manager.
  // Both halves are required, so deleting either the detection or the mapping
  // still fails this test — it was re-pointed, not relaxed.
  ok("LEG3: last_manager detection still keys on BOTH the message and SQLSTATE 23514",
    /function isLastManagerError[\s\S]*?includes\("last_manager"\)[\s\S]*?code === "23514"[\s\S]*?\n\}/.test(r));

  // COUNT the mapping sites, do not pattern-match across them. The route has TWO
  // catch blocks that must map this exception (the role change and the delete),
  // and a regex spanning `catch (error) … status: 409` matches even when the
  // first block is deleted, because it simply runs on to the second. Counting is
  // the only form that fails when either site is removed — verified by mutation:
  // deleting one block takes this from 2 to 1 and the assertion fails.
  // The span is BOUNDED (…{0,240}?…) so a match cannot run past its own block
  // into the next one — that unbounded run is exactly what made the previous
  // version of this assertion survive deletion of a guard.
  const guardSites = r.match(/if \(isLastManagerError\(error\)\) \{[\s\S]{0,240}?status: 409/g) ?? [];
  ok("LEG3: BOTH catch sites map the trigger's exception to 409 (2 guard blocks present)",
    guardSites.length === 2);
  ok("LEG3: every last_manager guard names the last_manager error code",
    guardSites.length > 0 && guardSites.every((b) => /"last_manager"/.test(b)));
  ok("LEG3: the friendly pre-check (409 last_manager on count ≤ 1) is still there for UX",
    /if \(\(count \?\? 0\) <= 1\)[\s\S]*?"last_manager"[\s\S]*?status: 409/.test(r));
}

console.log(`\nWO-RACE-1 MANAGER PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
