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
import { PERSON_WORDS, FRAME_WORDS, NOT_A_PERSON } from "./symptom-frames";

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
// drives the whole product instead of a list somebody thought of. A slot that
// is missing a value is now a hole in a LIST, which a reader can see, rather than a hole in a
// sentence, which nobody can.
//
// AND THE FIRST VERSION OF THAT WIDENING WAS BLOCKED, BECAUSE THE SENTENCE THAT USED TO SIT
// HERE — "every alternative still requires a BREATH WORD, and there is no ordinary restaurant
// sentence in that shape" — WAS FALSE, AND THE PROOF COULD NOT SAY SO.
//
// «نفس» IS a breath word. It is also "the same" and "himself", and «ما» is also the last two
// letters of «دايما». 3,993 ordinary Saudi restaurant strings — «دايما ناخذ نفس الطلب» ("we
// always order the same thing") among them — raised a full allergy emergency, which on this
// path means a WhatsApp to a real human phone and a fabricated allergy note on a kitchen
// ticket. The proof read 14,696/14,696 throughout, because its quiet corpus was derived from
// the SAME AXES as its firing corpus and so could not contain a single string the widening
// touched. See `docs/audits/AUDIT-airway-derivation.md`.
//
// WHAT IS STILL DEAF HERE, ON PURPOSE, SO THE NEXT READER INHERITS THE DECISION RATHER THAN
// RE-DERIVING IT. Each of these is a real gap, driven and confirmed silent; each is deferred
// because closing it is a WIDENING, and this file has just been blocked once for shipping a
// widening whose quiet side was never derived. They belong in their own work item, with their
// own quiet corpus, not appended to the end of the fix for the last one.
//
//   «صدري ضايق» / «صدري مسدود» — the chest. «صدر» is in no body list. It is deferred and not
//     forgotten: «ضاق صدري من الانتظار» ("I got fed up waiting") is one of the most common
//     idioms in a complaints inbox, so «صدر» + the tightness verbs needs exactly the design
//     work family C needed above — the verb split and the agreement rule — not a list entry.
//   Arabizi — `ma agdar atnafas`, `mo gader atnaffas`. Neither arm sees Latin-script Arabic at
//     all. That is a THIRD language surface with its own axes and its own homographs («mat»,
//     «shafa», «nafs»), so it needs its own derivation and its own ordinary corpus in Latin
//     script. Nothing here can be extended to reach it.
//   «ما اقدر اتنفص» (س→ص) and the rest of the typo space — that is the phonetic/fuzzy layer's
//     job (`proof-phonetic-typed-scope`), not a literal axis. Adding spellings one at a time
//     to a literal list is the anti-pattern this file exists to stop.
//   «اغمي عليه» / «فقد الوعي» / «he passed out» — loss of consciousness is a DIFFERENT
//     emergency family, not an airway one, with its own homographs («أغمي عليه من الضحك»,
//     "passed out drunk"). It deserves its own signal, label and quiet side.
//   «حلقي ضيق» — CLOSED, one wave later, and the way it was closed is the point. The deferral
//     named «ضيق» and not «ضايق», which is the commoner Gulf form and was worth 6,624 driven
//     strings on its own — a deferral list is a list somebody thought of too. It is closed
//     with a SUBJECT anchor rather than a list entry (see `THROAT_TIGHT_ANCHORED`), because
//     «حلقة ضيقة» is a narrow ring and the ring never belongs to a person.
//
// SO THE RULE IS NOT "REQUIRE A BREATH WORD" ANY MORE. It is: require a breath word, and where
// that word is a homograph, say WHICH READING by a property of the grammar — a word boundary,
// a construct, an agreement, a SUBJECT — never by a list of the complements somebody thought
// of. Each guard below carries the sentence that got past it.
//
// AND THE PROOF'S QUIET SIDE IS DERIVED FROM ORDINARY RESTAURANT LANGUAGE RATHER THAN FROM
// THESE AXES — IN TWO LANGUAGES, WHICH IS THE CORRECTION THIS PARAGRAPH OWED. The sentence
// that used to end here said "ordinary Arabic", and the number that shipped beside it — six
// false-positive families closed, 4,606 ordinary strings down to 1 — WAS AN ARABIC NUMBER
// PRESENTED AS A MODULE NUMBER. The same commit widened the English arm with no quiet side at
// all, and 616 of 1,325 ordinary restaurant-English strings raised a full emergency: «the wine
// is not breathing yet», «the queue left me short of breath». `proof-airway-derivation.test.ts`
// §8 is the Arabic corpus and §5c is the English one, both driven against the pre-widening and
// the widened modules so both can fail, and the proof's header states in one place what the
// two of them do and do not cover — word order, script and syntactic frame are the boundary,
// and a green run is evidence about a VALUE, not about a FRAME.
// ============================================================================

/** NEGATION — every particle Arabic uses to say "not", including the Egyptian ما…ش circumfix
 *  fused onto the verb («مقدرش»). Longest first, so «ماني» is not eaten by «ما». */
const NEG =
  // A LEFT WORD BOUNDARY, WHICH THIS FAMILY WAS THE ONE PLACE TO OMIT. `\b` is meaningless
  // for Arabic in JS, so `allergen-gate.ts`'s `termRegex()` uses `(?<![ء-ي])` — «لبن» must
  // not match inside «البندق». Without it «ما» matched INSIDE every ordinary word that ends
  // in it — «دايما»، «عموما»، «لما»، «كما»، «بينما»، «طالما»، «عندما»، «مهما»، «حينما» — and
  // «دايما ناخذ نفس الطلب» ("we always order the same thing"), a returning customer's most
  // ordinary sentence, raised a full allergy emergency and sent a WhatsApp to a real phone.
  //
  // THE PROCLITIC GOES INSIDE THE BOUNDARY, NOT AROUND IT — the same shape as the `(?:ال)?`
  // in `termRegex()`. «و» and «ف» glue straight onto the particle («تعبان وما أقدر أتنفس»,
  // «فما أقدر أتنفس»), so a bare `(?<![ء-ي])` would have silenced them: a fix that trades one
  // deaf spot for another. Written this way the conjunction is part of the match and the
  // boundary is checked BEFORE it, so «عموما» — which contains «وما» — is still excluded,
  // because its «و» has an Arabic letter in front of it.
  "(?<![ء-ي])[وف]?" +
  "(?:ماقدرش|مقدرتش|مقدرش|ماعرفش|معرفش|مبقتش|مبقاش|ماني|مانها|مانه|ماهو|ماهي|مهوب|موب|مش|مو|مب|ما|مني)";

