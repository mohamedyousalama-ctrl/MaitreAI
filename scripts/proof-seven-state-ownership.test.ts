// ============================================================================
// KV-D06-002 proof — SEVEN-STATE APPLICATION OWNERSHIP MODEL, cross-module parity.
//
// The focused suite (scripts/test-ownership-transitions.test.ts) proves the canonical
// contract itself. THIS proof answers the different question the deduplication makes
// necessary: do the two consuming modules still expose EXACTLY the shared behavior,
// under their original public names, with nothing independently maintained?
//
// It proves:
//   • lib/db/ownership.ts and lib/console/conversation-control.ts behave identically
//     to lib/conversation-control/model.ts — same states, same order, same identity;
//   • the exact authority mapping for all seven states, and that no state is dual;
//   • assertion and boolean transition checks agree for every one of the 49 pairs,
//     in all three modules;
//   • every legacy public export name is still present and still compatible;
//   • the shared model has no side effects and no database dependency;
//   • the console assignment-event derivation still covers all seven states.
//
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs \
//        --experimental-strip-types scripts/proof-seven-state-ownership.test.ts
//
// HONEST BOUNDARY — this is APPLICATION-CONTRACT PROOF ONLY. It does not touch a
// database and proves NOTHING about production: not the atomic claim, not one-writer
// enforcement, not tenant isolation, not RLS or FORCE RLS, not grants, not durable
// audit, and not that any control-plane RPC exists in production. Those remain the
// separately governed control-plane work.
// ============================================================================
import { readFileSync } from "fs";
import { resolve } from "path";

import * as model from "../lib/conversation-control/model.ts";
import * as ownership from "../lib/db/ownership.ts";
import * as control from "../lib/console/conversation-control.ts";
import type { OwnershipState } from "../lib/conversation-control/model.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const STATES = model.OWNERSHIP_STATES;
const CANONICAL = "AI_ACTIVE,HOLD_UNCLAIMED,HUMAN_ACTIVE,HUMAN_IDLE,AI_RESUME_PENDING,SYSTEM_HOLD,CLOSED";

// ══ A — one state set, three modules ═════════════════════════════════════════════
{
  ok("A1: the canonical tuple is the exact seven states in order", STATES.join(",") === CANONICAL);
  ok("A2: lib/db/ownership OWNERSHIP_STATES equals the canonical tuple", ownership.OWNERSHIP_STATES.join(",") === CANONICAL);
  ok("A3: lib/console CONTROL_MODES equals the canonical tuple", control.CONTROL_MODES.join(",") === CANONICAL);
  // Identity, not just equality: re-export means the SAME array object, so the two can
  // never drift apart by a later edit to one of them.
  ok("A4: ownership.OWNERSHIP_STATES IS the canonical array (re-export, not a copy)", ownership.OWNERSHIP_STATES === model.OWNERSHIP_STATES);
  ok("A5: control.CONTROL_MODES IS the canonical array (re-export, not a copy)", control.CONTROL_MODES === model.OWNERSHIP_STATES);
  ok("A6: no module carries an eighth state", ownership.OWNERSHIP_STATES.length === 7 && control.CONTROL_MODES.length === 7);
  ok("A7: no runtime HUMAN_WAITING in any module", ![...ownership.OWNERSHIP_STATES, ...control.CONTROL_MODES].includes("HUMAN_WAITING" as OwnershipState));
}

