// WO-LIVE4-F5 — RED-FIRST: a §6 checkpoint ACK must be recorded even when the SAME
// message also mentions an allergen. Live #1005-class (conv, «لا مفيش اي حساسه اكد
// الاوردر» = "no there's no allergy, confirm the order"): the message mentions «حساسه»,
// so the allergen gate fires → enterCompanion → it takes the companion §1a MENTION branch
// and NEVER reached the else-branch ack recognition → the §6 checkpoint re-fired forever.
// Fix: record the ack in the mention branch too (mention-merge unchanged; the denial NEVER
// suppresses the recorded note — standing law; NO new negation logic — the rejected half).
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-checkpoint-ack-f5.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import { detectAllergenAvoidance } from "../lib/ai/allergen-gate.ts";
import { detectPhoneticSafetyNet } from "../lib/ai/phonetic-safety-net.ts";
import { decideCompanionAction } from "../lib/ai/allergen-companion-flow.ts";
import { isExplicitOrderConfirmation } from "../lib/ai/order-confirm.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const LIVE_ACK = "لا مفيش اي حساسه اكد الاوردر";
const src = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");

// ── SECTION A — wiring (the red witness): the ack recorder is called in BOTH branches ──
ok("A: maybeRecordCheckpointAck helper is defined", /const maybeRecordCheckpointAck\s*=\s*async/.test(src));
ok("A: it is called in the companion §1a MENTION branch (the fix — right after the note merge, before the block closes)",
  // `[^}]` forbids a closing brace in the gap, so this can ONLY match the ack call INSIDE
  // the mention block (removing it makes the nearest call the else-branch one, across a
  // `}`, → no match → red).
  /ctx\.sessionAllergyNote\s*=\s*companionDecision\.note;[^}]*?await maybeRecordCheckpointAck\(\);[^}]*?result\s*=\s*await runRespond\(\);/.test(src));
ok("A: it is still called in the normal (else) branch",
  /Normal turn[\s\S]{0,400}?await maybeRecordCheckpointAck\(\);/.test(src));
ok("A: it is called at least twice (both branches)",
  (src.match(/await maybeRecordCheckpointAck\(\);/g) ?? []).length >= 2);
// The ACTIVE-emergency sub-branch must NOT record an ack (an emergency overrides finalize).
const emergencyBlock = (src.match(/path === "emergency"\)\s*\{[\s\S]*?\}\s*else\s*\{/) ?? [""])[0];
ok("A: the ACTIVE-emergency sub-branch does NOT record a checkpoint ack",
  emergencyBlock.length > 0 && !/maybeRecordCheckpointAck/.test(emergencyBlock));

// ── SECTION B — the live ack routes to the mention branch AND is a valid confirmation ──
// «حساسه» is phonetically near «حساسية», so the PHONETIC safety net fires → it feeds
// combinedAllergenHit → enterCompanion=true → the companion branch (NOT the else branch).
// This is the exact routing that made the ack a §1a mention instead of a checkpoint ack.
ok("B: the phonetic safety net FIRES on «حساسه» (so combinedAllergenHit → enterCompanion → companion branch)",
  detectPhoneticSafetyNet(LIVE_ACK).fired === true);
ok("B: the plain avoidance gate does NOT fire (confirming it's the phonetic net that routes it)",
  detectAllergenAvoidance(LIVE_ACK).fired === false);
{
  const d = decideCompanionAction(LIVE_ACK, "فول سوداني");
  ok("B: the live ack routes to the §1a MENTION path (NOT emergency)", d.path === "mention");
  // Standing law — the customer's denial NEVER suppresses the recorded allergy note.
  ok("B: mention-merge unchanged — the existing note «فول سوداني» is preserved", d.note.includes("فول سوداني"));
}
ok("B: the live ack IS an explicit order confirmation (so the checkpoint condition holds)",
  isExplicitOrderConfirmation(LIVE_ACK) === true);

// ── The ack condition is exactly «checkpointPending && isExplicitOrderConfirmation» ──
// (companionOn + a session note are the other two conjuncts — booleans set upstream).
ok("condition: a plain thanks «شكراً» is NOT a confirmation → no ack", !isExplicitOrderConfirmation("شكراً"));
ok("condition: «لا تأكد» (don't confirm) is NOT a confirmation → no ack (pre-existing negation, unchanged)",
  !isExplicitOrderConfirmation("لا تأكد الطلب"));
// The live ack leads with «لا مفيش» (no allergy) — that denial must NOT flip the
// confirmation off (it's not a «لا تأكد» negation): F5 adds NO new negation logic.
ok("condition: the leading «لا مفيش حساسه» denial does NOT cancel the «اكد» confirmation",
  isExplicitOrderConfirmation(LIVE_ACK) === true);

console.log(`\n${fail === 0 ? "✅" : "❌"} checkpoint-ack-f5: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
