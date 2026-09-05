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
import { buildDeepgramUrl, parseDeepgramResponse, deepgramSttAdapter, containerType } from "../lib/ai/stt/deepgram.ts";
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
  // Re-pinned 2026-08-26. Selection was split into two stages — STT_ADAPTER resolves
  // to a NAME, then the name resolves to an ADAPTER — so the old single-expression
  // regex no longer matched. Asserting BOTH stages is stricter than the original:
  // breaking either half now fails, where before only the fused form was checked.
  ok("WIRE: STT_ADAPTER=deepgram resolves to the deepgram adapter NAME",
    /if \(sel === "deepgram"\) return "deepgram";/.test(idx));
  ok("WIRE: STT_ADAPTER=deepgram selects the deepgram adapter",
    /if \(name === "deepgram"\) return deepgramSttAdapter;/.test(idx));
  // Explicit-only: deepgram must never be picked by key-presence auto-selection.
  ok("WIRE: deepgram stays EXPLICIT-ONLY (never auto-selected from a key)",
    !/DEEPGRAM_API_KEY\)\s*return "deepgram"/.test(idx));
  ok("WIRE: deepgram is EXPLICIT-ONLY — never in the auto-fallback chain (no default change)",
    !/GROQ_API_KEY\) return deepgramSttAdapter/.test(idx) && !/DEEPGRAM_API_KEY\) return deepgramSttAdapter/.test(idx));
  ok("WIRE: SttAdapterName includes deepgram", /"mock" \| "openai" \| "groq" \| "deepgram"/.test(read("lib/ai/stt/types.ts")));
  ok("WIRE: pricing carries a nova-3 rate", /"deepgram:nova-3"/.test(read("lib/ai/stt/pricing.ts")));
  ok("WIRE: DEEPGRAM_API_KEY gates ONLY the live call (throws when absent, pure builders don't)",
    /if \(!key\) throw new Error\("DEEPGRAM_API_KEY not set"\)/.test(read("lib/ai/stt/deepgram.ts")));
}

// ══ LEG 7 — THE IPHONE HAS NEVER BEEN UNDERSTOOD ═════════════════════════════
//
// Production, 3 Sep: four uploads from a real iPhone, every one 130 KB of genuine audio
// with `mime="audio/mp4; codecs=mp4a.40.2"`, every one answered 200 by Deepgram with an
// EMPTY transcript and confidence 0 — while desktop containers transcribed fine on the
// same deployment and key. The visitor hears the greeting, speaks, and Khalid never
// replies, because the route turns "no words" into a 422.
//
// These run the REAL adapter against a stubbed fetch. That is the only place this can be
// proven: reproducing it for real needs an iOS recorder and a Deepgram key in one
// environment, and none exists — so what is testable is the request WE send and how we
// react, which is exactly what changed.
{
  ok("CONTAINER: the codecs parameter is stripped — iOS Safari is the only browser that sends one",
    containerType("audio/mp4; codecs=mp4a.40.2") === "audio/mp4");
  ok("CONTAINER: a plain container is untouched", containerType("audio/webm") === "audio/webm");
  ok("CONTAINER: case and padding are normalized", containerType("  AUDIO/MP4 ; codecs=x ") === "audio/mp4");
  ok("CONTAINER: absent falls back to the WhatsApp default, as before",
    containerType(undefined) === "audio/ogg" && containerType("") === "audio/ogg");

  const realFetch = globalThis.fetch;
  const withStub = async (
    replies: Array<{ transcript: string }>,
    mimeType: string | undefined
  ): Promise<{ sent: Array<string | null>; text: string }> => {
    const sent: Array<string | null> = [];
    let n = 0;
    globalThis.fetch = (async (_u: unknown, init?: { headers?: Record<string, string> }) => {
      const h = (init?.headers ?? {}) as Record<string, string>;
      sent.push(h["Content-Type"] ?? null);
      const r = replies[Math.min(n++, replies.length - 1)]!;
      return {
        ok: true,
        json: async () => ({
          results: { channels: [{ alternatives: [{ transcript: r.transcript, confidence: 0 }] }] },
          metadata: { duration: 1 },
        }),
      };
    }) as unknown as typeof globalThis.fetch;
    process.env.DEEPGRAM_API_KEY = "test-key-not-a-real-one";
    try {
      const out = await deepgramSttAdapter.transcribe(Buffer.from([1, 2, 3]), { mimeType, languageHint: "ar" });
      return { sent, text: out.text };
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.DEEPGRAM_API_KEY;
    }
  };

  // THE RETRY IS GONE, AND THIS IS THE ASSERTION THAT WAS INVERTED TO SAY SO.
  //
  // These three cases used to prove a SECOND deepgram POST with no Content-Type at all, so
  // the provider would sniff the container out of the bytes. That experiment existed to
  // decide one question — header problem or decoder problem — and production decided it:
  //
  //     [stt/deepgram] empty transcript on "audio/mp4" — retried without Content-Type: still empty
  //
  // Both attempts empty, on 130 KB of real speech. So the retry buys nothing and costs a
  // round trip of dead air on the one turn already failing. Recovery moved to a DIFFERENT
  // ENGINE (lib/ai/stt/fallback.ts, proven in scripts/proof-stt-fallback.test.ts); this
  // adapter's job is now one honest attempt.
  const iphone = await withStub([{ transcript: "" }, { transcript: "ابغى كبسة دجاج" }], "audio/mp4; codecs=mp4a.40.2");
  ok("IPHONE: the attempt sends the container WITHOUT the codecs parameter",
    iphone.sent[0] === "audio/mp4");
  ok("IPHONE: an empty transcript costs ONE call — the disproven header retry is gone",
    iphone.sent.length === 1);
  ok("IPHONE: the empty answer is passed up honestly, for the fallback seam to act on",
    iphone.text === "");

  // A turn that worked must cost exactly one call, as it always did.
  const fine = await withStub([{ transcript: "مرحبا" }], "audio/webm");
  ok("WORKING AUDIO: one attempt, and the words come straight back",
    fine.sent.length === 1 && fine.text === "مرحبا");

  // A genuinely silent room is now indistinguishable HERE from a container we cannot read —
  // and that is correct: this adapter no longer guesses which one it is. One call, empty.
  const silent = await withStub([{ transcript: "" }, { transcript: "" }], "audio/webm");
  ok("SILENCE: one call, no words, no second guess",
    silent.sent.length === 1 && silent.text === "");

  const noMime = await withStub([{ transcript: "" }, { transcript: "late" }], undefined);
  ok("NO MIME: still one call, with the WhatsApp default container",
    noMime.sent.length === 1 && noMime.sent[0] === "audio/ogg");

  // THE RECOVERY DID NOT DISAPPEAR — IT MOVED. Without this, deleting the retry and
  // deleting the fallback would both leave this file green.
  // The CALL, not the identifier: a bare `/transcribeWithFallback/` passes on the import
  // line alone, or on a comment mentioning it, so deleting the wiring would leave this green.
  const seam = read("lib/messaging/voice.ts");
  ok("RECOVERY: the empty-transcript path is handed to a second ENGINE at the shared seam",
    /await transcribeWithFallback\(\s*adapter\.name,\s*bytes,\s*opts\s*\)/.test(seam) &&
    /if \(!isEmptyTranscript\(primary\)\) return primary;/.test(seam));
}

console.log(`\nWO-VOICE-DEEPGRAM PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