// ══ B — the exact authority mapping, and no dual authority ═══════════════════════
{
  const EXPECTED: Record<OwnershipState, "AI" | "HUMAN" | "NONE"> = {
    AI_ACTIVE: "AI",
    HOLD_UNCLAIMED: "NONE",
    HUMAN_ACTIVE: "HUMAN",
    HUMAN_IDLE: "HUMAN",
    AI_RESUME_PENDING: "NONE",
    SYSTEM_HOLD: "NONE",
    CLOSED: "NONE",
  };
  let mapOk = true, parityOk = true, dual = false;
  for (const s of STATES) {
    if (model.authorityFor(s) !== EXPECTED[s]) mapOk = false;
    if (control.authorityFor(s) !== model.authorityFor(s)) parityOk = false;
    const a = control.authorityFor(s);
    if (a === "AI" && (a as string) === "HUMAN") dual = true;
    if (!["AI", "HUMAN", "NONE"].includes(a)) dual = true;
  }
  ok("B1: the model's authority mapping is exact for all seven states", mapOk);
  ok("B2: console authorityFor agrees with the model for all seven states", parityOk);
  ok("B3: no state maps to dual authority (single-valued, AI|HUMAN|NONE only)", !dual);
  ok("B4: exactly one AI-authority state", STATES.filter((s) => control.authorityFor(s) === "AI").join(",") === "AI_ACTIVE");
  ok("B5: HUMAN authority is exactly {HUMAN_ACTIVE, HUMAN_IDLE}", STATES.filter((s) => control.authorityFor(s) === "HUMAN").join(",") === "HUMAN_ACTIVE,HUMAN_IDLE");
  ok("B6: NONE authority is exactly the holds, pending and closed", STATES.filter((s) => control.authorityFor(s) === "NONE").join(",") === "HOLD_UNCLAIMED,AI_RESUME_PENDING,SYSTEM_HOLD,CLOSED");
  ok("B7: AUTHORITY_BY_STATE is total over the state set", STATES.every((s) => model.AUTHORITY_BY_STATE[s] !== undefined));
}

// ══ C — transitions: boolean and assertion checks agree, in all three modules ═════
{
  let booleanParity = 0, assertParity = 0, selfLoops = 0, nullFrom = 0, pairs = 0;
  for (const from of STATES) {
    for (const to of STATES) {
      pairs++;
      const m = model.isLegalTransition(from, to);
      const o = ownership.isLegalTransition(from, to);
      const c = control.canTransition(from, to);
      if (m !== o || m !== c) booleanParity++;

      // Assertion form must agree with the boolean form, in every module.
      const threw = (fn: () => void) => { try { fn(); return false; } catch { return true; } };
      const mThrew = threw(() => model.assertLegalTransition(from, to));
      const oThrew = threw(() => ownership.assertLegalTransition(from, to));
      const cThrew = threw(() => control.assertTransition(from, to));
      if (mThrew === m || oThrew === m || cThrew === m) assertParity++;

      if (from === to && !m) selfLoops++;
    }
    if (!model.isLegalTransition(null, from) || !ownership.isLegalTransition(undefined, from) || !control.canTransition(null, from)) nullFrom++;
  }
  ok("C1: all 49 ordered pairs were evaluated", pairs === 49);
  ok("C2: boolean transition checks agree across all three modules, all 49 pairs", booleanParity === 0);
  ok("C3: assertion and boolean checks agree across all three modules, all 49 pairs", assertParity === 0);
  ok("C4: every self-transition is legal (idempotent no-op)", selfLoops === 0);
  ok("C5: a null/undefined `from` is permitted into every state, in all three modules", nullFrom === 0);
  ok("C6: ownership.isLegalTransition IS the canonical function", ownership.isLegalTransition === model.isLegalTransition);
  // The thrown messages keep each module's original prefix, so existing log/telemetry
  // greps and operator-facing text are unchanged by the deduplication.
  let om = "", cm = "";
  try { ownership.assertLegalTransition("CLOSED", "SYSTEM_HOLD"); } catch (e) { om = (e as Error).message; }
  try { control.assertTransition("CLOSED", "SYSTEM_HOLD"); } catch (e) { cm = (e as Error).message; }
  ok("C7: ownership assert keeps its [ownership] message prefix", om === "[ownership] illegal transition CLOSED → SYSTEM_HOLD");
  ok("C8: control assert keeps its [conversation-control] message prefix", cm === "[conversation-control] illegal transition CLOSED → SYSTEM_HOLD");
  // The five legacy edges must not have regressed anywhere.
  const legacy: Record<string, string[]> = {
    AI_ACTIVE: ["HUMAN_ACTIVE", "SYSTEM_HOLD", "CLOSED"],
    HUMAN_ACTIVE: ["HUMAN_IDLE", "AI_ACTIVE", "CLOSED"],
    HUMAN_IDLE: ["HUMAN_ACTIVE", "AI_ACTIVE", "CLOSED"],
    SYSTEM_HOLD: ["HUMAN_ACTIVE", "AI_ACTIVE", "CLOSED"],
    CLOSED: ["AI_ACTIVE"],
  };
  let superset = true;
  for (const [f, tos] of Object.entries(legacy)) for (const t of tos) {
    if (!ownership.isLegalTransition(f as OwnershipState, t as OwnershipState)) superset = false;
  }
  ok("C9: every pre-existing five-state edge is still legal (no regression)", superset);
  ok("C10: #87 preserved — SYSTEM_HOLD → HUMAN_IDLE stays illegal", !ownership.isLegalTransition("SYSTEM_HOLD", "HUMAN_IDLE"));
}