/** "NO LONGER" — the slot that was missing entirely. «ما عاد»/«ما بقيت» is what someone says
 *  when the breathing has just STOPPED, which is the most urgent message this file can get.
 *  Optional, because «ما يقدر يتنفس» has no such word. */
const NO_LONGER = "(?: ?(?:عاد|عادت|عادوا|بقي|بقيت|بقت))?";

/** ABILITY — the auxiliary between the negation and the verb, in every person and both
 *  genders. Optional: «ما عاد يتنفس» ("he no longer breathes") carries none, and requiring one
 *  is exactly what silenced it. */
const ABLE =
  // «فيني»/«فينا» is the LEVANTINE ability auxiliary — «ما فيني اتنفس» is how the Levant says
  // "I can't breathe", and it was in no slot, so the sentence was silent in both lists.
  "(?: ?(?:[ايتن]قدر|بقدر|قدر|قادر(?:ه|ين)?|عارف(?:ه|ين)?|[ايتن]عرف|[ايتن]ستطيع|[ايتن]تمكن|فيني|فينا))?";

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
const IN = "(?: ?(?:في|ب|ف)? ?)";

/** «نفس» IS THREE WORDS AT ONCE AND ONLY ONE OF THEM IS A BREATH. Arabic writes no short
 *  vowels, so one string carries نَفَس ("breath"), نَفْس ("self") and the construct head
 *  «نفس X» = "the SAME X". The bare noun was accepted anywhere a breath was expected, and
 *  «عندي صعوبة في نفس الطلب» ("I have trouble with the same order") became an ambulance call.
 *
 *  THE TELL IS STRUCTURAL, NOT LEXICAL. The breath reading is unambiguous whenever the noun
 *  carries the verbal-noun «ت» («تنفس»/«التنفس») or the article («النفس»); the "same" reading
 *  is a CONSTRUCT HEAD and is therefore always BARE and always followed by a definite noun.
 *  So the guard belongs on bare «نفس» alone, and what it excludes is that construct.
 *
 *  IT IS NOT «ANY «ال» AFTER «نفس»», WHICH IS THE OBVIOUS FIX AND IS WRONG: «عندي صعوبة في
 *  التنفس الحين» and «ضيق نفس الحين» — a difficulty breathing RIGHT NOW — end in exactly that
 *  shape, and a blanket lookahead silences them. «الحين»/«الان» are clause-level urgency
 *  adverbs, not construct complements: "the same moment" is «بنفس الوقت», never «نفس الحين». */
const NOT_THE_SAME = "(?! ?ال(?!(?:حين|ان|له)(?![ء-ي]))[ء-ي])";
/** THE SAME GUARD ON THE VERB'S OBJECT, WHICH NEEDS TO BE WEAKER, AND HERE IS THE MEASUREMENT
 *  THAT SAYS SO. «آخذ نفس ال…» has no left-hand tell at all — «ما عاد أقدر آخذ نفس الطلب» ("I
 *  can no longer take the same order") and «ما أقدر آخذ نفس الطفل تعبان» ("I can't take a
 *  breath, the child is exhausted") are the same six words in the same order. Applying the
 *  full guard silenced 18 airway strings that the PRE-WIDENING module already heard, which is
 *  a regression and not a narrowing. (The audit's own proposed lookahead, `(?! ?ال[ء-ي])`,
 *  is the same mistake made harder: driven against the blocked module over 2,496 airway
 *  strings it silences 420 of them and regresses 84 against pre-widening — and the proof as
 *  it stood passed 14,696/14,696 with it applied, because no assertion in that corpus ever
 *  put a word after the breath noun. Every number here is re-derived by §8 of the proof.)
 *  The difference is that «نفس الطلب» is the OBJECT of the verb and therefore ENDS the clause,
 *  while a run-on emergency keeps going. So the object reading is refused only when the
 *  definite noun is the last word in the clause — and never for a TIME word, because «اليوم»
 *  cannot be the object of "take" in the first place («نفس اليوم» needs a preposition).
 *  A trailing word after the noun leaves the string FIRING, which is the safe direction. */
const NOT_THE_SAME_OBJECT = "(?! ?ال(?!(?:حين|ان|له|يوم|ليله)(?![ء-ي]))[ء-ي]+\\s*$)";
/** The breath noun in the spellings that can ONLY be a breath. */
const BREATH_UNAMBIGUOUS = "(?:(?:ال)?تنفس|النفس)";
/** …AND THE OTHER HALF OF THE SAME PROBLEM, WHICH THE OBVIOUS FIX GETS BACKWARDS.
 *  «ضيق نفس» is a fixed compound and the bare «نفس» in it is unavoidable, so a right-hand
 *  guard cannot be the whole answer: «ضيق نفس اليوم», «عندي ضيق نفس الله يخليكم» and «ضيق نفس
 *  الطفل تعبان» are run-on emergency messages in exactly the blocked shape, and a lookahead
 *  that refuses a following definite noun silences all of them — 420 of 2,496 driven airway
 *  strings, 84 of which the PRE-widening module already heard.
 *
 *  The «الفرع الثاني» in «المحل ضيق نفس الفرع الثاني» is not distinguishable on the RIGHT.
 *  It is distinguishable on the LEFT: there «ضيق» is an ADJECTIVE and «المحل» is its subject,
 *  and an adjectival subject is a definite noun sitting immediately in front. A symptom
 *  report has no such subject — it opens the clause, or it sits in one of the personal frames
 *  `symptom-frames.FRAME_WORDS` already exists to name («عندي», «فيني», «ابني عنده»).
 *  «السلام عليكم ضيق نفس» keeps firing, because «عليكم» is not a definite noun. */
