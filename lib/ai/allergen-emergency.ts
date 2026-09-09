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
// The people a message can be ABOUT. One list, shared with the symptom detectors — see
// symptom-frames.ts for why a second copy is not an option.
import { PERSON_WORDS } from "./symptom-frames";

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
// ============================================================================
// THE AIRWAY IS COMPOSED FROM ITS AXES NOW, BECAUSE THIS BUG HAS HAPPENED TWICE.
//
// FIRST OCCURRENCE — NAJDI NEGATION «مو» WAS MISSING, a real gap and not a theoretical one.
// The list carried Egyptian «مش» and Gulf/Eastern «مب» but not «مو», which is the ordinary
// negation in Najd. Khalid's own configured home region is najd (Riyadh), so the single most
// natural way for this agent's core customer to say "I can't breathe" — «مو قادر أتنفس» — did
// not fire the emergency path at all, while «ما أقدر أتنفس» did. It was fixed by ADDING THE
// THREE PHRASINGS SOMEBODY THOUGHT OF («مو»، «موب»، «ماني») and the feminine «قادرة» — which,
// being written with «ة» in a list matched against `normalizeAr` output that folds ة→ه, could
// never match anything. The fix for the first occurrence shipped with a dead alternative in it.
//
// SECOND OCCURRENCE, found one wave later, the identical shape:
//
//   «ما عاد يتنفس»          he stopped breathing            SILENT
//   «ما عاد يقدر يتنفس»     he can no longer breathe        SILENT
//   «عندي صعوبة بالتنفس»    I have difficulty breathing     SILENT   ← Gulf «ب»
//   «عندي صعوبة في التنفس»  the identical sentence, «في»    FIRED
//
// «ما عاد» is how Arabic says "no longer" — the exact words a person reaches for when a state
// has just CHANGED, which is what an emergency IS — and it appeared in no auxiliary slot. The
// preposition was hard-coded to «في»; «ب» is the Gulf one, and this tenant's configured home
// region is Najd. And every verb in the family was frozen in the FIRST PERSON, so a father
// could not report his son at all: «ابني ما يقدر يتنفس» and «الطفل ما يتنفس» were both silent.
//
// Adding «ما عاد» and «ب» would have been the third patch of the same kind, and there would
// have been a fourth. So the airway family is no longer WRITTEN AS SENTENCES. It is the cross
// product of the four slots the language actually varies — NEGATION × ABILITY × PERSON ×
// PREPOSITION — composed from the named lists below, and `scripts/proof-airway-derivation.test.ts`
// drives the whole product (2,600+ strings) instead of a list somebody thought of. A slot that
// is missing a value is now a hole in a LIST, which a reader can see, rather than a hole in a
// sentence, which nobody can.
//
// WHY WIDENING HERE IS SAFE AND NARROWING IS NOT: every alternative below still requires a
// BREATH WORD («تنفس»/«نفس») or a BODY PART with a possessive glued to it. There is no ordinary
// restaurant sentence in that shape — the proof re-drives every "must stay quiet" string from
// `proof-allergy-false-positives.test.ts` and every clean voice control from the eval set to
// keep it that way.
// ============================================================================

/** NEGATION — every particle Arabic uses to say "not", including the Egyptian ما…ش circumfix
 *  fused onto the verb («مقدرش»). Longest first, so «ماني» is not eaten by «ما». */
const NEG =
  "(?:ماقدرش|مقدرتش|مقدرش|ماعرفش|معرفش|مبقتش|مبقاش|ماني|مانها|مانه|ماهو|ماهي|مهوب|موب|مش|مو|مب|ما|مني)";

/** "NO LONGER" — the slot that was missing entirely. «ما عاد»/«ما بقيت» is what someone says
 *  when the breathing has just STOPPED, which is the most urgent message this file can get.
 *  Optional, because «ما يقدر يتنفس» has no such word. */
const NO_LONGER = "(?: ?(?:عاد|عادت|عادوا|بقي|بقيت|بقت))?";

/** ABILITY — the auxiliary between the negation and the verb, in every person and both
 *  genders. Optional: «ما عاد يتنفس» ("he no longer breathes") carries none, and requiring one
 *  is exactly what silenced it. */
