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
  /(?:لو|اذا|ان|لما|في حال|يعني لو) (?:اكلت|كلت|اكل|تناولت|صار|جاني|حصل|اتحسست)/;
// A pure question about whether a reaction COULD happen (not a report that it is).
const HYPOTHETICAL_Q_RE = /(?:ممكن|يمكن|هل|ينفع|يصير|احتمال) .*تحسس.*\؟|.*تحسس.*(?:ممكن|احتمال).*\؟/;

// --- INCLUDES — present-tense emergency signal families ----------------------
// Each entry is [regex-over-normalized-text, audit-label]. Order: airway, swelling,
// active reaction, emergency-call, English/mixed.
// HARD vs SOFT — which families an exclusion is allowed to veto.
//
// THE EXCLUSIONS USED TO VETO EVERYTHING, AND THAT SILENCED PEOPLE WHO COULD NOT BREATHE.
//
// `PAST_RE` matches «زمان» anywhere in the message. «زمان، مو قادر أتنفس» is not a history —
// it is "for a while now, I can't breathe" — and it returned NO_HIT. So did «قبل كده صار لي
// كذا، الحين مو قادر أتنفس» and «سابقا ما صار، بس الحين حلقي يقفل»: both name the past in one
// clause and an airway closing in the NEXT, and the veto read the first and threw away the
// second. This file's own header says missing an active emergency is not acceptable.
//
// An exclusion answers "is this a story about the past". It cannot answer "is this person
// breathing". So it no longer gets to: the airway, throat and active-swelling families fire
// whatever frame surrounds them, and the exclusions keep their job over the softer signals —
// a hospital visit, a reaction reported, an emergency number — where a history really is the
// common reading and the cost of over-firing is a human interrupted for nothing.
const EMERGENCY_PATTERNS: Array<[RegExp, string, "hard" | "soft"]> = [
  // Airway / breathing NOW (Najdi + Gulf + Egyptian). «ما اقدر اتنفس» / «مو قادر اتنفس» /
  // «مش عارف اتنفس» / «نفسي ضاق/يضيق/ضايق» / «حلقي|زوري|حنجرتي يقفل/يضيق/يتورم».
  //
  // NAJDI NEGATION «مو» WAS MISSING — a real gap, not a theoretical one. The list carried
  // Egyptian «مش» and Gulf/Eastern «مب» but not «مو»، which is the ordinary negation in
  // Najd. Khalid's own configured home region is najd (Riyadh), so the single most natural
  // way for this agent's core customer to say "I can't breathe" — «مو قادر أتنفس» — did not
  // fire the emergency path at all, while «ما أقدر أتنفس» did. Added with «موب» and «ماني»,
  // the other two Najdi/Gulf negators, and the feminine «قادرة».
  [/ما ?اقدر ?(?:ا|ال)?تنفس|مش ?(?:عارف|عارفه|قادر|قادره) ?(?:ا|ال)?تنفس|(?:مب|مو|موب|ماني|مني) ?(?:قادر|قادره|قادرة)? ?(?:ا|ال)?تنفس|صعوبه في ?التنفس|ما ?اقدر ?اخذ ?نفس/, "صعوبة تنفس", "hard"],
  // «نفسي ضايق» is BOTH "my breath is tight" and the idiom "I am fed up". What follows says
  // which: a body reading never takes «من الخدمة» / «من التأخير» after it. Without this,
  // «نفسي ضايق من الخدمة» — a complaint — opened the ambulance path.
  [/نفسي ?(?:ضاق|يضيق|بيضيق|ضايق|مسدود|واقف|بيقف)(?! ?من ?(?:ال)?(?:خدمه|تعامل|انتظار|تاخير|وضع|كلام|رد|سوالف|طريق|زحمه))/, "ضيق نفس", "hard"],
  [/(?:حلقي|زوري|حنجرتي|بلعومي) ?(?:يقفل|يتقفل|بيقفل|بتقفل|يضيق|يتضيق|بيضيق|يتورم|بيتورم|مسدود|قافل|بيسكر|يسكر)/, "انسداد الحلق", "hard"],
  // Swelling NOW — lips / tongue / face / throat actively swelling.
  [/(?:شفايفي|شفتي|لساني|وشي|وجهي|عيني|حلقي) ?(?:تورم|تتورم|يتورم|بيتورم|ورم|بيورم|منتفخ|انتفخ|ينتفخ|بينتفخ|تنتفخ|كبرت)/, "تورم", "hard"],
  // Active allergic reaction happening right now («الحين»/«دلوقتي»/«الآن»).
  [/(?:صار|جاني|جاله|جالها|جالي|صارت|بيصير|صاير) ?.{0,12}?(?:تحسس|حساسيه|حساسيت|رد ?فعل|طفح) ?.{0,8}?(?:الحين|دلوقتي|الان|توه|هسه|هلا)|(?:تحسس|حساسيه) ?(?:الحين|دلوقتي|الان|توه|هسه)/, "رد فعل تحسسي نشط", "soft"],
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
  [/(?:نحتاج|عايزين|عايز|ابي|نبي|ابغي|ابغى|اتصل|اتصلو|اتصلوا|نتصل|كلم|كلمو|كلموا|نادو|نادوا|طلبو|طلبوا) ?ب? ?(?:ال)?اسعاف|(?:ودينا|ودونا|وديتوني|وديناه|وديناها|رحنا|راح|دخلنا|دخلوه) ?(?:ال)?(?:مستشفي|طواري)|(?:ال)?طواري ?(?:الحين|دلوقتي|الان)/, "طلب إسعاف / طوارئ", "soft"],
];