const NO_DEFINITE_SUBJECT = "(?<!(?:^|[\\s،,.؛!؟])ال[^\\s]{0,12} )";

// The composed airway alternatives. Each is one SHAPE, not one sentence.
/** «ما أقدر أتنفس» / «مو قادر يتنفس» / «ما عاد يقدر يتنفس» / «مقدرش اتنفس» / «ما عاد يتنفس». */
const CANNOT_BREATHE = `${NEG}${NO_LONGER}${ABLE} ?${BREATHE}`;
/** «ما أقدر آخذ نفس» — the same shape with the noun instead of the verb. */
const CANNOT_TAKE_BREATH =
  // «اخد» WITH A DAL is the Egyptian spelling of the verb, and only «اخذ» was listed — so
  // «مش قادر آخد نفسي», the Egyptian sentence, was silent while its Gulf twin fired. The
  // circumfix was a covered axis; the verb it attaches to was not.
  `${NEG}${NO_LONGER}${ABLE} ?(?:[ايتن]?اخ[ذد]|اسحب) ?(?:النفس|نفس${NOT_THE_SAME_OBJECT})`;
/** «توقف عن التنفس» / «بطل يتنفس» — reported as an event rather than an inability. No
 *  negation particle at all, which is why the negation axis alone would still have missed it. */
const BREATHING_STOPPED = `(?:توقف|توقفت|وقف|وقفت|بطل|بطلت|انقطع|انقطعت|حبس) ?(?:عن )?${BREATHE}`;
/** «صعوبة في التنفس» / «صعوبة بالتنفس» / «ضيق في التنفس» / «ضيق نفس» / «صعوبة تنفس». */
const BREATHING_DIFFICULTY =
  // the breath noun in a spelling that can only be a breath — any head, any preposition
  `(?:صعوبه|صعوبات|ضيق)${IN}${BREATH_UNAMBIGUOUS}` +
  // the fixed compound «ضيق نفس», which has no adjectival subject in front of it…
  `|${NO_DEFINITE_SUBJECT}ضيق ?نفس(?![ء-ي])` +
  // …or sits in a personal frame, which is what a symptom report looks like
  `|(?:${FRAME_WORDS})[^.،,؛!؟\\n]{0,12}?ضيق ?نفس(?![ء-ي])` +
  // «ضيق في نفس» / «ضيق بنفس» — WITH a preposition the compound is broken, so the construct
  // guard applies again and there is no run-on to protect: «الشارع ضيق بنفس الطريقة» is a
  // street, «فيه صعوبة في نفس الوقت» is a timetable.
  `|ضيق ?(?:في|ب|ف) ?نفس${NOT_THE_SAME}` +
  // «صعوبة نفس» — bare, and «صعوبة» never governs an adjectival subject, so the construct
  // guard is the whole test here: «عندي صعوبة في نفس الطلب» is about an order.
  `|(?:صعوبه|صعوبات)${IN}نفس${NOT_THE_SAME}`;
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
// THIRD PERSON: THE PERSON ANCHOR IS RIGHT, AND IT IS WHAT LET THE IDIOM IN.
//
// «نفسه» is "his breath" AND "itself", so «الطلب نفسه واقف» ("the order itself is stalled") —
// an ordinary delivery sentence — had to be excluded, and naming a PERSON is the correct way
// to do it: that non-widening is load-bearing and stays. But `PERSON_WORDS` is a list of
// HUMANS, and with a human subject «نفسه» has a THIRD reading the object reading does not:
// the emphatic reflexive, "himself". So the anchor that excludes the object reading admits
// «أبوي نفسه واقف معنا بالمحل» ("my dad HIMSELF is standing with us"), and alongside it the
// idiom «نفسه ضايق» = "he is fed up". 3,654 ordinary strings reached the WhatsApp alert.
//
// The only thing standing between them and the ambulance was `NOT_THE_IDIOM`, a CLOSED LIST
// OF TEN COMPLEMENTS: «صاحبي نفسه ضايق من الخدمة» was quiet because «خدمه» is one of the ten,
// and «صاحبي نفسه ضايق من الأسعار» was an emergency because «اسعار» is not. That is exactly
// the "list of sentences somebody thought of" this whole change exists to kill, and it cannot
// be finished — the complements are open.
//
// SO THE GUARD IS GRAMMAR INSTEAD OF VOCABULARY, on two axes:
//
//   THE VERB. «ضايق»/«ضاق»/«يضيق» with «نفس» IS the fed-up idiom, and «واقف»/«بيقف» with a
//   human is the emphatic reflexive standing somewhere. Neither is separable from the airway
//   reading by anything to their right. They are dropped from the THIRD PERSON only; the
//   first-person «نفسي ضايق», where the sender is reporting their own body and the fail-safe
//   argument is strongest, is unchanged.
//
//   AGREEMENT. نَفَس ("breath") is grammatically MASCULINE whoever it belongs to, so a
//   FEMININE predicate after «نفسها» is about the woman, not about her breath: «أختي نفسها
//   مقطوعة من الشغل» ("cut off from work") cannot be an airway, while «أختي نفسها مقطوع»
//   would be. Hence the masculine forms only, with a right boundary so «مقطوع» cannot match
//   inside «مقطوعه».
//
// WHAT THIS COSTS, NAMED — ON BOTH AXES, BECAUSE THE FIRST VERSION OF THIS PARAGRAPH NAMED
// ONLY ONE OF THEM AND THE OTHER ONE COSTS A DAUGHTER.
//
//   THE VERB AXIS: the bare «ابني نفسه ضايق» from a parent no longer fires. It is a
// real reading and this is a deliberate trade.
//
//   THE AGREEMENT AXIS, WHICH WAS NOT NAMED AND IS THE MORE EXPENSIVE OF THE TWO: «بنتي نفسها
// مقطوعة» — *my daughter's breath is cut* — is SILENT, while «بنتي نفسها مقطوع» fires. Thirty
// driven strings across «بنتي / ابنتي / اختي / زوجتي / امي / الطفله» are silent for this
// reason alone. The grammar is right — نَفَس is masculine whoever it belongs to, so a feminine
// predicate is about the woman and «أختي نفسها مقطوعة من الشغل» is a job, not an airway — but
// the rule asks a frightened parent to get agreement right on a noun whose gender they cannot
// hear, about a daughter, in a hurry, in a register that adds the ة freely. It is kept because
// the alternative is a closed list of complements («من الشغل», «من الدوام», …) and that list
// is exactly what this file is removing. IT IS KEPT AND IT IS WRITTEN DOWN, which is the part
// that was missing. Everything else that parent types about that daughter fires: «بنتي ما
// تقدر تتنفس», «بنتي تختنق», «بنتي حلقها مقفل», «بنتي حلقها ضايق», «بنتي عندها صعوبة في
// التنفس», «بنتي لسانها متورم», «بنتي شفايفها زرقاء» — all driven, all firing.
//
// Everything else a parent says still does —
// «ابني ما يقدر يتنفس», «ابني ما عاد يتنفس», «ابني عنده ضيق نفس», «ابني عنده صعوبة في
// التنفس», «حلقه يقفل», «حلقه مقفل», «شفايفه زرقاء», and «ابني يختنق», which is new below and
// is what a parent actually types. Trading one ambiguous phrasing for an unambiguous one that
// was previously silent is a net gain in what this file can hear.
/** The CUT verbs, masculine only (see agreement above), and never "cut off FROM" something —
 *  «عن» is the particle of ceasing an activity («انقطع عن الدوام»), never of a breath. */