const ABLE =
  "(?: ?(?:[ايتن]قدر|بقدر|قدر|قادر(?:ه|ين)?|عارف(?:ه|ين)?|[ايتن]عرف|[ايتن]ستطيع|[ايتن]تمكن))?";

/** BREATHE — the PERSON axis. «اتنفس» is me, «يتنفس» is him, «تتنفس» is her/you, «نتنفس» is us,
 *  «التنفس» is the verbal noun. Only «ا» and «ال» were ever accepted, which is why a parent
 *  reporting a child fired nothing. */
const BREATHE = "(?:ال|[ايتن])?تنفس";

/** POSSESSIVE — WHOSE body. Same axis as above, on the noun instead of the verb: «حلقي» is my
 *  throat, «حلقه» his, «حلقها» hers. Every body term in this file was bound to «ي». */
const POSS = "(?:ها|هم|نا|ي|ه)";

/** THE PREPOSITION SLOT in «صعوبة … التنفس». It was the literal «في». Gulf says «بالتنفس»,
 *  Najdi contracts «في ال» to «فال», and the article detaches or glues on either way. All of it
 *  optional — «صعوبة تنفس» carries no preposition at all. */
const IN = "(?: ?(?:في|ب|ف)? ?(?:ال)?)";

// The composed airway alternatives. Each is one SHAPE, not one sentence.
/** «ما أقدر أتنفس» / «مو قادر يتنفس» / «ما عاد يقدر يتنفس» / «مقدرش اتنفس» / «ما عاد يتنفس». */
const CANNOT_BREATHE = `${NEG}${NO_LONGER}${ABLE} ?${BREATHE}`;
/** «ما أقدر آخذ نفس» — the same shape with the noun instead of the verb. */
const CANNOT_TAKE_BREATH = `${NEG}${NO_LONGER}${ABLE} ?(?:[ايتن]?اخذ|اسحب) ?(?:ال)?نفس`;
/** «توقف عن التنفس» / «بطل يتنفس» — reported as an event rather than an inability. No
 *  negation particle at all, which is why the negation axis alone would still have missed it. */
const BREATHING_STOPPED = `(?:توقف|توقفت|وقف|وقفت|بطل|بطلت|انقطع|انقطعت|حبس) ?(?:عن )?${BREATHE}`;
/** «صعوبة في التنفس» / «صعوبة بالتنفس» / «ضيق في التنفس» / «ضيق نفس» / «صعوبة تنفس». */
const BREATHING_DIFFICULTY = `(?:صعوبه|صعوبات|ضيق)${IN}(?:ت)?نفس`;
/** «صعب علي التنفس» — the same statement with the difficulty as a verb. */
const HARD_TO_BREATHE = `(?:صعب|يصعب|صعبه) ?(?:عل(?:ي|يه|يها|يهم|ينا|يك))? ?(?:ال)?تنفس`;

/** The verbs that say a breath is tight, stopped or cut. */
const BREATH_TIGHT =
  "(?:ضاق|ضاقت|يضيق|تضيق|بيضيق|ضايق|ضايقه|مسدود|مسدوده|واقف|واقفه|بيقف|بيوقف|انقطع|انقطعت|مقطوع)";
/** «نفسي ضايق» is BOTH "my breath is tight" and the idiom "I am fed up". What follows says
 *  which: a body reading never takes «من الخدمة» / «من التأخير» after it. Without this,
 *  «نفسي ضايق من الخدمة» — a complaint — opened the ambulance path. */
const NOT_THE_IDIOM =
  "(?! ?من ?(?:ال)?(?:خدمه|تعامل|انتظار|تاخير|وضع|كلام|رد|سوالف|طريق|زحمه))";
/** THIRD PERSON NEEDS A PERSON NAMED, and this is the one slot where that is true. «نفسه» is
 *  "his breath" AND "itself": «الطلب نفسه واقف» ("the order itself is stalled") is an ordinary
 *  delivery sentence and would otherwise have become an ambulance call. So the third-person
 *  breath is admitted only with one of `symptom-frames.PERSON_WORDS` in front of it — the same
 *  shared list the symptom detectors use, imported rather than copied. */
