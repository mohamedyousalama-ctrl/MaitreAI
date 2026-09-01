// ============================================================================
// MaitreAI — Allergy EMERGENCY detector (Allergy-Companion §5) — PURE, no I/O.
//
// The NARROW, present-tense "this is happening NOW" detector. In companion mode
// (allergy_companion_mode ON) a plain allergy MENTION no longer forces a handoff —
// Kivo acknowledges and keeps talking (§1a). But an ACTIVE emergency ALWAYS
// escalates (spec §0 red line, §5): staff alert + the fixed emergency line, never
// reassurance. This module is the deterministic trigger for that escalation.
//
// Trigger = a PRESENT-TENSE symptom/action + a body-medical term (Gulf, Egyptian,
// English/mixed — the verbatim §5 lists). EXCLUDE: plain allergy statements, past
// tense, hypotheticals, questions about allergies, and idioms — those flow into the
// companion conversation, not the emergency path.
//
// Fail-safe: over-escalation is acceptable; MISSING an active emergency is not. So
// the includes are generous within "present-tense + body-medical", and the excludes
// are narrow (explicit past/hypothetical framing only).
//
// This module is consulted ONLY when allergy_companion_mode is ON (see
// customer-turn.ts). Flag-OFF, the legacy gate/symptom path is byte-identical.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

export interface EmergencyHit {
  fired: boolean;
  /** A short label for the audit/acknowledgement (never shown as reassurance). */
  label: string | null;
}

const NO_HIT: EmergencyHit = { fired: false, label: null };

// --- EXCLUSIONS (checked on normalized text; block a would-be trigger) -------
// Distant past ("it happened a year ago") — a history, not an active event.
const PAST_RE =
  /قبل (?:سنه|سنوات|كام سنه|فتره|مده|كذا سنه|شهر|شهور|اسبوع|يومين)|من زمان|زمان|السنه اللي فاتت|قبل كده|قبل فتره|سابقا/;
// Hypothetical framing ("if I eat…") — a what-if, not a now.
const HYPOTHETICAL_RE =
  /(?:لو|اذا|إن|لما|في حال|يعني لو) (?:اكلت|كلت|اكل|تناولت|صار|جاني|حصل|اتحسست)/;
// A pure question about whether a reaction COULD happen (not a report that it is).
const HYPOTHETICAL_Q_RE = /(?:ممكن|يمكن|هل|ينفع|يصير|احتمال) .*تحسس.*\؟|.*تحسس.*(?:ممكن|احتمال).*\؟/;

// --- INCLUDES — present-tense emergency signal families ----------------------
// Each entry is [regex-over-normalized-text, audit-label]. Order: airway, swelling,
// active reaction, emergency-call, English/mixed.
const EMERGENCY_PATTERNS: Array<[RegExp, string]> = [
  // Airway / breathing NOW (Najdi + Gulf + Egyptian). «ما اقدر اتنفس» / «مو قادر اتنفس» /
  // «مش عارف اتنفس» / «نفسي ضاق/يضيق/ضايق» / «حلقي|زوري|حنجرتي يقفل/يضيق/يتورم».
  //
  // NAJDI NEGATION «مو» WAS MISSING — a real gap, not a theoretical one. The list carried
  // Egyptian «مش» and Gulf/Eastern «مب» but not «مو»، which is the ordinary negation in
  // Najd. Khalid's own configured home region is najd (Riyadh), so the single most natural
  // way for this agent's core customer to say "I can't breathe" — «مو قادر أتنفس» — did not
  // fire the emergency path at all, while «ما أقدر أتنفس» did. Added with «موب» and «ماني»,
  // the other two Najdi/Gulf negators, and the feminine «قادرة».
  [/ما ?اقدر ?(?:ا|ال)?تنفس|مش ?(?:عارف|عارفه|قادر|قادره) ?(?:ا|ال)?تنفس|(?:مب|مو|موب|ماني|مني) ?(?:قادر|قادره|قادرة)? ?(?:ا|ال)?تنفس|صعوبه في ?التنفس|ما ?اقدر ?اخذ ?نفس/, "صعوبة تنفس"],
  [/نفسي ?(?:ضاق|يضيق|بيضيق|ضايق|مسدود|واقف|بيقف)/, "ضيق نفس"],
  [/(?:حلقي|زوري|حنجرتي|بلعومي) ?(?:يقفل|يتقفل|بيقفل|بتقفل|يضيق|يتضيق|بيضيق|يتورم|بيتورم|مسدود|قافل|بيسكر|يسكر)/, "انسداد الحلق"],
  // Swelling NOW — lips / tongue / face / throat actively swelling.
  [/(?:شفايفي|شفتي|لساني|وشي|وجهي|عيني|حلقي) ?(?:تورم|تتورم|يتورم|بيتورم|ورم|بيورم|منتفخ|انتفخ|بينتفخ|كبرت)/, "تورم"],
  // Active allergic reaction happening right now («الحين»/«دلوقتي»/«الآن»).
  [/(?:صار|جاني|جاله|جالها|جالي|صارت|بيصير|صاير) ?.{0,12}?(?:تحسس|حساسيه|حساسيت|رد ?فعل|طفح) ?.{0,8}?(?:الحين|دلوقتي|الان|توه|هسه|هلا)|(?:تحسس|حساسيه) ?(?:الحين|دلوقتي|الان|توه|هسه)/, "رد فعل تحسسي نشط"],
  // Emergency call / hospital NOW.
  // NORMALIZED SPELLINGS ONLY — three alternatives here were unreachable.
  //
  // These patterns run over `normalizeAr` output, which folds ئ→ي and ى→ي. So «طوارئ» is
  // «طواري» and «مستشفى» is «مستشفي» by the time this regex sees them, and the literals
  // «طوارئ» and «مستشفى» could never match anything. Harmless inside the hospital group,
  // where «طواري» and «مستشفي» were listed beside them — but «طوارئ ?الحين» was its OWN
  // alternative with no normalized twin, so the standalone phrase «طوارئ الحين» ("emergency,
  // now") — someone asking for emergency help without naming a verb first — fired NOTHING.
  // Written in the un-normalized spelling, which is the natural one to type, in a list whose
  // header says it is matched against normalized text.
  // THE PREPOSITION WAS MANDATORY AND SHOULD NEVER HAVE BEEN. This read «اتصلوا ?ب», so it
  // needed the plural verb AND the ب: «اتصلوا بالإسعاف» fired and «اتصلوا الإسعاف» — the same
  // sentence, said the way people say it — fired nothing at all. Nor did the SINGULAR «اتصل
  // بالإسعاف», which is the exact wording Khalid himself uses when he tells someone to call
  // one. Verb forms widened, ب and ال both optional; «اسعاف» is still required, and there is
  // no ordinary restaurant sentence that asks for an ambulance.
  [/(?:نحتاج|عايزين|عايز|ابي|نبي|ابغى|اتصل|اتصلو|اتصلوا|نتصل|كلم|كلمو|كلموا|نادو|نادوا|طلبو|طلبوا) ?ب? ?(?:ال)?اسعاف|(?:ودينا|وديناه|وديناها|رحنا|راح|دخلنا|دخلوه) ?(?:ال)?(?:مستشفي|طواري)|(?:ال)?طواري ?(?:الحين|دلوقتي|الان)/, "طلب إسعاف / طوارئ"],
];

