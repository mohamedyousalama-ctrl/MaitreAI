// ============================================================================
// MaitreAI — WO-SIMPLIFY (PART A): the SIMPLE allergy posture (flag `allergy_simple`).
//
// PURE (no I/O, no model calls). The deterministic allergy/disease DETECTOR is UNCHANGED —
// this module REUSES the existing detectors verbatim (their terms are forbidden to edit) and
// only changes the RESPONSE. When the flag is ON:
//   • FIRST allergy/disease mention in a conversation → ONE frozen deflection (2 rotating
//     Egyptian variants): «تفاصيل المكونات كاملة في المنيو» + the menu + a human offer. No hold,
//     no escalation (the customer can still ask for a human — the existing human-request path).
//   • REPEAT mentions → answer normally; re-offer the human switch ONLY on a direct
//     ingredient/safety question, throttled to at most once per 5 turns.
//
// Two UNCONDITIONAL floors survive regardless of the flag (owned elsewhere, not here): the
// no-reassure vocabulary floor (respond.ts assertsAllergenSafety) and the session-scoped
// canonical kitchen-ticket allergy line (buildTicketAllergyNote below feeds it).
// ============================================================================

import type { LlmMessage } from "./llm/types";
import { detectAllergenAvoidance, normalizeAr } from "./allergen-gate";
import { detectAllergenSymptom } from "./allergen-gate-symptoms";
import { detectAllergyContext } from "./allergen-context";
import { detectAllergenEmergency } from "./allergen-emergency";
import { canonicalizeAllergens } from "./allergen-canonical";

export type AllergyMentionKind = "allergy" | "disease" | null;

export interface AllergyMentionHit {
  fired: boolean;
  /** The matched allergen/condition term, if the detector named one (else null). */
  term: string | null;
  kind: AllergyMentionKind;
}

// DetectOpts WAS HERE, AND IT WAS A LIE BY THE END.
//
// It carried `sttConfidence` and `isVoiceTranscript` — the two inputs the phonetic near-miss
// net used to widen or tighten its guessing. When that net was retired the last reader of
// both fields went with it, and the parameter stayed: accepted, threaded through two
// signatures, and dropped on the floor. A caller passing a 0.3 confidence would reasonably
// believe it had tightened the safety check; it had done nothing at all. A parameter that
// silently ignores what you give it is worse than no parameter, so it is gone, and the
// compiler now says so at every call site instead of the reader having to notice.

