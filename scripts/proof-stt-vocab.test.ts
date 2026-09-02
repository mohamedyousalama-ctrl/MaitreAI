// ============================================================================
// PROOF — the recognizer is never nudged toward a word that trips a safety gate.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs \
//        --experimental-strip-types scripts/proof-stt-vocab.test.ts
//
// THE REGRESSION, caught in production minutes after shipping. Priming the transcriber
// with the tenant's menu is a genuine quality win — «جريش»، «لقيمات»، «مندي» are proper
// nouns a general model gets wrong unbiased — and the WhatsApp path has done it for a long
// time. The demo call was given the same treatment, and the demo menu contains «لبن بارد».
//
// The Founder said «هلا والله». Two words. A plain greeting. Whisper, now biased toward
// dairy, heard a dairy word; the deterministic allergen gate fired CORRECTLY on what it was
// handed; and a hello became an allergy consultation with a safety hold nobody can leave:
//
//   timing stt=233ms brain=840ms model=deterministic_allergen_gate
//   spoken reply skipped { reason: 'safety_hold' }
//
// Nothing was broken. Every component did its job. The defect was in the composition: a
// recognizer biased toward a word hears that word, and one biased word trips a safety gate.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { safeSttVocabulary } from "../lib/ai/stt/safe-vocab.ts";
import { detectAllergenAvoidance, normalizeAr } from "../lib/ai/allergen-gate.ts";
import { exactSafetyToken } from "../lib/ai/allergen-context.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

// The actual demo menu (scripts/seed-demo-ksa-tenant.mjs), which is what shipped.
const DEMO_MENU = [
  "كبسة دجاج", "كبسة لحم", "مندي دجاج", "جريش",
  "لبن بارد", "قهوة عربية", "تمر سكري", "لقيمات",
];

console.log("\n── THE WORD THAT CAUSED IT IS GONE ─────────────────────────────");
{
  const vocab = safeSttVocabulary(DEMO_MENU);
  ok("«لبن بارد» is not offered to the recognizer",
    !vocab.some((v) => v.includes("لبن")));
  // ALIGNED WITH THE GATE, DRIVEN AGAINST IT. The property is not "the probe returns no
  // term" — «حساسية» is itself in the lexicon, so the probe always names something. It is
  // that no kept name CONTAINS a term the gate could pick, since that is exactly the word
  // a biased recognizer could emit and the gate could then fire on.
  for (const name of vocab) {
    const hit = detectAllergenAvoidance(`عندي حساسية من ${name}`);
    const picked = hit.term ? normalizeAr(hit.term) : "";
    ok(`«${name}» contains no allergen the gate could pick`,
      picked === "" || !normalizeAr(name).includes(picked));
  }
}

console.log("\n── AND THE WORDS IT EXISTS FOR ARE STILL THERE ─────────────────");
{
  // Over-filtering would silently undo the whole feature and leave a comment claiming it
  // works. These are the Najdi proper nouns a general model gets wrong unbiased — the
  // entire reason for priming.
  const vocab = safeSttVocabulary(DEMO_MENU);
  for (const kept of ["كبسة دجاج", "مندي دجاج", "جريش", "لقيمات"]) {
    ok(`«${kept}» is still offered`, vocab.includes(kept));
  }
  ok("most of the menu survives the filter", vocab.length >= DEMO_MENU.length - 3);
}

