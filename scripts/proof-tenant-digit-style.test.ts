// ============================================================================
// Proof: a figure shown to a customer is ALWAYS in the tenant's declared digit style.
//
// Live demo order #1001 rendered «الإجمالي: ٧٠.١٥ ر.س» and «برقم #١٠٠١» on a tenant
// whose dialect profile declares digitStyle:"western" (lib/ai/dialect.ts). Four separate
// causes, each of which reverted silently because nothing pinned it:
//
//   1. formatCustomerVisibleNumbers was ONE-WAY. "western" returned the text untouched,
//      so Arabic-Indic that arrived from anywhere sailed straight through.
//   2. lib/ai/recap-render.ts hardcoded toArabicDigits for EVERY tenant — commented
//      "so the block matches Karim's own writing", i.e. written before Khalid existed.
//   3. lib/ai/prompt.ts rendered the authoritative «الطلب الحالي» state block in
//      Arabic-Indic for every tenant, so the model was SHOWN the digit style the same
//      prompt then told it not to use.
//   4. lib/demo/order.ts hardcoded toArabicDigits on the order number, and the demo
//      routes never called the formatter at all — only respond-and-send.ts did.
//
// Run: node --conditions=react-server --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-tenant-digit-style.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatCustomerVisibleText, formatCustomerVisibleNumbers, sanitizeWhatsAppBold } from "../lib/util/customer-visible-format.ts";
import { renderDraftRecap } from "../lib/ai/recap-render.ts";
import { demoOrderConfirmation } from "../lib/demo/order.ts";
import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";
import type { OrderDraft } from "../lib/ai/tools.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  FAIL", name); }
};
const eq = (name: string, actual: unknown, expected: unknown) =>
  ok(`${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`, actual === expected);
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

// ── 1. the formatter is SYMMETRIC ────────────────────────────────────────────
// Only the Egyptian direction was ever asserted. The Western direction was an identity
// return, so this whole class of bug was invisible to the suite.
eq("western: Arabic-Indic is normalized to ASCII",
  formatCustomerVisibleText("طلب ١٢٣ — ٤٥ ر.س", "saudi"), "طلب 123 — 45 ر.س");
eq("western: the live #1001 string is fixed",
  formatCustomerVisibleText("الإجمالي: ٧٠.١٥ ر.س برقم #١٠٠١", "saudi"), "الإجمالي: 70.15 ر.س برقم #1001");
eq("western: the Arabic decimal separator ٫ becomes a point",
  formatCustomerVisibleText("الإجمالي ٧٠٫١٥ ر.س", "saudi"), "الإجمالي 70.15 ر.س");
eq("western: Persian/Urdu digits are normalized too",
  formatCustomerVisibleText("طلب ۱۲۳", "saudi"), "طلب 123");
eq("egyptian: ASCII still becomes Arabic-Indic (unchanged)",
  formatCustomerVisibleText("طلب 123 — 45 ج.م", "egyptian"), "طلب ١٢٣ — ٤٥ ج.م");
eq("egyptian: Arabic-Indic is left alone",
  formatCustomerVisibleText("طلب ١٢٣ — ٤٥ ج.م", "egyptian"), "طلب ١٢٣ — ٤٥ ج.م");
eq("preserveQuotedText:false converts the whole string",
  formatCustomerVisibleNumbers("«عمارة ١٢»", "western", { preserveQuotedText: false }), "«عمارة 12»");

// ── 2. the quote rule FAILS CLOSED ───────────────────────────────────────────
// Quoted text is the customer's own words read back, so its figures stay as typed.
eq("a CLOSED quote is preserved",
  formatCustomerVisibleText("راجعنا ٣٤ والعميل قال «عمارة ١٢»", "saudi"), "راجعنا 34 والعميل قال «عمارة ١٢»");
// …but an UNMATCHED opener used to disable normalisation for the entire rest of the
// message. One stray « or " in the model's prose silently un-fixed every figure after it.
eq("an UNMATCHED « does not disable the rest of the message",
  formatCustomerVisibleText("قال «العميل ثم الإجمالي ٧٠ ر.س", "saudi"), "قال «العميل ثم الإجمالي 70 ر.س");
eq("an UNMATCHED \" does not disable the rest of the message",
  formatCustomerVisibleText('قال "تمام والإجمالي ٧٠ ر.س', "saudi"), 'قال "تمام والإجمالي 70 ر.س');
// The apostrophe is not a quote character at all — «don't» is a word, not an opener.
eq("an apostrophe is not a quote opener",
  formatCustomerVisibleText("don't worry الإجمالي ٧٠ ر.س", "saudi"), "don't worry الإجمالي 70 ر.س");

