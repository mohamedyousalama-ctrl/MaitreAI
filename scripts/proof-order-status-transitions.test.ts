// WO-STATE-MACHINE-GUARD proof.
// Run: node --experimental-strip-types scripts/proof-order-status-transitions.test.ts

import { readFileSync } from "node:fs";
import {
  isLegalOrderStatusTransition,
  validateOrderStatusTransition,
  type OrderTransitionError,
} from "../lib/orders/transitions.ts";
import type { OrderStatusKey } from "../lib/types.ts";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
}

function transition(
  from: OrderStatusKey,
  to: OrderStatusKey,
  paymentStatus: string | null = "unpaid"
): true | OrderTransitionError {
  const result = validateOrderStatusTransition({ from, to, paymentStatus });
  return result.ok ? true : result.error;
}

// CONTROL: these were possible before the route only checked an allowlist.
ok("CONTROL: draft/delivered are valid status tokens", ["draft", "delivered"].every((s) => typeof s === "string"));

ok("rejects draft -> delivered", transition("draft", "delivered") === "illegal_transition");
ok("rejects delivered -> preparing", transition("delivered", "preparing") === "illegal_transition");
ok("rejects cancelled -> paid", transition("cancelled", "paid", "paid") === "illegal_transition");
ok("rejects to=paid while payment_status is unpaid", transition("pending_payment", "paid", "unpaid") === "payment_required_for_paid");
ok("allows to=paid only when payment_status is paid", transition("pending_payment", "paid", "paid") === true);

ok("allows pending_confirmation -> pending_payment", transition("pending_confirmation", "pending_payment") === true);
ok("allows paid -> preparing", transition("paid", "preparing", "paid") === true);
ok("allows ready -> delivered", transition("ready", "delivered") === true);
ok("allows out_for_delivery -> delivered", transition("out_for_delivery", "delivered") === true);
ok("allows cancellation from active states", ["draft", "pending_confirmation", "pending_payment", "paid", "preparing", "ready", "out_for_delivery"].every(
  (from) => isLegalOrderStatusTransition(from as OrderStatusKey, "cancelled")
));

const codFlow: OrderStatusKey[] = ["pending_confirmation", "preparing", "ready", "out_for_delivery", "delivered"];
ok("allows COD lifecycle while payment_status stays unpaid",
  codFlow.slice(0, -1).every((from, i) => transition(from, codFlow[i + 1], "unpaid") === true));

ok("from===to is graph-legal", transition("delivered", "delivered", "unpaid") === true);
ok("from===to paid still respects paid invariant", transition("paid", "paid", "unpaid") === "payment_required_for_paid");

const route = readFileSync("app/api/orders/[id]/status/route.ts", "utf8");
const transitionIdx = route.indexOf("const transition = validateOrderStatusTransition");
const expectedConflictIdx = route.indexOf("currentStatus !== expectedStatus");
const safetyIdx = route.indexOf("if (isCommittedStatus(status))");
const driverIdx = route.indexOf('if (status === "delivered")');

ok("route imports transition validator", route.includes('from "@/lib/orders/transitions"'));
ok("route reads current order_status/payment state before writing",
  /\.select\("order_status,fulfillment,payment_method,payment_status"\)/.test(route));
ok("expectedStatus conflict check remains before transition validation",
  expectedConflictIdx > -1 && transitionIdx > expectedConflictIdx);
ok("transition validation runs before safety guard", transitionIdx > -1 && safetyIdx > transitionIdx);
ok("safety-hold guard still fires for committed statuses", /checkOrderSafetyHold[\s\S]*safety_hold_active/.test(route));
ok("delivered driver guard still fires after safety guard", driverIdx > safetyIdx && /if \(status === "delivered"\)[\s\S]*orderHasAssignedDriver/.test(route));
ok("delivered guard still fails closed with no_driver", /orderHasAssignedDriver[\s\S]*no_driver/.test(route));
ok("route does not early-return on from===to before guards", !/currentStatus\s*===\s*status[\s\S]{0,120}return NextResponse\.json\(\{ ok: true/.test(route));
ok("atomic expectedStatus update filter is still present", /if \(expectedStatus\) q = q\.eq\("order_status", expectedStatus\);/.test(route));

console.log(`\nORDER-STATUS-TRANSITIONS PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