console.log("\n── IT FAILS TOWARD LESS BIAS, NEVER MORE ───────────────────────");
{
  // The two errors are not symmetric. Dropping a name costs one clarifying question.
  // Keeping a dangerous one manufactures an allergy and holds the whole conversation.
  ok("empty and blank names are dropped",
    safeSttVocabulary(["", "   ", null, undefined]).length === 0);
  ok("an empty menu is handled", safeSttVocabulary([]).length === 0);
  ok("a null list is handled", safeSttVocabulary(null as never).length === 0);

  // A dish whose name carries a CLEAN allergen word must lose it.
  for (const risky of ["لبن بارد", "مكسرات مشكلة", "بيض مسلوق"]) {
    const kept = safeSttVocabulary([risky, "جريش"]);
    ok(`«${risky}» is refused`, !kept.includes(risky) && kept.includes("جريش"));
  }

  // A PREFIXED ALLERGEN IS STILL AN ALLERGEN — and the earlier version of this block
  // argued the opposite, which is why the bug survived.
  //
  // It reasoned: «عصير فراولة باللبن» is KEPT and that is CORRECT, because the gate is
  // boundary-aware and cannot pick «لبن» out of «باللبن» either — "a word the gate can never
  // fire on cannot be turned into a false allergy by biasing toward it".
  //
  // The premise is true and the conclusion does not follow. The gate's boundary-awareness
  // governs what it READS. Prompt bias governs what the recognizer EMITS, and it works on
  // tokens, which do not respect our word boundaries: prime Whisper with «باللبن» and it is
  // measurably likelier to emit the bare «لبن» — in a LATER utterance, on its own, where
  // the gate reads it exactly as it reads any other bare allergen and fires correctly. That
  // is the whole mechanism this file was written for, arriving through the one spelling the
  // filter was blind to. And Arabic menus write dishes this way as a matter of course.
  for (const compound of ["عصير فراولة باللبن", "كيك بالبيض", "سلطة بالمكسرات"]) {
    ok(`«${compound}» is dropped — the prefix does not make it safe`,
      !safeSttVocabulary([compound]).includes(compound));
  }
}