// ── 3. the DETERMINISTIC RECAP follows the tenant, not a hardcode ────────────
const draft = {
  lines: [{ itemId: "i1", name: "كبسة دجاج", quantity: 2, unitPrice: 35, variant: null, choices: [], modifiers: [], lineTotal: 70 }],
  fulfillment: "delivery", deliveryZone: "حي العليا", address: "الرياض", deliveryFee: 15,
  subtotal: 70, tax: 12.75, taxRate: 15, total: 97.75, currency: "ر.س", paymentMethod: null, finalized: false,
} as unknown as OrderDraft;

{
  const saudi = renderDraftRecap(draft, { dialect: "saudi" });
  ok("recap (saudi): the total is Western", saudi.includes("الإجمالي: 97.75 ر.س"));
  ok("recap (saudi): the quantity is Western", saudi.includes("2× كبسة دجاج"));
  ok("recap (saudi): the VAT rate is Western", saudi.includes("(15%)"));
  ok("recap (saudi): NO Arabic-Indic digit survives anywhere", !/[٠-٩]/.test(saudi));

  const egyptian = renderDraftRecap({ ...draft, currency: "ج.م" } as OrderDraft, { dialect: "egyptian" });
  ok("recap (egyptian): still Arabic-Indic, unchanged", egyptian.includes("الإجمالي: ٩٧٫٧٥ ج.م") || /[٠-٩]/.test(egyptian));
  ok("recap (egyptian): NO Western digit leaks in", !/[0-9]/.test(egyptian));
}

// ── 2b. THE BOLD SANITIZER IS IDEMPOTENT — exhaustively, not by one lucky input ──
// proof-polish.test.ts asserts idempotence with «**الإجمالي**», which is a stable case.
// It was NOT idempotent in general: `*a**a` → `*a*a` → `*a* a`, because the "does a
// space belong here?" decision read a character that the next step then deleted. With
// formatters now called from more places, "run it twice" has to be safe.
{
  const alphabet = ["*", "a", " ", "٥"];
  let checked = 0;
  const offenders: string[] = [];
  const walk = (acc: string) => {
    if (acc) { checked++; if (sanitizeWhatsAppBold(sanitizeWhatsAppBold(acc)) !== sanitizeWhatsAppBold(acc)) offenders.push(acc); }
    if (acc.length >= 6) return;
    for (const c of alphabet) walk(acc + c);
  };
  walk("");
  ok(`bold sanitizer: idempotent over all ${checked} strings of length ≤6 (offenders: ${offenders.length}${offenders.length ? ` e.g. ${JSON.stringify(offenders[0])}` : ""})`,
    offenders.length === 0);
  // The exact string adversarial review used to break it.
  eq("bold sanitizer: the known counterexample is stable",
    sanitizeWhatsAppBold(sanitizeWhatsAppBold("*a**a")), sanitizeWhatsAppBold("*a**a"));
  // And formatting a whole reply twice is a no-op, in both digit directions.
  for (const d of ["saudi", "egyptian"]) {
    const x = "الإجمالي *٧٠.١٥***١٠٠١ — 45 ر.س";
    eq(`formatCustomerVisibleText is idempotent (${d})`,
      formatCustomerVisibleText(formatCustomerVisibleText(x, d), d), formatCustomerVisibleText(x, d));
  }
}

// ── 3b. THE SYSTEM PROMPT ITSELF — behavioral, not source-shape ─────────────
// A regex on a helper's NAME proves nothing: the body can be reverted to the hardcode
// with every other assertion still green (proven by adversarial review). These build the
// real prompt and read its output, which is the only thing the model ever sees.
function promptCtx(dialect: string, draft: OrderDraft | null): Record<string, unknown> {
  return {
    profile: { name: "مطعم الديرة", currency: dialect === "saudi" ? "ر.س" : "ج.م", timezone: "Asia/Riyadh", businessType: "restaurant" },
    dialect, menuItems: [], modifiers: [], branches: [], deliveryAreas: [],
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [], aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live", isOpen: true, autoAccept: false,
    personaName: dialect === "saudi" ? "خالد" : "كريم",
    statefulOrders: true, currentDraft: draft,
  };
}

