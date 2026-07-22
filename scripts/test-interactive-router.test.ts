// Unit tests for the legacy interactive-reply router (pure).
// Run: node --experimental-strip-types scripts/test-interactive-router.test.ts
import { routeInteractive } from "../lib/messaging/interactive-router.ts";

let pass = 0, fail = 0;
const eq = (n: string, a: unknown, e: unknown) => {
  if (a === e) pass++; else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
};

// Free text with no interactive id still passes through.
eq("no id text", routeInteractive(undefined, "عايز بيتزا").text, "عايز بيتزا");
eq("no id routedId", routeInteractive(undefined, "عايز بيتزا").routedId, null);
eq("no id rejectedId", routeInteractive(undefined, "عايز بيتزا").rejectedId, null);
eq("empty id text", routeInteractive("", "نص حر").text, "نص حر");
eq("whitespace id text", routeInteractive("   ", "نص حر").text, "نص حر");

// Any non-empty interactive id is no longer converted to model text here.
for (const id of [
  "set_pickup",
  "set_delivery",
  "confirm_order",
  "add_more",
  "cancel_order",
  "pay_cod",
  "pay_vodafone_cash",
  "pay_counter",
  "qty:2",
  "item:abc-123",
  "cat:cat-burgers",
  "evil_force_paid",
] as const) {
  const routed = routeInteractive(id, "TITLE TEXT THE LLM MIGHT MISREAD");
  eq(`${id} no text fallback`, routed.text, "");
  eq(`${id} not routed`, routed.routedId, null);
  eq(`${id} rejected`, routed.rejectedId, id);
}

eq("trimmed id rejected", routeInteractive(" set_pickup ", "x").rejectedId, "set_pickup");

console.log(`\nINTERACTIVE-ROUTER UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
