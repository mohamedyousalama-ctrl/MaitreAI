// ============================================================================
// Proof: the demo renders WhatsApp's text conventions instead of printing them.
//
// LIVE EVIDENCE. On production the demo showed «خصم *15%* على أول طلب — بكود *AHLAN15*»
// with the asterisks visible. On real WhatsApp those render BOLD.
//
// The formatter was NOT the bug. lib/util/customer-visible-format.ts deliberately emits
// WhatsApp's wire format (`*bold*`) because that is exactly what the real client is sent
// — and scripts/proof-tenant-digit-style.test.ts pins its idempotence. The bug was that
// the demo page rendered that wire format as a plain React text child, so it was never a
// WhatsApp renderer at all. This parser is that renderer, and it may only READ: nothing
// here changes a character that goes out.
//
// Run: node --experimental-strip-types scripts/proof-whatsapp-markup.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseWhatsAppMarkup, isEmojiOnly } from "../lib/util/whatsapp-markup.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  FAIL", name); }
};
const eq = (name: string, actual: unknown, expected: unknown) =>
  ok(`${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
     JSON.stringify(actual) === JSON.stringify(expected));

// ── 1. THE LIVE STRINGS ──────────────────────────────────────────────────────
eq("the live promo line: both bold runs are parsed, no asterisk survives",
  parseWhatsAppMarkup("خصم *15%* على أول طلب — بكود *AHLAN15* عند الطلب"),
  [{ kind: "text", text: "خصم " }, { kind: "bold", text: "15%" },
   { kind: "text", text: " على أول طلب — بكود " }, { kind: "bold", text: "AHLAN15" },
   { kind: "text", text: " عند الطلب" }]);
eq("the live modifier line", parseWhatsAppMarkup("(*زيادة مكسرات*)"),
  [{ kind: "text", text: "(" }, { kind: "bold", text: "زيادة مكسرات" }, { kind: "text", text: ")" }]);
ok("no rendered token ever contains its own marker",
  parseWhatsAppMarkup("خصم *15%* بكود *AHLAN15*").every((t) => !t.text.includes("*")));

// ── 2. every convention WhatsApp actually supports ───────────────────────────
eq("italic", parseWhatsAppMarkup("_مائل_"), [{ kind: "italic", text: "مائل" }]);
eq("strikethrough", parseWhatsAppMarkup("~مشطوب~"), [{ kind: "strike", text: "مشطوب" }]);
eq("inline monospace", parseWhatsAppMarkup("`code`"), [{ kind: "mono", text: "code" }]);
eq("triple-backtick monospace wins over single", parseWhatsAppMarkup("```block```"), [{ kind: "mono", text: "block" }]);
eq("a link is clickable", parseWhatsAppMarkup("شوف https://getkivo.io/menu"),
  [{ kind: "text", text: "شوف " }, { kind: "link", text: "https://getkivo.io/menu", href: "https://getkivo.io/menu" }]);
eq("a bare www link gets a scheme", parseWhatsAppMarkup("www.getkivo.io"),
  [{ kind: "link", text: "www.getkivo.io", href: "https://www.getkivo.io" }]);

// ── 3. THE FENCE — it must not invent formatting ─────────────────────────────
// WhatsApp only treats a marker as formatting when it wraps non-space content.
eq("arithmetic is not bold", parseWhatsAppMarkup("5 * 3 * 2"), [{ kind: "text", text: "5 * 3 * 2" }]);
eq("an unmatched marker stays literal", parseWhatsAppMarkup("الإجمالي *70.15"), [{ kind: "text", text: "الإجمالي *70.15" }]);
eq("an underscore inside a word is not italic", parseWhatsAppMarkup("order_number"), [{ kind: "text", text: "order_number" }]);
eq("a trailing period is not part of the link",
  parseWhatsAppMarkup("زر https://getkivo.io/a.").slice(-1), [{ kind: "text", text: "." }]);
ok("plain Arabic passes through untouched",
  JSON.stringify(parseWhatsAppMarkup("الإجمالي: 77.05 ر.س")) === JSON.stringify([{ kind: "text", text: "الإجمالي: 77.05 ر.س" }]));
eq("empty input yields nothing", parseWhatsAppMarkup(""), []);

// ── 4. emoji-only messages render large, as WhatsApp does ────────────────────
ok("a single emoji is emoji-only", isEmojiOnly("🌟"));
ok("three emoji still count", isEmojiOnly("🌟🔥😊"));
ok("four do not", !isEmojiOnly("🌟🔥😊👍"));
ok("emoji with words is not emoji-only", !isEmojiOnly("تمام 🌟"));
ok("empty is not emoji-only", !isEmojiOnly("   "));

// ── 5. the demo actually USES it, and the formatter is untouched ─────────────
{
  const phone = readFileSync(resolve(process.cwd(), "app/demo/DemoPhone.tsx"), "utf8");
  ok("the bubble renders parsed markup, not a raw text child",
    /renderWhatsApp\(m\.text\)/.test(phone) && !/<div style=\{S\.text\}>\{m\.text\}<\/div>/.test(phone));
  ok("renderWhatsApp is module-scope so Bubble can see it",
    phone.indexOf("function renderWhatsApp") < phone.indexOf("function Bubble({"));
  ok("each line resolves its own direction, as WhatsApp does",
    /unicodeBidi: "plaintext"/.test(phone));
  ok("emoji-only messages get the large style", /isEmojiOnly\(m\.text\)/.test(phone));

  // The wire format must keep being PRODUCED — this parser reads it, it does not replace it.
  const fmt = readFileSync(resolve(process.cwd(), "lib/util/customer-visible-format.ts"), "utf8");
  ok("sanitizeWhatsAppBold still emits WhatsApp bold (the parser did not replace it)",
    /export function sanitizeWhatsAppBold/.test(fmt) && /`\*\$\{piece\.text\}\*`/.test(fmt));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} whatsapp-markup: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
