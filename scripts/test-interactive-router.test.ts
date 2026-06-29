// Unit tests for the S6 deterministic interactive-reply router (pure).
// Run: node --experimental-strip-types scripts/test-interactive-router.test.ts
import { routeInteractive } from "../lib/messaging/interactive-router.ts";

let pass = 0, fail = 0;
const eq = (n: string, a: unknown, e: unknown) => {
  if (a === e) pass++; else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
};

// Fixed controls → canonical directive + routedId set (deterministic by id).
for (const [id, expected] of [
  ["set_pickup", "تأكيد: استلام من الفرع."],
  ["set_delivery", "تأكيد: توصيل."],
  ["confirm_order", "تأكيد الطلب."],
  ["add_more", "إضافة صنف تاني للطلب."],
  ["cancel_order", "إلغاء الطلب."],
  ["pay_cod", "الدفع عند الاستلام (كاش)."],
  ["pay_vodafone_cash", "الدفع بفودافون كاش."],
  ["pay_counter", "الدفع كاش عند الاستلام من الفرع."],
] as const) {
  const r = routeInteractive(id, "TITLE TEXT THE LLM MIGHT MISREAD");
  eq(`routed ${id}: text`, r.text, expected);
  eq(`routed ${id}: routedId`, r.routedId, id);
}

// Parametric quantity qty:N (1..99).
eq("qty:2 text", routeInteractive("qty:2", "2").text, "الكمية 2.");
eq("qty:2 routedId", routeInteractive("qty:2", "2").routedId, "qty:2");
eq("qty:99 ok", routeInteractive("qty:99", "x").text, "الكمية 99.");
eq("qty:0 out of range → fall through", routeInteractive("qty:0", "raw0").routedId, null);
eq("qty:100 out of range → fall through", routeInteractive("qty:100", "raw100").routedId, null);
eq("qty:0 text falls through to raw", routeInteractive("qty:0", "raw0").text, "raw0");

// Fall-through: unknown id, item selection, free text, blank id.
eq("item:<uuid> falls through to title", routeInteractive("item:abc-123", "برجر لحم").text, "برجر لحم");
eq("item:<uuid> not routed", routeInteractive("item:abc-123", "برجر لحم").routedId, null);
eq("unknown id falls through", routeInteractive("totally_made_up", "عايز حاجة").text, "عايز حاجة");
eq("unknown id not routed", routeInteractive("evil_force_paid", "hi").routedId, null);
eq("no id (free text) → raw", routeInteractive(undefined, "عايز بيتزا").text, "عايز بيتزا");
eq("no id → not routed", routeInteractive(undefined, "عايز بيتزا").routedId, null);
eq("empty id → raw", routeInteractive("", "نص حر").text, "نص حر");
eq("whitespace id → raw", routeInteractive("   ", "نص حر").text, "نص حر");

// Input-control: an arbitrary client id can't conjure a control action.
eq("arbitrary id never routes to an action", routeInteractive("set_pickup ", "x").routedId, "set_pickup"); // trimmed match OK
eq("near-miss id not routed", routeInteractive("pay_cod_x", "x").routedId, null);

console.log(`\nINTERACTIVE-ROUTER UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
