// ============================================================================
// WO-VOICE-DEEPGRAM-SPIKE — RED-FIRST: imports buildDeepgramKeyterms / buildDeepgramUrl /
// extractCanonicalSlots / buildSlotComparison (absent on the pre-WO tree → ESM link fails
// → red). Proves the third STT adapter (Nova-3, ar, native keyterm prompting — allergen
// words NEVER boosted), env-selectable with NO default change, and the adapter-agnostic
// comparison harness that compares CANONICAL SLOTS (item/quantity/negation), never chars.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-deepgram-adapter.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildDeepgramKeyterms, isAllergenKeyterm, KEYTERM_CAP } from "../lib/ai/stt/deepgram-keyterms.ts";
import { buildDeepgramUrl, parseDeepgramResponse, deepgramSttAdapter } from "../lib/ai/stt/deepgram.ts";
import {
  extractCanonicalSlots, parseCanonicalQuantity, compareSlots, buildSlotComparison,
} from "../lib/ai/stt/slots.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

const MENU = ["ستربس دجاج", "بروست", "بطاطس", "كومبو كبير", "شير بوكس", "شاورما", "لوز محمص", "كيكة سمسم"];

// ══ LEG 1 — keyterms: dedup, cap, and ALLERGEN WORDS NEVER BOOSTED ═══════════
{
  const kt = buildDeepgramKeyterms(MENU);
  ok("LEG1: non-allergen menu items are boosted", kt.includes("ستربس دجاج") && kt.includes("بروست"));
  ok("LEG1: allergen dishes are EXCLUDED (لوز محمص / كيكة سمسم never boosted)",
    !kt.includes("لوز محمص") && !kt.includes("كيكة سمسم"));
  ok("LEG1: isAllergenKeyterm flags an allergen-bearing term, not a clean one",
    isAllergenKeyterm("لوز محمص") === true && isAllergenKeyterm("ستربس دجاج") === false);
  const big = Array.from({ length: 200 }, (_, i) => `صنف رقم ${i}`);
  ok("LEG1: capped at KEYTERM_CAP (~80)", buildDeepgramKeyterms(big).length === KEYTERM_CAP && KEYTERM_CAP === 80);
  ok("LEG1: de-duplicated by normalized form", buildDeepgramKeyterms(["برجر", "برجر", "بيتزا"]).length === 2);
}

// ══ LEG 2 — Nova-3 request URL: pure, key-independent, allergen-free keyterms ══
{
  const url = buildDeepgramUrl({ language: "ar", keyterms: buildDeepgramKeyterms(MENU) });
  ok("LEG2: URL targets nova-3 in Arabic", /model=nova-3/.test(url) && /language=ar/.test(url));
  ok("LEG2: keyterm params carry the boosted menu terms", /keyterm=/.test(url));
  ok("LEG2: NO allergen word ever appears in the URL keyterms",
    !/%D9%84%D9%88%D8%B2/.test(url) /* لوز */ && !decodeURIComponent(url).includes("لوز") && !decodeURIComponent(url).includes("سمسم"));
  ok("LEG2: model override respected", /model=nova-2/.test(buildDeepgramUrl({ model: "nova-2" })));
}

// ══ LEG 3 — response parsing (pure) ══════════════════════════════════════════
{
  const j = { results: { channels: [{ alternatives: [{ transcript: "عايز بروست", confidence: 0.91 }] }] }, metadata: { duration: 3.2 } };
  const p = parseDeepgramResponse(j);
  ok("LEG3: parses transcript + confidence + duration", p.text === "عايز بروست" && p.confidence === 0.91 && p.durationSec === 3.2);
  ok("LEG3: an empty/garbage body yields empty text, no throw", parseDeepgramResponse({}).text === "" && parseDeepgramResponse(null).text === "");
  ok("LEG3: adapter is named deepgram", deepgramSttAdapter.name === "deepgram");
}

// ══ LEG 4 — canonical slots: item, quantity (compound + correction), negation ═
{
  const s1 = extractCanonicalSlots("عايز ستربس دجاج اتنين", MENU);
  ok("LEG4: item + quantity from a plain order", s1.items.includes("ستربس دجاج") && s1.quantity === 2 && s1.negation === false);
  ok("LEG4: compound hundreds+tens «مية وخمسين» → 150", parseCanonicalQuantity("مية وخمسين") === 150);
  const corr = extractCanonicalSlots("عايز التسعة مش التمانية", MENU);
  ok("LEG4: a correction «٩ مش ٨» → quantity 9 (asserted) + negation true", corr.quantity === 9 && corr.negation === true);
  ok("LEG4: Arabic-Indic digits parse", parseCanonicalQuantity("٣ قطع") === 3);
  ok("LEG4: no number → null quantity", extractCanonicalSlots("عايز بروست", MENU).quantity === null);
}

// ══ LEG 5 — SLOT comparison (never characters): meaning-equal ⇒ MATCH ═════════
{
  // Same order, different spelling/dialect — a char diff would DIVERGE; slots MATCH.
  const cmp = buildSlotComparison([
    { adapter: "groq", transcript: "عايز ستربس دجاج اتنين" },
    { adapter: "deepgram", transcript: "أبغى ستربس دجاج إثنين" },
  ], MENU);
  ok("LEG5: different spelling, SAME slots → full agreement",
    cmp.agreement.all === true && cmp.agreement.items && cmp.agreement.quantity && cmp.agreement.negation);
  // Genuinely different quantity → the quantity slot diverges, items still agree.
  const div = compareSlots(
    extractCanonicalSlots("عايز بروست اتنين", MENU),
    extractCanonicalSlots("عايز بروست تلاتة", MENU),
  );
  ok("LEG5: a real quantity difference DIVERGES on quantity, agrees on items",
    div.items === true && div.quantity === false && div.all === false);
}

// ══ LEG 6 — WIRING: env-selectable, NO default change; pricing; type ═════════
{
  const idx = read("lib/ai/stt/index.ts");
  ok("WIRE: STT_ADAPTER=deepgram selects the deepgram adapter", /if \(sel === "deepgram"\) return deepgramSttAdapter;/.test(idx));
  ok("WIRE: deepgram is EXPLICIT-ONLY — never in the auto-fallback chain (no default change)",
    !/GROQ_API_KEY\) return deepgramSttAdapter/.test(idx) && !/DEEPGRAM_API_KEY\) return deepgramSttAdapter/.test(idx));
  ok("WIRE: SttAdapterName includes deepgram", /"mock" \| "openai" \| "groq" \| "deepgram"/.test(read("lib/ai/stt/types.ts")));
  ok("WIRE: pricing carries a nova-3 rate", /"deepgram:nova-3"/.test(read("lib/ai/stt/pricing.ts")));
  ok("WIRE: DEEPGRAM_API_KEY gates ONLY the live call (throws when absent, pure builders don't)",
    /if \(!key\) throw new Error\("DEEPGRAM_API_KEY not set"\)/.test(read("lib/ai/stt/deepgram.ts")));
}

console.log(`\nWO-VOICE-DEEPGRAM PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
