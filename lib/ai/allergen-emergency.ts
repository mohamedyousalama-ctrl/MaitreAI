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
  [/(?:نحتاج|عايزين|عايز|ابي|نبي|ابغى|اتصلوا ?ب|كلموا|طلبوا) ?(?:ال)?اسعاف|(?:ودينا|وديناه|وديناها|رحنا|راح|دخلنا|دخلوه) ?(?:ال)?(?:مستشفي|مستشفى|طوارئ|طواري)|طوارئ ?الحين|٩٩٧|997|911|١١٢|112/, "طلب إسعاف / طوارئ"],
];

// English / mixed — tested on the RAW (case-insensitive) text.
const EMERGENCY_EN_RE =
  /\b(can'?t breathe|cannot breathe|can not breathe|throat (?:is )?(?:closing|swelling|closed)|(?:lips?|face|tongue|throat) (?:is |are )?swelling|swelling (?:up )?now|anaphylaxis|anaphylactic|allergic reaction now|call (?:an )?ambulance|call 9-?1-?1|emergency now)\b/i;

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
  return NO_HIT;
}
