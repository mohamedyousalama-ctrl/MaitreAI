// ============================================================================
// WO-POLISH — customer-visible copy/formatting proof.
// Run: npm run proof-polish
// ============================================================================

import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";
import { DIALECTS } from "../lib/ai/dialect.ts";
import { emptyDraft, executeTool, type ToolContext } from "../lib/ai/tools.ts";
import { buildReceiptSvg, type ReceiptData } from "../lib/render/receipt.ts";
import {
  formatCustomerVisiblePresentation,
  formatCustomerVisibleText,
  optionValueOnly,
  sanitizeWhatsAppBold,
} from "../lib/util/customer-visible-format.ts";
import { DEFAULT_PAYMENT_CONFIG } from "../lib/payments/config.ts";
import type { MenuItem } from "../lib/types.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  ❌", name); }
};
const eq = (name: string, actual: unknown, expected: unknown) => {
  if (actual === expected) pass++;
  else { fail++; console.log(`  ❌ ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
};

const item = (over: Partial<MenuItem> & { id: string; name: string; price: number }): MenuItem => ({
  category: "c",
  available: true,
  description: "",
  imageUrl: "",
  modifierIds: [],
  ingredients: [],
  allergens: [],
  variants: [],
  choiceGroups: [],
  ...over,
});

const fillet = item({
  id: "fillet",
  name: "فيليه سوبريم",
  price: 130,
  choiceGroups: [
    {
      id: "flavor",
      name: "اختر المذاق",
      minSelect: 1,
      maxSelect: 1,
      sort: 0,
      options: [
        { id: "normal", label: "عادي", priceDelta: 0, sort: 0, active: true },
        { id: "hot", label: "حار", priceDelta: 0, sort: 1, active: true },
      ],
    },
  ],
});

function toolCtx(allergyNote: string | null = null): ToolContext {
  return {
    menuItems: [fillet],
    modifiers: [],
    deliveryAreas: [],
    branches: [],
    geoRouting: false,
    draft: emptyDraft("ج.م"),
    signals: [],
    escalation: null,
    presentation: null,
    photoRequests: [],
    taxMode: "inclusive",
    taxRate: 0,
    paymentConfig: DEFAULT_PAYMENT_CONFIG,
    resendReceipt: false,
    userConfirmed: true,
    explicitHuman: false,
    sessionAllergyNote: allergyNote,
  };
}

function promptCtx(dialect: "egyptian" | "saudi") {
  return {
    profile: { name: "مطعم تجريبي", currency: dialect === "egyptian" ? "ج.م" : "ر.س", timezone: "Africa/Cairo", businessType: "restaurant" },
    dialect,
    menuItems: [fillet],
    modifiers: [],
    branches: [],
    deliveryAreas: [],
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [],
    aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live",
    isOpen: true,
    autoAccept: false,
    personaName: dialect === "egyptian" ? "كريم" : "خالد",
  };
}

// 1-4: WhatsApp bold sanitizer.
eq("bold sanitizer: markdown bold → WhatsApp bold", sanitizeWhatsAppBold("**الإجمالي**"), "*الإجمالي*");
eq("bold sanitizer: idempotent", sanitizeWhatsAppBold(sanitizeWhatsAppBold("**الإجمالي**")), "*الإجمالي*");
eq("bold sanitizer: keeps single-star WhatsApp bold unchanged", sanitizeWhatsAppBold("*الإجمالي*"), "*الإجمالي*");
eq("bold sanitizer: preserves price digits", sanitizeWhatsAppBold("**الإجمالي: 120 ج.م**"), "*الإجمالي: 120 ج.م*");
eq("bold sanitizer: attached waw fixed idempotently", sanitizeWhatsAppBold(sanitizeWhatsAppBold("و*بيتزا*")), "و *بيتزا*");
eq("bold sanitizer: malformed star fallback strips markers", sanitizeWhatsAppBold("اختيار * بيتزا*"), "اختيار بيتزا");

// 5-8: shared numeral formatter.
eq("numerals: Egyptian converts Latin digits", formatCustomerVisibleText("طلب 123 — 45 ج.م", "egyptian"), "طلب ١٢٣ — ٤٥ ج.م");
eq("numerals: Saudi keeps Western digits", formatCustomerVisibleText("طلب 123 — 45 ر.س", "saudi"), "طلب 123 — 45 ر.س");
eq("numerals: quoted customer text is preserved", formatCustomerVisibleText("راجعنا 34 والعميل قال «عمارة 12»", "egyptian"), "راجعنا ٣٤ والعميل قال «عمارة 12»");
eq("numerals+bold: mixed text formats both", formatCustomerVisibleText("**الإجمالي: 120 ج.م**", "egyptian"), "*الإجمالي: ١٢٠ ج.م*");
eq(
  "presentations: customer-visible button digits convert",
  formatCustomerVisiblePresentation({ kind: "buttons", buttons: [{ id: "qty:1", title: "1" }] }, "egyptian").buttons[0]?.title,
  "١"
);
eq(
  "presentations: list-row price digits convert",
  formatCustomerVisiblePresentation(
    { kind: "list", button: "اختيار", sections: [{ rows: [{ id: "item:1", title: "بيتزا 145 ج.م" }] }] },
    "egyptian"
  ).sections[0]?.rows[0]?.title,
  "بيتزا ١٤٥ ج.م"
);
eq(
  "presentations: button price digits convert",
  formatCustomerVisiblePresentation({ kind: "buttons", buttons: [{ id: "price", title: "145 ج.م" }] }, "egyptian").buttons[0]?.title,
  "١٤٥ ج.م"
);

// 9-12: modifier/choice label leak and allergy carry-through in the deterministic order summary.
eq("option display: strips group label", optionValueOnly("اختر المذاق: عادي"), "عادي");
{
  const ctx = toolCtx("⚠️ حساسية: بيض");
  const add = executeTool("add_to_order", { item_name: "فيليه سوبريم", quantity: 1, options: ["عادي"] }, ctx);
  ok("summary: label leak absent after add", !add.content.includes("اختر المذاق: عادي"));
  ok("summary: value-only option present after add", add.content.includes("(عادي)"));
  executeTool("set_fulfillment", { type: "pickup" }, ctx);
  const confirm = executeTool("finalize_draft", {}, ctx);
  ok("registered confirmation: allergy line present", confirm.content.includes("⚠️ حساسية: بيض"));
  ok("registered confirmation: group label still absent", !confirm.content.includes("اختر المذاق: عادي"));
}

// 13-16: receipt SVG text renders Arabic-Indic computed numbers and value-only choices.
const receipt: ReceiptData = {
  restaurantName: "مطعم 123",
  orderNumber: "#1007",
  fulfillment: "pickup",
  items: [{ name: "فيليه سوبريم 15", quantity: 2, choices: ["اختر المذاق: عادي"], modifiers: [], total: 260 }],
  subtotal: 260,
  deliveryFee: 0,
  total: 260,
  currency: "ج.م",
  digitStyle: "arabic-indic",
  allergyNote: "⚠️ حساسية: بيض",
  safetyHold: true,
  createdAt: "2026-07-19T10:05:00.000Z",
};
const svgText = [...buildReceiptSvg(receipt).svg.matchAll(/>([^<>]+)</g)].map((m) => m[1]).join("\n");
ok("receipt: Arabic-Indic order number", svgText.includes("#١٠٠٧"));
ok("receipt: Arabic-Indic quantity and item digits", svgText.includes("٢×  فيليه سوبريم ١٥"));
ok("receipt: Arabic-Indic money", svgText.includes("٢٦٠ ج.م"));
ok("receipt: no choice group label leak", !svgText.includes("اختر المذاق"));
ok("receipt: value-only choice present", svgText.includes("عادي"));

// 17-20: prompt/template wording.
const karimPrompt = buildCustomerAgentSystemPrompt(promptCtx("egyptian") as any);
ok("prompt: forbids Markdown double-asterisk bold", karimPrompt.includes("Never use Markdown double-asterisk bold"));
ok("prompt: approved confirm phrase present", karimPrompt.includes("After an order recap, close with the exact question «أجهّزلك الطلب؟»"));
ok("dialect: Egyptian order confirm uses approved phrase", DIALECTS.egyptian.examples.orderConfirm.includes("أجهّزلك الطلب؟"));
const oldConfirmQuestion = ["تأكد الطلب", "؟"].join("");
ok("dialect: old exact confirm phrase absent from examples", !`${DIALECTS.egyptian.examples.orderConfirm}\n${DIALECTS.saudi.examples.orderConfirm}`.includes(oldConfirmQuestion));

const sampleCtx = toolCtx("⚠️ حساسية: بيض");
executeTool("add_to_order", { item_name: "فيليه سوبريم", quantity: 1, options: ["عادي"] }, sampleCtx);
executeTool("set_fulfillment", { type: "pickup" }, sampleCtx);
const sample = formatCustomerVisibleText(executeTool("finalize_draft", {}, sampleCtx).content, "egyptian");
console.log("\nSAMPLE RECEIPT TEXT:\n" + sample);
console.log(`\nPOLISH: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
