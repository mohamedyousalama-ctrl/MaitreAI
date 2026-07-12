// ============================================================================
// WO-VOICE-QUALITY-2 — garble-guard PRECISION fix. RED-FIRST: imports OVERLAP_CONF_CEILING
// (absent on the pre-fix module → ESM link fails → red) AND asserts the live behavior that
// the old classifier got wrong.
//
// Live evidence (13:29:11–14): «التسعة مش التماني» ("nine not eight") transcribed CORRECTLY
// at conf 0.725 — a valid quantity correction — yet the garble guard bounced it (zero menu
// overlap; the intent vocab had no number/correction words). Two deterministic fixes:
//   (1) expand the intent vocabulary — Arabic number-words + digits, quantity/correction
//       words (مش، غير، بدل، قصدي، يعني، لا، كمان، بس), confirmation words (تمام، ماشي، اه، أيوة);
//   (2) scope the zero-overlap trigger by confidence — it may fire only when
//       conf < OVERLAP_CONF_CEILING (0.70); at conf ≥ 0.70 the transcript is trusted
//       regardless of overlap. Low confidence (< 0.55) still bounces as before.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-voice-quality-2.test.ts
// ============================================================================

import {
  classifyVoiceTranscript, OVERLAP_CONF_CEILING, VOICE_QUALITY_FLOOR,
} from "../lib/ai/voice-quality.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

const MENU = ["برجر دجاج", "شاورما", "بطاطس", "بيبسي"];

// ══ LEG 1 — the LIVE message passes through (must NOT bounce) ═════════════════
{
  const live = "التسعة مش التماني"; // correct transcript, conf 0.725
  ok("LEG1: «التسعة مش التماني» @0.725 is NOT garbled (trusted + vocab)",
    classifyVoiceTranscript({ text: live, confidence: 0.725, menuVocab: MENU }).garbled === false);
  // Even with NO confidence it now passes — the expanded vocab («مش»/«تسعة») overlaps.
  ok("LEG1: the same message passes even with NO confidence (vocab expansion)",
    classifyVoiceTranscript({ text: live, menuVocab: MENU }).garbled === false);
}

// ══ LEG 2 — «سواء غير» @0.52 must STILL bounce (low confidence) ═══════════════
{
  const c = classifyVoiceTranscript({ text: "سواء غير", confidence: 0.52, menuVocab: MENU });
  ok("LEG2: «سواء غير» @0.52 is garbled — low confidence bounces even with a vocab word",
    c.garbled === true && c.reason === "low_confidence");
}

// ══ LEG 3 — vocabulary expansion: numbers, digits, corrections, confirmations ══
{
  ok("LEG3: digits count as vocabulary — «عايز ٩ مش ٨» not garbled (no conf)",
    classifyVoiceTranscript({ text: "عايز ٩ مش ٨", menuVocab: MENU }).garbled === false);
  ok("LEG3: a correction word «بدل» overlaps — «بدل الكبير صغير» not garbled @0.6",
    classifyVoiceTranscript({ text: "بدل الكبير صغير", confidence: 0.6, menuVocab: MENU }).garbled === false);
  ok("LEG3: confirmation «تمام ماشي» not garbled @0.6",
    classifyVoiceTranscript({ text: "تمام ماشي", confidence: 0.6, menuVocab: MENU }).garbled === false);
  ok("LEG3: a number word «خمسة كمان» not garbled (no conf)",
    classifyVoiceTranscript({ text: "خمسة كمان", menuVocab: MENU }).garbled === false);
}

// ══ LEG 4 — the confidence SCOPING is precise ════════════════════════════════
{
  const gibberish = "بلبل زقزق فلفل شخبط"; // zero menu/intent/digit overlap
  ok("LEG4: gibberish at HIGH conf (≥0.70) is TRUSTED (not garbled) — the scoped tradeoff",
    classifyVoiceTranscript({ text: gibberish, confidence: 0.80, menuVocab: MENU }).garbled === false);
  const mid = classifyVoiceTranscript({ text: gibberish, confidence: 0.60, menuVocab: MENU });
  ok("LEG4: the SAME gibberish at UNCERTAIN conf (<0.70) still bounces on zero overlap",
    mid.garbled === true && mid.reason === "no_vocab_overlap");
  const low = classifyVoiceTranscript({ text: gibberish, confidence: 0.40, menuVocab: MENU });
  ok("LEG4: and at LOW conf (<0.55) it bounces on low_confidence regardless",
    low.garbled === true && low.reason === "low_confidence");
  // With NO confidence, zero-overlap gibberish still bounces (uncertain by default).
  ok("LEG4: zero-overlap gibberish with NO confidence still bounces",
    classifyVoiceTranscript({ text: gibberish, menuVocab: MENU }).garbled === true);
}

// ══ LEG 5 — the constants ════════════════════════════════════════════════════
{
  ok("LEG5: OVERLAP_CONF_CEILING is 0.70", OVERLAP_CONF_CEILING === 0.70);
  ok("LEG5: VOICE_QUALITY_FLOOR unchanged at 0.55", VOICE_QUALITY_FLOOR === 0.55);
  ok("LEG5: the trust ceiling sits above the bounce floor", OVERLAP_CONF_CEILING > VOICE_QUALITY_FLOOR);
}

// ══ LEG 6 — no regression on the original guard behavior ═════════════════════
{
  ok("REG: a clear order @0.9 with menu overlap is not garbled",
    classifyVoiceTranscript({ text: "أبغى برجر دجاج", confidence: 0.9, menuVocab: MENU }).garbled === false);
  ok("REG: the floor is still strict — conf exactly 0.55 is not low-confidence-garbled",
    classifyVoiceTranscript({ text: "أبغى شاورما", confidence: VOICE_QUALITY_FLOOR, menuVocab: MENU }).garbled === false);
  ok("REG: empty transcript is still garbled",
    classifyVoiceTranscript({ text: "   ", confidence: 0.9 }).garbled === true);
}

console.log(`\nWO-VOICE-QUALITY-2 PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