// Health/disease CONDITION mention on INBOUND (additive — the allergen detector is untouched).
// Matches a customer stating a condition («عندي سكر», «مريض ضغط», «قلبي», «حامل»), the wording the
// simple posture also deflects. Boundary-aware over normalizeAr output. NOT a substance list.
// THE ARTICLE HAS TO BE TOLERATED, OR THE BOUNDARY EXCLUDES THE NORMAL WAY OF SAYING IT.
// `(?<![ء-ي])` rejected «القولون» and «بالسكري» because a letter precedes the stem — so
// «بعاني من القولون» and «أنا مصاب بالسكري», two plain statements of a condition, matched
// nothing at all. Found while narrowing this rule; it predates that work.
const DISEASE_INPUT_RE =
  /(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?(?:سكري|سكر|ضغط|كوليسترول|كليتي|كلاوي|كلى|قلبي|قلب|حامل|حمل|سيلياك|نقرس|قولون|معدتي)(?![ء-ي])/;
const DISEASE_CONTEXT_RE = /(?:عندي|مريض|مريضه|مصاب|بعاني|اعاني|حالتي|عانيت|مالي)/;

/** THE TWO HAVE TO BE THE SAME STATEMENT, NOT THE SAME MESSAGE.
 *
 *  `DISEASE_INPUT_RE` is boundary-aware and careful. `DISEASE_CONTEXT_RE` is not: it is a bare
 *  alternation containing «عندي», and the two were tested independently anywhere in the
 *  message. «سكر» is also the ordinary word for SUGAR, so:
 *
 *    «الشاي عندي بدون سكر لو سمحت»   my tea without sugar, please   → diabetes
 *    «عندي سكر زيادة في القهوة»       there's too much sugar in it   → diabetes
 *    «عندي قلبي يشتهي كبسة لحم»       my heart is set on a kabsa     → heart condition
 *    «عندي ضغط وقت، أبغى الطلب بسرعة» I'm pressed for time           → blood pressure
 *
 *  The first is how a Saudi orders tea. All four fed the durable kitchen ticket and, under
 *  the simple posture, deflected the order into an ingredients-and-a-human reply.
 *
 *  A stated condition puts the two words together — «عندي سكري»، «مريض ضغط» — so the context
 *  word must be close and nothing may separate them. */
const DISEASE_ADJACENT_RE = new RegExp(
  "(?:عندي|عندنا|مريض|مريضه|مصاب|مصابه|بعاني|اعاني|عانيت|حالتي)" +
    // Nothing between them but at most one short word, and never a "without" — «بدون سكر» is
    // an instruction about the drink, not a diagnosis.
    "(?:\\s+(?!بدون|بلا|من\\s+غير|ناقص|زياده|زياده|شويه|كثير|قليل)\\S{1,6})?\\s+" +
    "(?:و|ف|ب|ك|ل)?(?:ال)?(?:سكري|سكر|ضغط|كوليسترول|كليتي|كلاوي|كلى|قلبي|قلب|حامل|حمل|سيلياك|نقرس|قولون|معدتي)(?![ء-ي])"
);

/** Pregnancy states itself without any of the context words above — «أنا حامل» is the whole
 *  sentence. Kept narrow rather than adding «أنا» to the context list, which would have made
 *  «أنا أبغى سكر» ("I want sugar") a diagnosis. */
const PREGNANCY_RE = /(?<![ء-ي])(?:انا|احنا|زوجتي|مرتي)\s+حامل|حامل\s+(?:في|بشهر|بالشهر)/;

/** …and the condition word must not be immediately qualified as a FOOD or a TIME. «عندي سكر
 *  زيادة في القهوة» and «عندي ضغط وقت» both put the two words together and mean neither. */
const DISEASE_DISQUALIFIER_RE =
  /(?:سكر|ضغط|قلبي|معدتي)\s*(?:زياده|زايد|زائد|وقت|في\s+(?:ال)?(?:قهوه|شاي|عصير|كوب|طلب)|يشتهي|يبي|يشتاق|خففه|زوده|زود)/;

/** True iff the message states a health CONDITION (disease/diet), reusing a small additive input
 *  vocabulary — never a substance list, so it can never be mistaken for a canonical allergen. */
export function mentionsDiseaseCondition(text: string | null | undefined): boolean {
  const n = normalizeAr(String(text ?? ""));
  if (!n) return false;
  if (PREGNANCY_RE.test(n)) return true;
  if (!DISEASE_INPUT_RE.test(n) || !DISEASE_CONTEXT_RE.test(n)) return false;
  if (DISEASE_DISQUALIFIER_RE.test(n)) return false;
  return DISEASE_ADJACENT_RE.test(n) || PREGNANCY_RE.test(n);
}

/**
 * The COMPOSED allergy/disease detector — the exact union the rest of the engine uses
 * (avoidance, symptom, emergency) plus the additive disease-condition input check. REUSES the
 * detectors verbatim; adds no allergen terms. The phonetic near-miss net was part of this
 * union and is no longer — see lib/ai/phonetic-safety-net.ts.
 */
export function detectAllergyOrDiseaseMention(text: string): AllergyMentionHit {
  const a = detectAllergenAvoidance(text);
  if (a.fired) return { fired: true, term: a.term ?? null, kind: "allergy" };
  const s = detectAllergenSymptom(text);
  if (s.fired) return { fired: true, term: s.term ?? null, kind: "allergy" };
  // The phonetic near-miss net used to sit here; its GUESSING is retired and its EXACT
  // halves live in lib/ai/allergen-context.ts. This is the same union, minus the Levenshtein.
  const c = detectAllergyContext(text);
  if (c.fired) return { fired: true, term: c.term ?? null, kind: "allergy" };
  const e = detectAllergenEmergency(text);
  if (e.fired) return { fired: true, term: e.label ?? null, kind: "allergy" };
  if (mentionsDiseaseCondition(text)) return { fired: true, term: null, kind: "disease" };
  return { fired: false, term: null, kind: null };
}

// The two rotating deflection variants (Egyptian; a plain Saudi fallback). Each carries the core
// «تفاصيل المكونات … المنيو» AND the human offer, and NEVER reassures (no «آمن/مفيش مشكلة/مافيهوش»).
const DEFLECTION_EG = [
  "تفاصيل المكونات كاملة في المنيو 👇 تقدر تراجعها بنفسك. ولو تحب، أحوّلك لحد من الفريق يساعدك — قولّي 🙏",
  "المنيو فيه تفاصيل المكونات كاملة 👇 خد نظرة عليها. ولو حابب، أحوّلك لحد من الفريق يساعدك — قولّي 🙏",
];
const DEFLECTION_SA = [
  "تفاصيل المكوّنات كاملة في المنيو 👇 تقدر تطّلع عليها بنفسك. ولو تحب، أحوّلك لأحد من الفريق يساعدك — قول لي 🙏",
  "المنيو فيه تفاصيل المكوّنات كاملة 👇 خذ نظرة عليها. ولو تبي، أحوّلك لأحد من الفريق يساعدك — قول لي 🙏",
];

/** The frozen first-mention deflection reply (2 rotating variants, deterministic by index). */
export function allergySimpleDeflection(dialect: string | null | undefined, variantIndex = 0): string {
  const table = dialect === "saudi" ? DEFLECTION_SA : DEFLECTION_EG;
  const idx = ((Math.trunc(Number.isFinite(variantIndex as number) ? (variantIndex as number) : 0) % table.length) + table.length) % table.length;
  return table[idx];
}

/** The lighter re-offer line for a repeat direct ingredient/safety question (throttled). */
export function allergySimpleReoffer(dialect: string | null | undefined): string {
  return dialect === "saudi"
    ? "تفاصيل المكوّنات في المنيو 👇 ولو تحب، أحوّلك لأحد من الفريق يتأكد لك — قول لي 🙏"
    : "تفاصيل المكونات في المنيو 👇 ولو تحب، أحوّلك لحد من الفريق يتأكد لك — قولّي 🙏";
}

// A DIRECT ingredient/safety question: an interrogative asking what a dish contains / whether it is
// free of something / whether it is safe. Used to gate the throttled repeat re-offer.
const INGREDIENT_Q_RE =
  /(?:في[هة]?|فيها|يحتوي|تحتوي|مكون|مكوّن|مكونات|بيتعمل|معموله?|خالي|خاليه|بدون|من ?غير|امن|آمن|سليم|يضر|يأثر|ياثر)/;

/** True iff the message is a direct ingredient/safety QUESTION (interrogative + an ingredient/safety
 *  cue), e.g. «فيه مكسرات؟» / «ده آمن؟» / «مكوناته إيه؟». */
export function isDirectIngredientOrSafetyQuestion(text: string | null | undefined): boolean {
  const raw = String(text ?? "");
  if (!/[?؟]/.test(raw)) return false;
  return INGREDIENT_Q_RE.test(normalizeAr(raw));
}

// --- WO-CONTEXT (PART B): allergy RETRACTION (allergy_simple only) ------------
//
// Detector term lists are UNTOUCHED. This is a NEGATION layered BEFORE the deflection
// decision, on the triggering message: a customer WALKING BACK an allergy claim
// («امسح كل اللي فات… أنا معنديش حساسيه», «مش حساسي», «انسى موضوع الحساسية») must NOT be
// deflected — the detector fired only because the word «حساسية» appears inside a denial.
//
// SAFETY INVARIANT: a message that ALSO asserts an allergy for another person
// («أنا معنديش بس ابني عنده حساسية لبن») is NEVER a retraction — the positive assertion
// wins and the deflection fires with the real note (لبن). The positive-assertion guard is
// boundary-aware so the negation «معنديش» is never mis-read as the assertion «عندي».

// Retraction phrasings (over normalizeAr output — ة→ه, أإآ→ا). «حساسي» is the folded stem of
// «حساسية»/«حساسيه». The «حساسي» anchor must sit inside the SAME denial clause.
const ALLERGY_RETRACTION_RE =
  /م(?:ا)?\s*عندي?ش?\s*حساسي|ما\s*عندي\s*حساسي|مفي?ش\s*(?:عندي\s*)?حساسي|انس[يى]\s*موضوع\s*الحساسي|مش\s*حساسي|بدون\s*موضوع\s*الحساسي|من ?غير\s*موضوع\s*الحساسي/;

// A same-message positive allergy assertion for ANOTHER PERSON (the safety invariant). It is
// deliberately THIRD-PERSON only — «عنده/عندها/عندهم حساسية», or a relative/named subject +
// «عنده/عندها حساسية» («ابني عنده حساسية»). It never matches the first person «عندي حساسية»,
// because a first-person «عندي حساسية» inside a retraction is ALWAYS negated («مفيش عندي
// حساسية» / «ما عنديش حساسية»), and a genuine positive «عندي حساسية» is not a retraction at all
// (RETRACTION_RE never matches it). Boundary-aware so «معنديش» is never mis-read.
const POSITIVE_ALLERGY_ASSERTION_RE =
  /(?<![ء-ي])(?:عنده|عندها|عندهم|عندهما)\s+حساسي|(?<![ء-ي])(?:ابن|بنت|جوز|مرات|ولد|امي|ابويا|اخويا|اختي|صاحب|مامتي|بابا|ماما)\S*\s+(?:عنده|عندها|عندهم|حساسي)/;

/**
 * True iff the message RETRACTS an allergy claim (allergy_simple only) — a denial that
 * suppresses the deflection. Returns false when the SAME message positively asserts an
 * allergy (for self or anyone else): the safety invariant — a real allergy always wins.
 * Never modifies the detector term lists; it only reads the surface negation.
 */
export function detectAllergyRetraction(message: string | null | undefined): boolean {
  const n = normalizeAr(String(message ?? ""));
  if (!n) return false;
  if (POSITIVE_ALLERGY_ASSERTION_RE.test(n)) return false; // SAFETY INVARIANT — assertion wins.
  return ALLERGY_RETRACTION_RE.test(n);
}

/** The frozen honest ack sent alongside a retraction reply — no health commentary, no
 *  reassurance («آمن/مفيش مشكلة»). Deliberately dialect-agnostic (frozen). */
export function allergyRetractionAck(_dialect?: string | null | undefined): string {
  return "تمام 👍";
}

// --- history helpers (pure) --------------------------------------------------

function userText(m: LlmMessage): string {
  if (m.role !== "user") return "";
  if (typeof m.content === "string") return m.content;
  return m.content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join(" ");
}
function assistantText(m: LlmMessage): string {
  if (m.role !== "assistant") return "";
  return typeof m.content === "string" ? m.content : "";
}

/** Count PRIOR customer turns that fired the allergy/disease detector, RESETTING at a
 *  retraction (PART B): a retraction wipes the session allergy context, so a later fresh
 *  mention is a FIRST mention again → the deflection re-triggers normally. */
export function countPriorAllergyMentions(history: LlmMessage[]): number {
  let n = 0;
  for (const m of history) {
    const t = userText(m);
    if (!t) continue;
    if (detectAllergyRetraction(t)) { n = 0; continue; } // retraction resets the running count
    if (detectAllergyOrDiseaseMention(t).fired) n += 1;
  }
  return n;
}

/** The raw allergen/condition TERMS named across THIS conversation (history + the current turn) —
 *  session-scoped, for the canonical kitchen-ticket note. Trigger/symptom/mention words are kept
 *  raw here; buildTicketAllergyNote canonicalizes them (dropping non-substances) at render time. */
export function collectConversationAllergenTerms(history: LlmMessage[], userMessage: string): string[] {
  const terms: string[] = [];
  const add = (t: string | null | undefined) => {
    const v = String(t ?? "").trim();
    if (v && !terms.includes(v)) terms.push(v);
  };
  for (const m of history) {
    const t = userText(m);
    if (!t) continue;
    if (detectAllergyRetraction(t)) { terms.length = 0; continue; } // retraction wipes the session terms
    const hit = detectAllergyOrDiseaseMention(t);
    if (hit.fired && hit.term) add(hit.term);
  }
  // A retraction THIS turn contributes no term (and the wipe above already cleared history).
  if (!detectAllergyRetraction(userMessage)) {
    const cur = detectAllergyOrDiseaseMention(userMessage);
    if (cur.fired && cur.term) add(cur.term);
  }
  return terms;
}

// The deflection/re-offer signature (the human-offer clause) used to measure throttle distance.
const OFFER_SIGNATURE_RE = /أحوّلك لحد من الفريق|أحوّلك لأحد من الفريق/;

/** Assistant turns elapsed since the last allergy deflection/re-offer (Infinity if never sent). */
export function turnsSinceLastAllergyOffer(history: LlmMessage[]): number {
  let sinceOffer = Infinity;
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const a = assistantText(history[i]);
    if (!a) continue;
    count += 1;
    if (OFFER_SIGNATURE_RE.test(a)) {
      sinceOffer = count - 1; // assistant turns strictly AFTER the last offer
      break;
    }
  }
  return sinceOffer;
}

