// Unit tests for the conversation ownership-state transition map (pure, no DB).
// Run: node --experimental-strip-types scripts/test-ownership-transitions.test.ts
import { isLegalTransition, assertLegalTransition, OWNERSHIP_STATES } from "../lib/db/ownership.ts";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// --- The legal transitions every real flow performs ---
ok("AI_ACTIVE → HUMAN_ACTIVE (takeover)", isLegalTransition("AI_ACTIVE", "HUMAN_ACTIVE"));
ok("AI_ACTIVE → SYSTEM_HOLD (safety hold fires)", isLegalTransition("AI_ACTIVE", "SYSTEM_HOLD"));
ok("AI_ACTIVE → CLOSED", isLegalTransition("AI_ACTIVE", "CLOSED"));
ok("HUMAN_ACTIVE → HUMAN_IDLE (human stops responding)", isLegalTransition("HUMAN_ACTIVE", "HUMAN_IDLE"));
ok("HUMAN_ACTIVE → AI_ACTIVE (return to AI)", isLegalTransition("HUMAN_ACTIVE", "AI_ACTIVE"));
ok("HUMAN_IDLE → AI_ACTIVE (auto-return on timeout)", isLegalTransition("HUMAN_IDLE", "AI_ACTIVE"));
ok("HUMAN_IDLE → HUMAN_ACTIVE (human comes back)", isLegalTransition("HUMAN_IDLE", "HUMAN_ACTIVE"));
ok("SYSTEM_HOLD → HUMAN_ACTIVE (human picks it up)", isLegalTransition("SYSTEM_HOLD", "HUMAN_ACTIVE"));
ok("SYSTEM_HOLD → AI_ACTIVE (deliberate human release)", isLegalTransition("SYSTEM_HOLD", "AI_ACTIVE"));
ok("CLOSED → AI_ACTIVE (customer messages again, reopen)", isLegalTransition("CLOSED", "AI_ACTIVE"));

// --- Idempotent self-transitions are allowed (operator sends a 2nd message, etc.) ---
for (const s of OWNERSHIP_STATES) ok(`${s} → ${s} (self-loop no-op)`, isLegalTransition(s, s));

// --- Unknown/legacy current state (null) is permissive (never block an existing flow) ---
ok("null → HUMAN_ACTIVE (legacy row, allow)", isLegalTransition(null, "HUMAN_ACTIVE"));
ok("undefined → AI_ACTIVE (legacy row, allow)", isLegalTransition(undefined, "AI_ACTIVE"));

// --- Illegal transitions are rejected ---
ok("reject AI_ACTIVE → HUMAN_IDLE (must go via HUMAN_ACTIVE)", !isLegalTransition("AI_ACTIVE", "HUMAN_IDLE"));
ok("reject CLOSED → HUMAN_ACTIVE", !isLegalTransition("CLOSED", "HUMAN_ACTIVE"));
ok("reject CLOSED → SYSTEM_HOLD", !isLegalTransition("CLOSED", "SYSTEM_HOLD"));
ok("reject HUMAN_IDLE → SYSTEM_HOLD", !isLegalTransition("HUMAN_IDLE", "SYSTEM_HOLD"));
ok("reject HUMAN_ACTIVE → SYSTEM_HOLD", !isLegalTransition("HUMAN_ACTIVE", "SYSTEM_HOLD"));

// --- assertLegalTransition throws on illegal, passes on legal ---
let threw = false;
try { assertLegalTransition("CLOSED", "HUMAN_ACTIVE"); } catch { threw = true; }
ok("assert throws on illegal CLOSED → HUMAN_ACTIVE", threw);
threw = false;
try { assertLegalTransition("AI_ACTIVE", "HUMAN_ACTIVE"); } catch { threw = true; }
ok("assert does NOT throw on legal AI_ACTIVE → HUMAN_ACTIVE", !threw);

console.log(`\nOWNERSHIP-TRANSITIONS UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
