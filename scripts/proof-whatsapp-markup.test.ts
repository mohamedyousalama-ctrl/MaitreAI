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
// URL_RE is case-insensitive but the scheme test was not, so «WWW.x» produced a RELATIVE
// href that resolved to /demo/WWW.x — a 404 instead of a link.
eq("uppercase WWW. also gets a scheme", parseWhatsAppMarkup("WWW.getkivo.io"),
  [{ kind: "link", text: "WWW.getkivo.io", href: "https://WWW.getkivo.io" }]);
// A hostile scheme must never become an href. URL_RE can only BEGIN at http/https/www.
for (const hostile of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>x</script>"]) {
  ok(`no link token for «${hostile}»`, !parseWhatsAppMarkup(hostile).some((t) => t.kind === "link"));
}

// ── 3. THE FENCE — it must not invent formatting ─────────────────────────────
// WhatsApp only treats a marker as formatting when it wraps non-space content.
eq("arithmetic is not bold", parseWhatsAppMarkup("5 * 3 * 2"), [{ kind: "text", text: "5 * 3 * 2" }]);
eq("an unmatched marker stays literal", parseWhatsAppMarkup("الإجمالي *70.15"), [{ kind: "text", text: "الإجمالي *70.15" }]);
// THE ASSERTION THAT GAVE FALSE CONFIDENCE. «order_number» has ONE underscore, so there is
// nothing for it to pair with — it passed without the parser implementing any word-boundary
// rule at all. Adversarial review found the real shape: TWO markers anywhere in a message
// paired up, the markers were DELETED, and everything between them was formatted. Every row
// below is a string the parser corrupted, on a page whose whole job is showing prices and
// codes correctly — and worse than the asterisks it replaced, since nothing was deleted
// before. The visitor's own typed message is affected too: it never touches the formatter.
const VERBATIM = [
  "الكود PROMO_5 صالح مع الكود PROMO_10",
  "اختر: order_pickup أو order_delivery",
  "السعر من 50~60 ريال ومن 70~80 ريال",
  "رقم_الطلب هو order_number",
  "استخدم الكود SAVE_10 أو الكود NEW_USER",
  "order_number",
  "ابغى order_1 و order_2",
];
for (const input of VERBATIM) {
  eq(`markers glued to a word are LITERAL: ${input}`, parseWhatsAppMarkup(input), [{ kind: "text", text: input }]);
}
// THE PROPERTY THAT CAN ACTUALLY SEE THIS FAILURE CLASS. The previous version asserted
// only that NON-MARKER characters survive — so it returned zero offenders across 153
// MILLION strings while «PROMO_5» still rendered «PROMO5», because the character being
// deleted IS a marker. Every corruption in this file's history is a marker that was
// literal text and got eaten. So the property has to be about the RUNS: every formatted
// run must be non-empty, must not be padded with whitespace (WhatsApp requires the marker
// to touch the content on both sides), and the rejoin must still preserve everything else.
{
  const alphabet = ["*", "_", "~", "`", "a", "ب", "\u064F", " ", "5", "\n"];
  let checked = 0;
  const offenders: string[] = [];
  const strip = (x: string) => x.replace(/[*_~`]/g, "");
  const walk = (acc: string) => {
    if (acc) {
      checked++;
      const toks = parseWhatsAppMarkup(acc);
      if (strip(toks.map((t) => t.text).join("")) !== strip(acc)) offenders.push(`rejoin:${acc}`);
      else for (const t of toks) {
        if (t.kind === "text" || t.kind === "link") continue;
        if (!t.text || /^\s|\s$/.test(t.text)) { offenders.push(`padded:${acc}`); break; }
      }
    }
    if (acc.length >= 6) return;
    for (const c of alphabet) walk(acc + c);
  };
  walk("");
  ok(`every emitted run is well-formed over ${checked} strings (offenders: ${offenders.length}${offenders.length ? ` e.g. ${JSON.stringify(offenders[0])}` : ""})`,
    offenders.length === 0);
}

// THE INVARIANT THAT SEES THE LINK-BOUNDARY CLASS. The property above asserts that
// non-marker characters survive and that no run is whitespace-padded. Both are true, over
// a billion strings — and BOTH ARE BLIND to a marker eaten as a marker, which is every
// bug this file has ever had. Worse, that alphabet contains no «h», «w», «.», «/» or «:»,
// so no input in it can contain a URL, and the link-boundary hole was unreachable in
// principle. This one walks the ORIGINAL string and asserts BOUNDARY CONSISTENCY: no
// formatted run may sit next to a surviving word character, on an alphabet that can
// actually build a link.
{
  const A = ["*", "_", "~", "`", "a", "ب", "\u064F", " ", "5", "h", "t", "p", ":", "/", ".", "w", "\u200F"];
  const WORD = /[\p{L}\p{N}\p{M}]/u;
  let checked = 0;
  const offenders: string[] = [];
  const check = (input: string) => {
    checked++;
    let i = 0;
    for (const t of parseWhatsAppMarkup(input)) {
      if (t.kind === "text" || t.kind === "link") { i = input.indexOf(t.text, i) + t.text.length; continue; }
      const at = input.indexOf(t.text, i);
      if (at < 1) { i = Math.max(i, at + t.text.length); continue; }
      const prev = [...input.slice(0, at - 1)].pop() ?? "";
      const afterIdx = at + t.text.length + 1;
      const next = afterIdx < input.length ? [...input.slice(afterIdx)][0] ?? "" : "";
      if ((prev && WORD.test(prev)) || (next && WORD.test(next))) { offenders.push(input); return; }
      i = afterIdx;
    }
  };
  const walk = (acc: string) => { if (acc) check(acc); if (acc.length >= 4) return; for (const c of A) walk(acc + c); };
  walk("");
  ok(`no formatted run touches a surviving word character (${checked} strings, offenders: ${offenders.length}${offenders.length ? ` e.g. ${JSON.stringify(offenders[0])}` : ""})`,
    offenders.length === 0);
}

// (5) A segment boundary is still a boundary. Formatting each URL-delimited piece
// independently meant a closing marker at a piece's END was tested against end-of-string
// instead of against the URL's first character — always a letter.
for (const input of [
  "اطلب من ~هنا~https://kivo.io/menu",
  "كود الخصم `PROMO`www.kivo.io",
  "الكود *SAVE10*www.kivo.io/menu",
]) {
  ok(`a marker glued to a following LINK stays literal: ${input}`,
    !parseWhatsAppMarkup(input).some((t) => t.kind !== "text" && t.kind !== "link"));
}
// …and the identical shape WITHOUT a link must behave the same way, which is what proves
// the two paths agree rather than merely both being green.
ok("the same shape without a link is identical",
  parseWhatsAppMarkup("اطلب من ~هنا~هناك").every((t) => t.kind === "text"));

// (6) A marker must never end up INSIDE an href. Links-first stopped truncating the href
// and started polluting it: «*https://kivo.io/pay/abc*» built href="…/abc*", a live link
// to the wrong URL. Same for the invisible bidi controls that follow a link in Arabic.
for (const input of ["الرابط: *https://kivo.io/pay/abc*", "*www.kivo.io/pay/abc*", "الرابط \u200Fwww.kivo.io\u200F تمام"]) {
  const link = parseWhatsAppMarkup(input).find((t) => t.kind === "link") as { href?: string } | undefined;
  ok(`href carries no marker or bidi control: ${input}`,
    !!link?.href && !/[*_~`\u200E\u200F\u200D]/.test(link.href));
}

// (7) The guard reads CODE POINTS. Reading text[i] gave a lone surrogate half, which
// matches no \p{…} class, so every astral word character walked straight through it —
// «𝟝_5_ 𝟝_10_» rendered «𝟝5 … 𝟝10»: the PROMO_5 bug one Unicode plane up.
for (const input of ["𝟝_5_ 𝟝_10_", "𝐀*a*", "*a*𝐀"]) {
  ok(`an astral word character blocks the marker: ${input}`,
    parseWhatsAppMarkup(input).every((t) => t.kind === "text"));
}

// The four ways this parser has deleted a literal marker, each pinned by the exact string
// adversarial review broke it with.
const STILL_LITERAL = [
  // (1) an OPENING marker followed by a space still opened a run and paired across the message
  "التوصيل ~ 20 ريال، والطلب من 50~60 ريال",
  "الخصم _ ينطبق على الكود PROMO_5",
  "5 * 3* 2",
  "` `",
  // (2) a CLOSING marker glued to the start of a word
  "الرمز _A_5 والرمز _B_10",
  // (3) one Arabic diacritic bypassed a word class of [\p{L}\p{N}_] alone
  "الكودُ_5 مع الكودُ_10",
  "الكودْ~5 مع الكودْ~10",
];
for (const input of STILL_LITERAL) {
  eq(`stays literal: ${input}`, parseWhatsAppMarkup(input), [{ kind: "text", text: input }]);
}

// (4) boundaries read from an absolute offset saw the PREVIOUS run's closing marker — a
// character no longer in the output — and suppressed the run beside it.
for (const [input, kinds] of [
  ["_مائل_~مشطوب~", "italic,strike"],
  ["_مائل_*عريض*", "italic,bold"],
  ["*a*_b_~c~`d`", "bold,italic,strike,mono"],
] as const) {
  eq(`adjacent runs chain: ${input}`,
    parseWhatsAppMarkup(input).filter((t) => t.kind !== "text").map((t) => t.kind).join(","), kinds);
}

// The guard is PER RUN, not per message: a malformed pair must not disarm a good one.
{
  const toks = parseWhatsAppMarkup("قال _مرحبا_x وبعدين _y_ تمام");
  ok("a glued pair stays literal while a well-formed one beside it still formats",
    toks.some((t) => t.kind === "text" && t.text.includes("_مرحبا_x")) &&
    toks.some((t) => t.kind === "italic" && t.text === "y"));
}

// A URL is ONE opaque span. Formatting used to run first, so a URL containing markers was
// torn apart and its href TRUNCATED to the directory — a live link to the wrong page.
for (const url of ["https://getkivo.io/menu/_special_offer", "https://getkivo.io/x/~sale~/y"]) {
  const link = parseWhatsAppMarkup(url).find((t) => t.kind === "link") as { href?: string } | undefined;
  eq(`a URL is opaque, href not truncated: ${url}`, link?.href, url);
}

// WhatsApp has no «__bold__»; leaving it fully literal is the correct behaviour, and it is
// strictly better than the half-eaten «_الإجمالي_» the unguarded parser produced.
eq("«__x__» stays literal — WhatsApp has no such marker",
  parseWhatsAppMarkup("__الإجمالي__"), [{ kind: "text", text: "__الإجمالي__" }]);
eq("a trailing period is not part of the link",
  parseWhatsAppMarkup("زر https://getkivo.io/a.").slice(-1), [{ kind: "text", text: "." }]);
ok("plain Arabic passes through untouched",
  JSON.stringify(parseWhatsAppMarkup("الإجمالي: 77.05 ر.س")) === JSON.stringify([{ kind: "text", text: "الإجمالي: 77.05 ر.س" }]));
eq("empty input yields nothing", parseWhatsAppMarkup(""), []);

// ── 4. emoji-only messages render large, as WhatsApp does ────────────────────
ok("a single emoji is emoji-only", isEmojiOnly("🌟"));
ok("three emoji still count", isEmojiOnly("🌟🔥😊"));
// Counted by GRAPHEME CLUSTER. The previous version counted code points after stripping a
// hand-written class, so a lone family read as four glyphs and a flag as two — exactly the
// messages WhatsApp renders largest were the ones it refused to enlarge.
ok("a ZWJ family is ONE glyph", isEmojiOnly("👨‍👩‍👧‍👦"));
ok("a flag is ONE glyph", isEmojiOnly("🇸🇦"));
ok("a keycap is ONE glyph", isEmojiOnly("1️⃣"));
ok("a skin-tone emoji is ONE glyph", isEmojiOnly("👍🏽"));
ok("whitespace BETWEEN emoji is fine — WhatsApp enlarges «👍 👍»", isEmojiOnly("👍 👍"));
// Extended_Pictographic alone is too wide: «©» and «™» carry it and WhatsApp does NOT
// enlarge them. Emoji presentation is the real test — «❤️» qualifies via its U+FE0F.
ok("«©» is not enlarged", !isEmojiOnly("©"));
ok("«™» is not enlarged", !isEmojiOnly("™"));
ok("«❤️» IS enlarged (U+FE0F asks for emoji presentation)", isEmojiOnly("❤️"));
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
