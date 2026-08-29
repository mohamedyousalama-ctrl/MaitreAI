// ============================================================================
// WO-VOICE-PRECISION — RED-FIRST: imports GREETING_STOPLIST / ORDER_FRAME_TERMS /
// isVoiceAssent / wasVoiceLadderConfirm (absent on the pre-WO tree → ESM link fails → red).
// Folds FR-VOICE-DEEP's five proven findings into the deterministic voice path, each
// anchored on the live golden message-id it fixes. HARD LAW unchanged: allergen-class
// tokens are never menu candidates.
//
// Golden anchors:
//   • 04c078ce — «مساء الخير» overfired to «شير بوكس». Now: greeting stop-list + an
//     order-frame requirement on fuzzy matches → no candidate.
//   • 1224f0c0 — a number correction («مية وخمسين …») bounced as zero-overlap gibberish.
//     Now: Egyptian/tens/hundreds number words in the overlap vocab → served.
//   • b68666f5 — a confirm-loop: an assent after a ladder confirm re-confirmed forever.
//     Now: assent-exit leaves the ladder and acts on the confirmed content.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-voice-precision.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  resolveVoiceCandidates, SEED_VOICE_ALIASES, CLASS_PRIORITY_TERMS,
  GREETING_STOPLIST, ORDER_FRAME_TERMS,
} from "../lib/ai/voice-aliases.ts";
import {
  classifyVoiceTranscript, confirmVoiceReply, isVoiceAssent, wasVoiceLadderConfirm,
} from "../lib/ai/voice-quality.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

const MENU = ["شير بوكس", "ستربس دجاج", "بروست", "بطاطس", "كومبو كبير", "شاورما"];
const has = (t: string, item: string) => resolveVoiceCandidates(t, { menuItemNames: MENU }).some((c) => c.item === item);
const top = (t: string) => resolveVoiceCandidates(t, { menuItemNames: MENU })[0]?.item ?? null;

// ══ LEG 1 — finding 1: greeting stop-list + order-frame gate (msg 04c078ce) ═══
{
  // The live overfire: a bare greeting must attach NO menu candidate.
  ok("LEG1: «مساء الخير» → NO candidate (kills the «شير بوكس» overfire, msg 04c078ce)",
    resolveVoiceCandidates("مساء الخير", { menuItemNames: MENU }).length === 0);
  // A framed request for the SAME dish still resolves (exact bypasses the frame gate anyway).
  ok("LEG1: «عايز شير بوكس» → candidate «شير بوكس» (a real order is unaffected)",
    top("عايز شير بوكس") === "شير بوكس");
  // A high-trust bare ALIAS still attaches with no order frame (existing behavior preserved).
  ok("LEG1: a bare alias «استربس» still attaches (alias is high-trust, no frame needed)",
    top("استربس") === "ستربس دجاج");
  // A fuzzy (edit-distance) match with NO order frame is suppressed…
  ok("LEG1: bare «شورما» (fuzzy, no frame) → suppressed", !has("شورما", "شاورما"));
  // …but attaches the moment an order-frame token is present.
  ok("LEG1: «عايز شورما» (framed fuzzy) → candidate «شاورما»", top("عايز شورما") === "شاورما");
  ok("LEG1: the stop-list + frame sets are exported and populated",
    GREETING_STOPLIST.has("مساء") && GREETING_STOPLIST.has("الخير") &&
    ORDER_FRAME_TERMS.has("عايز") && ORDER_FRAME_TERMS.has("اطلب"));
}

// ══ LEG 2 — finding 2: length-relative edit budget (3-letter → near-exact) ════
{
  // «شبر» is one edit from the menu token «شير» — under the new budget a 3-letter token
  // must be EXACT, so it no longer fuzzy-attaches (even framed).
  ok("LEG2: framed 3-letter «شبر» (1 edit from «شير») → NOT a candidate", !has("عايز شبر", "شير بوكس"));
  // An EXACT 3-letter token still matches (exactness is independent of the budget).
  ok("LEG2: exact 3-letter «شير» still matches «شير بوكس»", top("عايز شير") === "شير بوكس");
  // A longer token still tolerates one edit («شورما»→«شاورما»).
  ok("LEG2: a longer near token still matches at 1 edit", top("عايز شورما") === "شاورما");
}

// ══ LEG 3 — finding 3: number words in overlap vocab + quantity class (1224f0c0) ══
{
  // Pure-number correction, menu gives no overlap → survives ONLY via the number vocab.
  ok("LEG3: «مية وخمسين» @0.6 is NOT garbled (number vocab overlap, msg 1224f0c0)",
    classifyVoiceTranscript({ text: "مية وخمسين", confidence: 0.6, menuVocab: [] }).garbled === false);
  ok("LEG3: «اتنين مش تلاتة» @0.6 is NOT garbled (Egyptian number forms)",
    classifyVoiceTranscript({ text: "اتنين مش تلاتة", confidence: 0.6, menuVocab: [] }).garbled === false);
  // Still garbled when there is genuinely no vocab overlap (guard didn't go blanket-permissive).
  ok("LEG3: a true no-overlap garble @0.6 still bounces",
    classifyVoiceTranscript({ text: "زقفثط ضصثق", confidence: 0.6, menuVocab: [] }).garbled === true);
  ok("LEG3: the number words joined the quantity priority class",
    CLASS_PRIORITY_TERMS.quantity.includes("اتنين") && CLASS_PRIORITY_TERMS.quantity.includes("ميتين"));
}

