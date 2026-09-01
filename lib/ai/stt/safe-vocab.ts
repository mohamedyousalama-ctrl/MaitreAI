// ============================================================================
// MaitreAI — WHICH MENU WORDS MAY BE WHISPERED TO THE TRANSCRIBER.
//
// THE REGRESSION THIS EXISTS FOR, caught in production within minutes of shipping.
//
// Priming a transcriber with the tenant's menu is a real quality win: «جريش»، «لقيمات»،
// «مندي» are proper nouns no general model has strong priors for, and unbiased they come
// back wrong. The WhatsApp path has done it for a long time. So the demo call was given the
// same treatment — and the demo menu contains «لبن بارد».
//
// The Founder said «هلا والله» — two words, a plain greeting — and Whisper, now biased
// toward dairy, heard a dairy word. The deterministic allergen gate then fired CORRECTLY on
// what it was handed, and a hello became an allergy consultation:
//
//   timing stt=233ms brain=840ms model=deterministic_allergen_gate
//   spoken reply skipped { reason: 'safety_hold' }
//
// Nothing was broken. Every component did its job. Biasing a recognizer toward a word makes
// it hear that word, and one of the words we biased toward was one that trips a SAFETY
// GATE. That is the asymmetry: mishearing «مندي» costs a clarifying question, while
// manufacturing an allergen derails the entire conversation into a hold nobody can leave.
//
// THE RULE. Bias toward dish names, never toward anything that can trigger a safety hold.
// The filter asks the allergen lexicon itself rather than keeping a second list, because a
// second list would drift from the first and this is precisely where drift is expensive.
//
// AND IT LIVES HERE, NOT IN lib/demo. It was written for the demo, applied at the demo
// route, and proven there — while the LIVE WhatsApp path went on priming Whisper with the
// tenant's raw menu, for every real restaurant whose menu contains a dairy, nut or egg
// word. That is the same defect on the surface where a manufactured allergy reaches a
// paying customer instead of a visitor. It is now applied inside `buildSttPromptVocab`,
// which is the one function both callers pass through — the same reasoning that put the
// ear-rendering pass inside the ElevenLabs adapter rather than in one of its two callers.
// ============================================================================

import { detectAllergenAvoidance, normalizeAr } from "../allergen-gate";
import { detectAllergenSymptom } from "../allergen-gate-symptoms";
import { detectPhoneticSafetyNet } from "../phonetic-safety-net";
import { detectAllergenEmergency } from "../allergen-emergency";

/** Would this word, heard in an allergy sentence, name an allergen?
 *
 *  Asked by CONSTRUCTION rather than by keeping a copy of the lexicon, which would drift
 *  from it: the name is placed in a sentence the detector recognises as allergy intent, and
 *  we ask which term it picked.
 *
 *  AND THE TERM MUST BE IN THE NAME. The first version returned true whenever a term came
 *  back at all — and «حساسية» is itself in the lexicon, so the probe matched its own
 *  scaffolding and every dish on the menu was filtered out. The feature would have been
 *  silently disabled while its comment claimed it worked, which is worse than the bug it
 *  replaced. Comparing against the NAME is what makes the answer about the name. */
/** Arabic proclitics that glue onto a noun: «باللبن» is «ب» + «ال» + «لبن».
 *
 *  A recognizer biased toward «سليق باللبن» is biased toward the SUBWORD «لبن», because
 *  prompt bias works on tokens and tokens do not respect our word boundaries. So the
 *  question is never "does this name contain a bare allergen" — it is "does any word in it
 *  become one once the glue comes off". Longest first, so «بال» is tried before «ب». */
const PROCLITICS = ["وبال", "فبال", "بال", "وال", "فال", "كال", "لل", "ال", "و", "ف", "ب", "ك", "ل"];

/** Every form a single word could be biasing the recognizer toward. */
function wordForms(word: string): string[] {
  const w = normalizeAr(word);
  if (!w) return [];
  const forms = new Set<string>([w]);
  for (const p of PROCLITICS) {
    if (w.length > p.length + 1 && w.startsWith(p)) forms.add(w.slice(p.length));
  }
  return [...forms];
}

/** Does this exact form name an allergen?
 *
 *  THE PROBE CANNOT BE ALLOWED TO ANSWER ITSELF. «الحساسية» is in the lexicon, so the
 *  carrier sentence always produces SOME term; requiring the picked term to appear in the
 *  form is what makes the answer about the form. The first version stopped there and was
 *  therefore correct only for BARE names: for «سليق باللبن» the detector's first hit is its
 *  own scaffolding word, `includes` is false, and the dish was kept — so «لبن»، «جبن»،
 *  «حليب»، «بيض» and «مكسرات» were all still whispered to the recognizer for any menu that
 *  writes them the way Arabic normally does. That is the whole exposure this file exists to
 *  close, and it stayed open for the commonest shape on a real menu. */
