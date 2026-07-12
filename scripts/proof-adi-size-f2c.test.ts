// WO-LIVE4-F2c — RED-FIRST: «عادي» is ALSO a SIZE label in cart/menu recaps («عادي» vs
// «دوبل»), which carry a price/quantity — never a bare safety assurance. Live #1005
// (04:26–04:34, banned_phrase_block:عادي ×2): the recap line «- **عادي** بـ ١٣٠ ج.م»
// tripped the §0 guard in an allergy-context thread and looped even on «Hi». F2c extends
// the exemption to a size/price/quantity recap; a bare «عادي» assurance STAYS banned.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-adi-size-f2c.test.ts
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const banned = (t: string) => scanBannedAllergyPhrases(t).includes("عادي");

// ── THE FIX (red→green): the live #1005 COMPACT CART RECAP no longer trips «عادي» ──
// At 04:26:56 + 04:34:58 the §0 guard fired on the model's cart-confirmation draft (the
// stored text is the escalation-recovery line that REPLACED it). Unlike the verbose menu
// recap — which lists «مايو حار», so F2b already exempts it via the flavor token — the
// compact cart recap names the SIZE «عادي» with a price/quantity and NO flavor word in its
// sentence, so F2b blocked it and the thread looped even on «Hi». (normalizeAr collapses
// newlines to spaces, so a «sentence» here is bounded only by ؟ ? . ! — «ج.م» splits at
// its «.» → the surviving price signal is «١٣٠ ج».)
const LIVE_1005 = "طلبك: ميسي زنجر (عادي) ×١ — ١٣٠ ج.م. تأكد الطلب؟";
ok("live #1005 cart recap: «عادي» NOT banned (the fix)", !banned(LIVE_1005));
ok("live #1005 cart recap: clean (no §0 hit at all)", scanBannedAllergyPhrases(LIVE_1005).length === 0);

// ── The three exemption signals, each in the «عادي» sentence ───────────────────
ok("price ج.م in the «عادي» line → exempt", !banned("- **عادي** بـ ١٣٠ ج.م"));
ok("price with Latin digits + ج.م → exempt", !banned("عادي 130 ج.م"));
ok("dotless currency «جم» → exempt", !banned("عادي ١٣٠ جم"));
ok("size sibling «دوبل» in the same sentence → exempt", !banned("عادي ولا دوبل؟"));
ok("quantity marker «×» → exempt", !banned("ميسي زنجر عادي ×١"));
ok("flavor option (F2b, still) → exempt", !banned("تحب عادي، حار، ولا مكس؟"));

// ── BARE «عادي» safety assurance STAYS banned (the red line — W3 §7 posture) ──
ok("bare assurance «الأكل عادي ومفيش قلق» → STILL banned", banned("الأكل عادي ومفيش أي قلق"));
ok("bare «عادي» alone → STILL banned", banned("عادي"));
ok("«عادي» + reassurance, no menu token → STILL banned", banned("متقلقش، الطبق عادي عليك"));

// ── PRECISION: a digit next to a «ج»-WORD (not the currency abbrev) must NOT exempt ──
// «٥ جبنات» = "5 cheeses": «ج» is followed by an Arabic letter, so PRICE_RE does not fire
// → a bare «عادي» in that sentence stays banned. (Currency «جنيه» is out of F2c scope —
// the ratified token is «ج.م»; a «جنيه»-priced recap is a separate follow-up if it recurs.)
ok("«٥ جبنات» (digit+ج but followed by a letter) does NOT exempt a bare «عادي»",
  banned("عادي، وضفنا ٥ جبنات للطبق"));

// ── MIXED: a recap «عادي» sentence AND a separate bare-assurance «عادي» → banned ──
ok("mixed: one «عادي» is a recap but ANOTHER is a bare assurance → STILL banned",
  banned("- **عادي** بـ ١٣٠ ج.م\nوطبعاً الأكل كله عادي عليك ومفيش قلق"));

console.log(`\n${fail === 0 ? "✅" : "❌"} adi-size-f2c: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