// English / mixed — tested on the RAW (case-insensitive) text.
const EMERGENCY_EN_RE =
  /\b(can'?t breathe|cannot breathe|can not breathe|throat (?:is )?(?:closing|swelling|closed)|(?:lips?|face|tongue|throat) (?:is |are )?swelling|swelling (?:up )?now|anaphylaxis|anaphylactic|allergic reaction now|call (?:an )?ambulance|call 9-?1-?1|emergency now)\b/i;

// --- EMERGENCY NUMBERS — the ones that were firing on phone numbers ------------
//
// «٩٩٧|997|911|١١٢|112» used to be five bare alternatives inside the pattern above, with no
// digit boundary and no context. Every one of these ordinary messages raised a full ALLERGY
// EMERGENCY on the live WhatsApp path:
//
//   «رقمي 0559971234»   a Saudi mobile number — 997 sits inside almost any long digit run
//   «الطلب رقم 112»     an order number
//   «العنوان شارع 911»  a street address
//   «الحساب 112 ريال»   a bill
//
// A customer sending their own phone number is the single most routine thing that happens in
// this product, and it was escalating to a human as a life-threatening allergic reaction.
//
// TWO CONDITIONS NOW, AND BOTH ARE HONEST. The digits must stand alone — a number inside a
// longer run is a phone number, never a call for help — AND either someone is CALLING (the
// verb is present) or the message is nothing but the number, which is what a person types
// when they are panicking and have no words left. Every genuine phrasing this file already
// caught («نبي إسعاف»، «ودّونا الطوارئ»، «call 911») is matched by the rules above and does
// not depend on these digits at all.
const EMERGENCY_NUMBER_RE = /(?<![0-9٠-٩])(?:997|911|112|٩٩٧|٩١١|١١٢)(?![0-9٠-٩])/;
/** A calling verb or an emergency service by name. NOT «طلب» — that is the ordinary word for
 *  a restaurant order, and «الطلب رقم 112» is how every customer refers to one. */
const EMERGENCY_CALL_FRAME_RE = /اتصل|اتصلو|كلمو|نادو|اسعاف|طواري|انقاذ|نجده|هلال ?احمر/;
/** The message is the number and nothing else. */
const BARE_EMERGENCY_NUMBER_RE = /^[\s]*(?:997|911|112|٩٩٧|٩١١|١١٢)[\s!؟?.،,]*$/;

/**
 * Detect an ACTIVE allergy emergency (present tense). Pure + deterministic.
 * Returns fired:false for plain allergy mentions, past incidents, hypotheticals,
 * questions about allergies, and idioms — those belong to the companion flow.
 */
export function detectAllergenEmergency(text: string): EmergencyHit {
  const raw = String(text ?? "");
  if (!raw.trim()) return NO_HIT;
  const n = normalizeAr(raw);

  // English/mixed first (raw text). Past/hypothetical English framings are rare and
  // an English "anaphylaxis"/"can't breathe" is always treated as active (fail-safe).
  if (EMERGENCY_EN_RE.test(raw)) return { fired: true, label: "emergency (EN)" };

  // Arabic: an explicit PAST or HYPOTHETICAL frame disqualifies (it's a history/what-if).
  if (PAST_RE.test(n) || HYPOTHETICAL_RE.test(n) || HYPOTHETICAL_Q_RE.test(n)) return NO_HIT;

  for (const [re, label] of EMERGENCY_PATTERNS) {
    if (re.test(n)) return { fired: true, label };
  }

  // The emergency numbers, which need the message as a whole and not just a pattern.
  if (EMERGENCY_NUMBER_RE.test(n) && (EMERGENCY_CALL_FRAME_RE.test(n) || BARE_EMERGENCY_NUMBER_RE.test(n))) {
    return { fired: true, label: "طلب إسعاف / طوارئ" };
  }

  return NO_HIT;
}