function formNamesAnAllergen(form: string): boolean {
  const hit = detectAllergenAvoidance(`عندي حساسية من ${form}`);
  if (!hit.term) return false;
  const term = normalizeAr(hit.term);
  return term.length > 0 && form.includes(term);
}

/** The word with its longest matching proclitic removed, or unchanged. */
function stripProclitic(word: string): string {
  for (const p of PROCLITICS) {
    if (word.length > p.length + 1 && word.startsWith(p)) return word.slice(p.length);
  }
  return word;
}

/** Would this name, heard on its own, trip any of the four safety detectors the voice
 *  routes actually run?
 *
 *  THE FIRST THREE VERSIONS ASKED ONE DETECTOR. `detectAllergenAvoidance` is the one the
 *  original incident went through, so it was the one consulted — but the route runs FOUR,
 *  and the phonetic safety net fires on words that merely SOUND like an allergen:
 *
 *      «كنافة بالجبن» → لبن      «موز» → لوز      «رز أبيض» → بيض
 *
 *  Each of those is a safety HOLD, by that file's own words: "a trip is a SAFETY-POSITIVE:
 *  it routes to the same deterministic allergen hold as a typed allergy mention." And it
 *  fires on the bare word inside any sentence — «هلا والله جبن» trips it — which is the
 *  incident that started all of this, arriving one detector over. Biasing a recognizer
 *  toward «جبن» raises the chance of «جبن» appearing in an utterance that was never about
 *  cheese, and that transcript then holds the conversation.
 *
 *  These three ask the name DIRECTLY rather than through a carrier sentence: they are
 *  fail-closed nets that fire on a mention, so there is no allergy-intent scaffolding to
 *  strip and no term-containment check to apply — firing at all is the answer. Measured on
 *  a realistic menu this drops a handful more names, and that is the right side to be wrong
 *  on: a dropped name costs one clarifying question, a manufactured allergy costs the whole
 *  conversation. */
function tripsASafetyHold(name: string): boolean {
  if (detectPhoneticSafetyNet(name, { sttConfidence: null, isVoiceTranscript: true }).fired) return true;
  if (detectAllergenEmergency(name).fired) return true;
  if (detectAllergenSymptom(name).fired) return true;
  return false;
}

function namesAnAllergen(name: string): boolean {
  if (tripsASafetyHold(name)) return true;
  const n = normalizeAr(name);
  if (!n) return false;
  const words = n.split(/\s+/).filter(Boolean);

  // THE TERM CAN BE LONGER THAN A WORD, WHICH IS WHERE THE SECOND VERSION STILL FAILED.
  //
  // Probing word by word catches «باللبن» → «لبن». It cannot catch «زبدة الفول السوداني»:
  // the detector's `termRegex` tolerates the article and hands back the CANONICAL, article-
  // free «فول سوداني» — two words — so no single stripped word ever contains it, and the
  // most consequential allergen on the list was kept while «لبن بارد» was dropped.
  //
  // So the containment test runs against the whole name too, with the glue off every word.
  // The tolerance that lets the detector SEE the allergen is the same tolerance the check
  // has to apply, or the two disagree on exactly the names that matter.
  const variants = new Set<string>([n, words.map(stripProclitic).join(" ")]);
  const probes = new Set<string>([n, ...words.flatMap(wordForms)]);

  for (const probe of probes) {
    const hit = detectAllergenAvoidance(`عندي حساسية من ${probe}`);
    if (!hit.term) continue;
    const term = normalizeAr(hit.term);
    if (!term) continue;
    for (const v of variants) if (v.includes(term)) return true;
  }
  return false;
}

/**
 * The menu names that are safe to give a speech recognizer as vocabulary bias.
 *
 * Drops any name the allergen lexicon can find a term inside. Everything else — the long
 * tail of Najdi dish names this exists for — is kept.
 *
 * Fails toward LESS bias: a name we are unsure about is dropped, because the cost of
 * dropping one is a clarifying question and the cost of keeping one is a fabricated
 * allergy.
 */
export function safeSttVocabulary(names: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const raw of names ?? []) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    try {
      if (namesAnAllergen(name)) continue;
    } catch {
      // A detector that throws on some input must not take the turn down with it, and an
      // unchecked name is exactly the one we must not bias toward.
      continue;
    }
    out.push(name);
  }
  return out;
}
