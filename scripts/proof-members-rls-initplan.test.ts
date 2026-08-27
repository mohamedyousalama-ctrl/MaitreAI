// ============================================================================
// WO-MEMBERS-INITPLAN — the members_read policy hoists auth.uid(), and stays
// exactly as permissive as it was.
//
// Run: node --experimental-strip-types scripts/proof-members-rls-initplan.test.ts
//
// WHY THIS MATTERS MORE THAN ONE LINT
// -----------------------------------
// public.members is the ROOT of tenant isolation. is_member_of() and
// is_manager_of() both read it, and nearly every RLS policy in the schema calls
// one of those. members_read carried a bare auth.uid(), which Postgres
// re-evaluates FOR EVERY ROW SCANNED, so the cost multiplied across the whole
// database. 0118 wraps it in a scalar subquery so the planner hoists it into an
// InitPlan and evaluates it once per statement.
//
// THE RISK THIS GUARDS
// --------------------
// This is a performance change to a SECURITY boundary. The danger is not that
// the optimisation fails — it is that someone "tidies" the policy later and
// widens it. So this pins the SHAPE of the fix, not just its presence:
//   * auth.uid() must be wrapped (the optimisation)
//   * is_manager_of(restaurant_id) must NOT be wrapped — it takes a column
//     argument, so it is genuinely per-row; wrapping it would evaluate one
//     tenant's answer and apply it to every row, which is a cross-tenant leak
//   * ALTER POLICY, never DROP + CREATE — a dropped policy on members is an open
//     door for however many milliseconds it is missing
//   * the USING expression must still be exactly the two original branches
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};

const raw = readFileSync(resolve(process.cwd(), "supabase/migrations/0118_members_read_hoist_auth_uid.sql"), "utf8");
// Statements only — the header documents the OLD expression, so a raw-text match
// would find `auth.uid()` unwrapped in the prose and report the fix as missing.
const sql = raw.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

ok("0118 alters the policy in place (never DROP + CREATE on members)",
  /alter policy members_read on public\.members/i.test(sql) &&
  !/drop policy/i.test(sql) && !/create policy/i.test(sql));

ok("auth.uid() is hoisted into a scalar subquery",
  /user_id = \(\s*select auth\.uid\(\)\s*\)/i.test(sql));

ok("no BARE auth.uid() survives in the executable SQL",
  !/[^(]\bauth\.uid\(\)/i.test(sql.replace(/\(\s*select auth\.uid\(\)\s*\)/gi, "«hoisted»")));

// The dangerous mistake: hoisting the column-argument predicate too. That would
// compute one tenant's answer once and apply it to every row — a cross-tenant read.
ok("is_manager_of is NOT hoisted — it takes a column and must stay per-row",
  /\bis_manager_of\(restaurant_id\)/i.test(sql) &&
  !/select\s+is_manager_of/i.test(sql));

// Same two branches, same OR. Nothing added, nothing widened.
ok("the policy still has exactly its two original branches, OR'd",
  /using \(\(user_id = \(select auth\.uid\(\)\)\) or is_manager_of\(restaurant_id\)\)/i
    .test(sql.replace(/\s+/g, " ")));

ok("no WITH CHECK was introduced (members_read is SELECT-only)",
  !/with check/i.test(sql));

ok("0118 touches only members_read — not members_write or the control-owner policy",
  !/members_write/i.test(sql) && !/members_control_owner_sel/i.test(sql));

console.log(`\nMEMBERS-RLS-INITPLAN PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