// ══ D — claimability parity and the exact claimable set ══════════════════════════
{
  ok("D1: claimable source set is exactly the four states", ownership.CLAIMABLE_FROM.join(",") === "AI_ACTIVE,HOLD_UNCLAIMED,HUMAN_IDLE,SYSTEM_HOLD");
  ok("D2: ownership.CLAIMABLE_FROM IS the canonical array", ownership.CLAIMABLE_FROM === model.CLAIMABLE_FROM);
  ok("D3: ownership.canClaim IS the canonical function", ownership.canClaim === model.canClaim);
  let claimParity = 0;
  for (const s of STATES) {
    for (const assigned of [null, "m1", "m2"]) {
      if (model.canClaim({ ownershipState: s, assignedMemberId: assigned }, "m1") !== ownership.canClaim({ ownershipState: s, assignedMemberId: assigned }, "m1")) claimParity++;
    }
  }
  ok("D4: canClaim agrees between model and ownership for all 21 state/owner cases", claimParity === 0);
  ok("D5: HOLD_UNCLAIMED is claimable", ownership.canClaim({ ownershipState: "HOLD_UNCLAIMED", assignedMemberId: null }, "m1"));
  ok("D6: AI_RESUME_PENDING and CLOSED are not claimable", !ownership.canClaim({ ownershipState: "AI_RESUME_PENDING", assignedMemberId: null }, "m1") && !ownership.canClaim({ ownershipState: "CLOSED", assignedMemberId: null }, "m1"));
  ok("D7: a teammate-owned conversation is never claimable in any state", STATES.every((s) => !ownership.canClaim({ ownershipState: s, assignedMemberId: "other" }, "m1")));
  ok("D8: HUMAN_ACTIVE is claimable only by its current assignee", ownership.canClaim({ ownershipState: "HUMAN_ACTIVE", assignedMemberId: "m1" }, "m1") && !ownership.canClaim({ ownershipState: "HUMAN_ACTIVE", assignedMemberId: null }, "m1"));
}

// ══ E — legacy public export names remain compatible ═════════════════════════════
{
  const ownershipNames = ["OWNERSHIP_STATES", "CLAIMABLE_FROM", "isLegalTransition", "assertLegalTransition", "canClaim", "setOwnershipState"];
  const controlNames = [
    "CONTROL_MODES", "authorityFor", "canTransition", "assertTransition", "deriveAssignmentEventType",
    "handBackBlockers", "canHandBack", "applyTransition", "escalateToHold", "claimConversation",
    "releaseToAI", "managerReassign", "ClaimLostError", "HandBackBlockedError", "NotManagerError", "ReassignPreconditionError",
  ];
  const missingOwnership = ownershipNames.filter((n) => !(n in ownership));
  const missingControl = controlNames.filter((n) => !(n in control));
  ok(`E1: every legacy lib/db/ownership export is still present (${ownershipNames.length})`, missingOwnership.length === 0);
  if (missingOwnership.length) console.log("     missing:", missingOwnership.join(", "));
  ok(`E2: every legacy lib/console/conversation-control export is still present (${controlNames.length})`, missingControl.length === 0);
  if (missingControl.length) console.log("     missing:", missingControl.join(", "));
  ok("E3: setOwnershipState is still a function (behavior preserved, not re-exported away)", typeof ownership.setOwnershipState === "function");
  ok("E4: the RPC wrappers are still functions", ["applyTransition", "escalateToHold", "claimConversation", "releaseToAI", "managerReassign"].every((n) => typeof (control as unknown as Record<string, unknown>)[n] === "function"));
}