const BREATH_CUT_THIRD = "(?:مسدود|مقطوع|انقطع)(?![ء-ي])(?! ?عن(?![ء-ي]))";
const BREATH_TIGHT_THIRD =
  `(?:${PERSON_WORDS})[^.،,؛!؟\\n]{0,12}?نفس(?:ه|ها|هم) ?${BREATH_CUT_THIRD}`;

/** CHOKING / SUFFOCATING — THE ENTIRE FAMILY WAS ABSENT IN BOTH LANGUAGES. «ابني يختنق» is
 *  the sentence a parent types when a child's airway is blocked by a swelling throat, and no
 *  detector on any surface heard it. It is not a missing value in a slot; it is a missing
 *  signal, and it is the most urgent one this file can receive.
 *
 *  «اختنق» also describes traffic and stuffy rooms — «اختنقت الشوارع», «الجو مختنق»,
 *  «المكان مختنق بالزحمة» — so it is admitted only with a PERSON or a first-person marker in
 *  front of it, the same anchor the third-person breath uses. A bare «مختنق» with no subject
 *  is deliberately NOT admitted: with no subject the room reading is the common one. */
const CHOKE_VERB = "(?:يختنق|تختنق|بيختنق|بتختنق|بختنق|نختنق|اختنقت|اختنق|مختنقه|مختنق)";
const CHOKING = `(?:${PERSON_WORDS}|انا|اني|احس|حاسس|حاسه|صار|صرت|بدا|كاد)[^.،,؛!؟\\n]{0,16}?${CHOKE_VERB}`;

/** «كتمة» — chest tightness. The proof's own vocabulary helper already classified it as
 *  naming an airway while the module could not detect it at all, which is the two-lists bug
 *  in its purest form. It is ALSO the ordinary word for stuffy weather, so it is bound to a
 *  personal frame («عندي»/«فيني»/«يجيني») from the shared `FRAME_WORDS`, with the place nouns
 *  of `NOT_A_PERSON` forbidden in the gap — «الجو فيه كتمة» and «أحس بالجو كتمه» are remarks
 *  about the room, and that is precisely why `NOT_A_PERSON` exists. */
const STUFFY =
  `(?:${FRAME_WORDS})(?:(?!${NOT_A_PERSON})[^.،,؛!؟\\n]){0,12}?كتمه(?![ء-ي])` +
  `|كتمه ?(?:في ?)?(?:ال)?نفس${NOT_THE_SAME}`;

/** THROAT — «حلقي يقفل» in every person and every closing verb. «انسد»/«سكرت»/«قفل» are the
 *  perfect forms of verbs the list already carried in the imperfect: the same slot, unfilled. */
// THE SAME MISSING LEFT BOUNDARY, ON THE BODY NOUNS. `normalizeAr` folds ة→ه, so «الحلقة»
// (an episode, a ring, a discussion circle) becomes «الحلقه» — which is «حلق» + the
// possessive «ه», i.e. "his throat" — and «الحلقة قفلت» ("the episode ended") raised
// «انسداد الحلق». A body noun carrying a possessive NEVER also carries the article, so the
// boundary is exactly right; the proclitics «و/ف/ب/ل» are inside it, as with `NEG`.
const AR_B = "(?<![ء-ي])[وفبل]?";
const THROAT = `${AR_B}(?:حلق|زور|حنجرت|بلعوم)`;
const THROAT_CLOSES =
  // «مقفل»/«مسكر» are the ORDINARY GULF PASSIVE PARTICIPLES — «حلقي مقفل» is how the Gulf
  // says "my throat is shut". The list carried the active «قافل» and the Standard «مسدود»
  // and neither passive form, so the commonest phrasing of the commonest anaphylaxis sign
  // was silent. The same slot, unfilled, in a list that had two of its three shapes.
  "(?:يقفل|تقفل|يتقفل|بيقفل|بتقفل|اتقفل|قافل|قافله|قفل|قفلت|مقفل|مقفله|يضيق|تضيق|يتضيق|بيضيق|ضاق|ضاقت|" +
  "يتورم|تتورم|بيتورم|متورم|تورم|مسدود|مسدوده|انسد|انسدت|يسكر|تسكر|بيسكر|سكر|سكرت|اتسكر|مسكر|مسكره)";
