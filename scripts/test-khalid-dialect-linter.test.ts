// Unit tests for the Khalid dialect-leakage linter (pure, no LLM, no I/O).
// Run: node --experimental-strip-types scripts/test-khalid-dialect-linter.test.ts
//
// Proves the QUALITY validator: exact Arabic word-boundary logic (no بديل/بدون/بدأ
// false-positive on بدي), true-positives per category with correct tags, determinism,
// and BANLIST SANITY (no native Saudi word is banned). This module is NOT the safety
// gate — these tests assert dialect quality only.
import {
  findLeakage,
  isWordHit,
  BANLIST,
  EGYPTIAN,
  LEVANTINE,
  OTHER,
  CARICATURE,
  emojiCount,
  overLength,
} from "../lib/ai/personas/khalid-dialect-linter.mjs";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// --- banlist shape ----------------------------------------------------------
ok("EGYPTIAN non-empty", EGYPTIAN.length > 0);
ok("LEVANTINE non-empty", LEVANTINE.length > 0);
ok("OTHER non-empty", OTHER.length > 0);
ok("CARICATURE non-empty", CARICATURE.length > 0);
ok("BANLIST = sum of categories",
  BANLIST.length === EGYPTIAN.length + LEVANTINE.length + OTHER.length + CARICATURE.length);
ok("every BANLIST entry is category-tagged",
  BANLIST.every((h) => ["egyptian", "levantine", "other", "caricature"].includes(h.category)));

// --- ★ FALSE-POSITIVE: بدي must NOT trip inside larger legit Arabic words -----
for (const legit of ["بديل", "بدون", "بدأ", "البديل", "بدائل", "مبدئي", "أبدي", "نبدأ"]) {
  ok(`(fp) «${legit}» does NOT trip بدي (word-boundary)`, findLeakage(legit).ok);
  ok(`(fp) isWordHit(«${legit}», بدي) === false`, isWordHit(legit, "بدي") === false);
}
// A realistic sentence carrying بديل must stay clean.
ok("(fp) «نجهز لك بديل بدون مكسرات» is clean", findLeakage("نجهز لك بديل بدون مكسرات").ok);

// --- ★ FALSE-POSITIVE: native Saudi words/phrases trip NOTHING ---------------
const NATIVE_SAUDI = [
  "أبشر", "الحين", "وش", "هلا", "هلا والله", "الله يعطيك العافية", "تسلم",
  "على راسي", "شلونك", "هلا وغلا", "حياك الله", "أبشر بأمرك", "ما قصرت",
  "الله يعافيك", "على خشمي", "وش تحب", "تفضل بطلبك",
];
for (const w of NATIVE_SAUDI) {
  ok(`(fp) native Saudi «${w}» is clean`, findLeakage(w).ok);
}
// The shipped eastern persona greeting (which uses شلونك) must NOT be flagged.
ok("(fp) eastern persona greeting «هلا وغلا، شلونك، حيّاك» is clean",
  findLeakage("هلا وغلا، شلونك، حيّاك").ok);
// The native «على راسي» must NOT trip the caricature PILE «على راسي وعيني وعيوني».
ok("(fp) «على راسي» does not trip the caricature pile", findLeakage("على راسي، جاهز").ok);

// --- BANLIST SANITY: no native-Saudi word is on the banlist ------------------
const banned = new Set(BANLIST.map((h) => h.marker));
for (const w of NATIVE_SAUDI) {
  ok(`(sanity) native «${w}» is NOT in the banlist`, !banned.has(w));
}
// شلونك specifically (native Eastern-Saudi) was removed from the reference Levantine list.
ok("(sanity) «شلونك» removed from LEVANTINE (native Eastern-Saudi)", !LEVANTINE.includes("شلونك"));
ok("(sanity) «الله يعطيك العافية» never a banned needle", !banned.has("الله يعطيك العافية"));

// --- TRUE-POSITIVE: ≥1 real marker per category trips, correct tag -----------
function firstHitCategory(text: string): string | null {
  const r = findLeakage(text);
  return r.hits.length ? r.hits[0].category : null;
}
ok("(tp) egyptian «دلوقتي» trips as egyptian", firstHitCategory("دلوقتي نجهزه") === "egyptian");
ok("(tp) egyptian «معلش» trips as egyptian", firstHitCategory("معلش تأخرنا") === "egyptian");
ok("(tp) levantine «كيفك» trips as levantine", firstHitCategory("كيفك اليوم") === "levantine");
ok("(tp) levantine «بدي» (standalone) trips as levantine", firstHitCategory("بدي اطلب") === "levantine");
ok("(tp) other «شنو» trips as other", firstHitCategory("شنو تحب") === "other");
ok("(tp) other «اشلونك» (Iraqi) trips as other", firstHitCategory("اشلونك") === "other");
ok("(tp) caricature «يا طويل العمر» trips as caricature", firstHitCategory("أبشر يا طويل العمر") === "caricature");
ok("(tp) caricature pile «على راسي وعيني وعيوني» trips as caricature",
  firstHitCategory("على راسي وعيني وعيوني") === "caricature");
// A reply mixing multiple leaks reports all of them.
const multi = findLeakage("كيفك، دلوقتي نجهز بتاعك");
ok("(tp) multi-leak reports ≥3 hits", multi.hits.length >= 3);
ok("(tp) multi-leak is not ok", multi.ok === false);

// --- WORD-BOUNDARY: embedded does NOT trip, standalone DOES ------------------
ok("(wb) standalone «بدي» trips", !findLeakage("بدي").ok);
ok("(wb) «بديل» (embedded) does not trip", findLeakage("بديل").ok);
ok("(wb) «كتير» standalone trips", !findLeakage("كتير").ok);
ok("(wb) «كتيرة»-like embedding does not trip كتير", isWordHit("كتيرة", "كتير") === false);
ok("(wb) leading-boundary: «وكيفك» does not trip كيفك", isWordHit("وكيفك", "كيفك") === false);
ok("(wb) punctuation boundary: «كيفك؟» trips", isWordHit("كيفك؟", "كيفك") === true);
ok("(wb) space boundary: «يا كيفك» trips", isWordHit("يا كيفك", "كيفك") === true);

// --- DETERMINISM ------------------------------------------------------------
const t = "كيفك، بدي بديل بدون مكسرات دلوقتي";
ok("(det) same text → identical result",
  JSON.stringify(findLeakage(t)) === JSON.stringify(findLeakage(t)));

// --- soft advisory helpers (never a block) ----------------------------------
ok("emojiCount counts emoji", emojiCount("أهلاً 🌟🔥") === 2);
ok("emojiCount 0 on plain text", emojiCount("أهلاً وسهلاً") === 0);
ok("overLength true past limit", overLength("abcdef", 3) === true);
ok("overLength false within limit", overLength("ab", 3) === false);

console.log(`\nKHALID-DIALECT-LINTER UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
