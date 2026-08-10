// Unit tests for the canonical conversation ownership contract (pure, no DB).
// Run: node --experimental-strip-types scripts/test-ownership-transitions.test.ts
//
// KV-D06-002 — expanded from five-state to the complete SEVEN-state application
// contract. The subject is now lib/conversation-control/model.ts, the one place that
// owns the state tuple, the authority mapping, the transition table and the
// claimability rules; lib/db/ownership.ts and lib/console/conversation-control.ts
// re-export exactly these. This harness runs under bare `node --experimental-strip-types`
// with NO resolver hook, so it imports the zero-import canonical module directly.
// Cross-module parity (that ownership.ts and conversation-control.ts really do expose
// identical behavior) is proven separately by scripts/proof-seven-state-ownership.test.ts,
// which runs under the loader that can resolve those modules' internal imports.
//
// SCOPE: application contract only. Nothing here proves an atomic database claim,
// tenant isolation, RLS, grants or durable audit behavior.
import {
  OWNERSHIP_STATES,
  AUTHORITY_BY_STATE,
  authorityFor,
  LEGAL_TRANSITIONS,
  isLegalTransition,
  assertLegalTransition,
  CLAIMABLE_FROM,
  canClaim,
  type OwnershipState,
} from "../lib/conversation-control/model.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── The exact seven-state tuple and its order (no missing state, no extra state) ──
const EXPECTED_STATES = [
  "AI_ACTIVE",
  "HOLD_UNCLAIMED",
  "HUMAN_ACTIVE",
  "HUMAN_IDLE",
  "AI_RESUME_PENDING",
  "SYSTEM_HOLD",
  "CLOSED",
] as const;
ok("exact seven-state tuple, in canonical order", OWNERSHIP_STATES.join(",") === EXPECTED_STATES.join(","));
ok("exactly seven states — no eighth", OWNERSHIP_STATES.length === 7);
for (const s of EXPECTED_STATES) ok(`state present: ${s}`, (OWNERSHIP_STATES as readonly string[]).includes(s));
ok("no extra state beyond the expected seven", OWNERSHIP_STATES.every((s) => (EXPECTED_STATES as readonly string[]).includes(s)));
ok("no runtime HUMAN_WAITING state (documentation alias only)", !(OWNERSHIP_STATES as readonly string[]).includes("HUMAN_WAITING"));
ok("tuple has no duplicate entries", new Set(OWNERSHIP_STATES).size === OWNERSHIP_STATES.length);

// ── The authority mapping: exact, total, and never dual ───────────────────────────
const EXPECTED_AUTHORITY: Record<OwnershipState, "AI" | "HUMAN" | "NONE"> = {
  AI_ACTIVE: "AI",
  HOLD_UNCLAIMED: "NONE",
  HUMAN_ACTIVE: "HUMAN",
  HUMAN_IDLE: "HUMAN",
  AI_RESUME_PENDING: "NONE",
  SYSTEM_HOLD: "NONE",
  CLOSED: "NONE",
};
for (const s of OWNERSHIP_STATES) ok(`authority ${s} = ${EXPECTED_AUTHORITY[s]}`, authorityFor(s) === EXPECTED_AUTHORITY[s]);
ok("AUTHORITY_BY_STATE agrees with authorityFor for all seven", OWNERSHIP_STATES.every((s) => AUTHORITY_BY_STATE[s] === authorityFor(s)));
ok("authorityFor only ever returns AI | HUMAN | NONE", OWNERSHIP_STATES.every((s) => ["AI", "HUMAN", "NONE"].includes(authorityFor(s))));
ok("exactly one AI-authority state (AI_ACTIVE)", OWNERSHIP_STATES.filter((s) => authorityFor(s) === "AI").join(",") === "AI_ACTIVE");
ok("HUMAN authority = exactly {HUMAN_ACTIVE, HUMAN_IDLE}", OWNERSHIP_STATES.filter((s) => authorityFor(s) === "HUMAN").join(",") === "HUMAN_ACTIVE,HUMAN_IDLE");
ok("NONE authority = the holds, pending and closed", OWNERSHIP_STATES.filter((s) => authorityFor(s) === "NONE").join(",") === "HOLD_UNCLAIMED,AI_RESUME_PENDING,SYSTEM_HOLD,CLOSED");
// A state maps to ONE authority, so no state can grant AI and HUMAN together.
ok("no state grants AI and HUMAN simultaneously", OWNERSHIP_STATES.every((s) => !(authorityFor(s) === "AI" && (authorityFor(s) as string) === "HUMAN")));