console.log("\n── EVERY DETECTOR THE ROUTE RUNS, AND NO MORE ──────────────────");
{
  // THE FILTER IS EXACTLY AS WIDE AS THE LIVE GATE — that is the whole property, and it has
  // now been wrong in both directions.
  //
  // It was too NARROW: it asked only `detectAllergenAvoidance`, so «موز» and «كنافة بالجبن»
  // were offered to the recognizer while the PHONETIC NET could fire a hold on them. Then it
  // was widened to all four detectors and became too WIDE, because the phonetic net was
  // itself removed by Founder ruling (lib/ai/phonetic-safety-net.ts) — it fired on words
  // that merely SOUND like an allergen and turned «هلا والله» into an allergy consultation.
  //
  // With the net unwired, «موز» and «كنافة بالجبن» can no longer trip anything, so withholding
  // them from the transcriber costs recognition quality for zero safety gain. They come back.
  const { detectPhoneticSafetyNet } = await import("../lib/ai/phonetic-safety-net.ts");
  const { detectAllergenEmergency } = await import("../lib/ai/allergen-emergency.ts");
  const { detectAllergenSymptom } = await import("../lib/ai/allergen-gate-symptoms.ts");

  for (const soundalike of ["كنافة بالجبن", "موز", "رز أبيض", "صلصة بيضاء"]) {
    // The module still WORKS — it is unwired, not broken — so this documents what was given
    // up. If someone re-wires it, proof-phonetic-net-unwired fails and so does the filter.
    ok(`«${soundalike}» would have tripped the retired net`,
      detectPhoneticSafetyNet(soundalike, { sttConfidence: null, isVoiceTranscript: true }).fired);
    ok(`…and is now offered to the recognizer again`,
      safeSttVocabulary([soundalike, "جريش"]).includes(soundalike));
  }

  // AND A REAL ALLERGEN IS STILL WITHHELD. The ruling removed the guessing, not the gate.
  for (const real of ["لبن بارد", "زبدة الفول السوداني", "سليق باللبن", "شكشوكة بالبيض"]) {
    ok(`«${real}» is still kept away from the recognizer`,
      !safeSttVocabulary([real, "جريش"]).includes(real));
  }

  // ASSERTED AS THE AGREEMENT, not a hand-picked list: nothing the filter keeps may trip any
  // detector the route ACTUALLY RUNS. Adding a fifth detector to the route without adding it
  // here fails HERE.
  const MENU = [
    "كنافة بالجبن", "موز", "رز أبيض", "زبدة الفول السوداني", "لبن بارد", "سليق باللبن",
    "كبسة دجاج", "مندي لحم", "جريش", "لقيمات", "قهوة عربية", "تمر سكري", "شيش طاووق",
    "سلطة خضراء", "فتوش", "حمص", "متبل", "عصير برتقال", "شاي أحمر", "هريس", "مرقوق",
  ];
  const kept = safeSttVocabulary(MENU);
  let leaked = "";
  for (const name of kept) {
    const hit = detectAllergenAvoidance(`عندي حساسية من ${name}`);
    const picked = hit.term ? normalizeAr(hit.term) : "";
    const trips =
      detectAllergenEmergency(name).fired ||
      detectAllergenSymptom(name).fired ||
      (picked !== "" && normalizeAr(name).includes(picked));
    if (trips) leaked = name;
  }
  ok(`no kept name can trip any detector the route runs${leaked ? ` — «${leaked}» can` : ""}`,
    leaked === "");

  // THE SYMPTOM ARM IS LOAD-BEARING, and a mutation proved nothing exercised it: dropping a
  // detector from the filter changed no answer, because no realistic dish name trips one.
  // Constructed on purpose — «طفح» (rash) is not a dish, and that is the point: the filter
  // must refuse ANY name a live detector can fire on, not only the ones a menu happens to
  // contain today.
  // ASKED OF THE TOKEN, NOT OF A SENTENCE — and that distinction is the fix, not a dodge.
  //
  // This drove `detectAllergenSymptom("طفح")`, which answers "does this SENTENCE report a
  // rash". A bare «طفح» no longer does, deliberately: «طفح الكيل» is the fixed idiom for
  // "enough is enough" and was raising an allergy hold on the angriest customer in the
  // queue. What the FILTER needs to know is different and more conservative — "is this word
  // a safety word at all" — because biasing a transcriber toward «طفح» is how a rash appears
  // in a transcript nobody spoke. `exactSafetyToken` owns that question.
  ok("a symptom word is still a safety word for vocabulary purposes",
    exactSafetyToken("طفح") !== null && exactSafetyToken("حكه") !== null);
  // …and the sentence-level detector still hears it said the way people say it.
  ok("…while the sentence detector needs a body or a report frame",
    detectAllergenSymptom("بيجيلي طفح من المكسرات").fired &&
    detectAllergenSymptom("عندي طفح").fired &&
    !detectAllergenSymptom("طفح الكيل").fired);
  ok("…and the filter refuses it", !safeSttVocabulary(["طفح جلدي", "جريش"]).includes("طفح جلدي"));
  ok("…while the safe dish beside it survives",
    safeSttVocabulary(["طفح جلدي", "جريش"]).includes("جريش"));

  // THE EMERGENCY ARM, DRIVEN — AND IT USED NOT TO BE.
  //
  // This assertion read the SOURCE of safe-vocab.ts for the string
  // "detectAllergenEmergency(name).fired", on the stated grounds that "an emergency detector
  // needs emergency PHRASING, which no dish name has, so there is no honest fixture". The
  // reasoning was wrong and the assertion was worthless: deleting the call and leaving a
  // comment behind would have kept it green, and — more to the point — the detector's own
  // emergency-call family matches on BARE DIGITS: «997», «911», «112» and their Arabic-
  // numeral forms. «برجر 911» is a real restaurant name, not a constructed one.
  //
  // So there is an honest fixture, and this is it: a menu item whose name fires the emergency
  // detector, and a filter that must refuse the token and keep the dish.
  // A NAME THAT IS AN EMERGENCY NUMBER IS DROPPED WHOLE — the emergency arm, driven.
  //
  // This assertion used to read the SOURCE of safe-vocab.ts for the string
  // "detectAllergenEmergency(name).fired", on the stated grounds that "an emergency detector
  // needs emergency PHRASING, which no dish name has, so there is no honest fixture". Reading
  // source is not a test: deleting the call and leaving a comment would have kept it green.
  //
  // There IS an honest fixture, because the detector hears a bare emergency number standing
  // on its own — «997», «911», «112» — and a menu item can be nothing but a number.
  ok("an emergency number alone fires the detector", detectAllergenEmergency("911").fired);
  ok("…and the filter refuses that name", !safeSttVocabulary(["911", "جريش"]).includes("911"));
  ok("…and the same for 997", !safeSttVocabulary(["997", "جريش"]).includes("997"));
  ok("…while the safe dish beside it survives", safeSttVocabulary(["911", "جريش"]).includes("جريش"));

  // AND «برجر 911» IS KEPT WHOLE, WHICH IS THE CORRECT ANSWER AND WAS NOT ALWAYS.
  //
  // The digits used to fire with no boundary and no context, so this name was split and
  // «911» withheld — along with every customer's phone number being read as an ambulance
  // call (see lib/ai/allergen-emergency.ts). A burger named after a car is a burger. The
  // filter now keeps the name, and the recognizer gets the whole thing.
  ok("«برجر 911» does not fire the detector", !detectAllergenEmergency("برجر 911").fired);
  ok("…so the filter keeps it whole", safeSttVocabulary(["برجر 911", "جريش"]).includes("برجر 911"));

  ok(`…and the menu is now MORE primed than before the ruling (${kept.length}/${MENU.length})`,
    kept.length >= MENU.length - 4);
}