{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saudiPrompt = buildCustomerAgentSystemPrompt(promptCtx("saudi", draft) as any);

  // The state block is the model's AUTHORITATIVE order truth. It was rendered in
  // Arabic-Indic for every tenant, so the model was shown one digit style and told to
  // write another. It copied what it was shown.
  ok("prompt (saudi): the «الطلب الحالي» state block is in Western digits",
    saudiPrompt.includes("2× كبسة دجاج") && saudiPrompt.includes("الإجمالي حتى الآن: 97.75 ر.س"));
  ok("prompt (saudi): the state block's prose is Saudi, not Cairene",
    saudiPrompt.includes("لا تعيد بناءه من المحادثة") &&
    !saudiPrompt.includes("متعيدش") && !saudiPrompt.includes("هيظهر") && !saudiPrompt.includes("لسه ماتحددش"));

  // THE WHOLE PROMPT. The exemplar replies («…بـ٤٥ + …بـ٢٠ = ٧٥ ر.س») are the anchor the
  // output-edge formatter CANNOT reach, because «…» is exactly what it preserves — there
  // it means "the customer's own words". So not one Arabic-Indic digit may survive here.
  const arabicIndicInSaudi = (saudiPrompt.match(/[٠-٩۰-۹]/g) ?? []).length;
  ok(`prompt (saudi): ZERO Arabic-Indic digits anywhere in the prompt (found ${arabicIndicInSaudi})`,
    arabicIndicInSaudi === 0);
  ok("prompt (saudi): the digit RULE and the exemplars finally agree",
    saudiPrompt.includes("Write numbers and money using Western digits"));

  // The Egyptian prompt is authored in this style and must be untouched.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const egyptianPrompt = buildCustomerAgentSystemPrompt(promptCtx("egyptian", { ...draft, currency: "ج.م" } as OrderDraft) as any);
  ok("prompt (egyptian): still Arabic-Indic, and its state block with it",
    /[٠-٩]/.test(egyptianPrompt) && egyptianPrompt.includes("٢× كبسة دجاج"));
  ok("prompt (egyptian): keeps its own Cairene state-block prose",
    egyptianPrompt.includes("متعيدش بناءه من المحادثة"));
}

// ── 4. the demo order confirmation carries no digit opinion of its own ───────
ok("demoOrderConfirmation does NOT convert the order number itself",
  demoOrderConfirmation("1001").includes("1001"));
ok("…and the tenant's formatter is what decides",
  formatCustomerVisibleText(demoOrderConfirmation("1001"), "egyptian").includes("١٠٠١") &&
  formatCustomerVisibleText(demoOrderConfirmation("1001"), "saudi").includes("1001"));

// ── 5. SOURCE WIRING — each fix reverts loudly, not silently ─────────────────
{
  const fmt = read("lib/util/customer-visible-format.ts");
  ok("the formatter is symmetric (western converts, not returns)",
    /digitStyle === "arabic-indic" \? toArabicDigits : arabicToAscii/.test(fmt));
  ok("the quote scanner requires a CLOSING mark before it protects a run",
    /chars\.indexOf\(end, i \+ 1\) !== -1/.test(fmt));
  ok("the apostrophe is not in the quote-pair table", !/"'": "'"/.test(fmt));

  const recap = read("lib/ai/recap-render.ts");
  ok("recap-render derives digits from the dialect, never a hardcode",
    /function digitsFor\(dialect: string\)/.test(recap) && !/const ar = \(v: number \| string\): string => toArabicDigits/.test(recap));

  const prompt = read("lib/ai/prompt.ts");
  // Source-shape pins below. They are a tripwire for a careless edit, NOT the guarantee —
  // the behavioral assertions in §3b are. A regex on a helper name survives a reverted body.
  ok("the «الطلب الحالي» state block is rendered in the tenant's digit style",
    /function digitsForDialect\(dialect: string\)/.test(prompt) &&
    /currentOrderBlock\(ctx\.currentDraft, currency, ctx\.dialect\)/.test(prompt));
  ok("the state block's prose is dialect-branched, not Cairene for everyone",
    /const ORDER_BLOCK_COPY/.test(prompt) && /saudi: \{[\s\S]{0,400}?لا تعيد بناءه من المحادثة/.test(prompt));

  const turn = read("lib/ai/customer-turn.ts");
  ok("the registered-order recap uses the tenant's digit style",
    /renderTenantDigits\(dialect, order\.orderNumber\)/.test(turn) && !/toArabicDigits\(order\.orderNumber\)/.test(turn));

  const order = read("lib/demo/order.ts");
  ok("demo/order.ts no longer imports toArabicDigits at all", !/toArabicDigits/.test(order.replace(/\/\/[^\n]*/g, "")));
  ok("closeDemoOrder formats its appended line with the tenant's dialect",
    /dialect: string \| null \| undefined;/.test(order) && /formatCustomerVisibleText\(text, dialect\)/.test(order));

  for (const route of ["app/api/demo/turn/route.ts", "app/api/demo/voice/route.ts"]) {
    const src = read(route);
    ok(`${route}: formats the reply the way respond-and-send does`,
      /formatCustomerVisibleText\(out\.reply, out\.dialect\)/.test(src));
    ok(`${route}: formats the interactive presentation too`,
      /formatCustomerVisiblePresentation\(out\.presentation, out\.dialect\)/.test(src));
    ok(`${route}: hands the dialect to closeDemoOrder`, /dialect: out\.dialect/.test(src));
  }
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} tenant-digit-style: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
