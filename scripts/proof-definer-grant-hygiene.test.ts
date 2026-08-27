// ============================================================================
// WO-DEFINER-HYGIENE — every SECURITY DEFINER function has a DELIBERATE
// anon/authenticated disposition.
//
// Run: node --experimental-strip-types scripts/proof-definer-grant-hygiene.test.ts
//
// WHY THIS EXISTS
// ---------------
// 0113 shipped a SECURITY DEFINER mutator with this at the bottom:
//
//     revoke all on function public.next_order_number(uuid) from public;
//     grant  execute on function public.next_order_number(uuid) to service_role;
//
// That reads as "server only". It is not. Supabase ships ALTER DEFAULT
// PRIVILEGES granting EXECUTE on every new function in `public` DIRECTLY to
// `anon` and `authenticated` — not through the PUBLIC pseudo-role — so revoking
// from PUBLIC misses both. The function shipped callable with the publishable
// browser key via PostgREST's /rest/v1/rpc/. Confirmed against production by
// impersonating anon before 0114 closed it.
//
// proof-grants-lockdown could not catch this: it pins the two functions 0090
// named. This is an INVARIANT over every migration, so the 39th definer
// function cannot repeat the mistake quietly.
//
// THE RULE
// --------
// Every SECURITY DEFINER function must be revoked from `anon` AND from
// `authenticated` BY NAME, unless one of four things is true — each of which is
// a real reason the default grant cannot reach it, not a way to silence the test:
//
//   1. DROPPED. A later migration drops it; there is nothing to reach.
//   2. TRIGGER. It returns `trigger`. PostgREST does not expose trigger
//      functions, and Postgres refuses to call one outside a trigger context.
//   3. REOWNED. Its migration reassigns ownership away from the migration role
//      (0108 does `alter function … owner to kivo_control_owner` in a loop).
//      ALTER DEFAULT PRIVILEGES is PER OWNER ROLE, so a function created under a
//      different owner never receives the anon/authenticated grant at all.
//      Verified live: kivo_control_owner owns 21 functions, 0 anon-executable;
//      postgres owns 21, 8 anon-executable.
//   4. ALLOWLISTED below, with a stated reason and an internal actor guard.
//
// Otherwise BOTH revokes are required, and neither implies the other:
//   * `revoke … from public` misses anon/authenticated, which hold DIRECT grants
//     from ALTER DEFAULT PRIVILEGES — the 0113 bug.
//   * revoking anon/authenticated BY NAME leaves a PUBLIC grant intact, and
//     PUBLIC still confers EXECUTE. Verified in a rolled-back transaction: after
//     a by-name revoke, has_function_privilege() was STILL true, because a new
//     function carries Postgres's default EXECUTE-to-PUBLIC.
// So requiring only one of the two would leave a hole either way.
// ============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = join(ROOT, "supabase", "migrations");

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; } else { fail++; console.error("  ✗ FAIL:", name); }
};

/**
 * Functions anon and/or authenticated may legitimately reach. Each entry must
 * say WHY it is safe — reachability is not itself a defect, an UNGUARDED mutator
 * is. Adding a name here is a security decision: it needs an internal actor
 * guard (auth.uid() / request.jwt.claim.sub) or read-only self-scoping.
 */
const ALLOWED_REACHABLE: Readonly<Record<string, string>> = {
  // Read-only RLS predicates. STABLE and scoped to auth.uid(), so they answer
  // only "is the CALLER a member/manager here" — anon gets false. Every RLS
  // policy invokes them as the querying role, so revoking `authenticated` would
  // break tenant isolation rather than tighten it.
  is_member_of: "read-only RLS predicate scoped to auth.uid(); every policy invokes it",
  is_manager_of: "read-only RLS predicate scoped to auth.uid(); every policy invokes it",

  // 0090 kept `authenticated` deliberately: the only caller is the manager's
  // browser (_sb.rpc in lib/store.ts), and 0007's internal guard raises
  // 'not authorized to reset this restaurant' for a non-manager. anon IS revoked.
  reset_restaurant: "0090 decision: manager browser is the sole caller; 0007 guard raises for non-managers",
};

/**
 * Functions whose migration TEXT still declares them, but which do NOT exist in
 * production — the migration's ledger entry predates the current repo text.
 * 0099's control_* were superseded by 0108's kv_control_*. Verified absent from
 * pg_proc on 2026-08-27.
 *
 * Their grant posture is moot while they do not exist, so they are exempt HERE.
 * That is not a clean bill of health: lib/console/conversation-control.ts still
 * calls four of them over RPC, and those calls fail in production. That is a
 * dead-RPC defect, not a grants defect, and it is tracked separately — this test
 * would be the wrong place to report it, and a red here would say the wrong
 * thing about grants.
 *
 * The teeth that remain: each entry lists the files allowed to mention it. A
 * mention anywhere else means someone is building NEW work on a function that
 * does not exist, and this test goes red.
 */
