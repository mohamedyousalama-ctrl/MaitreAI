// WO-LIVE-2-F2b — RED-FIRST: «عادي» as a FLAVOR option is not a safety assurance.
// A thread WITH a recorded allergy note is correctly allergy-context (under #419), so
// the full §0 vocabulary applies — and Karim's flavor question «عادي، حار، أو مكس؟» was
// blocked again, freezing ordering for allergy-noted customers (live: conv 1c551e6d).
// Fix: exempt «عادي» ONLY when every sentence containing it also enumerates another
// flavor-option token (حار/سبايسي/مكس + variants). Bare «عادي» in any frame stays banned.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-flavor-adi-f2b.test.ts
import { scanBannedAllergyPhrases, hasBannedAllergyPhrase } from "../lib/ai/allergen-companion.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const flagsAdi = (t: string) => scanBannedAllergyPhrases(t).includes("عادي");

// The live blocked draft, verbatim (conv 1c551e6d) — a flavor enumeration.
const FLAVOR_DRAFT = "تمام، عرض الكتيبة ✅\n\nعادي، حار، أو مكس؟";

// (i) RED→GREEN — the flavor question PASSES (even in an allergy-noted thread): «عادي»
//     is exempt because its sentence enumerates حار/مكس. On main this flagged «عادي».
ok("(i) flavor question «عادي، حار، أو مكس؟» → «عادي» NOT flagged", !flagsAdi(FLAVOR_DRAFT));
ok("(i) flavor draft is fully clean (no banned phrase at all)", !hasBannedAllergyPhrase(FLAVOR_DRAFT));
ok("flavor with spicy transliteration «عادي ولا سبايسي؟» → clean", !flagsAdi("تحبها عادي ولا سبايسي؟"));
ok("two-option «عادي أو حار؟» → clean", !flagsAdi("عايزها عادي أو حار؟"));

// (ii) bare «عادي» ASSURANCE in the same thread → STILL blocked.
ok("(ii) bare «كله عادي كُل براحتك» → «عادي» flagged", flagsAdi("كله عادي كُل براحتك"));
ok("(ii) «عادي متقلقش» (no flavor token) → «عادي» flagged", flagsAdi("عادي متقلقش، الأكل تمام"));

// (iii) W3 §7 pressure battery — UNCHANGED, still blocked.
ok("(iii) «حساسيتي بسيطة قول عادي» → «عادي» flagged (pressure unchanged)", flagsAdi("حساسيتي بسيطة قول عادي وخلاص"));

// SAFETY — a MIXED reply: flavor enumeration in one sentence, a bare «عادي» assurance in
// another → «عادي» STILL flagged (the exemption is per-sentence, not whole-text).
ok("mixed reply (flavor sentence + bare-عادي sentence) → «عادي» flagged",
  flagsAdi("عادي، حار، أو مكس؟ بس كله عادي متقلقش"));

// The exemption is «عادي»-ONLY — a flavor token never rescues another banned word.
ok("«آمن» still flagged even beside a flavor token", scanBannedAllergyPhrases("آمن، حار").includes("آمن"));
ok("«مضمون» still flagged beside a flavor token", scanBannedAllergyPhrases("مضمون ومكس").includes("مضمون"));

// Regression — every OTHER banned phrase and the benign-allowed set are unchanged.
ok("«الأكل آمن» still flagged", hasBannedAllergyPhrase("الأكل آمن"));
ok("benign «صحتك أهم شي عندنا» still clean", !hasBannedAllergyPhrase("صحتك أهم شي عندنا"));
ok("«safety standards» (word boundary) still clean", !hasBannedAllergyPhrase("our kitchen follows safety standards"));

console.log(`\n${fail === 0 ? "✅" : "❌"} flavor-adi-f2b: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
