// ============================================================================
// Proof: the SAUDI system prompt does not order Khalid to speak Egyptian.
//
// LIVE EVIDENCE. Khalid's first reply to a Saudi customer was «كام كبسة لحم تبي؟».
// «كام» is Egyptian; Najdi is «كم». It was not the model inventing it — the prompt
// TOLD him to, at lib/ai/prompt.ts, unbranched:
//
//     «Ask quantity in the item's OWN unit: «كام عرض؟» for a combo/deal,
//      «كام قطعة؟» only for piece items»
//
// …and there was no standalone Najdi «كم …؟» quantity question anywhere in the Saudi
// prompt to compete with it. The model was given two Egyptian ways to ask "how many"
// and no Saudi one.
//
// WHY EVERY EXISTING GATE MISSED IT. scripts/proof-saudi-dialect-purity.test.ts walks
// `dialect === "egyptian" ? X : Y` conditionals and lints the Saudi arm — but its file
// list contains neither lib/ai/prompt.ts nor lib/ai/prompt-allergy.ts, and its whole
// design only inspects CONDITIONALS. These strings had no conditional at all, so they
// were out of scope twice over. This proof reads the BUILT prompt instead, which is the
// only artifact the model actually sees.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-saudi-prompt-register.test.ts
// ============================================================================

import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  FAIL", name); }
};

