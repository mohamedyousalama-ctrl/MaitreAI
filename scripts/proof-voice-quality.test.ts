// ============================================================================
// WO-VOICE-QUALITY — RED-FIRST by construction: imports symbols that DO NOT EXIST on
// origin/main (classifyVoiceTranscript / buildSttPromptVocab / garbledVoiceReply /
// VOICE_QUALITY_FLOOR / confidenceFromSegments) → the ESM link fails on the old tree
// and every leg is RED. Anchored on customer Bebo's four LIVE garbled transcripts
// (05:14–05:15) that whisper-large-v3-turbo produced as gibberish.
//
// Parts: (a) language "ar" explicit · (b) domain prompt-biasing · (c) confidence from
// verbose_json segments · (d) deterministic garble guard (flag voice_garble_guard,
// default OFF) with a SEPARATE quality floor (0.55) and SAFETY-FIRST ordering.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-voice-quality.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  classifyVoiceTranscript, buildSttPromptVocab, garbledVoiceReply, VOICE_QUALITY_FLOOR,
} from "../lib/ai/voice-quality.ts";
import { confidenceFromSegments } from "../lib/ai/stt/groq.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// Bebo's four LIVE transcripts (Wesaya, 2026-07-12 05:14–05:15) — all stt_confidence NULL.
const BEBO = [
  " بصان لكم احتاج المنو",
  " هل يمكنك أن تكون مستشاركة؟",
  " إنه مجرد سيطر بسيطر بسيطر",
  " أعطي إذناني ستريف سم خام سيوكي تالي في منيو",
];
const MENU = ["برجر دجاج", "شاورما", "بطاطس", "بيبسي"];

// ══ LEG 1 — the four live garbles are flagged once confidence (part c) is present ══
{
  // With a real low confidence (< 0.55, as the Groq adapter now supplies), ALL four fire.
  ok("LEG1: all 4 Bebo transcripts → garbled at low confidence (0.40)",
    BEBO.every((t) => classifyVoiceTranscript({ text: t, confidence: 0.40, menuVocab: MENU }).garbled === true));
  // Even with NO confidence, the pure-gibberish ones (no menu/intent word) are caught by
  // zero-overlap; #4 contains «منيو» so it correctly relies on confidence (documented).
  ok("LEG1: pure-gibberish #2/#3 → garbled even with NO confidence (zero overlap)",
    classifyVoiceTranscript({ text: BEBO[1], menuVocab: MENU }).garbled === true &&
    classifyVoiceTranscript({ text: BEBO[2], menuVocab: MENU }).garbled === true);
  ok("LEG1: #4 (contains «منيو») is NOT overlap-garbled — confidence is the load-bearing signal",
    classifyVoiceTranscript({ text: BEBO[3], menuVocab: MENU }).garbled === false &&
    classifyVoiceTranscript({ text: BEBO[3], confidence: 0.4, menuVocab: MENU }).garbled === true);
  ok("LEG1: the low-confidence reason is labeled", classifyVoiceTranscript({ text: BEBO[0], confidence: 0.4, menuVocab: MENU }).reason === "low_confidence");
}

// ══ LEG 2 — precision: clear orders + menu turns are NOT garbled ══════════════
{
  ok("LEG2: a clear order with good confidence + menu overlap is NOT garbled",
    classifyVoiceTranscript({ text: "أبغى برجر دجاج وبطاطس", confidence: 0.9, menuVocab: MENU }).garbled === false);
  ok("LEG2: «منيو لو سمحت» (has an intent word) is NOT garbled even w/o confidence",
    classifyVoiceTranscript({ text: "منيو لو سمحت", menuVocab: MENU }).garbled === false);
  ok("LEG2: floor is STRICT — confidence exactly at 0.55 is NOT garbled",
    classifyVoiceTranscript({ text: "أبغى شاورما", confidence: VOICE_QUALITY_FLOOR, menuVocab: MENU }).garbled === false);
  ok("LEG2: VOICE_QUALITY_FLOOR is the separate quality floor (0.55, below the safety 0.66)",
    VOICE_QUALITY_FLOOR === 0.55);
}

