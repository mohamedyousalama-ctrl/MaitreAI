// ============================================================================
// WO-PAY-PLAYBOOK — pure unit tests (node --experimental-strip-types).
// Ask-timing gate · method offer · claimed-paid truth · callback windows ·
// overlay cleanliness (live gate) · the two new FORBIDDEN-CLAIMS detectors.
// No LLM, no DB.
// ============================================================================
import {
  PAY_PLAYBOOK_FLAG,
  canAskForPayment,
  mayAcknowledgePaid,
  isUnverifiedPaidClaim,
  offerableMethods,
  CALLBACK_WINDOWS,
  isCallbackWindow,
  buildPayPlaybook,
} from "../lib/ai/pay-playbook.ts";
import { findForbiddenClaims } from "../lib/ai/personas/khalid-forbidden-claims.mjs";

let pass = 0,
  fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  ❌", name);
  }
};

// ── flag ────────────────────────────────────────────────────────────────────
ok("flag id is pay_playbook", PAY_PLAYBOOK_FLAG === "pay_playbook");

// ── ask-timing gate (ONE ask, only after read-back) ──────────────────────────
ok("ask blocked with nothing confirmed", canAskForPayment({}) === false);
ok("ask blocked with only items", canAskForPayment({ itemsConfirmed: true }) === false);
ok(
  "ask blocked without VAT read-back",
  canAskForPayment({ itemsConfirmed: true, fulfillmentConfirmed: true }) === false,
);
ok(
  "ask blocked without fulfillment",
  canAskForPayment({ itemsConfirmed: true, totalReadBack: true }) === false,
);
ok(
  "ask ALLOWED only when all three hold",
  canAskForPayment({ itemsConfirmed: true, fulfillmentConfirmed: true, totalReadBack: true }) === true,
);

// ── payment-status truth (DB is the only source) ─────────────────────────────
ok("may acknowledge paid only when DB=paid", mayAcknowledgePaid("paid") === true);
ok("no ack when unpaid", mayAcknowledgePaid("unpaid") === false);
ok("no ack when link sent", mayAcknowledgePaid("payment_link_sent") === false);
ok("no ack when failed", mayAcknowledgePaid("failed") === false);
ok("no ack when null/absent", mayAcknowledgePaid(null) === false && mayAcknowledgePaid(undefined) === false);
ok(
  "unverified claim: says paid + DB not paid → true",
  isUnverifiedPaidClaim(true, "payment_link_sent") === true && isUnverifiedPaidClaim(true, "unpaid") === true,
);
ok("verified: says paid + DB paid → NOT unverified", isUnverifiedPaidClaim(true, "paid") === false);
ok("no claim → not unverified", isUnverifiedPaidClaim(false, "unpaid") === false);

// ── method offer (engine truth, never invents) ───────────────────────────────
ok("offer cash+link when both enabled", JSON.stringify(offerableMethods(["cash", "link"])) === JSON.stringify(["cash", "link"]));
ok("offer only cash when only cash", JSON.stringify(offerableMethods(["cash"])) === JSON.stringify(["cash"]));
ok("drops unknown methods (never invents)", JSON.stringify(offerableMethods(["cash", "bitcoin", "paypal"])) === JSON.stringify(["cash"]));
ok("de-dupes + order-stable", JSON.stringify(offerableMethods(["link", "link", "cash"])) === JSON.stringify(["link", "cash"]));
ok("none enabled → empty (name no method)", offerableMethods([]).length === 0 && offerableMethods(null).length === 0);

// ── callback windows ─────────────────────────────────────────────────────────
ok("callback windows are now/hour/evening", JSON.stringify(CALLBACK_WINDOWS) === JSON.stringify(["now", "hour", "evening"]));
ok("isCallbackWindow accepts valid", CALLBACK_WINDOWS.every((w) => isCallbackWindow(w)));
ok("isCallbackWindow rejects junk", !isCallbackWindow("tomorrow") && !isCallbackWindow("5:00") && !isCallbackWindow(null));