console.log("\n── AND NEVER KEEP HALF OF A TWO-WORD ALLERGEN ──────────────────");
{
  // «زبدة الفول السوداني» CAME BACK AS «زبدة الفول», AND THAT IS WORSE THAN DROPPING IT.
  //
  // The retry asks `namesAnAllergen` one word at a time, and «فول» alone is not a term — the
  // canonical is the two-word «فول سوداني». So «السوداني» was dropped and «زبدة الفول» was
  // offered to the recognizer as vocabulary bias: a TRUNCATION of the peanut-butter name
  // with the peanut word missing. Priming toward it makes a peanut-butter order MORE likely
  // to be transcribed without the word the allergen gate needs. The priming was removing the
  // allergen.
  const kept = safeSttVocabulary(["زبدة الفول السوداني", "جريش"]);
  ok("«زبدة الفول» is not offered to the recognizer",
    !kept.some((k) => k.includes("فول")));
  ok("…nor any part of the peanut term", !kept.some((k) => k.includes("سوداني")));
  ok("…while the harmless half is still primed", kept.includes("زبدة"));
  ok("…and the safe dish beside it survives", kept.includes("جريش"));
}

console.log("\n── DROP THE TRIGGER WORD, KEEP THE DISH ────────────────────────");
{
  // REFUSING A WHOLE NAME COSTS THE WORD THE PRIMING EXISTS FOR. «كنافة بالجبن» trips on
  // «جبن»; the recognition value is in «كنافة», a proper noun no general model has priors
  // for. Measured on a café menu, whole-name dropping removed 39% of the items — and four of
  // those were collateral rather than allergen-bearing («موز» near «لوز», «رز أبيض» near
  // «بيض», «صلصة بيضاء», «بان كيك»). The trigger is one token.
  // EXAMPLES ARE REAL ALLERGENS NOW, not sound-alikes. This block originally used «كنافة
  // بالجبن» and «موز», which were only ever dropped because of the retired near-miss net —
  // with that gone they are kept whole, so they no longer exercise the retry at all. A test
  // whose fixtures stopped reaching the code under test is a test that passes for nothing.
  const CAFE = [
    "كنافة بالفستق", "سليق باللبن", "كيك بالبيض", "زبدة الفول السوداني", "لبن بارد",
    "كيك شوكولاتة", "قهوة عربية", "لاتيه", "كابتشينو", "تشيز كيك", "براوني",
    "تمر سكري", "شاي أحمر", "عصير برتقال", "ماء",
  ];
  const kept = safeSttVocabulary(CAFE);
  ok(`the dish survives its trigger word (${kept.length}/${CAFE.length} kept)`,
    kept.length >= CAFE.length - 2);
  ok("…«كنافة» is kept even though «بالفستق» is not",
    kept.includes("كنافة") && !kept.some((k) => k.includes("فستق")));
  ok("…«سليق» is kept even though «باللبن» is not",
    kept.includes("سليق") && !kept.some((k) => k.includes("لبن")));
  ok("…«كيك» is kept even though «بالبيض» is not",
    kept.some((k) => k.startsWith("كيك")) && !kept.some((k) => k.includes("بيض")));

  // A SINGLE-WORD NAME THAT TRIPS HAS NOTHING TO KEEP, and is dropped outright.
  ok("«لبن بارد» loses its allergen and keeps only what is left",
    !kept.includes("لبن بارد") && !kept.some((k) => k.includes("لبن")));

  // AND EVERY REMAINDER IS RE-ASKED, NEVER ASSUMED. A fragment that still trips would be the
  // same bug with a shorter string. Checked against the detectors the route ACTUALLY runs.
  const { detectAllergenEmergency: emg } = await import("../lib/ai/allergen-emergency.ts");
  const { detectAllergenSymptom: sym } = await import("../lib/ai/allergen-gate-symptoms.ts");
  let leaked = "";
  for (const k of kept) {
    const hit = detectAllergenAvoidance(`عندي حساسية من ${k}`);
    const picked = hit.term ? normalizeAr(hit.term) : "";
    if (emg(k).fired || sym(k).fired || (picked !== "" && normalizeAr(k).includes(picked))) leaked = k;
  }
  ok(`no kept fragment trips a live detector${leaked ? ` — «${leaked}» does` : ""}`,
    leaked === "");

  // AND IT IS MEMOISED, because this now runs on every LIVE WhatsApp voice note: four
  // detectors over every word of every menu item, uncached, on the hot path.
  const big = Array.from({ length: 200 }, (_, i) => `طبق رقم ${i} بالحليب`);
  const t0 = Date.now();
  safeSttVocabulary(big);
  const cold = Date.now() - t0;
  const t1 = Date.now();
  for (let i = 0; i < 50; i++) safeSttVocabulary(big);
  const warm = Date.now() - t1;
  ok(`repeated calls on the same menu are cached (cold ${cold}ms, 50 warm ${warm}ms)`, warm <= cold);
  // …and the cache returns a COPY, so a caller that mutates the result cannot poison the
  // next tenant's vocabulary.
  const a = safeSttVocabulary(big);
  a.push("لبن");
  ok("…and a caller mutating the result cannot poison the cache",
    !safeSttVocabulary(big).includes("لبن"));
}