// ══ F — the shared model has no side effects and no database dependency ══════════
{
  const src = readFileSync(resolve(process.cwd(), "lib/conversation-control/model.ts"), "utf8");
  // Strip comments first: the module's own banner NAMES the dependencies it forbids, so a
  // raw text search would match that prose instead of real code. These checks must look at
  // executable source only.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const importLines = code.split("\n").filter((l) => /^\s*(import|export)\s.*\sfrom\s/.test(l) || /\b(import|require)\s*\(/.test(l));
  ok("F1: the canonical model imports NOTHING (zero import/require in code)", importLines.length === 0);
  if (importLines.length) console.log("     found:", importLines.join(" | "));
  ok("F2: no Supabase dependency in the canonical model's code", !/supabase/i.test(code));
  ok("F3: no server-only / Next / React dependency in the canonical model's code", !/["']server-only["']|["']next[/"']|["']react["']/.test(code));
  ok("F4: no environment access in the canonical model's code", !/process\s*\.\s*env/.test(code));
  // Exports are data + pure functions; importing the module performed no I/O (this test
  // already imported it above and reached here without a connection or a throw).
  ok("F5: model exports are plain data and pure functions", Array.isArray(model.OWNERSHIP_STATES) && typeof model.canClaim === "function" && typeof model.authorityFor === "function");
  // Purity: repeated calls return equal results and mutate no shared state.
  const before = model.OWNERSHIP_STATES.join(",");
  model.canClaim({ ownershipState: "AI_ACTIVE", assignedMemberId: null }, "m1");
  model.isLegalTransition("AI_ACTIVE", "CLOSED");
  ok("F6: calling the pure functions does not mutate the canonical tuple", model.OWNERSHIP_STATES.join(",") === before);
}

// ══ G — console assignment-event derivation still covers all seven states ════════
{
  const EXPECTED_EVENT: Record<OwnershipState, string> = {
    AI_ACTIVE: "HANDED_TO_AI",
    HOLD_UNCLAIMED: "ESCALATED",
    HUMAN_ACTIVE: "ESCALATED", // unclaimed handoff (Option 1); CLAIMED when an assignee is present
    HUMAN_IDLE: "REASSIGNED",
    AI_RESUME_PENDING: "HANDED_TO_AI",
    SYSTEM_HOLD: "SYSTEM_HOLD",
    CLOSED: "CLOSED",
  };
  let covered = 0, correct = 0;
  for (const s of STATES) {
    let value: string | null = null;
    try { value = control.deriveAssignmentEventType(s, false); } catch { value = null; }
    if (value !== null) covered++;
    if (value === EXPECTED_EVENT[s]) correct++;
  }
  ok("G1: event derivation is total over all seven states (never throws)", covered === 7);
  ok("G2: event derivation returns the expected type for all seven states", correct === 7);
  ok("G3: HUMAN_ACTIVE with an assignee still derives CLAIMED", control.deriveAssignmentEventType("HUMAN_ACTIVE", true) === "CLAIMED");
  ok("G4: an explicitly provided type still wins over derivation", control.deriveAssignmentEventType("HUMAN_ACTIVE", false, "MANAGER_TAKEOVER") === "MANAGER_TAKEOVER");
}

// ══ H — explicit boundary statement ══════════════════════════════════════════════
{
  // Recorded as an assertion so the boundary cannot be quietly dropped from the proof.
  const BOUNDARY = "application-contract proof only — not production, not PostgreSQL";
  ok(`H1: ${BOUNDARY}`, true);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} seven-state ownership parity: ${pass}/${pass + fail} passed`);
console.log("   scope: application contract only — no database, no production, no one-writer proof.");
if (fail > 0) process.exit(1);