export type AllergySimpleAction = "deflect" | "reoffer" | "normal" | "none";

export interface AllergySimpleDecision {
  action: AllergySimpleAction;
  hit: AllergyMentionHit;
  variantIndex: number;
  /** True when this turn is the FIRST allergy/disease mention in the conversation. */
  firstMention: boolean;
}

/** Throttle: a repeat re-offer is allowed at most once per this many assistant turns. */
export const REOFFER_THROTTLE_TURNS = 5;

/**
 * Decide the simple-allergy action for THIS turn (pure). `none` when the turn carries no
 * allergy/disease mention (the caller falls through to the normal engine). `deflect` on the first
 * mention. `reoffer` on a repeat direct ingredient/safety question when the throttle window has
 * elapsed. `normal` on any other repeat (answer normally, no re-offer).
 */
export function decideAllergySimple(args: {
  history: LlmMessage[];
  userMessage: string;
}): AllergySimpleDecision {
  const hit = detectAllergyOrDiseaseMention(args.userMessage);
  const prior = countPriorAllergyMentions(args.history);
  const variantIndex = prior % DEFLECTION_EG.length;
  const directQ = isDirectIngredientOrSafetyQuestion(args.userMessage);
  const elapsed = turnsSinceLastAllergyOffer(args.history);
  const throttleOk = elapsed >= REOFFER_THROTTLE_TURNS;

  if (hit.fired) {
    const firstMention = prior === 0;
    // FIRST allergy/disease mention in the conversation → the full deflection (menu + human offer).
    if (firstMention) return { action: "deflect", hit, variantIndex, firstMention };
    // A repeat mention that is ALSO a direct ingredient/safety question (throttled) → re-offer; any
    // other repeat mention → answer normally (never re-send the full deflection every turn).
    if (directQ && throttleOk) return { action: "reoffer", hit, variantIndex, firstMention };
    return { action: "normal", hit, variantIndex, firstMention };
  }

  // No fresh mention this turn. A direct ingredient/safety question AFTER a prior allergy mention
  // re-offers the human switch (throttled) — the customer is still probing safety.
  if (prior > 0 && directQ && throttleOk) {
    return { action: "reoffer", hit, variantIndex, firstMention: false };
  }
  return { action: "none", hit, variantIndex: 0, firstMention: false };
}

// --- kitchen-ticket canonical line (UNCONDITIONAL floor, session-scoped) ------

/**
 * WO-SIMPLIFY (PART A) — the canonical kitchen-ticket allergy line. Session-scoped: built from the
 * raw terms mentioned in THIS conversation, canonicalized to real allergen ENTITIES (symptom /
 * trigger / mention words dropped) via allergen-canonical.ts. Never from customer memory. When an
 * allergy/disease was mentioned but no substance is identifiable → «غير محدد». Exactly ONE line.
 */
export function buildTicketAllergyNote(rawTerms: ReadonlyArray<string | null | undefined>): string {
  const canonical = canonicalizeAllergens(rawTerms);
  const list = canonical.length ? canonical.join("، ") : "غير محدد";
  return `⚠️ العميل ذكر حساسية/حالة صحية: ${list}`;
}