// ── All 49 ordered state-pair results, including self-transitions ─────────────────
// The expected matrix is written out literally here rather than read from the module,
// so the test would catch a silent edit to the table it is meant to police.
const EXPECTED_EDGES: Record<OwnershipState, readonly OwnershipState[]> = {
  AI_ACTIVE: ["HOLD_UNCLAIMED", "HUMAN_ACTIVE", "SYSTEM_HOLD", "CLOSED"],
  HOLD_UNCLAIMED: ["HUMAN_ACTIVE", "SYSTEM_HOLD", "AI_ACTIVE", "CLOSED"],
  HUMAN_ACTIVE: ["HUMAN_IDLE", "AI_ACTIVE", "AI_RESUME_PENDING", "CLOSED"],
  HUMAN_IDLE: ["HUMAN_ACTIVE", "AI_ACTIVE", "AI_RESUME_PENDING", "CLOSED"],
  AI_RESUME_PENDING: ["AI_ACTIVE", "HUMAN_ACTIVE", "CLOSED"],
  SYSTEM_HOLD: ["HUMAN_ACTIVE", "AI_ACTIVE", "CLOSED"],
  CLOSED: ["AI_ACTIVE"],
};
ok("LEGAL_TRANSITIONS matches the expected matrix exactly", OWNERSHIP_STATES.every((s) => LEGAL_TRANSITIONS[s].join(",") === EXPECTED_EDGES[s].join(",")));

let pairCount = 0;
let pairMismatch = 0;
for (const from of OWNERSHIP_STATES) {
  for (const to of OWNERSHIP_STATES) {
    pairCount++;
    const expected = from === to || EXPECTED_EDGES[from].includes(to);
    if (isLegalTransition(from, to) !== expected) {
      pairMismatch++;
      console.log(`  ❌ pair ${from} → ${to}: expected ${expected}`);
    }
  }
}
ok("all 49 ordered state pairs evaluated", pairCount === 49);
ok("all 49 ordered pair results correct (self-transitions legal)", pairMismatch === 0);
for (const s of OWNERSHIP_STATES) ok(`${s} → ${s} (self-loop idempotent no-op)`, isLegalTransition(s, s));

// The specific edges every real flow depends on, named so a regression is readable.
ok("AI_ACTIVE → HUMAN_ACTIVE (takeover)", isLegalTransition("AI_ACTIVE", "HUMAN_ACTIVE"));
ok("AI_ACTIVE → HOLD_UNCLAIMED (escalate, unclaimed)", isLegalTransition("AI_ACTIVE", "HOLD_UNCLAIMED"));
ok("AI_ACTIVE → SYSTEM_HOLD (safety hold fires)", isLegalTransition("AI_ACTIVE", "SYSTEM_HOLD"));
ok("AI_ACTIVE → CLOSED", isLegalTransition("AI_ACTIVE", "CLOSED"));
ok("HOLD_UNCLAIMED → HUMAN_ACTIVE (a human claims it)", isLegalTransition("HOLD_UNCLAIMED", "HUMAN_ACTIVE"));
ok("HOLD_UNCLAIMED → AI_ACTIVE (deliberate resume)", isLegalTransition("HOLD_UNCLAIMED", "AI_ACTIVE"));
ok("HUMAN_ACTIVE → HUMAN_IDLE (human stops responding)", isLegalTransition("HUMAN_ACTIVE", "HUMAN_IDLE"));
ok("HUMAN_ACTIVE → AI_ACTIVE (return to AI)", isLegalTransition("HUMAN_ACTIVE", "AI_ACTIVE"));
ok("HUMAN_ACTIVE → AI_RESUME_PENDING (handback starts)", isLegalTransition("HUMAN_ACTIVE", "AI_RESUME_PENDING"));
ok("HUMAN_IDLE → AI_ACTIVE (auto-return on timeout)", isLegalTransition("HUMAN_IDLE", "AI_ACTIVE"));
ok("HUMAN_IDLE → HUMAN_ACTIVE (human comes back)", isLegalTransition("HUMAN_IDLE", "HUMAN_ACTIVE"));
ok("HUMAN_IDLE → AI_RESUME_PENDING (handback starts)", isLegalTransition("HUMAN_IDLE", "AI_RESUME_PENDING"));
ok("AI_RESUME_PENDING → AI_ACTIVE (validated resume)", isLegalTransition("AI_RESUME_PENDING", "AI_ACTIVE"));
ok("AI_RESUME_PENDING → HUMAN_ACTIVE (reclaim / validation fails)", isLegalTransition("AI_RESUME_PENDING", "HUMAN_ACTIVE"));
ok("SYSTEM_HOLD → HUMAN_ACTIVE (human picks it up)", isLegalTransition("SYSTEM_HOLD", "HUMAN_ACTIVE"));
ok("SYSTEM_HOLD → AI_ACTIVE (deliberate human release)", isLegalTransition("SYSTEM_HOLD", "AI_ACTIVE"));
ok("CLOSED → AI_ACTIVE (customer messages again, reopen)", isLegalTransition("CLOSED", "AI_ACTIVE"));

