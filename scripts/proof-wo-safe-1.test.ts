// ============================================================================
// WO-SAFE-1 proof harness — order/payment ↔ safety-hold guard.
// Pure isSafetyHeld / isCommittedStatus exercised directly; source assertions
// confirm the status + payment routes block a committed transition while the
// linked conversation is safety-held (409 + reason), that the check is fail-closed,
// and that non-committed moves (cancel/pending) are unaffected.
//
// Run: node --experimental-strip-types scripts/proof-wo-safe-1.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isSafetyHeld, isCommittedStatus, COMMITTED_ORDER_STATUSES } from "../lib/db/safety-hold.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// ---- isSafetyHeld: SYSTEM_HOLD OR is_safety_hold ---------------------------
check("SYSTEM_HOLD ownership → held", isSafetyHeld({ ownership_state: "SYSTEM_HOLD" }));
check("is_safety_hold flag → held", isSafetyHeld({ is_safety_hold: true }));
check("AI_ACTIVE, no flag → not held", !isSafetyHeld({ ownership_state: "AI_ACTIVE", is_safety_hold: false }));
check("HUMAN_ACTIVE (released) → not held", !isSafetyHeld({ ownership_state: "HUMAN_ACTIVE" }));
check("null conv → not held", !isSafetyHeld(null));

// ---- Committed statuses (the ones the guard blocks into) -------------------
check("paid/preparing/ready/out_for_delivery/delivered are committed",
  ["paid", "preparing", "ready", "out_for_delivery", "delivered"].every(isCommittedStatus));
check("draft/pending/cancelled are NOT committed",
  !["draft", "pending_confirmation", "pending_payment", "cancelled"].some(isCommittedStatus));
check("committed set is exactly the 5", COMMITTED_ORDER_STATUSES.length === 5);

// ---- Guard module: fail-closed --------------------------------------------
const guard = read("lib/db/safety-hold-guard.ts");
check("check reads the order's linked conversation ownership + flag",
  guard.includes('.select("ownership_state, is_safety_hold")'));
check("fail-CLOSED on read error (held=true when it can't prove safe)",
  /orderErr[\s\S]*held: true, reason: "safety_hold_check_failed"/.test(guard) && /convErr[\s\S]*held: true/.test(guard));
check("web order with no conversation → not held", /if \(!conversationId\) return \{ held: false/.test(guard));

// ---- Status route: blocks committed transitions ----------------------------
const status = read("app/api/orders/[id]/status/route.ts");
check("(status) guards committed transitions via isCommittedStatus", /if \(isCommittedStatus\(status\)\) \{/.test(status));
check("(status) blocks with 409 safety_hold_active + reason",
  /error: "safety_hold_active"[\s\S]*status: 409/.test(status));
check("(status) guard runs BEFORE the write (checkOrderSafetyHold precedes .update)",
  status.indexOf("checkOrderSafetyHold") < status.indexOf('.update({ order_status'));

// ---- Payment route: blocks marking paid ------------------------------------
const payment = read("app/api/orders/[id]/payment/route.ts");
check("(payment) guards the paid transition", /if \(paymentStatus === "paid"\) \{[\s\S]*checkOrderSafetyHold/.test(payment));
check("(payment) blocks with 409 safety_hold_active",
  /error: "safety_hold_active"[\s\S]*status: 409/.test(payment));
check("(payment) guard runs BEFORE the write", payment.indexOf("checkOrderSafetyHold") < payment.indexOf(".update(patch)"));

console.log(`\nWO-SAFE-1 PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
