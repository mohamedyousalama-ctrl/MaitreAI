// ============================================================================
// WO-VOICE-LADDER — RED-FIRST: imports decideVoiceLadder / confirmVoiceReply (absent on
// the pre-ladder module → ESM link fails → red). Replaces the BINARY garble guard with a
// confidence→behavior ladder, governed by the SAME voice_garble_guard flag:
//   • conf ≥ 0.70            → ACT   (today's behavior — proceed to the Brain)
//   • MEDIUM 0.55–0.70       → CONFIRM (warm "did I get this right?", proceed on yes)
//   • < 0.55 / zero-overlap  → RETYPE (the existing warm retype line)
// SAFETY-FIRST stays binding (the caller only consults the ladder when no allergen/
// emergency signal fired); a confirm that would ECHO a §0 safety assurance is downgraded.
//
// Live signatures: «التسعة مش التماني» @0.725 ACTs; a ~0.62 menu-ish transcript CONFIRMS;
// «سواء غير» @0.52 RETYPEs.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-voice-ladder.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  decideVoiceLadder, confirmVoiceReply, VOICE_QUALITY_FLOOR, OVERLAP_CONF_CEILING,
} from "../lib/ai/voice-quality.ts";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

const MENU = ["برجر دجاج", "شاورما", "بطاطس", "بيبسي"];

// ══ LEG 1 — ACT: the live «التسعة مش التماني» @0.725 proceeds normally ═════════
{
  const d = decideVoiceLadder({ text: "التسعة مش التماني", confidence: 0.725, menuVocab: MENU });
  ok("LEG1: «التسعة مش التماني» @0.725 → ACT (proceed to Brain)", d.action === "act");
}

// ══ LEG 2 — CONFIRM: a medium-confidence menu-ish transcript ══════════════════
{
  const d = decideVoiceLadder({ text: "عايز برجر دجاج", confidence: 0.62, menuVocab: MENU });
  ok("LEG2: ~0.62 menu-ish transcript → CONFIRM (not bounce)", d.action === "confirm" && d.reason === "medium_confidence");
  // The whole MEDIUM band confirms (with overlap): 0.55 (inclusive) … just under 0.70.
  ok("LEG2: 0.55 (floor, inclusive) with overlap → CONFIRM",
    decideVoiceLadder({ text: "شاورما", confidence: 0.55, menuVocab: MENU }).action === "confirm");
  ok("LEG2: 0.699 with overlap → CONFIRM; 0.70 → ACT (ceiling boundary)",
    decideVoiceLadder({ text: "شاورما", confidence: 0.699, menuVocab: MENU }).action === "confirm" &&
    decideVoiceLadder({ text: "شاورما", confidence: 0.70, menuVocab: MENU }).action === "act");
}

// ══ LEG 3 — RETYPE: low confidence and zero-overlap-under-ceiling ═════════════
{
  const low = decideVoiceLadder({ text: "سواء غير", confidence: 0.52, menuVocab: MENU });
  ok("LEG3: «سواء غير» @0.52 → RETYPE (low_confidence)", low.action === "retype" && low.reason === "low_confidence");
  const zero = decideVoiceLadder({ text: "بلبل زقزق فلفل", confidence: 0.62, menuVocab: MENU });
  ok("LEG3: zero-overlap @0.62 (under ceiling) → RETYPE (no_vocab_overlap)", zero.action === "retype" && zero.reason === "no_vocab_overlap");
}

// ══ LEG 4 — SAFETY: a confirm-band transcript is never allowed to echo a §0 phrase ══
{
  const d = decideVoiceLadder({ text: "عايز برجر آمن", confidence: 0.62, menuVocab: MENU });
  ok("LEG4: medium-band transcript containing «آمن» → RETYPE, never CONFIRM (no banned echo)",
    d.action === "retype" && d.reason === "banned_echo");
}

// ══ LEG 5 — the CONFIRM reply echoes + asks, and is §0 banned-clean ═══════════
{
  const eg = confirmVoiceReply("egyptian", "٩ قطع ستربس");
  const kh = confirmVoiceReply("saudi", "٩ قطع ستربس");
  ok("LEG5: confirm reply echoes what was heard + asks to confirm", eg.includes("٩ قطع ستربس") && /صح/.test(eg));
  ok("LEG5: confirm reply is §0 banned-clean (never asserts safety)",
    scanBannedAllergyPhrases(eg).length === 0 && scanBannedAllergyPhrases(kh).length === 0);
  ok("LEG5: Khalid/KSA variant is distinct", kh !== eg && kh.includes("٩ قطع ستربس"));
  ok("LEG5: constants — floor 0.55 < ceiling 0.70", VOICE_QUALITY_FLOOR === 0.55 && OVERLAP_CONF_CEILING === 0.70 && VOICE_QUALITY_FLOOR < OVERLAP_CONF_CEILING);
}

// ══ LEG 6 — ACT fall-through cases (no over-triggering) ═══════════════════════
{
  ok("LEG6: high-conf gibberish @0.85 → ACT (trusted)", decideVoiceLadder({ text: "بلبل زقزق", confidence: 0.85, menuVocab: MENU }).action === "act");
  ok("LEG6: no-confidence WITH overlap → ACT", decideVoiceLadder({ text: "عايز شاورما", menuVocab: MENU }).action === "act");
  ok("LEG6: no-confidence zero-overlap → RETYPE", decideVoiceLadder({ text: "بلبل زقزق", menuVocab: MENU }).action === "retype");
}

// ══ LEG 7 — WIRING: the ladder replaced the binary guard, safety-first, flagged ══
{
  const ct = read("lib/ai/customer-turn.ts");
  ok("WIRE: ladder decision via decideVoiceLadder (binary guard replaced)", /decideVoiceLadder\(\{/.test(ct));
  ok("WIRE: three actions handled — retype + confirm + act fall-through",
    /voiceLadder\.action === "retype"/.test(ct) && /voiceLadder\.action === "confirm"/.test(ct));
  ok("WIRE: confirm sends the deterministic confirm outcome", /result = voiceConfirmResult\(dialect, input\.userMessage, initialDraft, ctx\.profile\.currency(, candidates)?\)/.test(ct));
  ok("WIRE: still flag-gated + SAFETY-FIRST (no allergen/emergency signal)",
    /isFeatureExplicitlyEnabled\("voice_garble_guard", tenantFeatures\)/.test(ct) &&
    /!combinedAllergenHit\.fired &&\s*!companionEmergency\.fired/.test(ct));
}

console.log(`\nWO-VOICE-LADDER PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