const THROAT_CLOSING = `${THROAT}${POSS} ?${THROAT_CLOSES}`;

/** «حلقي ضايق» / «ابني حلقه ضايق» — A TIGHT THROAT, DEFERRED UNDER ONE SPELLING AND MISSED
 *  UNDER THE COMMONER ONE. The header above deferred «حلقي ضيق» by name; it never mentioned
 *  «ضايق», which is the ordinary Gulf participle and the form a parent types. 6,624 driven
 *  strings in that shape were silent in all three versions of this module.
 *
 *  THE DEFERRAL WAS RIGHT ABOUT THE HOMOGRAPH AND WRONG ABOUT THE REMEDY. «حلقة ضيقة» is a
 *  narrow ring and «حلقات» are onion rings, so these four words cannot join `THROAT_CLOSES`,
 *  where they would be admitted with no subject at all: driven, a bare «حلقه ضيق» and «ابغى
 *  حلقه ضيقه للتغليف» both fire the moment they are added there. `AR_B` protects «الحلقة
 *  ضيقة» — a noun carrying the article is not a noun carrying a possessive — but the BARE
 *  ring slips past it, because «حلقه» is «حلق»+«ه» whichever word it came from.
 *
 *  So the guard is the one this file already uses twice, and it is a subject and not a
 *  complement list: the throat is either THE SENDER'S OWN («حلقي», first person, where a ring
 *  has no reading) or it belongs to A PERSON THE MESSAGE NAMES. A ring belongs to an order.
 *  «ابغى حلقه ضيقه» has no person in it and stays quiet; «ابني حلقه ضايق» has one and fires.
 *
 *  WHAT THIS COSTS, NAMED: «عندكم حلقه ضيقه؟» from a customer who wants a narrow ring for
 *  packaging is still quiet, but «حلقي ضيق» said about an EARRING — «حلق» is also jewellery —
 *  now fires. That is over-escalation on a sentence nobody sends to a restaurant, and it is
 *  the direction this file chooses when it has to choose. */
const THROAT_TIGHT = "(?:ضايق|ضايقه|ضيق|ضيقه)(?![ء-ي])";
const THROAT_TIGHT_ANCHORED =
  `${THROAT}ي ?${THROAT_TIGHT}` +
  `|(?:${PERSON_WORDS}|انا|اني|احس|حاسس|حاسه|صار|صرت|بدا)[^.،,؛!؟\n]{0,12}?${THROAT}${POSS} ?${THROAT_TIGHT}`;

/** SWELLING NOW — lips / tongue / face / eyes / throat, in every person. «شفتي» stays FIRST
 *  PERSON ONLY on purpose: the singular «شفة» with a third-person suffix is «شفته», which is
 *  also «شفته» = "I saw it" — «الخبز شفته ينتفخ» ("I saw the bread rising") would have become
 *  an anaphylaxis. Nobody says «شفته» for a swelling lip anyway; they say «شفايفه». */
// «بلعوم»/«زور»/«حنجرت» were in the THROAT list and not this one, so «بلعومي منتفخ» was
// silent while «بلعومي يتورم» fired: the same body part, two verb lists, one of them short.
const SWELL_BODY = `(?:${AR_B}(?:شفايف|لسان|وش|وجه|عين|حلق|بلعوم|زور|حنجرت)${POSS}|شفتي)`;
// «متورم» — THE ORDINARY PAST PARTICIPLE FOR *SWOLLEN*, AND THE ONE WORD THIS LIST DID NOT
// HAVE. `THROAT_CLOSES` carries it, so «ابني حلقه متورم» fired and «ابني لسانه متورم» — the
// textbook angioedema report, a swollen tongue — did not. Two lists over the same body, one of
// them a word short: the exact bug this file exists to end, surviving inside the commit that
// re-read the family. It is a pure widening — «متورم» describes a body and nothing else in a
// restaurant — and it needs no guard beyond the one `SWELL_BODY` already applies.
const SWELLS =
  "(?:متورم|متورمه|تورم|تورمت|تتورم|يتورم|بيتورم|ورم|بيورم|منتفخ|منتفخه|انتفخ|انتفخت|ينتفخ|بينتفخ|تنتفخ)";
/** «كبر»/«كبرت» IS "GREW", NOT "SWELLED", and it is not a synonym of the nine verbs above:
 *  Arabic says a swelling is «متورم»/«منتفخ». On the possessive axis it carried «عينها كبرت»
 *  ("her eyes went wide with joy") and «وجهه كبر» ("his face filled out from the food") into
 *  the anaphylaxis label — 72 driven strings, none of them about a body swelling. It was
 *  first-person-only before this family gained the person axis, and the axis was added
 *  without the verb list being re-read.
 *  It is kept for the LIPS and the TONGUE, where "got bigger" has no ordinary reading and is
 *  a real report of angioedema, and dropped for the face, eyes and throat, where it does. */
const GREW = "(?:كبرت|كبر)(?![ء-ي])";
const GREW_BODY = `(?:${AR_B}(?:شفايف|شفاه|لسان)${POSS}|شفتي)`;
const SWELLING = `${SWELL_BODY} ?${SWELLS}|${GREW_BODY} ?${GREW}`;

/** CYANOSIS — «شفايفه زرقاء». THIS ONE IS A NEW SIGNAL, NOT A WIDER SLOT, and it is here
 *  because it was driven: «ابني شفايفه زرقاء» is a father reporting the textbook sign that a
 *  child has stopped getting oxygen, and it fired nothing in any detector on any surface. It
 *  is the message you send when the person can no longer speak for themselves, so it cannot
 *  wait for the airway vocabulary to be reached some other way.
 *  Bound to lips / face / tongue / fingers ONLY — «عينه زرقاء» is an eye COLOUR, and «لونه
 *  أزرق» is just as likely to be a drink. */
