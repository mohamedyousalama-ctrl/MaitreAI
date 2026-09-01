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

import { safeSttVocabulary } from "../lib/ai/stt/safe-vocab.ts";
import { detectAllergenAvoidance, normalizeAr } from "../lib/ai/allergen-gate.ts";

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

  // AND THE FILTER IS EXACTLY AS WIDE AS THE GATE — no wider, no narrower.
  //
  // «عصير فراولة باللبن» is KEPT, and that is correct rather than a miss: the gate is
  // boundary-aware, so it cannot pick «لبن» out of the prefixed «باللبن» either. A word the
  // gate can never fire on cannot be turned into a false allergy by biasing toward it, and
  // dropping it would cost recognition quality for no safety gain. The two must agree, so
  // this asserts the agreement rather than a hand-picked list — if the lexicon later starts
  // matching prefixed forms, this fails and the filter must follow it.
  for (const compound of ["عصير فراولة باللبن", "كيك بالبيض", "سلطة بالمكسرات"]) {
    const gateCanFire = (() => {
      const hit = detectAllergenAvoidance(`عندي حساسية من ${compound}`);
      const picked = hit.term ? normalizeAr(hit.term) : "";
      return picked !== "" && normalizeAr(compound).includes(picked);
    })();
    const dropped = !safeSttVocabulary([compound]).includes(compound);
    ok(`«${compound}»: filter and gate agree (gate=${gateCanFire}, dropped=${dropped})`,
      gateCanFire === dropped);
  }
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

console.log(`\n${fails.length ? "FAIL" : "PASS"} stt-vocab: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
