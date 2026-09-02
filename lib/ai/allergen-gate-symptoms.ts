// ============================================================================
// MaitreAI — Allergen SYMPTOM / CONDITION detector (additive layer, pure, no I/O)
//
// ⚠️  REVIEW STATUS: PENDING HUMAN/MEDICAL REVIEW — see docs/ALLERGEN_SYMPTOM_REVIEW.md
//     The Arabic term lists below need validation by a native Egyptian-Arabic speaker
//     familiar with food-allergy terminology. That review is tracked (with the exact
//     terms + a sign-off checklist) in docs/ALLERGEN_SYMPTOM_REVIEW.md — NOT buried here.
//
//     NO LONGER FLAG-GATED. `allergen_symptom_detection` was checked in one of the nine
//     places that call this detector and ignored in the other eight, so its OFF position
//     produced a turn that contradicted itself — the safety bridge telling the customer to
//     hold while the Brain took the order. It is unconditional now, which also means there
//     is no runtime kill switch for the lists below: removing a term is a deploy.
//     The `allergen_symptom_detection` flag was previously ON in prod for Wesaya. This
//     is SAFE pending review because of the FAIL-SAFE CONTRACT below; the review
//     improves recall + reduces over-escalation, it does not gate a safety regression.
//
//     FAIL-SAFE CONTRACT (do not weaken): this layer is ADDITIVE and may ONLY cause a
//     conservative escalation to a human. A match → escalate_to_human (no order
//     confirmed, nothing marked "safe", nothing auto-cleared — see
//     customer-turn.ts forcedAllergenSafetyResult). A miss → falls back to the base
//     gate + the never-say-safe output guard, i.e. never worse than the flag being
//     OFF. Recall is the design goal: over-escalation is safe; under-escalation is
//     dangerous. The base gate (lib/ai/allergen-gate.ts) is a separate, reviewed
//     layer and stays byte-identical + ON.
//
// This module is a SEPARATE layer from lib/ai/allergen-gate.ts (which stays
// byte-identical). It fires on independent signal classes the base gate misses
// because they have no co-occurring AVOIDANCE_INTENT_RE:
//
//   SET 1 — Symptom / consequence language (choking, swelling, epipen, hospital…)
//   SET 2 — Named medical conditions (celiac, lactose, favism/G6PD)
//   SET 3 — English + Franco-Arabic (allergic, 7asas*, hasaseya, betkhane2…)
//   SET 4 — Child + strict-avoidance + allergen triple conjunction
//
// Designed to be called AFTER detectAllergenAvoidance — only when the base gate
// did NOT fire. If EITHER fires, the combined result is treated as a safety hit.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

export interface SymptomHit {
  fired: boolean;
  /** A representative term from the detected signal (for an honest acknowledgement),
   *  or null when we detected a signal but can't isolate a clean label. */
  term: string | null;
}

