// ============================================================================
// WO-VOICE-HCW (HCW-LITE) — RED-FIRST: imports actBandCoherenceVeto / hasContentAnchor
// (absent on the pre-WO tree → ESM link fails → red). The ACT-band coherence veto: a
// multi-word transcript at conf ≥0.70 carrying an order-frame verb but NO resolved target
// (number/assent/distinctive menu item) is demoted ACT → CONFIRM, never blind-acted.
// Evidence-anchored on the live A/B specimen 2f18834d (deepgram «كريم وجبة عايز عرض
// الأوسايط ساقطة» @0.94). PLUS the two harness honesty-notes (negation و-strip; address
// numbers excluded from quantity). Verified: the specimen demotes; all 10 correct Deepgram
// golden clips keep their band (zero friction).
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-voice-hcw.test.ts
// ============================================================================

import {
  decideVoiceLadder, actBandCoherenceVeto, hasContentAnchor,
} from "../lib/ai/voice-quality.ts";
import { extractCanonicalSlots, parseCanonicalQuantity } from "../lib/ai/stt/slots.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// The golden tenant (وصاية) menu — real names, so candidate resolution matches production.
const MENU = ["أرز","إضافة كاتشب","برجر لحم","بطاطس","بيتزا باربكيو","بيتزا ببروني","بيتزا تشيكن رانش","بيتزا خضار","بيتزا دجاج","بيتزا سماش لحم","بيتزا سوبر رانش","بيتزا سوبر كرانشي","بيتزا كرانشي سموك","بيتزا كيري بسطرمة","بيتزا ميكس جبن","بيتزا هوت دوج","تويستر","ريزو","ريزو دبل شيدر","زنجر","ستربس ١٥ قطعة","ستربس ٣ قطع","ستربس ٥ قطع","ستربس ٧ قطع","سناك بلس","سوبر دينر","سوبر وصاية","عرض ٢ بيتزا وسط","عرض ٦ قطع","عرض ٨ قطع بروست","عرض أكيل","عرض الكتيبة","عرض دبل","عرض شير بوكس","عرض كاديا","عرض ميجا ميل","فيليه سوبريم","قطعة بروست","قطعة ستربس","كول سلو","مياه معدنية","ميسي زنجر","هالبينو","وجبة أطفال","وجبة دينر","وجبة سناك","وجبة وصاية العائلية"];
const band = (text: string, conf: number) => decideVoiceLadder({ text, confidence: conf, menuVocab: MENU });

// ══ LEG 1 — the live specimen (2f18834d) demotes ACT → CONFIRM ════════════════
{
  const r = band("كريم وجبة عايز عرض الأوسايط ساقطة", 0.943); // deepgram @0.94, garble
  ok("LEG1: the specimen 2f18834d is DEMOTED to CONFIRM (coherence_veto), never blind-ACTed",
    r.action === "confirm" && r.reason === "coherence_veto");
}

// ══ LEG 2 — all 10 correct Deepgram golden clips keep their band (ZERO friction) ══
{
  // Correct clips that should ACT — frame-verb WITH an anchor, or no frame verb at all.
  const acts: Array<[string, number]> = [
    ["التسعة مش التمن. التسعة مش التمني.", 0.960],                 // 57d5f6e9 — number
    ["السلام عليكم محتاج الوجبة التسع قطع وبعتلك اللوكيشن", 0.908], // cc18d8c0 — frame + number
    ["تمام محتاج وجبة وصاية العائلية تسع قطع", 0.813],              // b5583c6b — frame + assent + distinctive menu
    ["مساء الخير", 0.998],                                          // 04c078ce — 2-word greeting, never vetoed
    ["أيوه صح عاوز أعمل أوردر في حدود مئة وخمسين جنيه", 0.834],     // b68666f5 — frame + assent + number
    ["ممكن أرسللكم اللوكيشن و ترسلوه الطلب", 0.758],                // 63e530aa — NO frame verb (ممكن≠desire)
    ["أنت عندك أي في حدود مئة وخمسين جنيه", 0.845],                 // 1224f0c0 — number
    ["عندك A بحدود ١٥٠ جنيه", 0.908],                              // bd6fb324 — number
    ["عرض كاديا والتوصيل إلى شارع الهرم، شارع عشرة ومحتاجه حار ومش محتاج أي مشروب. شكرا نفز. تمام.", 0.788], // a3f3643d — frame + distinctive menu «كاديا»
  ];
  ok("LEG2: all 9 correct ACT-band clips stay ACT (no coherence_veto)",
    acts.every(([t, c]) => band(t, c).action === "act"));
  // The 10th correct clip (c9be977b) stays RETYPE on its own low confidence — the veto
  // never turns a RETYPE into anything softer.
  ok("LEG2: the low-confidence garble clip stays RETYPE (veto never softens a retype)",
    band("ترى لي ممكن أن أتصدر", 0.449).action === "retype");
}

// ══ LEG 3 — the veto predicate: frame + no target, but NOT the coherent cases ══
{
  ok("LEG3: order-frame verb + no resolved target → vetoed",
    actBandCoherenceVeto("كريم وجبة عايز عرض الأوسايط ساقطة", MENU) === true);
  ok("LEG3: frame verb + a NUMBER anchor → not vetoed",
    actBandCoherenceVeto("عايز الوجبة تسع قطع", MENU) === false);
  ok("LEG3: NO frame verb (logistics turn) → never vetoed",
    actBandCoherenceVeto("ممكن أرسللكم اللوكيشن و ترسلوه الطلب", MENU) === false);
  ok("LEG3: a distinctive menu item anchors even with a frame verb → not vetoed",
    actBandCoherenceVeto("عايز عرض كاديا", MENU) === false);
  ok("LEG3: a short (<3-word) turn is never vetoed", actBandCoherenceVeto("عايز برجر", MENU) === false);
}

// ══ LEG 4 — content anchors: number / assent / DISTINCTIVE menu (not category) ══
{
  ok("LEG4: a number is an anchor", hasContentAnchor("عايز تسعة", MENU) === true);
  ok("LEG4: an assent is an anchor", hasContentAnchor("تمام عايز حاجة", MENU) === true);
  ok("LEG4: a distinctive menu token («كاديا») is an anchor", hasContentAnchor("عايز عرض كاديا", MENU) === true);
  ok("LEG4: a BARE category token («عرض»/«وجبة») is NOT an anchor",
    hasContentAnchor("عايز عرض", MENU) === false && hasContentAnchor("عايز وجبة", MENU) === false);
}

// ══ LEG 5 — honesty note 1: negation و-strip, but «ولا» (or) stays non-negation ══
{
  ok("LEG5: «ومش محتاج» → negation true", extractCanonicalSlots("عايز حاجة ومش محتاج مشروب", MENU).negation === true);
  ok("LEG5: «حار ولا عادي» (or) stays NON-negation", extractCanonicalSlots("حار ولا عادي", MENU).negation === false);
  ok("LEG5: a bare «لا» still counts as negation", extractCanonicalSlots("لا مش كده", MENU).negation === true);
}

// ══ LEG 6 — honesty note 2: address numbers excluded, real quantities preserved ══
{
  ok("LEG6: «شارع عشرة» is NOT a quantity", parseCanonicalQuantity("التوصيل إلى شارع عشرة") === null);
  ok("LEG6: a real «عشرة قطع» quantity is preserved", parseCanonicalQuantity("عايز عشرة قطع") === 10);
  ok("LEG6: a number NOT after an address word still counts", parseCanonicalQuantity("عايز تسعة") === 9);
}

console.log(`\nWO-VOICE-HCW PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