// Illegal edges, including the Step 3 call-site risks that must STAY illegal.
ok("reject AI_ACTIVE → HUMAN_IDLE (must go via HUMAN_ACTIVE)", !isLegalTransition("AI_ACTIVE", "HUMAN_IDLE"));
ok("reject AI_ACTIVE → AI_RESUME_PENDING (nothing to resume)", !isLegalTransition("AI_ACTIVE", "AI_RESUME_PENDING"));
ok("reject CLOSED → HUMAN_ACTIVE", !isLegalTransition("CLOSED", "HUMAN_ACTIVE"));
ok("reject CLOSED → SYSTEM_HOLD", !isLegalTransition("CLOSED", "SYSTEM_HOLD"));
ok("reject CLOSED → HOLD_UNCLAIMED", !isLegalTransition("CLOSED", "HOLD_UNCLAIMED"));
ok("reject HUMAN_IDLE → SYSTEM_HOLD", !isLegalTransition("HUMAN_IDLE", "SYSTEM_HOLD"));
ok("reject HUMAN_ACTIVE → SYSTEM_HOLD", !isLegalTransition("HUMAN_ACTIVE", "SYSTEM_HOLD"));
ok("reject HUMAN_ACTIVE → HOLD_UNCLAIMED", !isLegalTransition("HUMAN_ACTIVE", "HOLD_UNCLAIMED"));
ok("reject SYSTEM_HOLD → HOLD_UNCLAIMED", !isLegalTransition("SYSTEM_HOLD", "HOLD_UNCLAIMED"));
ok("reject HOLD_UNCLAIMED → AI_RESUME_PENDING", !isLegalTransition("HOLD_UNCLAIMED", "AI_RESUME_PENDING"));
ok("reject AI_RESUME_PENDING → SYSTEM_HOLD", !isLegalTransition("AI_RESUME_PENDING", "SYSTEM_HOLD"));
ok("reject AI_RESUME_PENDING → HOLD_UNCLAIMED", !isLegalTransition("AI_RESUME_PENDING", "HOLD_UNCLAIMED"));
ok("reject AI_RESUME_PENDING → HUMAN_IDLE", !isLegalTransition("AI_RESUME_PENDING", "HUMAN_IDLE"));
// SYSTEM_HOLD→HUMAN_IDLE is the transition the auto-return guard avoids (SYSTEM_HOLD
// bails to realert before the auto-return). #87: a safety hold never auto-returns.
ok("reject SYSTEM_HOLD → HUMAN_IDLE (auto-return guard, #87)", !isLegalTransition("SYSTEM_HOLD", "HUMAN_IDLE"));
// CLOSED→AI_ACTIVE is the legal reopen the inbound + operator-send fixes rely on.
ok("allow CLOSED → AI_ACTIVE (legal reopen the fixes use)", isLegalTransition("CLOSED", "AI_ACTIVE"));

// ── Null/absent bootstrap behavior: never block an unknown or legacy row ──────────
ok("null → HUMAN_ACTIVE (legacy row, allow)", isLegalTransition(null, "HUMAN_ACTIVE"));
ok("undefined → AI_ACTIVE (legacy row, allow)", isLegalTransition(undefined, "AI_ACTIVE"));
ok("null from is permitted into EVERY state", OWNERSHIP_STATES.every((s) => isLegalTransition(null, s) && isLegalTransition(undefined, s)));

// ── assertLegalTransition: throws on illegal, passes on legal, message preserved ──
let threw = false;
try { assertLegalTransition("CLOSED", "HUMAN_ACTIVE"); } catch { threw = true; }
ok("assert throws on illegal CLOSED → HUMAN_ACTIVE", threw);
threw = false;
try { assertLegalTransition("AI_ACTIVE", "HUMAN_ACTIVE"); } catch { threw = true; }
ok("assert does NOT throw on legal AI_ACTIVE → HUMAN_ACTIVE", !threw);
let message = "";
try { assertLegalTransition("CLOSED", "SYSTEM_HOLD"); } catch (e) { message = (e as Error).message; }
ok("assert default message keeps the [ownership] prefix", message === "[ownership] illegal transition CLOSED → SYSTEM_HOLD");
message = "";
try { assertLegalTransition("CLOSED", "SYSTEM_HOLD", "conversation-control"); } catch (e) { message = (e as Error).message; }
ok("assert scope label yields the [conversation-control] prefix", message === "[conversation-control] illegal transition CLOSED → SYSTEM_HOLD");
// assert and predicate agree on every one of the 49 pairs.
let assertMismatch = 0;
for (const from of OWNERSHIP_STATES) {
  for (const to of OWNERSHIP_STATES) {
    let t = false;
    try { assertLegalTransition(from, to); } catch { t = true; }
    if (t === isLegalTransition(from, to)) assertMismatch++;
  }
}
ok("assert and predicate agree on all 49 pairs", assertMismatch === 0);