// ---------------------------------------------------------------------------
// SET 1: Symptom / physical-consequence language — fires standalone.
// Each sub-pattern covers a real phrase Egyptian customers use to describe an
// allergic reaction. No co-occurring allergen term required.
// ---------------------------------------------------------------------------
const SYMPTOM_TERMS: { re: RegExp; label: string }[] = [
  // Throat / airway — original patterns
  { re: /(?:زور|حلق|حنجر)(?:تي|ي|ه)?(?:\s+(?:بي?تضي?ق|بي?نتفخ|بي?قفل|بي?غلق|بتاثر|بت(?:ضيق|نتفخ|قفل|غلق)))/, label: "ضيق في الحلق" },
  { re: /ضيق(?:\s+في\s+|\s+)(?:التنفس|النفس|الصدر)/, label: "ضيق في التنفس" },
  { re: /صعوب[هة]\s+(?:في\s+)?(?:التنفس|النفس|البلع)/, label: "صعوبة في التنفس" },
  { re: /(?:مقدرش|مش\s+قادر|مبقدرش|ماقدرش)\s+(?:اتنفس|ابلع)/, label: "صعوبة في التنفس" },
  // Can't breathe — ADDED: Egyptian colloquial "مش عارف اتنفس" / "مبعرفش اتنفس"
  { re: /(?:مش\s+عارف|مبعرفش|مش\s+عارفه?|مبقدرش|مقدرش)\s+(?:اتنفس|انفس)/, label: "صعوبة في التنفس" },

  // Past-tense airway closure — ADDED: اتقفل/اتسد co-occurring with throat/chest body part.
  // Catches "حلقي اتقفل" / "زوري اتسد" / "صدري اتقفل" reported after an incident.
  { re: /(?:(?:حلق|زور|حنجر|نفس|صدر)(?:ي|تي|ه|ها)?\s+(?:اتقفل[ت]?|اتسد[ت]?)|(?:اتقفل[ت]?|اتسد[ت]?)\s+(?:في\s+)?(?:(?:ال)?(?:حلق|زور|حنجر|نفس|صدر)))/, label: "ضيق في الحلق" },

  // Choking / airway emergency — ADDED: covers اختناق / بتخنق / بيخنق / بختنق / بخنق / نفسي بيقف / ربو etc.
  // بخنق = ب+خ+نق; بختنق = ب+خت+نق; بتخنق/بيخنق = بت/بي+خنق — covered by separate alternates.
  // Past-tense اتخنق/اتخنقت / present باتخنق/باتخنقت ADDED (reported after-the-fact incidents).
  { re: /(?:اختناق|(?:بت|بي)خنق(?:ني)?|ب(?:خت|خ)نق(?:ني)?|(?:ب)?اتخنق[ت]?|خنق[هة]|نفسي\s+(?:بيقف|بيتقطع)|مش\s+لاحق\s+نفسي|كتم[هة]\s+(?:في\s+)?(?:صدر|نفس|حلق|زور)|صدري\s+بيقفل|صفير\s+في\s+النفس|ازم[هة]\s+صدر|(?<![ء-ي])(?:ال)?ربو(?![ء-ي]))/, label: "ضيق في التنفس" },

  // Swelling — original انتفاخ/تورم patterns
  { re: /(?:وجه|وشي?|عيني?|شفايف|شفه|لسان)(?:\s+\S+)?\s*(?:بي?نتفخ|بينتفخ|انتفخ|بتورم|اتورم|بيتورم)/, label: "تورم" },
  { re: /(?:انتفاخ|تورم)\s+(?:في\s+)?(?:الوجه|الوش|الشفاه|اللسان|العين|الحلق)/, label: "تورم" },
  { re: /بي?نتفخ(?:لي|لنا|ي)?/, label: "تورم" },

  // Swelling — ADDED: ورم/ورمت/بيورم/بيورملي forms missed by original patterns
  { re: /(?:(?:وش|وجه|شفايف|عين|لسان)(?:ي|ه)?\s+(?:ورم[ت]?|بيورم(?:لي|لنا)?)|ورم[ت]?\s+(?:في\s+)?(?:الوجه|الوش|الشفاه|اللسان|العين|الحلق)|بيورم(?:لي|لنا)?|ورمت)/, label: "تورم" },

  // Skin reaction — original طفح / حكة
  // A WORD, NOT A RUN OF LETTERS — and for «حبوب», a body as well.
  //
  // This read `(?:طفح|حبوب|حكه|حكة|هرش|اكزيما)` with the qualifier OPTIONAL, matched anywhere
  // in the message. Arabic has no \b, so every one of these fired on an ordinary sentence:
  //
  //   «عندكم خبز حبوب كاملة؟»   do you have whole-grain bread?      → skin rash
  //   «الطبق ده محبوب عندنا»     this dish is popular (محبوب)         → skin rash
  //   «ضحكة حلوة»                nice laugh (ضحكه contains حكه)       → skin rash
  //   «طفح الكيل»                enough is enough — a fixed idiom     → skin rash
  //
  // «حبوب» is the worst of them: pills, grains AND pimples, and the grain reading is the one
  // a restaurant hears all day. It now needs a body or a skin word with it. The others need
  // only to be words rather than fragments.
  // A PERSON HAS TO BE IN THE SENTENCE — and the fix note above claimed this was already
  // handled. It was not: it said «طفح الكيل» was covered because "the others need only to be
  // words rather than fragments", and «طفح» in «طفح الكيل» IS a word. «طفح الكيل من التأخير
  // هذا» ("enough of this delay") is the single most likely sentence from a customer who has
  // had it with a late order, and it was answered with an allergy questionnaire, a kitchen
  // note and a page to a human.
  //
  // «اكزيما» and «هرش» stand alone — eczema and itching-scratching have no second reading.
  // «طفح» and «حكه» need either a body part or the frame Arabic uses to report a symptom
  // («عندي»، «طلع لي»، «جاني»، «صار لي»، «فيني»), which is how anyone actually says it.
  { re: /(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?(?:هرش|اكزيما)(?![ء-ي])/, label: "طفح جلدي" },
  { re: /(?:(?:عندي|فيني|جاني|جالي|بيجيني|بيجيلي|يجيني|يجيلي|بتجيني|تجيني|بييجي|طلع\s*لي|ظهر\s*لي|صار\s*لي|طالع\s*لي|احس\s*ب|حاسس\s*ب)[^.،,؛!؟\n]{0,20}(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?(?:طفح|حكه)(?![ء-ي])|(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?(?:طفح|حكه)(?![ء-ي])[^.،,؛!؟\n]{0,20}(?:جلد|بشرت|جسم|وجهي|وشي|ايدي|يدي|رقبت|صدري|بطني|رجلي))/, label: "طفح جلدي" },
  { re: /(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?حبوب(?![ء-ي])(?=[^.،,؛!؟\n]{0,24}(?:جلد|وجه|وش|بشر|جسم|ايد|يدي|رقب|صدر|رجل|من\s+(?:ال)?(?:اكل|طعام|وجب|صنف|طبق)))|(?:جلدي|وجهي|وشي|بشرتي|جسمي|ايدي|رقبتي)[^.،,؛!؟\n]{0,12}(?<![ء-ي])حبوب(?![ء-ي])|(?:طلع|طلعت|ظهر|ظهرت|جاني|جاتني)\s*(?:لي|لنا)?\s*(?:ال)?حبوب(?![ء-ي])/, label: "طفح جلدي" },
  { re: /جلد[ي]?\s+(?:بي?حمر|بيتاثر|بي?تبقع)/, label: "طفح جلدي" },
  // WORD BOUNDARIES, because «rash» is inside «Rasheed» and «hives» is inside «chives».
  // A customer giving their name, or ordering chives on a salad, was reported as a rash.
  { re: /\b(?:urticaria|hives|rash|rashes)\b/, label: "طفح جلدي" }, // English

  // Skin reaction — ADDED: احمرار / ارتيكاريا / جسمي بيقلب / بقع حمرا
  // «احمرار» ON A PERSON. In a restaurant the ordinary reading is the food: «احمرار في
  // اللحم يعني مو مستوي» ("redness in the meat means it isn't cooked") was a skin reaction.
  { re: /(?:احمرار[^.،,؛!؟\n]{0,12}(?:جلد|وجه|وش|بشر|جسم|ايد|يدي|رقب|عيون|عين|شفا|خد)|(?:جلد|وجه|وش|بشر|جسم|ايد|يدي|رقب|عيون|عين|شفا|خد|صدر|رجل)\S*[^.،,؛!؟\n]{0,12}احمرار|ارتي?كاريا|جسم[يه]\s+بيقلب|بقع\s+حمرا)/, label: "طفح جلدي" },

  // Anaphylaxis / emergency — original
  { re: /(?:epipen|epinephrine|اوتوانجكتور)/, label: "حساسية شديدة" },
  { re: /(?:anaphylaxis|anaphylactic)/, label: "حساسية شديدة" },
  { re: /حساسي[هة]\s+(?:شديد[هة]|حاد[هة]|خطير[هة])/, label: "حساسية شديدة" },

  // Emergency — ADDED: ودوني المستشفى / حقنة حساسية / ادرينالين (standalone — specific enough)
  { re: /ودوني\s+(?:ال)?(?:مستشفي|مستشفى)|حقن[هة]\s+حساسي[هة]|ادرينالين/, label: "حساسية شديدة" },

  // Hospital/ER after food — original (اكل/طعام only); طوارئ→طواري after normalizeAr (ئ→ي)
  { re: /(?:مستشفي|مستشفى|طواري|اسعاف)\s+(?:من|عشان|بسبب)\s+(?:اكل|طعام)/, label: "رد فعل تحسسي" },

  // Hospital/ER after allergen — ADDED: broader (any allergen; allows ال article)
  // Note: normalizeAr maps ئ→ي so "الطوارئ" becomes "الطواري" — pattern uses طواري.
  // سوداني / فول سوداني ADDED (peanuts — most common Egyptian term, most critical allergy).
  { re: /(?:(?:ال)?(?:مستشفي|مستشفى|طواري|اسعاف))\s+(?:من|عشان|بسبب|بعد|لما)\s+(?:ما\s+)?(?:(?:ال)?(?:اكل|طعام|بندق|فستق|لوز|كاجو|جوز|مكسرات|فول|سوداني|فول\s+سوداني|لبن|حليب|جلوتين|قمح|بيض|سمسم|صويا|سمك|جمبري|قشريات))/, label: "رد فعل تحسسي" },

  // Other anaphylaxis signals — original
  { re: /(?:رد\s+فعل|reaction)\s+(?:تحسسي|allergic)/, label: "رد فعل تحسسي" },
  { re: /بي?غمى\s+عليه|بفقد\s+وعيي?|بغيب\s+عن\s+الوعي/, label: "رد فعل تحسسي" },

  // Vomiting linked to specific food — original (narrow)
  { re: /(?:قي[ءئ]|اتقيا?[تث]|بتقيا?[تث])\s+(?:من|بعد|لما)\s+(?:ما\s+)?(?:اكل|اكلت)/, label: "رد فعل تحسسي" },

  // Lactose/dairy triggers symptom — ADDED: "اللاكتوز بيتعبني" / "اللبن بيوجعني" etc.
  { re: /(?:اللاكتوز|اللبن|الحليب|منتجات\s+الالبان)\s+(?:بيتعبني|بيوجعني|بيضرني|بياذيني|بيأذيني|بيعملي\s+مشكله?|مش\s+ماشي\s+معي)/, label: "عدم تحمل اللاكتوز" },
];

// ---------------------------------------------------------------------------
// SET 2: Named medical conditions — fire standalone.
// ---------------------------------------------------------------------------
const CONDITION_TERMS: { re: RegExp; label: string }[] = [
  // Celiac
  { re: /(?:celiac|coeliac|سيلياك|سيلياكي[هة]?|سيليك|مرض\s+الزراعي[هة]?)/, label: "مرض السيلياك" },
  { re: /حساسي[هة]\s+(?:الجلوتين|القمح|الدقيق)/, label: "حساسية الجلوتين" },

  // Lactose intolerance
  { re: /(?:lactose\s+intolerance|lactose\s+intolerant)/, label: "عدم تحمل اللاكتوز" },
  { re: /(?:عدم\s+تحمل|حساسي[هة])\s+(?:اللاكتوز|الحليب|اللبن|منتجات\s+الالبان)/, label: "عدم تحمل اللاكتوز" },
  { re: /(?:lacto(?:se)?-?intol|dairy\s+(?:free|allergy|intol))/, label: "عدم تحمل اللاكتوز" },

  // Favism / G6PD deficiency — original entries
  { re: /(?:g6pd|g\.6\.p\.d|فيفازم|فافيسم|favism)/, label: "مرض الفول" },
  { re: /نقص\s+(?:انزيم\s+)?(?:g6pd|جي\s*6\s*بي\s*دي|g\.6\.p\.d)/, label: "مرض الفول" },
  { re: /(?:(?:اكل|اتاكل|ناكل)\s+)?فول\s+(?:بي?مرضني|بي?اذيني|بي?ضرني|ممنوع\s+علي[ها]?)/, label: "مرض الفول" },
  { re: /(?:مسموحش|ممنوع)\s+(?:علي[ها]?\s+)?(?:اكل\s+)?(?:الفول|الفاصوليا)/, label: "مرض الفول" },
  { re: /الفول\s+ممنوع|ممنوع\s+الفول/, label: "مرض الفول" },

  // Favism — ADDED: clinical terminology gap (أنيميا الفول / تفول / نقص الخميرة / بيكسر الدم)
  { re: /انيميا\s+(?:ال)?فول|(?:ال)?فول\s+(?:ال)?انيميا/, label: "مرض الفول" },
  // تفول = G6PD hemolytic crisis from fava beans (Egyptian medical slang)
  // A WORD. «تفول» sits inside the Egyptian «ما تفولش كذا» ("don't say that"). The article
  // is allowed because «التفول» is how the condition is normally named.
  { re: /(?<![ء-ي])(?:ال)?تفول(?![ء-ي])/, label: "مرض الفول" },
  // نقص خميرة الدم / نقص الخميرة = G6PD enzyme deficiency
  { re: /نقص\s+(?:ال)?خمير[هة](?:\s+الدم)?/, label: "مرض الفول" },
  // تكسير/بيكسر الدم = red-blood-cell destruction (G6PD hemolysis)
  { re: /(?:تكسير|بيكسر)\s+الدم/, label: "مرض الفول" },

];

/** English tree-nut/peanut allergy stated as a condition.
 *
 *  MOVED OUT OF THE ARABIC CONDITIONS TABLE. That table is consulted before any English
 *  handling, so this pattern ran ahead of the denial guard and «no nut allergy here» — a
 *  customer answering the allergy question with "no" — was held as a disclosure. */
const ENGLISH_NUT_ALLERGY_RE = /\b(?:tree[\s-]?nut|peanut|nut)\s+allerg(?:y|ies)\b/i;

// ---------------------------------------------------------------------------
// SET 3: English + Franco-Arabic terms — fire standalone.
// ---------------------------------------------------------------------------

// SPLIT IN TWO, BECAUSE ONLY ONE HALF IS DENIABLE.
//
// A denial guard over the whole English arm silenced «I'm not allergic to nuts but my throat
// is closing» — a sentence that denies one thing and reports another, and the reported thing
// is an airway. The first version of that guard shipped with a comment claiming this case
// still fired. It did not.
//
// So the VOCABULARY half — "allergic", "intolerant", "sensitive to X" — is deniable, because
// "no nut allergy here" is an answer to a question. The SYMPTOM half is not: nobody says
// their throat is closing as a denial, and no negation in the same sentence makes it safe to
// ignore.

/** English allergy VOCABULARY. A denial in the same message suppresses this half. */
const ENGLISH_ALLERGY_WORDS_RE = new RegExp(
  [
    String.raw`allerg(?:ic|y|ies|en|ens)`,
    // «sensitive» ON ITS OWN IS NOT AN ALLERGY. "sensitive to price", "a sensitive matter"
    // — this fired on both. It has to name what the sensitivity is to.
    String.raw`sensitiv(?:e|ity)\s+to\s+(?:\w+\s+){0,2}(?:food|foods|nut|nuts|peanut|peanuts|dairy|milk|lactose|gluten|wheat|egg|eggs|soy|sesame|shellfish|fish|seafood)`,
    String.raw`(?:food|nut|peanut|dairy|milk|lactose|gluten|wheat|egg|soy|sesame|shellfish)\s+sensitiv(?:e|ity)`,
    String.raw`intoleran(?:t|ce)`,
  ].map((p) => `\\b(?:${p})\\b`).join("|"),
  "i"
);

/** English SYMPTOMS. Never suppressed by a denial — see above. */
const ENGLISH_SYMPTOM_RE = new RegExp(
  [
    // ASCII apostrophe U+0027 + curly U+2018/2019 + cannot
    String.raw`can[\u0027\u2018\u2019]?t\s+breathe`,
    String.raw`cannot\s+breathe`,
    String.raw`shortness\s+of\s+breath`,
    String.raw`wheez(?:e|es|ing|y|er)?`,
    String.raw`chest(?:\s+\w+)?\s+tight(?:ness)?`,
    String.raw`tight(?:ness)?\s+(?:in\s+(?:my\s+)?)?(?:chest|throat)`,
    String.raw`throat(?:\s+\w+)?\s+(?:clos(?:es?|ing|ed)|tight(?:en(?:ing|s)?|s)?)`,
    String.raw`(?:lips?|face)\s+swells?`,
    String.raw`(?:lips?|face)\s+swelling`,
    String.raw`went\s+to\s+(?:the\s+)?(?:er|e\.r\.|hospital|emergency)\s+after`,
  ].map((p) => `\\b(?:${p})\\b`).join("|"),
  "i"
);

// Franco-Arabic variants (original + ADDED: hasaseya / 7saseya / betkhane2 / weshy byewram etc.)
const FRANCO_AR_RE = new RegExp(
  [
    // Original
    String.raw`7asas(?:eya|iya|ya)?`,
    String.raw`3andi\s+7asas`,
    String.raw`عندي\s+حساسي[هة]`,
    // ADDED: spelling variants and Franco symptom phrases
    String.raw`has{1,2}aseya`,                // hasaseya / hassaseya
    String.raw`7saseya`,                       // abbreviated (no initial vowel)
    String.raw`(?:3ndy|3andi)\s+(?:7asas|has+aseya)`, // 3ndy 7asas / 3andi hasaseya
    String.raw`weshy?\s+bye?wram`,             // وشي بيورم in Franco
    String.raw`nafasy?\s+bye?2af`,             // نفسي بيقف (2=ق in Egyptian Franco)
    String.raw`betkhane?2`,                    // بتخنق (2=ق)
    String.raw`betkhana2`,
    String.raw`m[e]?sh\s+ba3raf\s+atnafas`,   // مش عارف اتنفس in Franco
  ].join("|"),
  "i"
);

// ---------------------------------------------------------------------------
// SET 4: Child + strict-avoidance + allergen triple conjunction.
// ALL THREE must be present. Over-escalation is acceptable; under-escalation
// can harm a child. Does NOT fire on a simple «من غير X» preference.
// ---------------------------------------------------------------------------

/** All allergens known to the system (union of base gate + condition terms).
 *  سوداني ADDED: peanuts (فول سوداني) — most common Egyptian peanut term, highest anaphylaxis risk. */
// EACH TERM A WORD, article and conjunction tolerated. Without the boundary «بيض» matched
// inside «الأبيض» (the white one), so «ابني ما يقربش الرز الأبيض» ("my son won't go near
// white rice") satisfied the allergen leg of the child triple and raised a child-allergy
// hold on a picky eater.
const ALLERGEN_COMBINED_RE =
  /(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?(?:بندق|فستق|لوز|كاجو|جوز|مكسرات|فول|سوداني|لبن|البان|حليب|جلوتين|قمح|بيض|بيظ|سمسم|صويا|سمك|جمبري|قشريات)(?![ء-ي])/;

/** Possessive child / family markers (normalized). */
const CHILD_MARKER_RE =
  /(?:ابني|ابنتي|بنتي|ولادي|عيالي|طفلي|الطفل|البيبي|بيبي|ابنهم|ابنها|بنتها|رضيع)/;

/** Strict-avoidance words (خالص/نهائي/بلاش/مايقربش/ماينفعش ياكل/ممنوع etc.).
 *  - نهايي (NOT نهائي): normalizeAr maps ئ→ي so نهائي→نهايي in normalized text.
 *  - ما\s*يقرب covers both spaced (ما يقربش) and unspaced (مايقربش) forms.
 *  - ما\s*ينفعش covers ياكل/تاكل/ناكل eating verbs and يقرب proximity verb. */
const STRICT_AVOIDANCE_CHILD_RE =
  /(?:خالص|نهايي|بلاش|ما\s*يقرب(?:ها|هو|ني|و)?ش|ما\s*ينفعش\s+(?:يقرب|[يتن]اكل)|ممنوع)/;

/** Doctor-prescribed restriction: الدكتور/الطبيب + restriction verb.
 *  Used in the doctor–child–allergen triple conjunction. */
const DOCTOR_RE = /(?:الدكتور[هة]?|الطبيب[هة]?)/;
const DOCTOR_AVOIDANCE_RE = /(?:مانع|منع|حذر|قال\s+ما\s*(?:[يتن](?:اكل|قرب)))/;

/** An English DENIAL of an allergy, which was being read as a disclosure.
 *
 *  «I am not allergic to anything» and «no nut allergy here» both fired: the English arm
 *  matched `allerg…` and nothing looked left of it. The Arabic denial paths
 *  (`isExplicitAllergyDenial`, `detectAllergyRetraction`) had no English counterpart at all,
 *  so a customer answering "no" to the allergy question was held as if they had said yes.
 *
 *  Narrow on purpose: only an explicit negation immediately before the allergy word, and
 *  only when nothing else in the message states a symptom. "I'm not allergic to nuts but my
 *  throat is closing" must still fire — and does, through the symptom families above. */
export const ENGLISH_DENIAL_RE =
  /\b(?:no|not|non|never|isn'?t|aren'?t|don'?t|doesn'?t|without|free\s+of)\b(?:\s+\w+){0,3}\s*\b(?:allerg(?:ic|y|ies|en|ens)|intoleran(?:t|ce)|sensitiv(?:e|ity))\b/i;

/**
 * Returns true when a child + allergen triple conjunction is detected:
 *   (a) child marker + strict avoidance (ممنوع/بلاش/ماينفعش ياكل/…) + allergen, OR
 *   (b) doctor restriction (الدكتور مانع/منع) + child marker + allergen.
 * Both variants require an explicit allergen term — neither fires on a simple
 * preference ("بنتي عايزة من غير جوز").
 */
function detectChildAllergenPattern(n: string): boolean {
  if (!ALLERGEN_COMBINED_RE.test(n)) return false;
  if (!CHILD_MARKER_RE.test(n)) return false;
  // Branch (a): classic strict-avoidance triple
  if (STRICT_AVOIDANCE_CHILD_RE.test(n)) return true;
  // Branch (b): doctor prescribed restriction for child
  return DOCTOR_RE.test(n) && DOCTOR_AVOIDANCE_RE.test(n);
}

// ---------------------------------------------------------------------------
// Exported detector
// ---------------------------------------------------------------------------

/** Return the label of the first matching SYMPTOM_TERMS entry, or null. */
function matchSymptom(n: string): string | null {
  for (const { re, label } of SYMPTOM_TERMS) {
    if (re.test(n)) return label;
  }
  return null;
}

/** Return the label of the first matching CONDITION_TERMS entry, or null. */
function matchCondition(n: string): string | null {
  for (const { re, label } of CONDITION_TERMS) {
    if (re.test(n)) return label;
  }
  return null;
}

/**
 * INPUT GATE (supplement to detectAllergenAvoidance).
 * Fires when the customer's message contains:
 *   • A physical symptom / anaphylaxis signal (SET 1), OR
 *   • A named medical condition (celiac, lactose, favism, nut allergy) (SET 2), OR
 *   • English / Franco-Arabic allergen language (SET 3), OR
 *   • Child + strict-avoidance + allergen triple conjunction (SET 4).
 *
 * NEVER reads menu data. Pure + deterministic.
 */
export function detectAllergenSymptom(text: string): SymptomHit {
  const n = normalizeAr(text);
  if (!n) return { fired: false, term: null };

  const symptom = matchSymptom(n);
  if (symptom) return { fired: true, term: symptom };

  const condition = matchCondition(n);
  if (condition) return { fired: true, term: condition };

  // THE ENGLISH ARM ONLY, and only after the symptom families above have had their say —
  // so "I'm not allergic to nuts but my throat is closing" still fires, on the throat.
  // A plain denial is not a disclosure; it was being held as one.
  // SYMPTOMS FIRST, and they are not deniable. «I'm not allergic to nuts but my throat is
  // closing» denies the allergy and reports the airway; the airway is what matters.
  if (ENGLISH_SYMPTOM_RE.test(text)) return { fired: true, term: "حساسية" };
  const englishDenial = ENGLISH_DENIAL_RE.test(text);
  if (ENGLISH_NUT_ALLERGY_RE.test(text) && !englishDenial) return { fired: true, term: "حساسية المكسرات" };
  if (ENGLISH_ALLERGY_WORDS_RE.test(text) && !englishDenial) return { fired: true, term: "حساسية" };
  if (FRANCO_AR_RE.test(text)) return { fired: true, term: "حساسية" };

  if (detectChildAllergenPattern(n)) return { fired: true, term: "حساسية الطفل" };

  return { fired: false, term: null };
}