const BREATH_TIGHT_THIRD =
  `(?:${PERSON_WORDS})[^.،,؛!؟\\n]{0,12}?نفس(?:ه|ها|هم) ?${BREATH_TIGHT}${NOT_THE_IDIOM}`;

/** THROAT — «حلقي يقفل» in every person and every closing verb. «انسد»/«سكرت»/«قفل» are the
 *  perfect forms of verbs the list already carried in the imperfect: the same slot, unfilled. */
const THROAT = "(?:حلق|زور|حنجرت|بلعوم)";
const THROAT_CLOSES =
  "(?:يقفل|تقفل|يتقفل|بيقفل|بتقفل|اتقفل|قافل|قافله|قفل|قفلت|يضيق|تضيق|يتضيق|بيضيق|ضاق|ضاقت|" +
  "يتورم|تتورم|بيتورم|متورم|تورم|مسدود|مسدوده|انسد|انسدت|يسكر|تسكر|بيسكر|سكر|سكرت|اتسكر)";
const THROAT_CLOSING = `${THROAT}${POSS} ?${THROAT_CLOSES}`;

/** SWELLING NOW — lips / tongue / face / eyes / throat, in every person. «شفتي» stays FIRST
 *  PERSON ONLY on purpose: the singular «شفة» with a third-person suffix is «شفته», which is
 *  also «شفته» = "I saw it" — «الخبز شفته ينتفخ» ("I saw the bread rising") would have become
 *  an anaphylaxis. Nobody says «شفته» for a swelling lip anyway; they say «شفايفه». */
// «بلعوم»/«زور»/«حنجرت» were in the THROAT list and not this one, so «بلعومي منتفخ» was
// silent while «بلعومي يتورم» fired: the same body part, two verb lists, one of them short.
const SWELL_BODY = `(?:(?:شفايف|لسان|وش|وجه|عين|حلق|بلعوم|زور|حنجرت)${POSS}|شفتي)`;
const SWELLS =
  "(?:تورم|تورمت|تتورم|يتورم|بيتورم|ورم|بيورم|منتفخ|منتفخه|انتفخ|انتفخت|ينتفخ|بينتفخ|تنتفخ|كبرت|كبر)";
const SWELLING = `${SWELL_BODY} ?${SWELLS}`;

/** CYANOSIS — «شفايفه زرقاء». THIS ONE IS A NEW SIGNAL, NOT A WIDER SLOT, and it is here
 *  because it was driven: «ابني شفايفه زرقاء» is a father reporting the textbook sign that a
 *  child has stopped getting oxygen, and it fired nothing in any detector on any surface. It
 *  is the message you send when the person can no longer speak for themselves, so it cannot
 *  wait for the airway vocabulary to be reached some other way.
 *  Bound to lips / face / tongue / fingers ONLY — «عينه زرقاء» is an eye COLOUR, and «لونه
 *  أزرق» is just as likely to be a drink. */
const BLUE = "(?:زرقاء|زرقا|زرقه|زرق|ازرق|مزرق|مزرقه|تزرق|زرقت|يزرق)";
const CYANOSIS = `(?:شفايف|شفاه|وجه|وش|لسان|اصابع|اظافر)${POSS} ?(?:صار|صارت|بدت|بدا|تحول|صايره)? ?${BLUE}`;