const KNOWN_ABSENT_FROM_PROD: Readonly<Record<string, readonly string[]>> = {
  control_apply_transition: ["lib/console/conversation-control.ts"],
  control_escalate_to_hold: ["lib/console/conversation-control.ts"],
  control_release_to_ai: ["lib/console/conversation-control.ts"],
  control_reassign: ["lib/console/conversation-control.ts"],
  control_claim: [
    "lib/console/conversation-control.ts",                 // prose only; the call was ported in 3993845
    "app/api/conversations/[id]/assignee/route.ts",        // prose only, explaining the replacement
  ],
};

// ── collect every migration, in ledger order ────────────────────────────────
const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
check("migrations directory is non-empty", files.length > 0);

/** Statements only — a word in a `--` comment must never satisfy an assertion. */
const codeOf = (sql: string) =>
  sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

const perFile = files.map((f) => ({ file: f, code: codeOf(readFileSync(join(MIG, f), "utf8")) }));
const allCode = perFile.map((p) => p.code).join("\n");

// ── find every SECURITY DEFINER function, and how it is exempt (if it is) ───
type Def = { file: string; isTrigger: boolean; reowned: boolean };
const definers = new Map<string, Def>();
for (const { file, code } of perFile) {
  // 0108 reassigns ownership for all its functions via a loop; the marker is
  // file-scoped because that is the granularity the reassignment applies at.
  const reowned = /alter\s+function\s+[^;]*owner\s+to\s+(?!postgres\b)\w+/i.test(code);
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const bodyAt = code.indexOf("$$", m.index);
    const header = code.slice(m.index, bodyAt > 0 ? bodyAt : m.index + 800);
    if (!/security\s+definer/i.test(header)) continue;
    if (definers.has(m[1])) continue;
    definers.set(m[1], { file, isTrigger: /returns\s+trigger/i.test(header), reowned });
  }
}
check("found SECURITY DEFINER functions to check", definers.size > 0);

/** True when some migration drops `fn`. */
const dropped = (fn: string) =>
  new RegExp(String.raw`drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?${fn}\s*\(`, "i").test(allCode);

/** True when some migration revokes `fn` from `role` BY NAME. */
function revokedByName(fn: string, role: "anon" | "authenticated" | "public"): boolean {
  const re = new RegExp(
    String.raw`revoke\s+(?:all|execute)[\s\S]{0,40}?\bon\s+function\s+(?:public\.)?${fn}\s*\([^)]*\)\s+from\s+([^;]+);`,
    "gi",
  );
  for (let m = re.exec(allCode); m; m = re.exec(allCode)) {
    if (m[1].split(",").some((r) => r.trim().toLowerCase() === role)) return true;
  }
  return false;
}

/** The four exemptions. Returns the reason, or null when the function must be revoked. */
function exemptBecause(fn: string, d: Def): string | null {
  if (dropped(fn)) return "dropped";
  if (d.isTrigger) return "trigger";
  if (d.reowned) return "reowned";
  if (fn in ALLOWED_REACHABLE) return "allowlisted";
  if (fn in KNOWN_ABSENT_FROM_PROD) return "absent-from-prod";
  return null;
}

/** Source files under app/, lib/, components/ that mention `needle`. */
function callersOf(needle: string): string[] {
  const hits: string[] = [];
  for (const dir of ["app", "lib", "components"]) {
    let entries: string[] = [];
    try { entries = readdirSync(join(ROOT, dir), { recursive: true }) as string[]; } catch { continue; }
    for (const rel of entries) {
      if (!/\.(ts|tsx)$/.test(rel)) continue;
      let body = "";
      try { body = readFileSync(join(ROOT, dir, rel), "utf8"); } catch { continue; }
      // Whole-identifier match: `control_claim` is a substring of
      // `kv_control_claim`, and the console was ported to the latter in 3993845.
      // A plain includes() would report those call sites as callers of the
      // superseded function and make this exemption look violated.
      if (new RegExp(String.raw`(?<![A-Za-z0-9_])${needle}(?![A-Za-z0-9_])`).test(body)) hits.push(join(dir, rel));
    }
  }
  return hits;
}