// ══ LEG 3 — confidence extraction from verbose_json segments (part c) ═════════
{
  const c1 = confidenceFromSegments([{ avg_logprob: -0.1 }, { avg_logprob: -0.5 }]);
  ok("LEG3: confidence = exp(min avg_logprob) (worst segment governs)",
    typeof c1 === "number" && Math.abs(c1 - Math.exp(-0.5)) < 1e-9);
  const c2 = confidenceFromSegments([{ avg_logprob: -0.1, no_speech_prob: 0.8 }]);
  ok("LEG3: high no_speech_prob penalizes confidence (min with 1 - no_speech)",
    typeof c2 === "number" && Math.abs(c2 - 0.2) < 1e-9);
  ok("LEG3: no segments → undefined (tripwire + guard stay inert)", confidenceFromSegments([]) === undefined && confidenceFromSegments(undefined) === undefined);
}

// ══ LEG 4 — domain prompt-biasing vocab (part b) ══════════════════════════════
{
  const p = buildSttPromptVocab(MENU);
  ok("LEG4: prompt vocab includes tenant item names", p.includes("برجر دجاج") && p.includes("شاورما"));
  ok("LEG4: prompt vocab includes generic ordering words (منيو)", p.includes("منيو"));
  ok("LEG4: empty menu still yields the ordering words (non-empty)", buildSttPromptVocab([]).length > 0);
  ok("LEG4: length is capped (~200)", buildSttPromptVocab(Array.from({ length: 200 }, (_, i) => `صنف رقم ${i} طويل الاسم`), 200).length <= 200);
}

// ══ LEG 5 — the ratified warm reply (verbatim + Khalid variant) ═══════════════
{
  ok("LEG5: egyptian reply is EXACTLY the ratified line",
    garbledVoiceReply("egyptian") === "معلش، الصوت مش واضح 🙏 ممكن تكتبلي طلبك أو تبعت الرسالة تاني؟");
  ok("LEG5: Khalid/KSA variant mirrors the same intent, distinct wording",
    garbledVoiceReply("saudi") !== garbledVoiceReply("egyptian") && garbledVoiceReply("saudi").includes("الصوت مو واضح"));
}

// ══ LEG 6 — WIRING: (a)(b)(c) UNFLAGGED · (d) FLAGGED · SAFETY-FIRST ══════════
{
  const groq = read("lib/ai/stt/groq.ts");
  ok("WIRE(a): groq passes language, defaulting to «ar» — UNFLAGGED", /fd\.append\("language", opts\?\.languageHint \|\| "ar"\)/.test(groq));
  ok("WIRE(b): groq appends the prompt bias — UNFLAGGED", /if \(opts\?\.prompt\) fd\.append\("prompt", opts\.prompt\)/.test(groq));
  ok("WIRE(c): groq derives confidence from segments — UNFLAGGED", /confidence: confidenceFromSegments\(j\.segments\)/.test(groq));

  const ct = read("lib/ai/customer-turn.ts");
  ok("WIRE(d): garble guard is FLAGGED voice_garble_guard", /isFeatureExplicitlyEnabled\("voice_garble_guard", tenantFeatures\)/.test(ct));
  ok("WIRE(d): SAFETY-FIRST — only when NO allergen/emergency signal fired",
    /!combinedAllergenHit\.fired &&\s*!companionEmergency\.fired/.test(ct));
  // WO-VOICE-LADDER replaced the binary guard: the voice ladder branch precedes the cascade.
  // Re-pinned 2026-08-26. The cascade branch gained `&& !allergySimpleOn`, so the
  // literal indexOf target no longer existed and returned -1 — which made the
  // ordering comparison silently false rather than reporting a real change.
  // Matching the branch by regex keeps the assertion about ORDERING (what this
  // test is for) instead of about the exact condition list, which belongs to the
  // allergen tests. Both indices are asserted > -1 so a vanished anchor fails
  // loudly instead of quietly inverting the comparison.
  const voiceAt = ct.indexOf('if (voiceLadder.action === "retype")');
  const cascadeAt = ct.search(/\} else if \(combinedAllergenHit\.fired && !companionOn/);
  ok("WIRE(d): the voice branch precedes the allergen/companion cascade (first)",
    voiceAt > 0 && cascadeAt > 0 && voiceAt < cascadeAt);
  ok("WIRE(d): the retype path sends the deterministic garble outcome (no LLM)", /result = voiceGarbleResult\(dialect, initialDraft, ctx\.profile\.currency, voiceLadder\.reason\)/.test(ct));
}

console.log(`\nWO-VOICE-QUALITY PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