const EMERGENCY_PATTERNS: Array<[RegExp, string, "hard" | "soft"]> = [
  // AIRWAY / BREATHING NOW — the composed cross product above, in one alternation. Every
  // shape needs a breath word, so a message with none of them cannot reach this line.
  [new RegExp(`${CANNOT_BREATHE}|${CANNOT_TAKE_BREATH}|${BREATHING_STOPPED}|${BREATHING_DIFFICULTY}|${HARD_TO_BREATHE}`), "صعوبة تنفس", "hard"],
  // Breath tight — first person bare, third person only with a person named (see above).
  [new RegExp(`نفسي ?${BREATH_TIGHT}${NOT_THE_IDIOM}|${BREATH_TIGHT_THIRD}`), "ضيق نفس", "hard"],
  // Throat closing, in every person.
  [new RegExp(THROAT_CLOSING), "انسداد الحلق", "hard"],
  // Swelling NOW — lips / tongue / face / eyes / throat actively swelling, in every person.
  [new RegExp(SWELLING), "تورم", "hard"],
  // Blue lips / face — oxygen, not swelling, and its own label so the audit row says so.
  [new RegExp(CYANOSIS), "ازرقاق (نقص أكسجين)", "hard"],
  // Active allergic reaction happening right now («الحين»/«دلوقتي»/«الآن»).
  [/(?:صار|جاني|جاله|جالها|جالي|صارت|بيصير|صاير) ?.{0,12}?(?:تحسس|حساسيه|حساسيت|رد ?فعل|طفح) ?.{0,8}?(?:الحين|دلوقتي|الان|توه|هسه|هلا)|(?:تحسس|حساسيه) ?(?:الحين|دلوقتي|الان|توه|هسه)/, "رد فعل تحسسي نشط", "soft"],
  // Emergency call / hospital NOW.
  // THE PERSON AXIS REACHES HERE TOO. «ودّيناه المستشفى» was listed and «ودّوه المستشفى» was
  // not — the same first-person freeze as the airway family, in the family a bystander is
  // most likely to use, because the person being taken to hospital is by definition not the
  // one typing. Soft, so a genuine history («قبل سنة ودّوه المستشفى») is still vetoed.
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
  [/(?:نحتاج|عايزين|عايز|ابي|نبي|ابغي|ابغى|اتصل|اتصلو|اتصلوا|نتصل|كلم|كلمو|كلموا|نادو|نادوا|طلبو|طلبوا) ?ب? ?(?:ال)?اسعاف|(?:ودينا|ودونا|ودوه|ودوها|ودوني|ودوا|ودو|وديته|وديتها|وديتوني|وديناه|وديناها|رحنا|راح|راحت|راحوا|دخلنا|دخلوه|دخلوها|دخلته|خذوه|خذوها) ?(?:ال)?(?:مستشفي|طواري)|(?:ال)?طواري ?(?:الحين|دلوقتي|الان)/, "طلب إسعاف / طوارئ", "soft"],
];

// English / mixed — tested on the RAW (case-insensitive) text.
//
// THE SAME BUG CLASS, IN THE OTHER LANGUAGE. This arm knew «can't breathe» and «cannot
// breathe» and nothing else about breathing, so the English half of the very defect that
// prompted this rewrite — "he stopped breathing", "he can no longer breathe", "difficulty
// breathing" — was silent here too, alongside "not breathing", "trouble breathing",
// "struggling to breathe" and "shortness of breath". Derived the same way: the inability
// (can't / cannot / can no longer / unable / struggling / hard to), the event (stopped /
// not breathing), and the nominal (difficulty / trouble / shortness of breath).
//
// A hypothetical English framing is still read as active, unchanged and on purpose — see the
// header of `detectAllergenEmergency`. Widening the vocabulary does not touch that policy.
const EMERGENCY_EN_RE =
  /\b(?:(?:can|could)(?:'|\u2019)?t (?:\w+ ){0,2}?breathe?|can ?not breathe|can no longer breathe|(?:unable|not able) to breathe|(?:struggling|straining|fighting) to breathe|gasping for (?:air|breath)|(?:hard|difficult|tough) to breathe|(?:difficulty|trouble|problems?|issues?) (?:in |with )?breathing|(?:stopped|quit) breathing|(?:is |are |he'?s |she'?s |i'?m |im )?not breathing|short(?:ness)? of breath|can(?:'|\u2019)?t catch (?:my|his|her|their) breath|(?:throat|airway) (?:is |are )?(?:closing|closed|swelling|swollen|blocked|tightening|tight)|(?:lips?|face|tongue|throat) (?:is |are )?swelling|swelling (?:up )?now|(?:lips?|face|tongue|fingers?|skin) (?:are |is |look |looks |went |turned |turning |going )*(?:blue|bluish|purple)|anaphylaxis|anaphylactic|allergic reaction now|call (?:an )?ambulance|call (?:9-?1-?1|997|112)|emergency now)\b/i;

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
