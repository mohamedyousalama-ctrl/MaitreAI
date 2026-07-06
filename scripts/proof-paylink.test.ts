// ============================================================================
// WO-PAYLINK-MSG proof — the customer pay-link message composer (pure).
// Guards the verbatim template: order #, VAT-inclusive total in ر.س, the 15-min
// expiry line, the anti-phishing safety line, and Arabic-digit rendering.
//
// Run: node --experimental-strip-types scripts/proof-paylink.test.ts
// ============================================================================

import { payLinkMessage } from "../lib/payments/paylink-message.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } }

const msg = payLinkMessage({
  restaurantName: "سويت شوب",
  orderNumber: "1008",
  total: 148.2,
  payUrl: "https://pay.moyasar.example/inv_123",
});

check("restaurant name present", msg.includes("مطعم سويت شوب"));
check("order # in Arabic digits with #", msg.includes("طلبك رقم #١٠٠٨"));
check("VAT-inclusive total in ر.س (Arabic, 2dp)", msg.includes("الإجمالي: ١٤٨.٢٠ ر.س"));
check("VAT 15% inclusive line", msg.includes("شامل ضريبة القيمة المضافة ١٥٪"));
check("payUrl present verbatim", msg.includes("https://pay.moyasar.example/inv_123"));
check("15-min expiry line", msg.includes("صالح ١٥ دقيقة") && msg.includes("اطلب رابطاً جديداً"));
check("anti-phishing safety line (verbatim)", msg.includes("الدفع يتم فقط داخل صفحة الدفع الآمنة — لا تشارك بيانات بطاقتك في المحادثة"));

// integer total → no trailing .00
{
  const m = payLinkMessage({ restaurantName: "x", orderNumber: "5", total: 50, payUrl: "u" });
  check("integer total → ٥٠ ر.س (no .00)", m.includes("الإجمالي: ٥٠ ر.س"));
}
// order number already prefixed with # → not doubled
{
  const m = payLinkMessage({ restaurantName: "x", orderNumber: "#77", total: 10, payUrl: "u" });
  check("order # already-prefixed → single #", m.includes("طلبك رقم #٧٧") && !m.includes("##"));
}
// six lines, link on its own line (WhatsApp auto-links)
check("payUrl is on its own line", msg.split("\n").some((l) => l === "https://pay.moyasar.example/inv_123"));

console.log(`\nPAYLINK-MSG PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