const ctx = (dialect: string) => ({
  profile: { name: "مطعم الديرة", currency: dialect === "saudi" ? "ر.س" : "ج.م", timezone: "Asia/Riyadh", businessType: "restaurant" },
  dialect, menuItems: [], modifiers: [], branches: [], deliveryAreas: [],
  policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
  faqs: [], aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
  mode: "live", isOpen: true, autoAccept: false,
  personaName: dialect === "saudi" ? "خالد" : "كريم",
  khalidPersona: dialect === "saudi", ksaEncyclopedia: dialect === "saudi", ksaRegion: "najd",
  statefulOrders: true, goalLogic: true, mediaTurnTrigger: true,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const saudi = buildCustomerAgentSystemPrompt(ctx("saudi") as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const egyptian = buildCustomerAgentSystemPrompt(ctx("egyptian") as any);

// ── 1. THE LIVE BUG, and the counter-exemplar that was missing ───────────────
// Narrowly: the IMPERATIVE forms are gone. «كام» survives once in the Franco decode
// glossary («b kam» = «بكام»), and that is correct and deliberate — decoding what a
// CUSTOMER might type is comprehension, not register. A Saudi customer types Franco too.
ok("the «كام …؟» quantity IMPERATIVES are gone from the Saudi prompt",
  !saudi.includes("كام عرض") && !saudi.includes("كام قطعة"));
// A WORD-BOUNDARY check, not a substring one: «كام» also lives inside «بالكامل»
// («أنا أسمع الشكوى بالكامل» — a perfectly good Najdi line from the persona layer), and
// inside the Franco gloss «بكام». Neither is the Egyptian interrogative.
ok("no standalone Egyptian «كام» survives as a word in the Saudi prompt",
  !/(?<![ء-ي])كام(?![ء-ي])/.test(saudi));
ok("…while the Franco decode entry «b kam» → «بكام» is deliberately kept",
  saudi.includes("«b kam» = «بكام»"));
ok("…and a Najdi «كم … تبي؟» quantity exemplar now EXISTS to take its place",
  /كم (?:عرض|قطعة) تبي؟/.test(saudi));
ok("«كام» is still there for the Egyptian tenant, whose word it is", egyptian.includes("كام"));

// ── 2. every string the prompt ORDERS the Saudi agent to say ────────────────
// Each of these was unbranched — authored once in Cairene and served verbatim to Khalid.
const MUST_NOT_SAY: [string, string][] = [
  ["دلوقتي (as a thing to say)", "خلص دلوقتي"],
  ["ظبطتها دلوقتي", "ظبطتها دلوقتي"],
  ["دي قائمتنا", "دي قائمتنا"],
  ["دي عروضنا", "دي عروضنا"],
  ["ده عرض كاديا", "ده عرض كاديا"],
  ["معاك وأحاول أظبطها", "معاك وأحاول أظبطها"],
  ["بعتلك الإيصال تاني", "بعتلك الإيصال تاني"],
  ["بنحتفظ بسجل", "بنحتفظ بسجل"],
  ["أزوّد صنف؟ أغيّر حاجة؟", "أزوّد صنف؟ أغيّر حاجة؟"],
  ["حاجة مقرمشة", "حاجة مقرمشة"],
  ["الصنف ده", "الصنف ده"],
  ["مفيش عروض", "مفيش عروض"],
  ["النهارده", "النهارده"],
  ["أحسن أكل في مصر", "أحسن أكل في مصر"],
  ["الرقم ده وابعتلنا", "الرقم ده وابعتلنا"],
  ["مش بقدر أقرا", "مش بقدر أقرا"],
];
for (const [label, needle] of MUST_NOT_SAY) {
  ok(`Saudi prompt does not instruct «${label}»`, !saudi.includes(needle));
  ok(`…and the Egyptian prompt keeps it`, egyptian.includes(needle));
}

// ── 2b. NAJDI vs HIJAZI ──────────────────────────────────────────────────────
// «أبغى آكل» was the ONLY Saudi customer utterance in the entire base prompt — and it is
// HIJAZI. khalid.ts:375 itself names «أبغى» as a Hijazi cue a Najdi Khalid should only
// lightly mirror, yet the base prompt gave the model no Najdi anchor to prefer. Live
// output: «كم حبة تبغى؟» on a najd tenant. Najdi is «أبي» / «تبي».
ok("the Saudi prompt's customer-utterance example is Najdi, not Hijazi",
  saudi.includes("«أبي آكل»") && !saudi.includes("«أبغى آكل»"));
ok("the Najdi quantity exemplars use «تبي», the Najdi form",
  saudi.includes("«كم عرض تبي؟»") && saudi.includes("«كم قطعة تبي؟»"));
ok("«أبغى» survives ONLY where it is named as a Hijazi cue to mirror lightly",
  !/«أبغى آكل»/.test(saudi));

// ── 3. THE SAFETY LINE ───────────────────────────────────────────────────────
// The mandatory cross-contact caveat is the one sentence that must land cleanly with a
// customer who has just said they have an allergy. It carried the Egyptian ما...ش
// circumfix («ما نقدرش نضمن») for every tenant, because legacyAllergyBlock() took no
// dialect at all. The demo tenant runs the LEGACY block — allergy_companion_mode is
// deliberately OFF — so this was the block Khalid actually got.
ok("the cross-contact caveat is Najdi for a Saudi tenant", saudi.includes("ما نقدر نضمن عدم وجود أثر"));
ok("…and is NOT the Egyptian circumfix", !saudi.includes("ما نقدرش نضمن"));
ok("…while the Egyptian tenant keeps its own form", egyptian.includes("ما نقدرش نضمن"));
ok("the allergy acknowledgement is Najdi", saudi.includes("خذت بالي") && !saudi.includes("خدت بالي"));
ok("«صحتك أهم شي» not «أهم حاجة»", saudi.includes("صحتك أهم شي") && !saudi.includes("صحتك أهم حاجة"));

// ── 4. THE IMMEDIACY BANS COVER NAJDI TOO ────────────────────────────────────
// The bans named only «حالاً»/«دلوقتي». A Najdi Khalid could promise «الحين» — the exact
// same false-immediacy claim — with nothing stopping him. Both dialects now ban both.
for (const [label, prompt] of [["saudi", saudi], ["egyptian", egyptian]] as const) {
  ok(`${label}: the escalation ban includes «الحين»`, prompt.includes('«حالاً»/«دلوقتي»/«الحين»'));
  ok(`${label}: the fake-ETA ban includes «جاي الحين»`, prompt.includes('«جاي دلوقتي»/«جاي الحين»'));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} saudi-prompt-register: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