// English / mixed — tested on the RAW (case-insensitive) text.
const EMERGENCY_EN_RE =
  /\b(can'?t breathe|cannot breathe|can not breathe|throat (?:is )?(?:closing|swelling|closed)|(?:lips?|face|tongue|throat) (?:is |are )?swelling|swelling (?:up )?now|anaphylaxis|anaphylactic|allergic reaction now|call (?:an )?ambulance|call (?:9-?1-?1|997|112)|emergency now)\b/i;

// --- EMERGENCY NUMBERS — the hardest rule in this file to get right --------------
//
// «٩٩٧|997|911|١١٢|112» began as five bare alternatives with no digit boundary and no
// context, and every one of these ordinary messages raised a full allergy EMERGENCY on the
// live WhatsApp path: «رقمي 0559971234» (a Saudi mobile — 997 sits inside a great many of
// them), «الطلب رقم 112», «العنوان شارع 911», «الحساب 112 ريال».
//
// THE FIRST FIX WAS TWO-THIRDS RIGHT AND ITS TWO REMAINING HOLES WERE BOTH REAL.
//
//   The digit boundary only saw digits. «055 997 1234» and «055-997-1234» — how a Saudi
//   actually writes that number — put spaces around the 997, so the boundary was satisfied
//   and the number fired again. The proof passed because it only tested the unseparated
//   form: an assertion green because a different spelling satisfied it.
//
//   The context word could sit ANYWHERE. «اتصل» is the most ordinary verb in delivery, so
//   «الطلب رقم 112 اتصل علي لما توصل» ("order 112, call me when you arrive") re-opened the
//   whole family. «طلب» had already been left out for exactly this reason; «اتصل» is no
//   different. And «نجده» was on the list for the rescue service «نجدة» — but normalizeAr
//   folds ة→ه, so it is also the everyday verb "we find it": «الطلب 112 ما نجده» fired.
//
// So: the digits are collapsed first, so a separated phone number reads as one run; and the
// calling verb must come BEFORE the number and close to it, which is where a verb sits when
// the number is what you are calling. A bare number, alone or with an urgency word, still
// fires — that is what someone types with no words left.
//
// «الله يخليك 997» is knowingly not covered. A leading courtesy phrase with no verb is rare,
// and the alternative is a heuristic on message length that would let «الطلب رقم 112 اتصل
// علي» back in. Anyone in that state says something else too, and everything else in this
// file fires on it.

/** Join digit groups a person separated with spaces or hyphens, so «055 997 1234» reads as
 *  one ten-digit run and the boundary below sees it that way. */
function collapseDigitGroups(n: string): string {
  let out = n;
  for (let i = 0; i < 6; i++) {
    const next = out.replace(/([0-9٠-٩])[\s\u00A0-]+([0-9٠-٩])/g, (_m, a, b) => a + b);
    if (next === out) break;
    out = next;
  }
  return out;
}

const EMERGENCY_NUMBER_RE = /(?<![0-9٠-٩])(?:997|911|112|٩٩٧|٩١١|١١٢)(?![0-9٠-٩])/;
/** A calling verb, immediately before the number. NOT «طلب» (the ordinary word for a
 *  restaurant order) and NOT «نجده» (which normalizes onto "we find it"). */
const CALL_THEN_NUMBER_RE =
  /(?:اتصل|اتصلو|اتصلوا|نتصل|كلم|كلمو|كلموا|اطلب|اطلبو|اطلبوا|نادو|نادوا)(?:\s+\S{1,12}){0,2}\s*(?:997|911|112|٩٩٧|٩١١|١١٢)(?![0-9٠-٩])/;
/** An emergency service named NEXT TO the number — proximity required, and it was not.
 *
 *  This was "anywhere in the message", which is the exact hole closed one line above for
 *  «اتصل» ("the context word could sit ANYWHERE"), left open in the very next rule. Saudi
 *  addresses are given by landmark, so «قريب من الإسعاف، شقة 911» ("near the ambulance
 *  station, flat 911") and «عندي طوارئ في الشغل، ألغي الطلب رقم 112» ("I have an emergency
 *  at work, cancel order 112") both raised a full allergy emergency with a staff alert.
 *
 *  A service word that is genuinely about THIS number sits beside it. One that is describing
 *  where you live, or why you are cancelling, does not. */
const EMERGENCY_SERVICE_NEAR_NUMBER_RE =
  // SERVICE THEN NUMBER — but never with an ADDRESS between them. «قريب من الاسعاف شقة 911»
  // ("near the ambulance station, flat 911") only stayed quiet because the corpus wrote it
  // with a comma; Arabic in a chat window rarely has one, and without it the sixteen-character
  // window closed over «شقة». Saudi addresses are given by landmark, so the landmark and the
  // flat number sit next to each other by nature. An address noun between the two is the tell.
  /(?:اسعاف|طواري|انقاذ|هلال ?احمر)(?:(?!شقه|شقة|عماره|عمارة|شارع|مبني|مبنى|حي |طريق|دور |مكتب|فيلا|برج)[^.،,؛!؟\n]){0,16}(?:997|911|112|٩٩٧|٩١١|١١٢)(?![0-9٠-٩])|(?<![0-9٠-٩])(?:997|911|112|٩٩٧|٩١١|١١٢)\s{0,2}(?:لل|ال|ل|بال)?(?:اسعاف|طواري|انقاذ)/;

/** The message is the number, alone or with one word of urgency — what someone types when
 *  they have no words left. */
const BARE_EMERGENCY_NUMBER_RE =
  /^[\s]*(?:997|911|112|٩٩٧|٩١١|١١٢)[\s]*(?:الحين|حالا|الان|بسرعه|بسرعة|please|now|quick(?:ly)?)?[\s!؟?.،,]*$/i;

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

  // A CONDITIONAL IS NEVER A REPORT, AND LETTING THE HARD FAMILIES IGNORE THAT WAS A
  // REGRESSION AGAINST THE VERSION IN PRODUCTION.
  //
  // The hard/soft split was written so a past-tense word could not silence someone who cannot
  // breathe. It went further than that and let the HYPOTHETICAL veto go too — so «لو أكلت
  // مكسرات حلقي يقفل» ("if I eat nuts my throat closes"), the single most ordinary way anyone
  // states an allergy, became an ACTIVE ANAPHYLAXIS: «🚨 اتصل بالإسعاف 997 الحين» to a calm
  // customer, plus an alert row, an email and a WhatsApp to a real human phone. So did «إذا
  // أكلت بيض وجهي يتورم» and «ممكن لو أكلت لوز ما أقدر أتنفس؟».
  //
  // No reading of «لو أكلت» is "this person is not breathing". The hypothetical veto covers
  // every family again, and the gate still HEARS the disclosure — it is an allergy statement,
  // just not an emergency.
  if (HYPOTHETICAL_RE.test(n) || HYPOTHETICAL_Q_RE.test(n)) return NO_HIT;

  // THE PAST VETO IS CLAUSE-SCOPED, which is what the split was actually reaching for.
  //
  // «زمان، مو قادر أتنفس» is a past word and a present airway in two clauses, and the whole
  // point was to stop the first from eating the second. Scoping it to its own clause does
  // that without handing the hard families a blanket exemption — the same technique this
  // branch invented for the English denial one file over.
  const clauses = n.split(/[.،,؛!؟\n]|\s+بس\s+|\s+لكن\s+/).filter((c) => c.trim() !== "");
  for (const [re, label, kind] of EMERGENCY_PATTERNS) {
    if (kind !== "hard") continue;
    for (const c of clauses) {
      if (re.test(c) && !PAST_RE.test(c)) return { fired: true, label };
    }
  }

  const excluded = PAST_RE.test(n);

  if (excluded) return NO_HIT;
  for (const [re, label, kind] of EMERGENCY_PATTERNS) {
    if (kind === "soft" && re.test(n)) return { fired: true, label };
  }

  // The emergency numbers, which need the message as a whole and not just a pattern.
  const collapsed = collapseDigitGroups(n);
  if (
    EMERGENCY_NUMBER_RE.test(collapsed) &&
    (CALL_THEN_NUMBER_RE.test(collapsed) ||
      EMERGENCY_SERVICE_NEAR_NUMBER_RE.test(collapsed) ||
      BARE_EMERGENCY_NUMBER_RE.test(collapsed))
  ) {
    return { fired: true, label: "طلب إسعاف / طوارئ" };
  }

  return NO_HIT;
}