// ── the invariant ───────────────────────────────────────────────────────────
const unguarded: string[] = [];
for (const [fn, d] of definers) {
  if (exemptBecause(fn, d)) continue;
  const missing: string[] = [];
  if (!revokedByName(fn, "public")) missing.push("public");
  if (!revokedByName(fn, "anon")) missing.push("anon");
  if (!revokedByName(fn, "authenticated")) missing.push("authenticated");
  if (missing.length === 0) continue;
  unguarded.push(`${fn} (${d.file}: not revoked from ${missing.join("+")})`);
}
check(
  "every SECURITY DEFINER function is revoked from public AND anon AND authenticated, or exempt" +
    (unguarded.length ? ` — UNGUARDED: ${unguarded.join(", ")}` : ""),
  unguarded.length === 0,
);

// ── the specific idiom that caused this ─────────────────────────────────────
// `revoke … from public` with no by-name revoke of anon and authenticated is the
// exact shape of the 0113 bug. Flag it wherever it appears so it is not copied.
const publicOnly = new Set<string>();
const pubRe = /revoke\s+(?:all|execute)[\s\S]{0,40}?\bon\s+function\s+(?:public\.)?(\w+)\s*\([^)]*\)\s+from\s+([^;]+);/gi;
for (let m = pubRe.exec(allCode); m; m = pubRe.exec(allCode)) {
  if (!m[2].split(",").some((r) => r.trim().toLowerCase() === "public")) continue;
  const fn = m[1];
  // SECURITY INVOKER functions run with the caller's own rights and are still
  // subject to RLS, so anon reachability is not privilege escalation. The
  // vulnerability class this guards is DEFINER escalation specifically.
  if (!definers.has(fn)) continue;
  if (fn in ALLOWED_REACHABLE || dropped(fn) || fn in KNOWN_ABSENT_FROM_PROD) continue;
  if (!revokedByName(fn, "anon") || !revokedByName(fn, "authenticated")) publicOnly.add(fn);
}
check(
  "no function relies on 'revoke … from public' alone — it does not cover anon/authenticated on Supabase" +
    (publicOnly.size ? ` — RELIES ON IT: ${[...publicOnly].join(", ")}` : ""),
  publicOnly.size === 0,
);

// ── the case that taught us, pinned by name ─────────────────────────────────
check("next_order_number is revoked from anon by name (0114)", revokedByName("next_order_number", "anon"));
check("next_order_number is revoked from authenticated by name (0114)", revokedByName("next_order_number", "authenticated"));

// ── CONTROL: the guard would actually have caught 0113 ──────────────────────
// Without this, every assertion above could pass because the rule is vacuous.
// Re-run the exact rule against 0113 alone, with 0114's revokes excluded, and
// require that it FAILS — proving the invariant has teeth on the real case.
const without0114 = perFile.filter((p) => !p.file.startsWith("0114")).map((p) => p.code).join("\n");
const sawAnonRevokeWithout0114 = new RegExp(
  String.raw`revoke\s+(?:all|execute)[\s\S]{0,40}?\bon\s+function\s+(?:public\.)?next_order_number\s*\([^)]*\)\s+from\s+([^;]+);`,
  "gi",
).exec(without0114)?.[1]?.split(",").some((r) => r.trim().toLowerCase() === "anon") ?? false;
check("CONTROL: with 0114 removed, next_order_number has NO by-name anon revoke (the guard has teeth)",
  sawAnonRevokeWithout0114 === false);

// ── the absent-from-prod exemption keeps teeth ──────────────────────────────
// Each exempted function may only be mentioned in the files that already mention
// it. A NEW file naming one means work is being built on a function that does not
// exist in production — catch it before the call ships, not after the 502.
const strayRefs: string[] = [];
for (const [fn, allowed] of Object.entries(KNOWN_ABSENT_FROM_PROD)) {
  for (const f of callersOf(fn)) {
    if (!allowed.includes(f.split("\\").join("/"))) strayRefs.push(`${fn} in ${f}`);
  }
}
check(
  "no NEW file references a function that does not exist in production" +
    (strayRefs.length ? ` — STRAY: ${strayRefs.join(", ")}` : ""),
  strayRefs.length === 0,
);

// ── the exemptions cannot rot ───────────────────────────────────────────────
const stale = [...Object.keys(ALLOWED_REACHABLE), ...Object.keys(KNOWN_ABSENT_FROM_PROD)].filter((fn) => !definers.has(fn));
check("no stale ALLOWED_REACHABLE entries" + (stale.length ? ` — STALE: ${stale.join(", ")}` : ""),
  stale.length === 0);
check("every ALLOWED_REACHABLE entry states a reason",
  Object.values(ALLOWED_REACHABLE).every((r) => r.trim().length > 20));

console.log(`\nDEFINER-GRANT-HYGIENE PROOF: ${pass} passed, ${fail} failed (${definers.size} definer functions checked)`);
if (fail) process.exit(1);