const BLUE = "(?:زرقاء|زرقا|زرقه|زرق|ازرق|مزرق|مزرقه|تزرق|زرقت|يزرق)";
const CYANOSIS = `${AR_B}(?:شفايف|شفاه|وجه|وش|لسان|اصابع|اظافر)${POSS} ?(?:صار|صارت|بدت|بدا|تحول|صايره)? ?${BLUE}`;

const EMERGENCY_PATTERNS: Array<[RegExp, string, "hard" | "soft"]> = [
  // AIRWAY / BREATHING NOW — the composed cross product above, in one alternation. Every
  // shape needs a breath word, so a message with none of them cannot reach this line.
  [new RegExp(`${CANNOT_BREATHE}|${CANNOT_TAKE_BREATH}|${BREATHING_STOPPED}|${BREATHING_DIFFICULTY}|${HARD_TO_BREATHE}`), "صعوبة تنفس", "hard"],
  // Breath tight — first person bare, third person only with a person named (see above).
  [new RegExp(`نفسي ?${BREATH_TIGHT}${NOT_THE_IDIOM}|${BREATH_TIGHT_THIRD}`), "ضيق نفس", "hard"],
  // Throat closing, in every person.
  [new RegExp(`${THROAT_CLOSING}|${THROAT_TIGHT_ANCHORED}`), "انسداد الحلق", "hard"],
  // Choking / suffocating, with a person named — the family that was absent in both arms.
  [new RegExp(CHOKING), "اختناق", "hard"],
  // Chest tightness reported in a personal frame («عندي كتمة»), never about the room.
  [new RegExp(STUFFY), "كتمة/ضيق نفس", "hard"],
  // Swelling NOW — lips / tongue / face / eyes / throat actively swelling, in every person.
  [new RegExp(SWELLING), "تورم", "hard"],
  // Blue lips / face — oxygen, not swelling, and its own label so the audit row says so.
  [new RegExp(CYANOSIS), "ازرقاق (نقص أكسجين)", "hard"],
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
  // THE PERSON AXIS REACHES HERE TOO. «ودّيناه المستشفى» was listed and «ودّوه المستشفى» was
  // not — the same first-person freeze as the airway family, in the family a bystander is
  // most likely to use, because the person being taken to hospital is by definition not the
  // one typing. Soft, so a genuine history («قبل سنة ودّوه المستشفى») is still vetoed.
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
// AND THE SAME WIDENING REACHED A COMPLAINT ABOUT THE VENTILATION. «hard to breathe» and
// «problems breathing» carry no person and no tense, so «it was hard to breathe inside», «we
// had issues with breathing space in the kitchen» and «having trouble breathing in the smoking
// section» — a restaurant describing its own dining room — each raised a full anaphylaxis.
// The tell is a LOCATIVE: an airway report says WHO cannot breathe, a ventilation complaint
// says WHERE. So the two nominal forms refuse a following place phrase, and «breathing» refuses
// «space»/«room». Prepositions are a CLOSED grammatical class, which is why a lookahead over
// them is not the open-ended complement list this change is removing elsewhere.
// «can't breathe» is deliberately left unguarded — «I can't even breathe in there» still fires.
// It is the one sentence in this file that is never worth a second guess.
// «skin» now needs a possessive: «the skin looks blue on the chicken» is a kitchen report.
//
// ============================================================================
// AND THAT GUARD WAS WRITTEN FOR THE TWO SHAPES AN AUDIT HAD LISTED, AND CERTIFIED AGAINST A
// CORPUS THAT WAS 100% ARABIC. WHICH IS THE ARABIC BUG, ONE LANGUAGE OVER.
//
// The four alternatives added beside the two guarded ones — `struggling|straining|fighting to
// breathe`, `gasping for air|breath`, `short(ness)? of breath`, `(?:is |are |…)?not breathing`
// — carried no person, no tense and no locative. Driven against an ordinary restaurant ENGLISH
// corpus built the way §8 of the proof builds the Arabic one (vocabulary and homographs first,
// sentences never), 616 of 1,325 ordinary strings raised a full allergy emergency and every one
// of them was quiet in production:
//
//   «the wine is not breathing yet»                      «the dough is not breathing under the cloth»
//   «the extractor fan is not breathing»                 «the tandoor is not breathing well»
//   «customers were struggling to breathe in the hall»   «we were gasping for air in the kitchen»
//   «the queue left me short of breath»                  «that double shift left me short of breath»
//
// «breathing» is a homograph in English the same way «نفس» is in Arabic: wine breathes, dough
// breathes, an oven breathes, a room breathes. The rule this file already states applies
// unchanged — REQUIRE THE BREATH WORD, AND WHERE IT IS A HOMOGRAPH SAY WHICH READING BY A
// PROPERTY OF THE GRAMMAR. In English that property is the SUBJECT: a wine, a dough and an
// extractor fan are not people, and an airway report names a person or it is the whole message.
//
// SO THE GUARD IS A CLOSED PERSON CLASS ON THE LEFT (`EN_PERSON`, below — the English twin of
// `symptom-frames.PERSON_WORDS`), NOT AN OPEN LIST OF THINGS THAT BREATHE. The things are
// open — wine, dough, sourdough, starter, cheese, oven, tandoor, fan, compressor, engine — and
// enumerating them is the anti-pattern this file exists to kill. The people are enumerable, and
// this file already enumerates them in Arabic and, for `choking|suffocating`, in English: that
// alternative was written with a person anchor from the start and it contributes ZERO false
// positives to the 1,325-string corpus. The guard below is that alternative's guard, applied to
// the four that were shipped without it.
//
// WHY THAT DOES NOT SILENCE THE BARE FORMS, WHICH IS THE OBJECTION THAT KILLED THE OBVIOUS FIX.
// A person anchor alone silences «not breathing», «struggling to breathe», «gasping for air»,
// «short of breath» — the subjectless forms the proof asserts as must-fire, and it is right to:
// they are what someone types when they have no words left. So the anchor has the escape hatch
// THIS FILE ALREADY USES FOR THE EMERGENCY NUMBERS one screen down — the phrase ALONE, as the
// whole message, with at most one word of urgency, fires with no subject at all. «not breathing»
// fires; «the wine is not breathing yet» does not. That is the difference the subject makes, and
// it is a property of the message, not a list of complements.
//
// THE LOCATIVE HALF STAYS, AND IT REACHES TWO MORE ALTERNATIVES. A person anchor cannot separate
// «we were gasping for air in the kitchen» from «he is gasping for air» — «we» is a person. The
// tell there is the one already named above: WHERE, not WHO. So `struggling|straining|fighting
// to breathe` and `gasping for air|breath` take the same closed-class place lookahead the two
// nominals already have.
//
// WHAT THIS COSTS, NAMED, AND DRIVEN — the same discipline the Arabic design calls got:
//
//   * A PLACE-QUALIFIED AIRWAY REPORT in exactly those two shapes: «my son is struggling to
//     breathe in the car» is silent. Everything else that parent can type still fires — «my son
//     can't breathe in the car» (unguarded on purpose), «my son is choking», «my son is not
//     breathing», «my son has difficulty breathing», «his throat is closing».
//   * A NAMED SUBJECT THAT IS NOT A PRONOUN OR A KINSHIP TERM: «Ahmed is not breathing» is
//     silent, because proper names are the one open class here. «he is not breathing», «my son
//     is not breathing», «the child is not breathing» and a bare «not breathing» all fire.
//   * A FIRST-PERSON PRESENT-TENSE «I am short of breath» STILL FIRES even when the cause is a
//     double shift. That is over-escalation and it is the accepted direction: the sender is
//     reporting their own body in the present tense. What no longer fires is the causative
//     frame with an OBJECT pronoun — «the queue left me short of breath» — where the sender is
//     reporting a cause, not a symptom. Subject vs object is grammar; "queue" vs "allergy" is a
//     complement list, and this file does not write those any more.
//   * `shortness of breath` KEEPS NO ANCHOR AT ALL. The -ness nominalisation is clinical
//     register; it has no ordinary restaurant reading, and 0 of the 1,325 ordinary strings
//     contain it. Only the adjectival «short of breath» needed the subject.
//
// The quiet side of this guard is derived in `proof-airway-derivation.test.ts` §5c, from
// ordinary restaurant English, BEFORE the guard was written — which is the discipline this
// file was blocked for missing in Arabic and owed to the other language.
// ============================================================================

/** THE PEOPLE, BY RELATION — the noun half of `EN_PERSON`, and LONG ON PURPOSE. What makes
 *  this a closed class is not its length; it is that every value is A PERSON. It replaced an
 *  open `my \w+`, which was open in the wrong direction — it admitted «my sourdough is not
 *  breathing». A name missing from here is a deaf spot and a one-line fix; an open `\w+` here
 *  is 616 false positives. Driven: `proof-airway-derivation.test.ts` §5 crosses this list
 *  against every possessive and every guarded symptom, so a value dropped from it fails in
 *  the hundreds rather than in silence. */
const EN_KIN =
  "(?:son|daughter|child|kid|baby|toddler|infant|boy|girl|wife|husband|mother|father|mom|mum|" +
  "dad|papa|brother|sister|sibling|spouse|partner|fianc(?:e|é)e?|friend|colleague|co-?worker|" +
  "neighbou?r|customer|guest|client|patient|uncle|aunt(?:ie)?|cousin|" +
  "grand(?:ma|mother|pa|father|son|daughter|child|kid)|granny|nephew|niece|stepson|stepdaughter|" +
  "twin|girlfriend|boyfriend|roommate|flatmate|classmate|student|teacher|nurse|doctor|" +
  "man|woman|lady|person|little one|boss|manager|owner|employee|mate|" +
  "driver|waiter|waitress|chef|cook|staff member)";
/** WHO an English message can be ABOUT — the English twin of `symptom-frames.PERSON_WORDS`,
 *  and closed for the same reason: the people are enumerable and the things that breathe in a
 *  restaurant — wine, dough, sourdough, cheese, oven, tandoor, extractor fan — are not. Kept
 *  as ONE list used by every alternative that needs a subject, because two copies of a person
 *  list is the bug `symptom-frames.ts` exists to document. */
const EN_PERSON =
  // The contractions FIRST — «he's» must not be eaten by «he», which would leave the «s»
  // stranded and the copula unmatched. Longest first, the same ordering rule as `NEG`.
  "(?:he(?:'|’)s|she(?:'|’)s|they(?:'|’)re|we(?:'|’)re|i(?:'|’)m|" +
  "he|she|they|we|i|im|someone|somebody|" +
  `(?:(?:my|his|her|our|their|your|the|a|this) )?${EN_KIN})`;
/** The subject slot: a person, then at most two words of copula/adverb before the symptom —
 *  «he is not breathing», «she is still not breathing», «my son has stopped breathing».
 *  THE `\b` IS LOAD-BEARING AND ITS ABSENCE COST 349 FALSE POSITIVES IN THE FIRST DRAFT OF
 *  THIS GUARD. Written without it — with the contraction as an optional trailing `s` — the
 *  pronoun «i» matched the FIRST LETTER OF THE COPULA and the `s` matched its second, so
 *  «the wine **is** not breathing» supplied its own subject and the anchor admitted every
 *  string it was written to exclude. The contractions are alternatives inside `EN_PERSON`
 *  instead, and the person has to END where a word ends. */
const EN_SUBJ = `(?:${EN_PERSON})\\b (?:\\w+ ){0,2}?`;
/** THE PRESENT TENSE, WHICH IS THIS FILE'S OWN DEFINITION OF ITSELF («the NARROW,
 *  present-tense "this is happening NOW" detector», line 4) AND THE LAST THING SEPARATING
 *  TWO OF THESE PHRASES FROM A REPORT ABOUT LAST NIGHT'S SERVICE. With a person anchor and
 *  a place lookahead both applied, «the smoke was so bad we were gasping for air» and «we
 *  were all short of breath» still fired: «we» is a person and there is no place in them.
 *  What is left is the tense — a ventilation complaint is a report about a shift that is
 *  over, an airway emergency is now — and it is grammar, not a list of causes.
 *  APPLIED TO THREE ALTERNATIVES ONLY: «struggling to breathe», «gasping for air» and the
 *  adjectival «short of breath», where the past reading is the ordinary one. NOT to «stopped
 *  breathing», which is past by nature; NOT to «not breathing», so «he was not breathing when
 *  I found him» still fires; NOT to «can't breathe», which is guarded by nothing at all.
 *  COST, NAMED: «my son was gasping for air» is silent. «my son is gasping for air», «my son
 *  can't breathe», «my son is choking» and a bare «gasping for air» all fire. */
const EN_NOW =
  "(?:is|are|(?:'|’)s|(?:'|’)re|am|(?:'|’)m|keeps|starts|started|suddenly|now|still|" +
  "barely|hardly|just|already|really|very|badly|so)";
/** The subject slot, present tense only — see `EN_NOW`. */
const EN_SUBJ_NOW = `(?:${EN_PERSON})\\b (?:${EN_NOW} ){0,2}?`;

/** A PLACE, not a person. Prepositions are a closed grammatical class; this is the same
 *  lookahead the two nominal forms already carry, shared so the two lists cannot drift. */
const EN_NOT_A_PLACE =
  "(?! (?:in|inside|out|near|around|here|there|with|when|from|during|throughout|because|due)\\b)";

const EMERGENCY_EN_RE =
  new RegExp(
    "\\b(?:" +
    // «can't breathe» — deliberately unguarded, in every spelling. Never worth a second guess.
    "(?:can|could)(?:'|’)?t (?:\\w+ ){0,2}?breathe?|can ?not breathe|can no longer breathe|" +
    "(?:unable|not able) to breathe|" +
    // The four that shipped bare. A person subject, and for the two that a person can say
    // about a ROOM, no place after them.
    `${EN_SUBJ_NOW}(?:struggling|straining|fighting) to breathe${EN_NOT_A_PLACE}|` +
    `${EN_SUBJ_NOW}gasping for (?:air|breath)${EN_NOT_A_PLACE}|` +
    `${EN_SUBJ_NOW}(?:feels? |feeling |gets |getting )?short of breath|` +
    `${EN_SUBJ}not breathing|` +
    // …and the -ness nominal, which has no ordinary restaurant reading and needs no subject.
    "shortness of breath|" +
    // The two the audit's §1F named, unchanged: guarded on the place, not on the person.
    "(?:hard|difficult|tough) to breathe(?! (?:in|inside|out|near|around|here|there|with|when)\\b)|" +
    "(?:difficulty|trouble|problems?|issues?) (?:in |with )?breathing(?! (?:space|room|in|inside|near|around|here|there)\\b)|" +
    "(?:stopped|quit) breathing|" +
    "can(?:no|(?:'|’))?t catch (?:my|his|her|their|our|your) breath|" +
    // Choking / suffocating — person-anchored since it was written, and the model for the four
    // above. `EN_PERSON` replaces its own inline person list so there is one list, not two.
    `(?:${EN_PERSON}) (?:is |are |'?s |was |were )?(?:choking|suffocating)|` +
    "(?:throat|airway) (?:is |are |feels? |feeling |went |going )?(?:closing|closed|swelling|swollen|blocked|tightening|tight)|" +
    "(?:lips?|face|tongue|throat) (?:is |are )?swelling|swelling (?:up )?now|" +
    "(?:lips?|face|tongue|fingers?|(?:(?:his|her|my|their|our|your)(?: (?:son|daughter|child|kid|baby|boy|girl)(?:'|’)s)?|the (?:baby|child|kid)(?:'|’)?s?) skin) (?:are |is |look |looks |went |turned |turning |going )*(?:blue|bluish|purple)|" +
    "anaphylaxis|anaphylactic|allergic reaction now|call (?:an )?ambulance|call (?:9-?1-?1|997|112)|emergency now" +
    ")\\b",
    "i",
  );

/** THE ESCAPE HATCH FOR THE SUBJECTLESS FORMS — the same rule, and the same reasoning, as
 *  `BARE_EMERGENCY_NUMBER_RE` below: the phrase IS the message, which is what someone types
 *  when they have no words left. «not breathing» fires; «the wine is not breathing yet» does
 *  not, because there the phrase is not the message — it has a subject, and the subject is a
 *  wine. The `^` anchor is the whole guard: a symptom that OPENS the message is the topic of
 *  the message, and «the queue left me short of breath» can never reach it.
 *
 *  An elided copula is allowed in front («is not breathing»), a severity adverb with it
 *  («sudden short of breath»), and at most four words of tail behind — «short of breath after
 *  eating», «not breathing please help» — because a message that begins with the symptom is
 *  still about the symptom. The two lookaheads are the only things the tail may not be: a
 *  PLACE, which is the ventilation reading this file already refuses on the right, and the
 *  fixed compounds «breathing room/space» and «choking hazard», which open a message about
 *  the kitchen rota and a message about packaging respectively. */
const EN_BARE_AIRWAY_RE = new RegExp(
  "^[\\s]*(?:(?:is|are|was|were|he(?:'|’)?s|she(?:'|’)?s|i(?:'|’)?m|im|still|now|" +
  "sudden|suddenly|severe|acute|really|very|badly)\\s+){0,2}" +
  "(?:" +
  "not breathing(?! (?:room|space)\\b)|" +
  `(?:struggling|straining|fighting) to breathe${EN_NOT_A_PLACE}|` +
  `gasping for (?:air|breath)${EN_NOT_A_PLACE}|` +
  "short of breath|" +
  "(?:choking|suffocating)(?! (?:hazard|risk|point)\\b)" +
  ")" +
  "(?:[\\s,]+[^\\s]+){0,4}[\\s!?.,’']*$",
  "i",
);

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
  if (EMERGENCY_EN_RE.test(raw) || EN_BARE_AIRWAY_RE.test(raw)) return { fired: true, label: "emergency (EN)" };

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
