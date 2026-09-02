// ============================================================================
// WO-PHONETIC-NET-TYPED-SCOPE — the phonetic net's TYPED-turn near path (blocking).
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//   scripts/proof-phonetic-typed-scope.test.ts
//
// The phonetic net's Levenshtein NEAR path exists to recover garbled STT. Applied
// UNCONDITIONALLY to TYPED text it over-triggered on dist-1/dist-2 look-alikes of
// short allergen terms (e.g. «عايز الحساب»→حساس, «موز»→لوز, and the two MIZAN
// captures «أطباق»→البان / «ثاني»→سوداني). Fix: for TYPED turns, NEAR fires only when
//   (term.length ≥ 5 AND dist ≤ 1)  OR  (term.length < 5 AND dist ≤ 1 AND allergy-intent),
// while TRANSCRIBED/voice turns keep the full STT-recovery budget (proof-voice-safety-net
// asserts the 31 voice cases stay byte-identical). Exact hits + phrases + English/Franco
// are unchanged for all turns (fail-safe preserved).
// ============================================================================

import { detectPhoneticSafetyNet } from "../lib/ai/phonetic-safety-net.ts";
import { detectAllergenAvoidance } from "../lib/ai/allergen-gate.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const typedFires = (s: string) => detectPhoneticSafetyNet(s).fired;                       // typed (no flag)
const voiceFires = (s: string) => detectPhoneticSafetyNet(s, { isVoiceTranscript: true }).fired;

// 1) RED-FIRST — typed FALSE positives that FIRED on the pre-WO net; MUST be clean now.
//    (The two MIZAN captures are dist-2; «الحساب»/«احساس»/«موز»/«قمر»/«البيت» are dist-1
//    to SHORT terms with no allergy intent.)
const TYPED_FP = [
  "هلا، إيش عندكم أطباق اليوم؟",   // MIZAN S1-03 — أطباق ≈ البان (d2)
  "خلص طلبي، شي ثاني؟",            // MIZAN S10-02 — ثاني ≈ سوداني (d2)
  "عايز الحساب لو سمحت",           // الحساب ≈ حساس (d1, short, no intent) — the bill
  "عندي احساس حلو النهارده",        // احساس ≈ حساس (d1) — a feeling
  "ممكن موز مع الطلب",             // موز ≈ لوز (d1) — banana
  "يا قمر عليك",                   // قمر ≈ قمح (d1) — a compliment
  "احنا رايحين البيت",             // البيت ≈ البان (d2) — going home
];
for (const s of TYPED_FP) ok(`typed-clean (was FP): «${s}»`, !typedFires(s));

// 2) SCOPING IS REAL — the SAME strings, as VOICE transcripts, STILL fire (full STT
//    budget). Proves this is voice-vs-typed scoping, not a global weakening / recall loss.
ok("voice still fires: «أطباق اليوم» (near البان)", voiceFires("هلا، إيش عندكم أطباق اليوم؟"));
ok("voice still fires: «شي ثاني» (near سوداني)", voiceFires("خلص طلبي، شي ثاني؟"));
ok("voice still fires: «موز» (near لوز)", voiceFires("ممكن موز مع الطلب"));

// 3) INTENT-EXCEPTION — a typo'd SHORT allergen INSIDE a real disclosure MUST fire typed.
const TYPED_SHORT_INTENT = [
  "بتعبني البيظ",           // تعب intent + البيظ ≈ بيض (d1, short)
  "ما اتحمل الحلوب",        // ما اتحمل intent + الحلوب ≈ حليب (d1, short)
  "مينفعش اكل الموز ده",    // ...اكل intent + الموز ≈ لوز (d1, short)
];
for (const s of TYPED_SHORT_INTENT) ok(`typed-fire (short+intent): «${s}»`, typedFires(s));

// 4) NO-INTENT CONTROL — the same short near-words WITHOUT allergy intent stay clean typed.
for (const s of ["عايز البيظ", "عايز الموز", "ممكن الحلوب"]) ok(`typed-clean (short, no intent): «${s}»`, !typedFires(s));

// 5) LONG-TERM TYPOS — a 1-edit typo of a LONG allergen (≥5) fires typed with NO intent needed.
for (const s of ["سودني", "مكسرت في الطلب", "جلوتن", "لكتوز", "جمبر"]) ok(`typed-fire (long typo): «${s}»`, typedFires(s));

// 6) THE "DOCUMENTED ACCEPTED FAIL-SAFE" WAS A DOCUMENTED FALSE POSITIVE, AND IT IS FIXED.
//
//    «تعبان من الحساب» is "tired of the bill" — a customer complaining about a price. It
//    fired because «تعب» was a bare stem in the avoidance-intent list (matching «تعبان»,
//    "tired") and «الحساب» is one edit from «حساس» ("allergic"). Two accidents, one on each
//    side, and the result was written down here as acceptable: "over-escalate, never miss".
//
//    It is not acceptable. The Founder retired this whole net for exactly this — an ordinary
//    sentence answered as an allergy consultation — and a complaint about the bill is the
//    worst possible turn to answer with a safety questionnaire. The intent list now reads
//    «تعب» only with an object pronoun («يتعبني»), under a condition («أتعب لو»), or followed
//    by «من» AND an actual allergen («يتعب من البندق» still fires, and is asserted in
//    scripts/test-allergen-gate.test.ts). The near-miss half is retired outright.
ok("typed-QUIET (the fail-safe that was a false positive): «تعبان من الحساب»",
  !typedFires("تعبان من الحساب"));
// …and the genuine third-party disclosure that shares its shape still fires — asserted
// against the LIVE GATE, not this retired module. `typedFires` is
// `detectPhoneticSafetyNet`, which reaches no live path any more
// (scripts/proof-phonetic-net-unwired.test.ts), so a pass or a fail from it says nothing
// about what a customer experiences. What matters is that the exact gate still hears it.
ok("the LIVE gate still hears «صاحبي بيتعب من البندق»",
  detectAllergenAvoidance("صاحبي بيتعب من البندق").fired);
ok("…and stays quiet on «تعبان من الحساب»", !detectAllergenAvoidance("تعبان من الحساب").fired);

// 7) FAIL-SAFE PRESERVED for typed — exact marker/phrase/English still fire (unchanged).
ok("typed exact marker: «عندي حساسية»", typedFires("عندي حساسية"));
ok("typed phrase: «ما اتحمل»", typedFires("عندي مشكلة، ما اتحمل"));
ok("typed English: «peanut allergy»", typedFires("do you have a peanut allergy option?"));

console.log(`\nPHONETIC TYPED-SCOPE PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
