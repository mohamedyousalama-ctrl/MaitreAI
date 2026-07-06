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
// Codex: assert on the concrete CALL (with args), not the bare name — the import at
// the top would satisfy indexOf even if the actual guard call were removed.
const STATUS_CALL = 'checkOrderSafetyHold(admin, tenant.restaurantId, params.id)';
check("(status) the actual guard CALL is present", status.includes(STATUS_CALL));
check("(status) guard CALL runs BEFORE the write",
  status.indexOf(STATUS_CALL) > 0 && status.indexOf(STATUS_CALL) < status.indexOf('.update({ order_status'));

// ---- Payment route: blocks marking paid ------------------------------------
const payment = read("app/api/orders/[id]/payment/route.ts");
const PAY_CALL = 'checkOrderSafetyHold(admin, tenant.restaurantId, params.id)';
check("(payment) guards the paid transition (call inside the paid block)", /if \(paymentStatus === "paid"\) \{[\s\S]*checkOrderSafetyHold\(admin, tenant\.restaurantId, params\.id\)/.test(payment));
check("(payment) blocks with 409 safety_hold_active",
  /error: "safety_hold_active"[\s\S]*status: 409/.test(payment));
check("(payment) the actual guard CALL runs BEFORE the write",
  payment.indexOf(PAY_CALL) > 0 && payment.indexOf(PAY_CALL) < payment.indexOf(".update(patch)"));

// ---- PSP session-create also guards a held order (Codex) --------------------
const psp = read("app/api/payments/psp/create/route.ts");
check("(psp create) guards before creating the session", psp.includes("checkOrderSafetyHold(admin, tenant.restaurantId, orderId)"));
check("(psp create) guard CALL runs BEFORE createMoyasarSession",
  psp.indexOf("checkOrderSafetyHold(admin, tenant.restaurantId, orderId)") < psp.indexOf("createMoyasarSession(admin"));
check("(psp create) blocks with 409 safety_hold_active", /error: "safety_hold_active"[\s\S]*status: 409/.test(psp));

// ---- WO-SAFE-4: the MOCK payments route also guards the paid write ----------
// This surface is mock-env-gated (prod-inert), but "mitigated by a flag" is exactly
// the pattern we reject for safety — the hold guard must be STRUCTURAL, not a flag.
const mock = read("app/api/payments/[sessionId]/route.ts");
const MOCK_CALL = "checkOrderSafetyHold(admin, view.restaurantId, view.orderId)";
check("(mock pay) imports the guard", mock.includes('from "@/lib/db/safety-hold-guard"'));
check("(mock pay) the actual guard CALL is present", mock.includes(MOCK_CALL));
check("(mock pay) guard CALL is inside the success branch, BEFORE the paid write",
  mock.indexOf(MOCK_CALL) > mock.indexOf('body.action === "success"') &&
  mock.indexOf(MOCK_CALL) < mock.indexOf('payment_status: "paid"'));
check("(mock pay) blocks with 409 safety_hold_active", /error: "safety_hold_active"[\s\S]*status: 409/.test(mock));

// ---- INVARIANT: EVERY paid-writer surface carries the hold guard ------------
// The proven set of routes that flip an order to a paid/committed state. Adding a
// new paid-writer without the guard fails this gate — "all paid-writers guarded"
// becomes a CI-enforced invariant, not a review-time hope.
const PAID_WRITERS = [
  "app/api/orders/[id]/status/route.ts",
  "app/api/orders/[id]/payment/route.ts",
  "app/api/payments/psp/create/route.ts",
  "app/api/payments/[sessionId]/route.ts",
];
for (const p of PAID_WRITERS) {
  const src = read(p);
  check(`(invariant) ${p} calls checkOrderSafetyHold`, src.includes("checkOrderSafetyHold("));
  check(`(invariant) ${p} returns 409 safety_hold_active`, /error: "safety_hold_active"[\s\S]*status: 409/.test(src));
}
// The Moyasar webhook is the settled-payment reconciler (money truth stands, held
// orders are flagged not blocked) — it's covered by its own WO-SAFE-1 webhook path,
// so it is intentionally NOT in the pre-write-block set above.

console.log(`\nWO-SAFE-1 PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