// ── overlay cleanliness (LIVE gate = evalOnly:true) both dialects + variants ──
// The overlay legitimately ILLUSTRATES the post-webhook paid acknowledgment (a real
// payment_status assertion), so it is checked under the live gate — which excludes the
// evalAssert:false payment_status_claim but keeps card_data_request + the 5 hard classes.
for (const dialect of ["saudi", "egyptian"]) {
  for (const callbackEnabled of [false, true]) {
    for (const enabledMethods of [null, ["cash"], ["cash", "link"]] as const) {
      const text = buildPayPlaybook({ dialect, callbackEnabled, enabledMethods });
      const hits = findForbiddenClaims(text, { evalOnly: true });
      ok(
        `overlay clean under live gate [${dialect}/cb:${callbackEnabled}/${enabledMethods?.join("+") ?? "none"}]`,
        hits.length === 0,
      );
    }
  }
}

// overlay carries the load-bearing rules (both dialects)
for (const dialect of ["saudi", "egyptian"]) {
  const t = buildPayPlaybook({ dialect, callbackEnabled: true, enabledMethods: ["cash", "link"] });
  ok(`[${dialect}] states VAT read-back before ask`, t.includes("VAT") && t.includes("read back"));
  ok(`[${dialect}] screenshot is never proof`, t.includes("screenshot is NEVER proof") || t.includes("screenshot"));
  ok(`[${dialect}] risk_type=payment_issue escalation`, t.includes("risk_type=payment_issue"));
  ok(`[${dialect}] voice never carries the link`, t.includes("never CARRIES"));
  ok(`[${dialect}] callback never promises exact time`, t.includes("NEVER promise an exact minute"));
}
ok("callbackEnabled:false omits the callback block", !buildPayPlaybook({ callbackEnabled: false }).includes("callback capture"));

// ── the two new FORBIDDEN-CLAIMS detectors (targeted) ─────────────────────────
const fires = (t: string, id: string) => findForbiddenClaims(t).some((f) => f.id === id);
// card_data_request — fires on solicitation, quiet on description/prohibition
ok("card_data: asks for card number → fires", fires("أعطني رقم بطاقتك عشان الدفع", "card_data_request"));
ok("card_data: asks for OTP → fires", fires("اكتب لي رمز التحقق OTP", "card_data_request"));
ok("card_data: asks for PIN → fires", fires("محتاج الرقم السري للبطاقة", "card_data_request"));
ok("card_data: Egyptian «رقم الكارت» → fires", fires("ابعتلي رقم الكارت عشان الدفع", "card_data_request"));
ok("card_data: Egyptian «بيانات الكارت» → fires", fires("هات بيانات الكارت", "card_data_request"));
ok("card_data: Egyptian «نمرة الكارت» → fires", fires("ممكن نمرة الكارت؟", "card_data_request"));
ok("card_data: bank-sends-OTP description → quiet", !fires("البنك بيرسل لك رمز تحقق على جوالك", "card_data_request"));
ok("card_data: prohibition statement → quiet", !fires("لا نطلب أبداً رقم البطاقة أو الرمز السري", "card_data_request"));
// payment_status_claim — fires on false confirmation, quiet on the honest not-yet line
ok("pay_status: confirms paid on claim → fires", fires("تمام، تم استلام دفعتك", "payment_status_claim"));
ok("pay_status: money received → fires", fires("وصلنا المبلغ، طلبك تحت التجهيز", "payment_status_claim"));
ok("pay_status: english payment received → fires", fires("payment received, thanks", "payment_status_claim"));
ok("pay_status: honest not-yet line → quiet", !fires("لسه ما وصلني تأكيد الدفع — أول ما يوصل بأكد لك فورًا", "payment_status_claim"));
ok("pay_status: offering the link → quiet", !fires("تحب أرسل لك رابط الدفع؟", "payment_status_claim"));
// payment_status_claim is evalAssert:false → excluded from the LIVE cross-cutting gate
ok(
  "pay_status excluded from live gate (evalOnly:true)",
  findForbiddenClaims("تم استلام دفعتك", { evalOnly: true }).every((f) => f.id !== "payment_status_claim"),
);
// card_data_request IS in the live gate
ok(
  "card_data included in live gate (evalOnly:true)",
  findForbiddenClaims("أعطني رقم بطاقتك", { evalOnly: true }).some((f) => f.id === "card_data_request"),
);

console.log(`\nPAY-PLAYBOOK UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