console.log("\n── THE ALLERGEN GATE ITSELF IS UNTOUCHED ───────────────────────");
{
  // The fix must NOT be "make the gate less sensitive". A real allergy declaration must
  // still fire exactly as before — that is the guarantee this whole product sells, and
  // narrowing it to make a demo smoother would be the worst possible trade.
  ok("a real dairy allergy still fires",
    detectAllergenAvoidance("عندي حساسية من اللبن").fired === true);
  ok("…and still names the term", detectAllergenAvoidance("عندي حساسية من اللبن").term !== null);
  ok("a nut allergy still fires", detectAllergenAvoidance("ما اقدر آكل مكسرات").fired === true);
  ok("an egg allergy still fires", detectAllergenAvoidance("عندي حساسية من البيض").fired === true);
}

console.log("\n── THE ROUTE FILTERS BEFORE IT CACHES ──────────────────────────");
{
  // Filtering AFTER the cache would keep the dangerous word alive for the whole TTL, so
  // the first caller poisons every caller for five minutes.
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const src = readFileSync(resolve(process.cwd(), "app/api/demo/voice/route.ts"), "utf8");
  const code = src.split("\n").filter((l) => {
    const t = l.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).join("\n");
  ok("the route filters the vocabulary", /safeSttVocabulary\(/.test(code));
  ok("…before storing it in the cache",
    code.indexOf("safeSttVocabulary(") < code.indexOf("demoMenuCache = {"));
}

console.log("\n── AND THE LIVE WHATSAPP PATH IS COVERED, NOT ONLY THE DEMO ────");
{
  // THE FIX ORIGINALLY STOPPED AT THE DEMO. The filter was applied at the demo route and
  // proven there, while `transcribeWhatsAppVoice` went on priming Whisper with the tenant's
  // RAW menu — so every real restaurant whose menu names a dairy, nut or egg product kept
  // the exact bug, on the surface where a manufactured allergy reaches a paying customer
  // waiting on an order rather than a visitor clicking around a sales page.
  //
  // Both callers pass through `buildSttPromptVocab`, so that is where it belongs — the same
  // reasoning that put the ear-rendering pass inside the TTS adapter instead of in one of
  // its two callers. Driven on the real builder, not read off the source.
  const { buildSttPromptVocab } = await import("../lib/ai/voice-quality.ts");

  const prompt = buildSttPromptVocab(DEMO_MENU);
  ok("the shared builder drops the word that caused it", !prompt.includes("لبن"));
  for (const kept of ["كبسة", "مندي", "جريش", "لقيمات"]) {
    ok(`…and still biases toward «${kept}»`, prompt.includes(kept));
  }

  // A TENANT MENU THAT IS NOTHING BUT ALLERGENS still yields a usable prompt: the generic
  // ordering words survive, so the recognizer is not left worse off than unbiased.
  const allergenic = buildSttPromptVocab(["لبن بارد", "مكسرات مشكلة", "بيض مسلوق"]);
  for (const term of ["لبن", "مكسرات", "بيض"]) {
    ok(`«${term}» never reaches the recognizer`, !allergenic.includes(term));
  }
  ok("…and the ordering words still do", allergenic.includes("منيو"));

  // PRIORITY TERMS ARE NOT MENU NAMES and must not be filtered — they are the closed,
  // repo-owned answer-class table (quantities, sizes), which contains no allergen. Filtering
  // them would silently weaken the aliases feature to fix a menu problem.
  const withPriority = buildSttPromptVocab(DEMO_MENU, 200, ["حبة", "حبتين"]);
  ok("state-aware priority terms survive the filter",
    withPriority.includes("حبة") && withPriority.includes("حبتين"));
}

console.log("\n── AND A PREFIXED NAME IS STILL AN ALLERGEN ────────────────────");
{
  // THE SHAPE THE FIRST CORPUS DID NOT HAVE. Every risky name tested here was BARE —
  // «لبن بارد», «مكسرات مشكلة», «بيض مسلوق» — and those are exactly the shape the probe
  // already handled. Arabic menus do not write dishes that way. They write «سليق باللبن»,
  // «شاي كرك بالحليب», «شكشوكة بالبيض», and for those the detector's first hit was its own
  // scaffolding word «الحساسية», `name.includes(term)` was false, and the dish was KEPT.
  //
  // Prompt bias works on tokens, and tokens do not respect our word boundaries: a
  // recognizer primed with «باللبن» is primed for «لبن». So every one of these was still
  // being whispered to Whisper — on the LIVE WhatsApp path, for any real tenant whose menu
  // names a dairy, nut or egg dish the way Arabic normally does.
  //
  // This is the same criticism the spoken-text corpus earned: four hand-picked strings,
  // none of them the shape the code exists for.
  const { buildSttPromptVocab } = await import("../lib/ai/voice-quality.ts");
  const REAL_MENU = [
    "سليق باللبن", "شاي كرك بالحليب", "شكشوكة بالبيض", "معمول بالتمر والمكسرات",
    "كبسة دجاج", "مندي لحم", "جريش", "لقيمات", "قهوة عربية",
  ];
  for (const risky of ["سليق باللبن", "شاي كرك بالحليب", "شكشوكة بالبيض", "معمول بالتمر والمكسرات"]) {
    ok(`«${risky}» is dropped despite the prefix`, !safeSttVocabulary(REAL_MENU).includes(risky));
  }

  // AND A MULTI-WORD TERM BEHIND AN ARTICLE — the case that survived the first fix.
  //
  // `detectAllergenAvoidance` tolerates «ال» when MATCHING and returns the CANONICAL,
  // article-free term. For «زبدة الفول السوداني» that term is «فول سوداني»: two words. Word-
  // by-word stripping catches «باللبن» → «لبن» and can never catch this, so peanut butter —
  // the single most consequential allergen in a Gulf menu — was kept in the recognizer's
  // bias while «لبن بارد» was dropped. The containment test now also runs against the whole
  // name with the glue off every word.
  // «طبق المأكولات البحرية» IS THE CASE THAT PINS THE WHOLE-NAME BRANCH. The peanut names
  // above all survive a mutation that deletes it, because «سوداني» is separately in the
  // lexicon and the per-WORD probe catches them anyway. This one is caught ONLY by the
  // article-stripped whole-name variant: the lexicon term is multi-word and the name writes
  // it with «ال», so no single stripped word contains it. Without that branch the dish is
  // offered to the recognizer and the assertion that would notice does not exist.
  for (const risky of ["طبق المأكولات البحرية", "زبدة الفول السوداني", "الحليب المحلى", "زبدة فول سوداني", "الفول السوداني"]) {
    ok(`«${risky}» is dropped — a multi-word term behind an article is still an allergen`,
      !safeSttVocabulary([risky, "جريش"]).includes(risky));
  }
  ok("…and the safe dish beside it survives", safeSttVocabulary(["زبدة الفول السوداني", "جريش"]).includes("جريش"));

  // AND EVERY DROPPED NAME EARNS IT. Over-dropping is the other failure and it is silent:
  // it would disable priming for a whole menu while the file's comment claimed it worked.
  // Each name the filter refuses must be one a bare transcript really would fire on.
  {
    const GULF_MENU = [
      "زبدة الفول السوداني", "لبن بارد", "شاي كرك بالحليب", "شكشوكة بالبيض", "سمك هامور",
      "كبسة دجاج", "مندي لحم", "جريش", "لقيمات", "قهوة عربية", "تمر سكري", "شيش طاووق",
      "سلطة خضراء", "فتوش", "حمص", "متبل", "عصير برتقال", "شاي أحمر", "كنافة بالجبن",
    ];
    const kept = safeSttVocabulary(GULF_MENU);
    const dropped = GULF_MENU.filter((m) => !kept.includes(m));
    let unearned = "";
    for (const d of dropped) {
      if (!detectAllergenAvoidance(`عندي حساسية من ${d}`).fired) unearned = d;
    }
    ok(`every dropped name really does name an allergen${unearned ? ` — «${unearned}» does not` : ""}`,
      unearned === "");
    ok(`…and most of a real menu still primes the recognizer (${kept.length}/${GULF_MENU.length})`,
      kept.length >= GULF_MENU.length - 6);
  }
  const prompt = buildSttPromptVocab(REAL_MENU);
  for (const sub of ["لبن", "حليب", "بيض", "مكسرات"]) {
    ok(`the recognizer is not primed for «${sub}» through a prefix`, !prompt.includes(sub));
  }
  for (const kept of ["كبسة دجاج", "مندي لحم", "جريش", "لقيمات"]) {
    ok(`…while «${kept}» is still offered`, prompt.includes(kept));
  }

  // AND THE FILTER IS STILL EXACTLY AS WIDE AS THE GATE, NOT WIDER. «جبن» is NOT in the
  // allergen lexicon — the gate can never fire on it — so a dish named «كنافة بالجبن»
  // cannot be turned into a false allergy by biasing toward it, and dropping it would cost
  // recognition quality for no safety gain. Asserted as the AGREEMENT rather than as a
  // hand-picked list, so if the lexicon ever gains that word this fails and the filter
  // follows it.
  // …AND «كنافة بالجبن» IS DROPPED TOO, for a reason the avoidance gate cannot see.
  //
  // An earlier version of this block compared the filter against `detectAllergenAvoidance`
  // ALONE and asserted they must agree — which said «كنافة بالجبن» should be KEPT, because
  // «جبن» is not in that lexicon. That was true of one detector and false of the product:
  // the PHONETIC SAFETY NET fires on «جبن» (nearest «لبن») and routes to the same hold. The
  // agreement that matters is with every detector the route runs, and it is asserted as such
  // in its own block below rather than against whichever one was checked first.
  // «كنافة بالجبن» USED TO BE HERE and is deliberately gone: «جبن» is not in the allergen
  // lexicon, so with the near-miss net retired nothing on the live path can fire on it, and
  // withholding it would cost recognition for no safety gain. The two below carry real
  // lexicon terms behind a prefix, which is the shape this block exists for.
  for (const compound of ["سليق باللبن", "شكشوكة بالبيض"]) {
    ok(`«${compound}» is dropped — a live detector can fire on it`,
      !safeSttVocabulary([compound]).includes(compound));
  }
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} stt-vocab: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
