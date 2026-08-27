// ============================================================================
// WO-UNPORTED-CONTROL — the four unported control wrappers stay unwired.
//
// Run: node --experimental-strip-types scripts/proof-unported-control-wrappers.test.ts
//
// THE HAZARD
// ----------
// lib/console/conversation-control.ts exports five RPC wrappers. Exactly one —
// claimConversation — was ported to the kv_control_* family that actually exists
// in production (3993845). The other four still name control_apply_transition,
// control_escalate_to_hold, control_release_to_ai and control_reassign, none of
// which exist in the database. Verified absent from pg_proc 2026-08-27; the
// ledger entry for 0099 predates the current repo text.
//
// Nothing calls them today, so nothing is broken. The danger is the DAY someone
// wires one to a route: it fails with PGRST202, and the unit suite says it is
// fine — because proof-control.test.ts exercises them against a fake DB that
// implements the OLD rpc names. A green suite over a dead RPC is exactly the
// pattern that produced a false green once before in this repo.
//
// proof-definer-grant-hygiene has a stray-reference tripwire, but it matches the
// SQL names. A new route would call the TypeScript wrapper — `managerReassign(…)`,
// not `control_reassign` — so it would sail past. This closes that gap.
//
// WHEN A WRAPPER IS PORTED: move its name out of UNPORTED, and update the header
// comment in conversation-control.ts. Porting is not a rename — kv_control_reassign
// and kv_control_release_hold require the manager role and accept a narrower set
// of source states than the functions they replace.
// ============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};

const SRC = "lib/console/conversation-control.ts";
const src = readFileSync(resolve(ROOT, SRC), "utf8");

/** Wrapper → the RPC it names, which does not exist in production. */
const UNPORTED: Readonly<Record<string, string>> = {
  applyTransition: "control_apply_transition",
  escalateToHold: "control_escalate_to_hold",
  releaseToAI: "control_release_to_ai",
  managerReassign: "control_reassign",
};

// Sanity: the wrappers still exist and still name the dead RPCs. If one stops
// naming its dead RPC it has probably been ported — and then it must leave
// UNPORTED, or this test is lying about the state of the code.
for (const [wrapper, rpc] of Object.entries(UNPORTED)) {
  ok(`${wrapper} still exists`, new RegExp(String.raw`export async function ${wrapper}\b`).test(src));
  ok(`${wrapper} still names the dead RPC ${rpc} (if not, port it and remove it from UNPORTED)`,
    new RegExp(String.raw`\.rpc\("${rpc}"`).test(src));
}

// claimConversation is the one that WAS ported — pin it, so a regression that
// reverts it to the dead control_claim is caught here too.
ok("claimConversation is ported and calls kv_control_claim",
  /\.rpc\("kv_control_claim"/.test(src) && !/\.rpc\("control_claim"/.test(src));

// ── the tripwire ────────────────────────────────────────────────────────────
// Any production file that calls one of these is building on an RPC that does
// not exist. Tests may reference them: they document the contract for when the
// wrappers ARE ported, and they run against a fake DB.
function productionFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["app", "lib", "components"]) {
    let entries: string[] = [];
    try { entries = readdirSync(join(ROOT, dir), { recursive: true }) as string[]; } catch { continue; }
    for (const rel of entries) {
      if (!/\.(ts|tsx)$/.test(rel)) continue;
      if (/\.(test|spec)\.tsx?$/.test(rel)) continue;
      const p = join(dir, rel).split("\\").join("/");
      if (p === SRC) continue; // the definition itself
      out.push(p);
    }
  }
  return out;
}

const files = productionFiles();
ok("found production files to scan", files.length > 50);

const callers: string[] = [];
for (const f of files) {
  let body = "";
  try { body = readFileSync(join(ROOT, f), "utf8"); } catch { continue; }
  for (const wrapper of Object.keys(UNPORTED)) {
    // Whole identifier, and only where it is CALLED or IMPORTED — a word in a
    // comment explaining why it is unported is not a caller.
    const called = new RegExp(String.raw`(?<![A-Za-z0-9_.])${wrapper}\s*\(`).test(body);
    const imported = new RegExp(String.raw`import[\s\S]{0,400}?\b${wrapper}\b[\s\S]{0,400}?from\s+["'][^"']*conversation-control`).test(body);
    if (called || imported) callers.push(`${wrapper} in ${f}`);
  }
}

ok(
  "no production file calls or imports an unported control wrapper" +
    (callers.length
      ? ` — WIRED: ${callers.join(", ")}. That RPC does not exist in production and will fail with ` +
        `PGRST202. Port it to the kv_control_* family first (see claimConversation), then remove it from UNPORTED.`
      : ""),
  callers.length === 0,
);

// The header must keep telling the truth, because it is what a future author reads.
ok("conversation-control.ts still documents which wrappers are unported",
  /NOT PORTED/.test(src) && Object.values(UNPORTED).every((rpc) => src.includes(rpc)));

console.log(`\nUNPORTED-CONTROL PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
