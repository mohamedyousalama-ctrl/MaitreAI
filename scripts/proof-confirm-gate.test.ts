// WO-LIVE5-CONFIRM-GATE — RED-FIRST: a non-confirmation must never create an order.
// Live #1005 (04:00:28): after «تأكد الطلب؟», the customer's «ابعتلي صوره العرض» («send
// ME a photo») matched the confirmation verb «ابعت» and auto-finalized a PHANTOM order.
// Part A — isExplicitOrderConfirmation rejects a receive/photo/menu request. Part B — the
// finalize_draft tool refuses when the turn's message isn't a confirmation (closes the
// model-tool-loop path). Every legitimate confirmation form is unchanged.
// Run: node --conditions=react-server --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-confirm-gate.test.ts
import { isExplicitOrderConfirmation } from "../lib/ai/order-confirm.ts";
import { executeTool } from "../lib/ai/tools.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── PART A — the detector ─────────────────────────────────────────────────────
// THE FIX (red→green): the live #1005 photo request is NOT a confirmation.
ok("live #1005: «ابعتلي صوره العرض» is NOT a confirmation", !isExplicitOrderConfirmation("ابعتلي صوره العرض"));
ok("«ابعتلي صوره الاكيل» is NOT a confirmation", !isExplicitOrderConfirmation("ابعتلي صوره الاكيل"));
ok("«ابعتلي المنيو» (menu request) is NOT a confirmation", !isExplicitOrderConfirmation("ابعتلي المنيو"));
ok("«وريني الصور» (show me) is NOT a confirmation", !isExplicitOrderConfirmation("وريني الصور"));
ok("«شوفني كتالوج العروض» is NOT a confirmation", !isExplicitOrderConfirmation("شوفني كتالوج العروض"));

// Live #1018-class: confirming allergy status / asking for a new order is NOT a
// confirmation of the stale pending order.
ok("live #1018: new-order + allergy-status confirm is NOT an order confirmation",
  !isExplicitOrderConfirmation("عاوز طلب جديد بس قبل الطلب الجديد حاب ااكد انه ما عندي حساسية من البيض"));
ok("new-order intent «عاوز طلب جديد» is NOT a confirmation", !isExplicitOrderConfirmation("عاوز طلب جديد"));
ok("new-order intent «اوردر تاني» is NOT a confirmation", !isExplicitOrderConfirmation("اوردر تاني"));
ok("new-order intent «اطلب من جديد» is NOT a confirmation", !isExplicitOrderConfirmation("اطلب من جديد"));
ok("allergy-status confirm «حاب اكد اني ما عندي حساسية» is NOT an order confirmation",
  !isExplicitOrderConfirmation("حاب اكد اني ما عندي حساسية"));

// LEGITIMATE confirmations — ALL unchanged (byte-identical requirement).
ok("«أكد» → confirmation", isExplicitOrderConfirmation("أكد"));
ok("«تمام» → confirmation", isExplicitOrderConfirmation("تمام"));
ok("«أكد الطلب» → confirmation", isExplicitOrderConfirmation("أكد الطلب"));
ok("«تأكيد الطلب» → confirmation", isExplicitOrderConfirmation("تأكيد الطلب"));
ok("«أكد الطلب الجديد» → confirmation (new-order disqualifier stays tight)",
  isExplicitOrderConfirmation("أكد الطلب الجديد"));
ok("«أكد الطلب وأنا ما عندي حساسية» → confirmation (explicit order object wins)",
  isExplicitOrderConfirmation("أكد الطلب وأنا ما عندي حساسية"));
ok("«أكد الأوردر» → confirmation", isExplicitOrderConfirmation("أكد الأوردر"));
ok("«كمل الطلب» → confirmation", isExplicitOrderConfirmation("كمل الطلب"));
ok("«ابعت الطلب» (send the ORDER) → confirmation", isExplicitOrderConfirmation("ابعت الطلب"));
ok("«ابعتها» → confirmation", isExplicitOrderConfirmation("ابعتها"));
ok("«أيوه» → confirmation", isExplicitOrderConfirmation("أيوه"));
ok("«yes» → confirmation", isExplicitOrderConfirmation("yes"));
ok("«confirm» → confirmation", isExplicitOrderConfirmation("confirm"));
ok("«send it» → confirmation", isExplicitOrderConfirmation("send it"));
// the minted confirm BUTTON routes to this exact text (interactive-router) → must confirm.
ok("confirm-tap text «تأكيد الطلب.» → confirmation (no regression)", isExplicitOrderConfirmation("تأكيد الطلب."));

// Negations stay negative.
ok("«لا تأكد» → NOT a confirmation", !isExplicitOrderConfirmation("لا تأكد"));
ok("«الغِ الطلب» → NOT a confirmation", !isExplicitOrderConfirmation("الغِ الطلب"));

// ── PART B — the finalize_draft tool gate ─────────────────────────────────────
function ctx(userConfirmed: boolean | undefined): Record<string, unknown> {
  const burger = {
    id: "burger", name: "برجر", price: 100, category: "c", available: true, description: "", imageUrl: "",
    modifierIds: [], ingredients: [], allergens: [], variants: [], choiceGroups: [],
  };
  return {
    menuItems: [burger], modifiers: [], deliveryAreas: [], branches: [], geoRouting: false,
    draft: {
      lines: [{ itemId: "burger", name: "برجر", quantity: 1, unitPrice: 100, choices: [], modifiers: [], lineTotal: 100 }],
      fulfillment: "pickup", deliveryZone: null, address: null, deliveryFee: 0,
      subtotal: 100, tax: 0, taxRate: 0, total: 100, currency: "ج.م", paymentMethod: null, finalized: false,
    },
    signals: [], escalation: null, presentation: null, photoRequests: [],
    taxMode: "inclusive", taxRate: 0, paymentConfig: {}, resendReceipt: false, userConfirmed,
  };
}

// userConfirmed === false → REFUSE, no finalize, actionable re-ask directive.
{
  const c = ctx(false);
  const out = executeTool("finalize_draft", {}, c as never);
  ok("gate: non-confirmation → isError (refused)", out.isError === true);
  ok("gate: non-confirmation → draft NOT finalized", (c.draft as { finalized: boolean }).finalized === false);
  ok("gate: refusal directive tells the model to re-ask for an explicit confirm", /تأكيد صريح/.test(out.content));
  ok("gate: an unconfirmed-finalize signal is recorded",
    (c.signals as { detail?: { reason?: string } }[]).some((s) => s.detail?.reason === "finalize_without_confirmation"));
}

// userConfirmed === true → the gate lets it through → the order finalizes.
{
  const c = ctx(true);
  const out = executeTool("finalize_draft", {}, c as never);
  ok("confirmed: finalize succeeds (no error)", !out.isError);
  ok("confirmed: draft IS finalized", (c.draft as { finalized: boolean }).finalized === true);
}

// userConfirmed === undefined (a caller that never sets it, e.g. a unit test) → legacy path.
{
  const c = ctx(undefined);
  const out = executeTool("finalize_draft", {}, c as never);
  ok("legacy (undefined): finalize succeeds — gate is opt-in", !out.isError && (c.draft as { finalized: boolean }).finalized === true);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} confirm-gate: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