// ── Claimability (MO2 lineage): the exact claimable-source set and its rules ──────
ok("claimable source set is exactly {AI_ACTIVE, HOLD_UNCLAIMED, HUMAN_IDLE, SYSTEM_HOLD}",
  CLAIMABLE_FROM.join(",") === "AI_ACTIVE,HOLD_UNCLAIMED,HUMAN_IDLE,SYSTEM_HOLD");
ok("claimable set contains exactly four states", CLAIMABLE_FROM.length === 4);
ok("HUMAN_ACTIVE is NOT in the claimable source set", !CLAIMABLE_FROM.includes("HUMAN_ACTIVE"));

ok("claim AI_ACTIVE (unowned) = claimable", canClaim({ ownershipState: "AI_ACTIVE", assignedMemberId: null }, "m1"));
ok("claim HOLD_UNCLAIMED (unowned) = claimable", canClaim({ ownershipState: "HOLD_UNCLAIMED", assignedMemberId: null }, "m1"));
ok("claim HUMAN_IDLE (unowned) = claimable", canClaim({ ownershipState: "HUMAN_IDLE", assignedMemberId: null }, "m1"));
ok("claim SYSTEM_HOLD (unowned) = claimable", canClaim({ ownershipState: "SYSTEM_HOLD", assignedMemberId: null }, "m1"));
ok("claim SYSTEM_HOLD already mine = claimable (idempotent)", canClaim({ ownershipState: "SYSTEM_HOLD", assignedMemberId: "m1" }, "m1"));
ok("claim AI_RESUME_PENDING = NOT claimable (validation in flight)", !canClaim({ ownershipState: "AI_RESUME_PENDING", assignedMemberId: null }, "m1"));
ok("claim AI_RESUME_PENDING even if assigned to me = NOT claimable", !canClaim({ ownershipState: "AI_RESUME_PENDING", assignedMemberId: "m1" }, "m1"));
ok("claim CLOSED = NOT claimable", !canClaim({ ownershipState: "CLOSED", assignedMemberId: null }, "m1"));

// Current-assignee behaviour in HUMAN_ACTIVE, and teammate-owned rejection.
ok("claim own HUMAN_ACTIVE = idempotent success", canClaim({ ownershipState: "HUMAN_ACTIVE", assignedMemberId: "m1" }, "m1"));
ok("claim teammate's HUMAN_ACTIVE = conflict (not claimable)", !canClaim({ ownershipState: "HUMAN_ACTIVE", assignedMemberId: "m2" }, "m1"));
ok("claim unassigned HUMAN_ACTIVE = not claimable (route 409s)", !canClaim({ ownershipState: "HUMAN_ACTIVE", assignedMemberId: null }, "m1"));
ok("a teammate-owned conversation is never claimable, in ANY state",
  OWNERSHIP_STATES.every((s) => !canClaim({ ownershipState: s, assignedMemberId: "someone-else" }, "m1")));
ok("unowned claimability equals CLAIMABLE_FROM membership, for all seven states",
  OWNERSHIP_STATES.every((s) => canClaim({ ownershipState: s, assignedMemberId: null }, "m1") === CLAIMABLE_FROM.includes(s)));
ok("a null/absent ownership state is not claimable",
  !canClaim({ ownershipState: null, assignedMemberId: null }, "m1") && !canClaim({ ownershipState: undefined, assignedMemberId: null }, "m1"));

// Two operators racing the SAME claimable conversation → exactly one winner. Model
// the DB's atomic serialization: the winner's claim flips ownership to them, so the
// loser then sees a teammate-owned row and canClaim returns false. This is the pure
// application mirror of the race — NOT proof of the atomic database claim.
for (const s of ["AI_ACTIVE", "HOLD_UNCLAIMED", "HUMAN_IDLE", "SYSTEM_HOLD"] as const) {
  let row: { ownershipState: OwnershipState; assignedMemberId: string | null } = { ownershipState: s, assignedMemberId: null };
  const m1Wins = canClaim(row, "m1");
  if (m1Wins) row = { ownershipState: "HUMAN_ACTIVE", assignedMemberId: "m1" }; // atomic UPDATE serialized m1 first
  const m2After = canClaim(row, "m2");
  ok(`race on ${s}: exactly one winner (m1 wins, m2 conflicts)`, m1Wins && !m2After);
}

console.log(`\nOWNERSHIP-TRANSITIONS UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