// ══ LEG 4 — finding 4: assent-exit detectors (msg b68666f5) ══════════════════
{
  ok("LEG4: pure assents → true (أيوه/تمام/صح/ماشي)",
    isVoiceAssent("أيوه") && isVoiceAssent("تمام") && isVoiceAssent("صح") && isVoiceAssent("ماشي"));
  ok("LEG4: an assent carrying real intent is NOT a pure assent",
    isVoiceAssent("أيوه عايز حاجة تانية") === false && isVoiceAssent("") === false);
  // The ladder-confirm signature is detected across every confirm variant, and nowhere else.
  ok("LEG4: wasVoiceLadderConfirm detects a confirm turn (candidate + echo, both dialects)",
    wasVoiceLadderConfirm(confirmVoiceReply("egyptian", "x", "ستربس دجاج")) &&
    wasVoiceLadderConfirm(confirmVoiceReply("saudi", "٩ قطع")) &&
    wasVoiceLadderConfirm("أهلاً بيك، تحب تطلب إيه؟") === false);
}

// ══ LEG 5 — finding 5: evidence-backed alias additions ═══════════════════════
{
  ok("LEG5: the ratified garble corrections are seeded",
    SEED_VOICE_ALIASES["برست"] === "بروست" && SEED_VOICE_ALIASES["ستريف"] === "ستربس" &&
    SEED_VOICE_ALIASES["وصية"] === "وصاية" && SEED_VOICE_ALIASES["المنو"] === "المنيو" &&
    SEED_VOICE_ALIASES["اللوكيش"] === "اللوكيشن");
  // A corrected frame verb «أطلو»→«أطلب» satisfies the order-frame gate, so a fuzzy dish attaches.
  ok("LEG5: «أطلو شورما» — corrected frame «أطلب» lets the fuzzy «شاورما» attach",
    has("أطلو شورما", "شاورما"));
  // «برست» corrects to «بروست», which matches the menu item exactly.
  ok("LEG5: «برست» → candidate «بروست» via alias", top("برست") === "بروست");
}

// ══ LEG 6 — HARD LAW intact: allergen tokens never become candidates ═════════
{
  const almondMenu = ["لوز محمص", "ستربس دجاج"];
  ok("LEG6: «عايز لوز» → NO candidate (allergen routes to the safety net, even framed)",
    resolveVoiceCandidates("عايز لوز", { menuItemNames: almondMenu }).length === 0);
}

// ══ LEG 7 — WIRING: the assent-exit gate is in customer-turn ═════════════════
{
  const ct = read("lib/ai/customer-turn.ts");
  ok("WIRE: customer-turn computes assentExit from the two pure detectors",
    /const assentExit = voiceGuardOn && isVoiceAssent\(input\.userMessage\) && wasVoiceLadderConfirm\(lastAssistant\);/.test(ct));
  ok("WIRE: assentExit skips the ladder (forces ACT on the confirmed content)",
    /voiceGuardOn && !assentExit/.test(ct));
  // Re-pinned 2026-08-26. The guard did not weaken — it gained a THIRD safety
  // signal (`!calmEmergency.fired`), so the old regex, which required the block to
  // terminate immediately after `!companionEmergency.fired;`, no longer matched.
  // Asserting each negated signal INDEPENDENTLY inside the voiceGuardOn block is
  // both truer and stricter: dropping any one of the three now fails, and adding a
  // fourth does not spuriously break this test again.
  // Re-pinned 2026-08-29. STATEMENTS ONLY: the window is measured in characters, so a
  // comment inside the guard pushed the closing `;` past it and the lazy match truncated
  // mid-block — the same spurious break this test has now suffered twice. Stripping
  // comments first makes the window about the CODE, which is what it was always meant to
  // measure, and the signal list below can grow without anyone touching the number again.
  const ctCode = ct.split("\n")
    .filter((l) => { const t = l.trimStart(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");
  const guardBlock = /const voiceGuardOn =[\s\S]{0,400}?;/.exec(ctCode)?.[0] ?? "";
  ok("WIRE: the assent-exit stays under the safety-first guard (no allergen/emergency bypass)",
    guardBlock.length > 0 &&
    /!combinedAllergenHit\.fired/.test(guardBlock) &&
    // The UNGATED emergency detector. `companionEmergency`/`calmEmergency` are this same
    // signal filtered through two feature flags, so on a tenant with both OFF they are
    // hard-false and guard nothing — which is how an «اتصلوا بالإسعاف» voice note under
    // 0.70 STT confidence reached the garble ladder instead of the emergency override.
    /!safetyEmergencyHit\.fired/.test(guardBlock) &&
    /!companionEmergency\.fired/.test(guardBlock) &&
    /!calmEmergency\.fired/.test(guardBlock) &&
    /input\.isVoiceTranscript === true/.test(guardBlock));
}

console.log(`\nWO-VOICE-PRECISION PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
