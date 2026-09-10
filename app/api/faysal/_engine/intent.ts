// ============================================================================
// فيصل / Faysal — INTENT CLASSIFICATION.
//
// TWO PASSES, AND THE ORDER IS THE POINT.
//
//   1. A DETERMINISTIC pre-pass over normalized Arabic. It resolves every turn
//      of the demo script and most real ones, it costs nothing, and it works with
//      no API key at all — so the demo runs on a laptop on a plane.
//   2. The LLM seam (`lib/ai/llm`, `perception` use case — Haiku, maxTokens 200)
//      runs ONLY when the pre-pass is unsure. It returns a closed enum and a
//      handful of extracted entities as JSON, and NOTHING else.
//
// WHAT THE MODEL MAY NOT DO, enforced structurally rather than by instruction:
// it never sees a slot, a price, a doctor, a branch status or an hours record,
// and its output is parsed into a fixed union — an unrecognised label degrades to
// `other`, an unrecognised district is kept only as the patient's own literal
// text, and a carrier is resolved against the network list by the domain, not by
// the model. There is no field on `Classification` through which a fact can
// arrive. That is the same law as `lib/ai/tools.ts`: the model chooses how it
// sounds; code owns what is true.
//
// INBOUND IS NEVER NARROWED ON A DIALECT AXIS (SPEC-2 §11.2). Patients type
// «أبغى» and «إيش» and «كويس» constantly; a matcher that treats those as
// out-of-register is a matcher that goes deaf on half of Riyadh. The linter is an
// OUTBOUND validator only.
// ============================================================================

import { getAdapter, isClaudeConfigured } from "@/lib/ai/llm";
import { NEED_PLANS, SITES, carrierNameAr, foldDigits, normalizeArabic, siteInDistrict, type DemoNeed } from "../_domain";
import { FAYSAL_MAX_HISTORY } from "./limits";

export type IntentKind =
  | "greeting_only"
  | "need"
  | "district"
  | "payment"
  | "insurance_question"
  | "price_question"
  | "package_question"
  | "slots_question"
  | "pick_slot"
  | "confirm"
  | "decline"
  | "cancel"
  | "prefer_nearest"
  | "objection_distance"
  | "objection_price"
  | "objection_delay"
  | "rating"
  | "competitor"
  | "identity"
  | "female_doctor"
  | "doctor_quality"
  | "clinical_question"
  | "drug_question"
  | "records"
  | "complaint"
  | "handoff"
  | "hours_question"
  | "unsupported_specialty"
  | "clinic_list"
  | "callback_request"
  | "pre_visit"
  | "other_branch"
  | "language_choice"
  | "labs_question"
  | "unserved_district"
  | "location_question"
  | "booking_status"
  | "keep_booking"
  | "reschedule"
  | "close"
  | "other";

export interface Classification {
  kind: IntentKind;
  need: DemoNeed | null;
  /** The patient's own words for their district. Never a resolved site id. */
  districtAr: string | null;
  /** Raw carrier text; the DOMAIN resolves it against the network list. */
  carrierRaw: string | null;
  payment: "insurance" | "cash" | null;
  /** 1-based index into the two offered slots, when the patient picked one. */
  slotPick: number | null;
  /** A coarse window in the patient's own words — «الصبح» / «بعد العصر». */
  preferredWindowAr: string | null;
  /** The language of the most recent SUBSTANTIVE clause (§3.1). */
  language: "ar" | "en" | "other";
  /** True when the deterministic pass was confident; false means the LLM ran. */
  deterministic: boolean;
  /** The patient asked for a female clinician ANYWHERE in the message. It is a
   *  preference that travels with the booking, not an intent that replaces it:
   *  «أبغى موعد جلدية بكرة الصبح في الروابي وأفضّل دكتورة» is a booking ask. */
  prefersFemale: boolean;
  /** The patient asked for a MALE clinician. Rule DOC-1's filter has two directions
   *  and the product could only ever express one of them. */
  prefersMale: boolean;
  /** The whole message is thanks or goodbye — nothing else in it. */
  courtesyOnly: boolean;
  /** The message opens by correcting Faysal («لا، أنا قصدي…», «مو الروابي…»). The
   *  correction is not a refusal; whatever it names REPLACES what we recorded. */
  correction: boolean;
  /** «فيه عرض؟ خصم؟» — asked alongside a price or package question. */
  offerAsked: boolean;
  /** «بكرة» / «اليوم» — a day the patient named. A patient who says «بكرة» and is
   *  offered today first has not been listened to, however good the slot is. */
  preferredDayAr: string | null;
}

const EMPTY: Classification = {
  kind: "other",
  need: null,
  districtAr: null,
  carrierRaw: null,
  payment: null,
  slotPick: null,
  preferredWindowAr: null,
  language: "ar",
  deterministic: true,
  prefersFemale: false,
  prefersMale: false,
  courtesyOnly: false,
  correction: false,
  offerAsked: false,
  preferredDayAr: null,
};

// ── language (§3.1) ─────────────────────────────────────────────────────────

// ── CONFIRM — composed from axes (see the note at the use site) ─────────────
// Everything here is written in POST-normalization spelling: hamza folded to «ا»,
// «ة» to «ه», no tashkeel. The boundary is a negative lookahead for a letter or
// digit, never `\b` (ASCII-only in JS; never matched an Arabic token).
const CONFIRM_WORD_END = "(?![ء-يa-z0-9])";
/** Bare-yes tokens and yes-idioms: a whole reply on their own. «ما عندي مانع» and
 *  «ما فيه مشكله» are yeses that happen to start with «ما» — which is why the
 *  negation layer below does not treat a bare «ما» as a no. */
const CONFIRM_YES =
  "اي|ايه|ايوه|ايوا|نعم|تمام|زين|طيب|خلاص|تم|صح|اوك|اوكي|اوكيه|اكيد|موافق|ماشي|ابشر|يلا|يالله|" +
  "ان شاء الله|انشالله|انشاء الله|ما عندي مانع|ما فيه مشكله|ما في مشكله|" +
  "ok|okay|okey|yes|yep|yeah|sure|fine|tamam|yalla|inshallah|go ahead|no problem|👍|✅|👌";
/** Verb stems that mean "go ahead and lock it": أكد / ثبت / اعتمد / كمل / احجز, with
 *  the imperative prefix «ا» optional and the object optional — «ثبته», «ثبت لي»,
 *  «ثبته الموعد», «اكد الموعد لي». */
const CONFIRM_STEM = "(?:ا)?(?:اكد|ثبت|اعتمد|كمل|حجز|احجز)";
const CONFIRM_OBJ = "(?:\\s*(?:ه|ها|it))?(?:\\s*لي)?(?:\\s*(?:الموعد|الحجز|the appointment))?(?:\\s*لي)?";
/** Nominal forms: «تأكيد» / «تثبيت» / «اعتماد» as a one-word reply. */
const CONFIRM_NOUN = "(?:تاكيد|تثبيت|اعتماد|confirm|confirmed|book it)";
/** Leading particles a patient glues on, at most two: «و», «ف», «ايه،», «تمام،»,
 *  «انا», «ان شاء الله». */
const CONFIRM_LEAD =
  "(?:(?:و|ف)\\s*|(?:اي|ايه|ايوه|تمام|زين|طيب|خلاص|اوك|اوكي|انا|ان شاء الله|انشالله|ما شاء الله|يعطيك العافيه)\\s*[،,]?\\s*){0,2}";
/** What may follow a yes without changing it: thanks, his name, a smiley, a full
 *  stop. NOT a question mark — «أثبته؟» is a question — and NOT another clause:
 *  «اكد بس بكرا», «ثبته وابي اغير الفرع», «احجز لي موعد اسنان في الشفا» all carry
 *  a tail that is not on this list, so the anchored pattern below refuses them. The
 *  first version had no end anchor and confirmed every one of those. */
const CONFIRM_TAIL_WORDS =
  "شكرا لك|شكرا|مشكور|تسلم|يا فيصل|فيصل|الله يعطيك العافيه|يعطيك العافيه|الله يسلمك|ان شاء الله|انشالله|please|pls|thanks|thank you|🙏|👍|✅|❤️|😊";
const CONFIRM_TAIL = `(?:\\s*[،,.!]?\\s*(?:${CONFIRM_TAIL_WORDS})){0,3}\\s*[،,.!]*\\s*`;
const CONFIRM_CORE = `(?:(?:${CONFIRM_YES})${CONFIRM_WORD_END}|${CONFIRM_STEM}${CONFIRM_OBJ}${CONFIRM_WORD_END}|${CONFIRM_NOUN}${CONFIRM_WORD_END})`;
/** The WHOLE message is a yes: lead(s), one or two yes-cores, a courtesy tail. Anchored
 *  at both ends on purpose (see CONFIRM_TAIL). */
const CONFIRM_RE = new RegExp(`^${CONFIRM_LEAD}${CONFIRM_CORE}(?:\\s*[،,]?\\s+${CONFIRM_CORE})?${CONFIRM_TAIL}$`);
/** «ثبته باسم محمد الشهري» — a yes that carries the name to book under. The name
 *  itself is cut from the raw text by `nameInConfirm`. */
const CONFIRM_NAMED_RE = new RegExp(`^${CONFIRM_LEAD}${CONFIRM_STEM}${CONFIRM_OBJ}\\s*(?:باسم|علي اسم|تحت اسم|under the name|for)\\s+\\S`);
/** A no, a not-now, a change request or a consult-first, anywhere → decline. Every
 *  token is word-bounded: «مو» must not fire inside «موعد», «لا» not inside «لازم». */
const CONFIRM_NEGATED = new RegExp(
  `(?:^|\\s)(?:لا|مو|مب|موب|ماني|ما ابي|ما ابغي|ما اقدر|ما يناسب|ما ينفع|مو الحين|مب الحين|بعدين|لاحقا|خلني افكر|خلني اشوف|اشاور|بشوف|ارد عليك|اردلك|بردلك|not now|later|no(?!\\s*problem))${CONFIRM_WORD_END}|` +
    // A yes followed by «بس»/«لكن»/«but» is a hedge, whatever follows: «تمام بس
    // بعدين», «نعم ولكن ابي اغير الفرع», «yes but tomorrow». A confirm STEM with a
    // hedge («اكد بس بكرا») is not listed on purpose: the anchored CONFIRM_RE already
    // refuses it, and "yes-but-tomorrow" is a not-yet to re-ask about, not a no.
    `^${CONFIRM_LEAD}(?:${CONFIRM_YES})\\s*[،,]?\\s*(?:بس|لكن|ولكن|but|however)(?![ء-يa-z])|` +
    // A change request anywhere — «غيّره» is the demo's own chip word: «تمام غيره»,
    // «ثبته وابي اغير الفرع», «ايه غير الوقت».
    `(?:^|\\s)(?:ا)?(?:غير|غيره|غيرها|غيرلي|اغير|تغير|بدل|بدله|بدلها|ابدل|change)${CONFIRM_WORD_END}|` +
    // «أكد لي الدوام» / «ثبت لي السعر» — an object that is not the booking.
    "(?:^|\\s)(?:ا)?(?:اكد|ثبت)\\s*لي\\s+(?!(?:ال)?موعد|(?:ال)?حجز)[ء-ي]|" +
    // The one idiom: «ماشي الحال» is «how are things», not a yes.
    "^ماشي الحال",
);
/** «تمام بس بعدين», «نعم ولكن», «yes but tomorrow» — a yes that is not yet. It is not
 *  a confirmation and it is NOT a refusal: counted as a refusal, two of them closed
 *  the conversation on a patient who was still choosing. */
const CONFIRM_HEDGE = new RegExp(
  `^${CONFIRM_LEAD}(?:${CONFIRM_YES})\\s*[،,]?\\s*(?:بس|لكن|ولكن|but|however)(?![ء-يa-z])`,
);
/** Not a yes and NOT a no either: a question that opens politely. It must not confirm,
 *  and it must not count as an objection — two objections close the conversation, and
 *  two ordinary questions did exactly that in the first version. It falls through to
 *  the branches below (slots, price, …) or to the model tier. Most of this is already
 *  refused by CONFIRM_RE's end anchor; the guard that still bites is the question mark
 *  on a NAMED confirm — «ثبته باسم زوجتي؟» is a question about whose name goes on it. */
const CONFIRM_BLOCKED = new RegExp(
  // «تمام وش الأسعار», «زين الدكتور؟», «ايوه وين الفرع».
  `^${CONFIRM_LEAD}(?:${CONFIRM_YES})\\s*[،,]?\\s*(?:وش|ايش|كم|متي|وين|هل|ليش|مين|كيف)${CONFIRM_WORD_END}|` +
    // «أي» the question word («اي وقت», «تمام أي وقت») folds to the same letters as «إي»
    // the yes («إي، إي ثبّته»). It is a question only when a non-yes word follows it.
    `^${CONFIRM_LEAD}اي\\s+(?!(?:${CONFIRM_YES}|${CONFIRM_STEM}${CONFIRM_OBJ}|${CONFIRM_NOUN}|${CONFIRM_TAIL_WORDS})${CONFIRM_WORD_END})[ء-ي]|` +
    // Anything that ends with a question mark is the patient asking, not deciding.
    "[؟?]\\s*$",
);

const GREETING_TOKENS =
  // NOT `\\b`. It is ASCII-word-based in JS, so after an Arabic letter there is never a
  // boundary and this regex could not match a single Arabic greeting — «مساء الخير»
  // reached the honest-unknown fallback whenever the model tier was absent. Driven.
  // Same defect the confirm line documents; same fix: a letter-or-digit lookahead.
  // Tested on NORMALIZED text, so «أهلاً» arrives as «اهلا».
  /^(?:hi|hello|hey|salam|salaam|السلام عليكم|سلام عليكم|هلا|مرحبا|مساء الخير|صباح الخير|اهلا|السلام|صباح النور|مساء النور)(?![ء-يa-z0-9])/i;

// ── A NAME-SHAPED REPLY ─────────────────────────────────────────────────────
// What a patient sends to «أثبّته باسم ضيف العرض التجريبي؟» when the honest answer
// is "yes, but under MY name". It is accepted only on a POSITIVE signal: a Saudi
// mobile, or an explicit lead («اسمي», «انا», «باسم», «my name is»). "The rules
// could not read it" is NOT that signal — the first version accepted any unread
// two-to-four-word message and booked «ابي اغير الوقت» as a patient. Consumed ONLY at
// S6_close with a live hold (scenes.ts). The display name is cut from the RAW text,
// so «سارة» stays «سارة» and never becomes «ساره».
/** ASCII digits only — callers fold Arabic-Indic digits first. Spaces and dashes
 *  inside the number are tolerated: «055 123 4567», «0551-234-567». */
const SAUDI_MOBILE_RAW = /(?:\+?966|0)[\s\-]?5(?:[\s\-]?\d){8}/;
const NAME_LEAD_RAW = /^(?:اسمي|أنا|انا|باسم|على اسم|علي اسم|تحت اسم|my name is|name is|name|i am|i'm|this is)\s*[:،,\-]?\s*/i;
const NAME_TOKEN_RE = /^(?:[ء-يa-z][ء-يa-z'\-]{1,20}|[ء-يa-z]\.)$/i;
/** Words that are never part of a name — function words, question words, wishes,
 *  courtesy, the booking vocabulary. Normalized spelling. */
const NAME_STOP = new Set(
  (
    "ابي ابغي ابغى ممكن اقدر وش ايش وين مين كم ليش ليه كيف متي هل غير اغير غيره بدل عندي الوقت الموعد الفرع " +
    "دكتور دكتوره عياده موعد بكرا بكره الحين بعد قبل لحظه شوي خلني اشوف اشاور زوجتي زوجي افضل احسن ثاني ثانيه " +
    "صداع الم حراره الله يسلمك يعطيك العافيه جزاك خير حياك وعليكم السلام سلام تمام طيب خلاص شكرا تم صح اي ايه " +
    "ايوه نعم زين اوكي موافق لا مو ما مب انت انتم انا هو هي احنا ضيف العرض التجريبي مانع مشكله " +
    "not maybe later sure yet change time doctor who what when where why how please thanks ok okay yes no"
  ).split(" "),
);
/** A trailing yes or courtesy after the name is allowed: «محمد الشهري 0551234567 ثبته». */
const NAME_TRAIL_RE = /^(?:(?:ا)?(?:اكد|ثبت|اعتمد|كمل|احجز)(?:ه|ها)?|تمام|اوكي|اوك|اي|ايه|ايوه|نعم|شكرا|please|thanks|ok|yes)$/;
export function nameShaped(raw: string): { nameAr: string; mobile: string | null } | null {
  let text = foldDigits(raw).trim();
  const lead = NAME_LEAD_RAW.exec(text);
  if (lead) text = text.slice(lead[0].length).trim();
  const m = SAUDI_MOBILE_RAW.exec(text);
  const mobile = m ? m[0].replace(/[\s\-]/g, "") : null;
  if (m) text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
  if (!lead && !mobile) return null; // no positive signal — not a name, whatever its shape
  const tokens = text.split(/[\s،,:!.]+/).filter((tok) => tok && !/^[\-–—_]+$/.test(tok));
  while (tokens.length && NAME_TRAIL_RE.test(normalizeArabic(tokens[tokens.length - 1]))) tokens.pop();
  let prefix = "";
  if (tokens.length && /^(?:د|dr)\.?$/i.test(tokens[0])) {
    prefix = "د. ";
    tokens.shift();
  }
  if (tokens.length < 1 || tokens.length > 4) return null;
  for (const tok of tokens) {
    if (!NAME_TOKEN_RE.test(tok)) return null;
    const n = normalizeArabic(tok);
    if (NAME_STOP.has(n)) return null;
    if (NEEDS.some((row) => row.words.some((w) => normalizeArabic(w) === n))) return null;
  }
  const joined = tokens.join(" ");
  if (findDistrict(joined)) return null;
  if (GREETING_TOKENS.test(normalizeArabic(joined))) return null;
  return { nameAr: `${prefix}${joined}`.slice(0, 40), mobile };
}
/** «ثبته باسم محمد الشهري» → the name after the lead, by the same rules as above. */
export function nameInConfirm(raw: string): { nameAr: string; mobile: string | null } | null {
  const m = /(?:باسم|على اسم|علي اسم|تحت اسم|under the name|for)\s+(.+)$/i.exec(foldDigits(raw).trim());
  return m ? nameShaped(`باسم ${m[1]}`) : null;
}

/**
 * "Faysal replies in the language of the patient's most recent SUBSTANTIVE
 * clause. Greeting tokens do not count. Arabic is the home register and the
 * tie-break." A single English word inside Arabic (`MRI`, `laser`) does not flip
 * the language, so the test is on the majority of letters, not on presence.
 */
/**
 * Urdu is written in the ARABIC SCRIPT, so a script-block test calls it Arabic and
 * §3.3's honest third-language path never fires — which is the one Riyadh-clinic
 * reality that path exists for. The tell is the letters Urdu has and Arabic does
 * not: ٹ ڈ ڑ ں ھ ے ۓ گ ک چ پ ژ ہ ی. Two of them is a sentence, not a typo.
 */
const URDU_MARKERS = /[پچژگکہھےۓٹڈڑںی]/g;

export function detectLanguage(raw: string): "ar" | "en" | "other" {
  const stripped = raw.replace(GREETING_TOKENS, " ").trim();
  const probe = stripped || raw;
  const arabic = (probe.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (probe.match(/[A-Za-z]/g) ?? []).length;
  // Devanagari, Bengali, Ethiopic, Thai — the other languages §3.3 names.
  const otherScript = (probe.match(/[ऀ-ॿঀ-৿ሀ-፿฀-๿]/g) ?? []).length;
  const urdu = (probe.match(URDU_MARKERS) ?? []).length;
  if (otherScript > arabic && otherScript > latin) return "other";
  if (urdu >= 2) return "other";
  if (latin > arabic * 2 && latin >= 6) return "en";
  return "ar"; // mixed with no clear majority → Arabic (the tie-break)
}

// ── deterministic matchers ──────────────────────────────────────────────────

const has = (t: string, ...needles: string[]) => needles.some((n) => t.includes(normalizeArabic(n)));
/** A need word is a substring match EXCEPT when it is three letters or fewer: «سن»
 *  lives inside «حسن» and «أحسن», «اذن» inside «اذنك», «ent» inside «appointment».
 *  Short needles are word-bounded, with the ordinary Arabic prefixes allowed. */
/**
 * A needle that must END at a word boundary. `has` is a plain `includes`, and
 * «أفضّل دكتورة» — "I'd prefer a female doctor" — contains «افضل دكتور», so a
 * patient stating a preference was answered with «ما أقيّم لك دكتور» ("I don't rate
 * doctors"). Driven. The Arabic feminine «ة» folds to «ه», which is a letter, so the
 * only thing that separates the two phrases is what comes after the last one.
 */
const hasPhrase = (t: string, ...needles: string[]): boolean =>
  needles.some((n) => new RegExp(`${normalizeArabic(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![ء-يa-z0-9])`).test(t));

const needIn = (t: string): DemoNeed | null => NEEDS.find((row) => row.words.some((w) => needWord(t, w)))?.need ?? null;
const needWord = (t: string, w: string): boolean => {
  const n = normalizeArabic(w);
  if (n.length > 3) return t.includes(n);
  return new RegExp(`(?<![ء-يa-z])(?:و|ف|ب|ل|ال|وال|بال)?${n}(?![ء-يa-z])`).test(t);
};

/**
 * The demo's needs, each a key of `NEED_PLANS`, which pins it to one of the
 * ENGINE's `NeedKey`s. Orthopaedics is deliberately absent: SPEC-1 §6.2 records
 * it as group-wide only at all six sites, so `recommendBranch` has no key for it
 * and «ألم بالركبة» is answered by the unsupported-specialty path below.
 */
const NEEDS: readonly { need: DemoNeed; words: string[] }[] = [
  { need: "laser", words: ["ليزر", "ازاله شعر", "إزالة الشعر", "laser", "hair removal"] },
  { need: "orthodontics", words: ["تقويم", "braces", "aligner", "الينر"] },
  { need: "endodontics", words: ["عصب", "حشو عصب", "علاج جذور", "root canal"] },
  { need: "dental", words: ["اسنان", "سن", "سني", "ضرس", "ضرسي", "تنظيف اسنان", "تبييض", "dental", "teeth", "tooth"] },
  { need: "dermatology", words: ["جلديه", "جلدية", "بشره", "حبوب الوجه", "derma", "skin"] },
  { need: "paediatrics", words: ["اطفال", "طفلي", "ابني الصغير", "بيبي", "pediatric", "paediatric"] },
  { need: "obgyn", words: ["نساء وولاده", "نسائيه", "حمل", "حامل", "ولاده", "obgyn", "gynae"] },
  { need: "ent", words: ["انف واذن", "حنجره", "اذن", "ent"] },
  { need: "employment_medical", words: ["فحص توظيف", "ما قبل التوظيف", "employment medical", "pre-employment"] },
  { need: "neurology", words: ["مخ واعصاب", "اعصاب", "صداع مزمن", "neurology"] },
  { need: "internal", words: ["باطنه", "باطنية", "internal medicine"] },
  { need: "general", words: ["كشف عام", "كشف", "يحتاج كشف", "ابي كشف", "طب اسره", "عياده عامه", "general checkup", "check up", "checkup", "family medicine"] },
];

/**
 * The branch that IS in the district the patient named — the engine's own
 * `siteInDistrict`, which matches a site's district and its recorded alternates
 * and NOTHING else. There is no "nearest by distance" here and there must not be:
 * the dossier gives a plus code for two of six sites and no coordinates at all, so
 * a neighbourhood-adjacency table would be a geographic claim we cannot support.
 * A null answer is the honest one, and the fork simply does not run.
 */
/**
 * RIYADH HAS HUNDREDS OF DISTRICTS AND THIS DEMO SERVES SIX. «أنا في العليا» — an
 * answer to Faysal's OWN question «أنت بأي حي؟» — produced «هذي المعلومة ما أقدر
 * أأكدها لك من عندي» and left `districtAr` null, so the identical question came back
 * on the next turn. Three testers in a row will type العليا or الملز.
 *
 * This is not a route: it is the ability to recognise that the patient answered, so
 * the reply can say plainly that there is no branch there and name the ones there
 * are. Deliberately the big, unmistakable names — a district word we do not know at
 * all still falls through to the model tier, where a guess is cheap and reversible.
 */
const UNSERVED_DISTRICTS: readonly string[] = [
  "العليا", "الملز", "النخيل", "السليمانيه", "المروج", "الياسمين", "النرجس", "قرطبه", "الحمراء",
  "الخليج", "المرسلات", "الصحافه", "المغرزات", "الازدهار", "الوزارات", "الديره", "البطحاء",
  "العزيزيه", "المنار", "بدر", "الشميسي", "السويدي", "ظهره لبن", "الحاير", "العريجاء", "لبن",
  "الدرعيه", "حطين", "الملقا", "الغدير", "المؤتمرات", "الرحمانيه", "عرقه", "طويق", "المهديه",
];

function findDistrict(raw: string): string | null {
  const id = siteInDistrict(raw);
  return id ? SITES[id].districtAr : null;
}

/** Resolved against the ENGINE's payer table; a `directory_source` is never one. */
function findCarrier(raw: string): string | null {
  return carrierNameAr(raw);
}

/**
 * A message that is ONLY thanks or goodbye. It must be read as what it is in every
 * scene: after a confirmed booking «تسلم يا فيصل، مع السلامة» was reaching the
 * honest-unknown line, and «تمام مشكور» was re-opening the slot list, because
 * «تمام» is also a yes and «شكرا» was only half-listed. The whole message must be
 * courtesy — one substantive word anywhere and this is false.
 */
const COURTESY_WORDS =
  "شكرا لك|شكرا|شكر|مشكور|مشكورين|تسلم|تسلمون|الله يسلمك|يعطيك العافيه|الله يعطيك العافيه|الله يسعدك|" +
  "ما قصرت|جزاك الله خير|بالتوفيق|مع السلامه|في امان الله|تصبح علي خير|الله يجزاك خير|" +
  "thanks|thank you|thank u|bye|goodbye|good night|see you|appreciate it|🙏|❤️|😊|👍";
const COURTESY_LEAD = "(?:(?:تمام|خلاص|طيب|اوكي|اوك|زين|ok|okay)\\s*[،,]?\\s*)?";
const COURTESY_ONLY_RE = new RegExp(
  `^${COURTESY_LEAD}(?:${COURTESY_WORDS})(?:[،,.!\\s]+(?:${COURTESY_WORDS}|يا فيصل|فيصل|والله))*[،,.!\\s]*$`,
);
/** A doctor noun in the message, feminine. «بنت» alone is far too broad — a patient
 *  saying «بنتي» means their daughter, not a preference about the clinician. */
// The ordinary Arabic prefixes ride on this word like any other — «ودكتورة»,
// «بدكتورة», «للدكتورة» — and a boundary that forbids them misses the commonest
// way it is typed: as the second half of a sentence joined with «و».
const FEMALE_DOCTOR_RE = /(?:^|\s)(?:و|ف|ب|ل)?(?:ال)?(?:دكتوره|دكتورة|طبيبه|اخصائيه|اخصاءيه)(?![ء-ي])|female doctor|lady doctor|woman doctor/;
/** «أبغى دكتور رجّال» / «دكتور مو دكتورة» — the other half of Rule DOC-1's filter,
 *  which the product could not express at all. A bare «دكتور» is NOT this: it is
 *  how everyone says "a doctor", and reading it as a gender request would filter
 *  every patient who never asked for one. It needs the word that makes it explicit. */
const MALE_DOCTOR_RE = /(?:^|\s)(?:و|ف|ب|ل)?(?:ال)?دكتور\s*(?:رجال|رجل|ذكر)(?![ء-ي])|دكتور مو دكتوره|طبيب رجال|male doctor|man doctor/;
/** «لا، أنا قصدي الليزر», «مو الروابي، الروضة»: the head is a negation and the rest
 *  of the message names something. That is a correction, never a walk-away. */
const CORRECTION_HEAD_RE = /^(?:لا+\s*)+(?:لا)?\s*(?:انا\s*)?(?:اقصد|قصدي|قلت لك|قلت)?|^(?:مو|مب|موب)\s|(?:^|\s)(?:انا\s*)?(?:اقصد|قصدي|غلط|مو صحيح)(?![ء-ي])|^no,? ?no|^i said|^i meant/;

/**
 * A coarse window IN THE PATIENT'S OWN WORDS (Rule C4-1 — never a clock time we
 * then promise). «بعد الساعة 7» is kept verbatim rather than collapsed to «بعد
 * العصر»: the confirmation prints this string back, and a patient who said "after
 * seven" and read "after Asr" has been contradicted by his own appointment.
 */
function findWindow(t: string): string | null {
  const clock = /(?:بعد|من)\s*(?:الساعه)?\s*(\d{1,2})(?::(\d{2}))?/.exec(t);
  if (clock) return `بعد الساعة ${clock[1]}${clock[2] ? `:${clock[2]}` : ""}`;
  if (has(t, "الصبح", "الصباح", "بكره الصبح", "صباحا")) return "الصبح";
  if (has(t, "بعد العصر", "العصر", "بعد الظهر", "المسا", "المساء", "بالليل")) return "بعد العصر";
  return null;
}

/**
 * The deterministic pass. Returns `null` when it is NOT confident, which is the
 * only condition under which the model is asked.
 */
export { CONFIRM_RE, CONFIRM_NEGATED, CONFIRM_BLOCKED, CONFIRM_HEDGE };

/**
 * EVERY FACT IN THE MESSAGE, READ ONCE, REGARDLESS OF THE INTENT.
 *
 * The classifier used to return on the first thing it recognised and drop the rest
 * of the sentence with it. «مساء الخير، أبغى موعد جلدية بكرة الصبح في فرع الروابي،
 * عندي تأمين بوبا، وأفضّل دكتورة» matched the doctor word, returned `female_doctor`,
 * and the next turn asked the patient what they need and which district — a patient
 * who had just said both. Twelve testers hit this; it is the single loudest reason
 * Faysal reads as a form rather than a person.
 *
 * So the facts are extracted first and ride on EVERY classification, including the
 * model tier's. The `kind` decides what he SAYS; these decide what he KNOWS.
 */
function extractFacts(raw: string, t: string): Pick<
  Classification,
  | "need"
  | "districtAr"
  | "carrierRaw"
  | "payment"
  | "preferredWindowAr"
  | "prefersFemale"
  | "prefersMale"
  | "courtesyOnly"
  | "correction"
  | "offerAsked"
  | "preferredDayAr"
> {
  const carrier = findCarrier(raw);
  const declaring = has(t, "عندي", "معي", "معاي", "معنا", "تاميني", "بتامين", "علي تامين", "معي بطاقه", "i have", "we have", "we're on", "my insurance");
  const cash = has(t, "كاش", "نقدا", "ادفع كاش", "cash");
  // A BARE «تأمين» IS AN ANSWER. It is one of the two chips under «تأمين ولا كاش؟»,
  // and tapping it left `payment` null because the insurance branch wanted a carrier
  // name too — so the patient answered the question and was asked it again. The
  // insurer is the NEXT question, not a precondition for hearing the first answer.
  const bareInsurance = /^(?:و|ف)?\s*(?:ال)?(?:تامين|بتامين|insurance)\s*[.!،,]?$/.test(t);
  return {
    need: needIn(t),
    districtAr: findDistrict(raw),
    carrierRaw: carrier,
    payment: cash ? "cash" : (declaring && carrier) || bareInsurance ? "insurance" : null,
    preferredWindowAr: findWindow(t),
    prefersFemale: FEMALE_DOCTOR_RE.test(t) && !MALE_DOCTOR_RE.test(t),
    prefersMale: MALE_DOCTOR_RE.test(t),
    courtesyOnly: COURTESY_ONLY_RE.test(t),
    correction: CORRECTION_HEAD_RE.test(t),
    offerAsked: has(t, "عرض", "عروض", "خصم", "تخفيض", "offer", "discount", "promo"),
    preferredDayAr: has(t, "بعد بكره", "بعد بكرة", "day after tomorrow")
      ? "بعد بكرة"
      : has(t, "بكره", "بكرة", "tomorrow")
        ? "بكرة"
        : has(t, "اليوم", "today")
          ? "اليوم"
          : null,
  };
}

export function classifyDeterministic(raw: string, offeredCount: number): Classification | null {
  const t = normalizeArabic(raw);
  const language = detectLanguage(raw);
  const base: Classification = { ...EMPTY, language, deterministic: true, ...extractFacts(raw, t) };
  if (!t) return { ...EMPTY, language, deterministic: true, kind: "other" };

  // Identity — asked sincerely (§1.5). Checked early: it outranks a booking read.
  if (has(t, "انت روبوت", "انت بوت", "انت انسان", "انت ذكاء", "are you a bot", "are you human", "انت مين", "من انت", "انت حقيقي"))
    return { ...base, kind: "identity" };

  // Handoff / escalation (§5.3, Rule MED-7).
  if (has(t, "ابي موظف", "ابي بشر", "ابي انسان يكلمني", "حولني", "ابي مسؤول", "ابي مدير", "speak to a human", "talk to someone"))
    return { ...base, kind: "handoff" };

  // Complaint (§5.3) — outranks price and booking in the stance order (§5.5).
  if (has(t, "انتظرت", "تاخرت عليكم", "زعلان", "مستاء", "سيئ", "سيءه", "شكوي", "اشتكي", "ضاع علي", "ما احترمتوا", "استرجاع", "ارجعوا فلوسي", "تعويض",
    // «ما أبي اعتذار أبي حل» was read as a decline — the «ما أبي» trips the negation
    // layer — so a patient demanding a resolution was offered a no-obligation booking.
    "ما ابي اعتذار", "ابي حل", "خدمه زفت", "خدمتكم سيئه", "ما تردون", "ما ترد علي", "زفت"))
    return { ...base, kind: "complaint" };

  // Rating (§5.4) — before competitor, because it names us, not them.
  // A map pin is not a review. «قوقل» appears in both «تقييمكم في قوقل» and «الموقع
  // على قوقل ماب», and the rating branch answered an accusation the patient never
  // made. The location read runs first (it is below, before hours) and this now
  // requires a rating word, not merely the platform's name.
  if (has(t, "تقييم", "نجوم", "review", "stars", "rating") || (has(t, "جوجل", "قوقل") && has(t, "تقييم", "نجمه", "نجوم", "ضعيف", "سيئ")))
    return { ...base, kind: "rating" };

  if (has(t, "احسن من", "افضل من", "ارخص من", "مستشفي ثاني", "مجمع ثاني", "عيادات ثانيه", "compared to", "better than"))
    return { ...base, kind: "competitor" };

  // Clinical (§8.1 #1) and drug (#2) — never answered, always routed.
  if (has(t, "وش عندي", "ايش عندي", "وش سببه", "هل هو خطير", "تشخيص", "what do i have", "is it serious", "diagnose"))
    return { ...base, kind: "clinical_question" };
  if (has(t, "اي دواء", "وش اخذ", "مرهم", "مضاد حيوي", "حبوب اخذها", "what medicine", "which medicine", "antibiotic"))
    return { ...base, kind: "drug_question" };

  if (has(t, "نتيجه التحليل", "نتيجه الاشعه", "تقريري", "تقرير الاشعه", "التحاليل طلعت", "lab result", "my report"))
    return { ...base, kind: "records" };

  if (hasPhrase(t, "الدكتور زين", "الدكتور شاطر", "احسن دكتور", "افضل دكتور", "is the doctor good", "best doctor"))
    return { ...base, kind: "doctor_quality" };

  // Cancellation (Rule MED-6 — never argued).
  if (has(t, "الغي", "الغه", "الغيه", "الغاء", "ابي الغي", "ابي الغاء", "cancel", "cancel it")) return { ...base, kind: "cancel" };

  // Slot pick by ordinal. Picking by the slot's OWN WORDS — «السبت 11» — is matched
  // in the scene machine, which is the only layer that can see the offered labels.
  if (offeredCount > 0) {
    if (/(^|\s)(1|الاول|الاولي|الخيار الاول|first|the first one|first one)(\s|$)/.test(t)) return { ...base, kind: "pick_slot", slotPick: 1 };
    if (/(^|\s)(2|الثاني|الثانيه|الخيار الثاني|second|the second one|second one)(\s|$)/.test(t) && offeredCount > 1)
      return { ...base, kind: "pick_slot", slotPick: 2 };
  }

  // Objections (§6.4).
  if (has(t, "بعيد", "المسافه", "الزحمه", "ما اقدر اروح لهناك", "too far", "far away"))
    return { ...base, kind: "objection_distance" };
  if (has(t, "غالي", "كثير علي", "ما عندي فلوس", "expensive", "too much"))
    return { ...base, kind: "objection_price" };
  if (has(t, "بفكر", "خلني افكر", "ارجع لك", "بعدين", "let me think", "i'll think"))
    return { ...base, kind: "objection_delay" };

  // Nearest — the geography fork trigger (§6.2).
  const nearest = has(t, "اقرب فرع", "الاقرب", "اقرب لي", "قريب مني", "اقرب شي لي", "nearest", "closest");
  const district = findDistrict(raw);
  if (nearest && district) return { ...base, kind: "prefer_nearest", districtAr: district };
  if (nearest) return { ...base, kind: "prefer_nearest" };

  // Rule STR-3 forbids a SILENT substitution, and routing «دكتور قلب» to a general
  // consultation is exactly that. A specialty we carry no route for is said out
  // loud (§8.2) rather than quietly turned into a different appointment. The
  // clinic-context requirement is what keeps «من القلب أشكركم» out of it — a bare
  // `includes` on «قلب» fires on gratitude, which is SPEC-4 §2.1's own near-miss.
  if (
    (has(t, "عياده", "عيادة", "دكتور", "طبيب", "قسم", "موعد") ||
      // A bare complaint about a body part we carry no clinic for is the same ask
      // in a patient's words: «عندي ألم في الركبة من شهر» got the generic
      // honest-unknown line three times because it named no clinic.
      has(t, "عندي الم", "يعورني", "يوجعني", "الم في", "الم ب", "وجع")) &&
    has(t, "قلب", "قلبيه", "مسالك", "كلي", "اورام", "نفسي", "نفسيه", "سكري", "تجميل", "تخاطب", "علاج طبيعي", "روماتيزم", "عظام", "الركبه", "ركبه", "كتف", "الظهر", "ظهري", "المفاصل")
  ) {
    return { ...base, kind: "unsupported_specialty" };
  }

  // Price (§5.2). «كم» / «السعر» / «التكلفة».
  if (has(t, "باقه", "باقات", "باكج", "الباكج", "بكج", "بكجات", "package", "packages") || (base.offerAsked && base.need))
    return { ...base, kind: "package_question" };
  if (has(t, "كم سعر", "السعر", "بكم", "التكلفه", "كم يكلف", "كم تكلف", "how much", "price", "cost"))
    return { ...base, kind: "price_question" };

  // Insurance (§5.2). Distinguish "do you take X?" from "I have X".
  if (base.payment) return { ...base, kind: "payment" };
  if (has(t, "تامين", "التامين", "insurance") || base.carrierRaw) return { ...base, kind: "insurance_question" };

  // Hours / branch status (§2.3, Rule C4-1).
  // «وين الفرع؟», «العنوان؟», «وين المواقف؟» — the address is data we hold, and a
  // patient about to drive somewhere asks for it. It was reaching the honest-unknown
  // line, which is the one answer that is definitely wrong when we know the answer.
  if (has(t, "وين الفرع", "وين مكانكم", "العنوان", "عنوانكم", "الموقع", "وين موقعكم", "لوكيشن", "المواقف", "موقف السيارات", "where are you", "your address", "location", "parking"))
    return { ...base, kind: "location_question" };

  // «فرع ثاني» and «العربية» / «English» — both of them CHIPS this engine emits, and
  // neither had an intent. A chip the engine cannot read is worse than no chip: the
  // patient taps the thing he offered them and he says he did not follow. Found by
  // the proof that reads every chip literal out of scenes.ts, not by a person.
  if (has(t, "فرع ثاني", "فرع اخر", "فرع ثالث", "another branch", "different branch"))
    return { ...base, kind: "other_branch" };
  if (/^(?:العربيه|عربي|بالعربي|arabic|english|انجليزي|بالانجليزي)\s*[.!،,]?$/.test(t))
    return { ...base, kind: "language_choice" };

  // «وش أجيب معي؟» — asked one message after he wrote the answer himself. The
  // pre-visit line already says what to bring; he answered «ما أقدر أأكدها لك من
  // عندي» and then offered to book an appointment the patient had just booked.
  if (has(t, "وش اجيب", "ايش اجيب", "وش اخذ معي", "اجيب معي", "المطلوب معي", "اوراق", "what should i bring", "what do i need to bring", "documents"))
    return { ...base, kind: "pre_visit" };

  // «سجّل لي طلب» — HIS OWN CHIP, on the scene the spec calls the honesty showpiece,
  // and it had no intent at all: tapping it produced «ما أقدر أأكدها لك من عندي».
  if (has(t, "سجل لي طلب", "سجل طلب", "سجل لي", "اكتب لي طلب", "طلب مكتوب", "register the request", "log the request"))
    return { ...base, kind: "callback_request" };

  // «تحاليل وأشعة» — the THIRD door the greeting itself offers, and the only one that
  // was a wall. The demo books clinics, not labs; that is a limit to say, not to hide.
  if (has(t, "تحاليل", "تحليل", "اشعه", "أشعة", "مختبر", "سونار", "رنين", "اشعه مقطعيه", "lab", "labs", "blood test", "x-ray", "xray", "mri", "ultrasound", "scan"))
    return { ...base, kind: "labs_question" };

  // «عيادة معيّنة» — the second half of the opener's own question, and one of the two
  // chips under it. A chip the engine cannot read is worse than no chip at all.
  if (has(t, "عياده معينه", "عيادة معينة", "عيادة معيّنة", "تخصص معين", "قسم معين", "specific clinic", "a clinic"))
    return { ...base, kind: "clinic_list" };

  if (has(t, "الدوام", "متي تفتحون", "متي يفتح", "مفتوح", "مسكر", "شغالين", "فاتحين", "فاتح", "تفتحون", "دواماتكم", "open now", "are you open", "opening hours"))
    return { ...base, kind: "hours_question" };

  // Confirm / decline — DERIVED, NOT LISTED, and checked BEFORE the slots ask so «ثبّت
  // الموعد» reads as a confirmation rather than as a request for slots. It still sits
  // AFTER price, insurance and the objections, so «إي غالي» stays an objection and
  // «كم سعر الموعد» stays a price question.
  // The first version of this line was a hand-typed set and
  // it was missing «أكد» — the single most ordinary way to say yes to «أثبّته؟» —
  // so a patient who TYPED a confirmation one tap from a booked appointment got
  // the honest-unknown fallback while the chip worked. Same failure class this
  // repo hit four times today on the restaurant emergency detector: a list holds
  // exactly the values one author thought of on one afternoon. The stems below are
  // composed with their inflections instead of enumerated as sentences, and the
  // proof (scripts/proof-faysal-confirm.test.ts) generates its corpus from the
  // same axes AND drives an independently-derived must-NOT-confirm corpus, so a
  // widening here has something that can object to it.
  //
  // Negations and hedges are checked FIRST and win: «لا تأكد», «ما أبي أثبت»,
  // «مو الحين», «تمام بس بعدين», «إي بس غالي» are not a yes. A patient asking
  // Faysal to confirm something else («أكد لي الدوام») is not a yes either — the
  // object gate below requires the confirmation to be bare, or to point at the
  // appointment/booking/it.
  // AFTER A BOOKING EXISTS, three ordinary sentences were being read as new
  // bookings, refusals or noise. They are read as themselves now, before the
  // confirm block, because «خليه» carries a «لا» and «موعدي باقي؟» carries «موعد».
  if (has(t, "خليه", "خلاص خليه", "نفس الموعد", "زي ما هو", "زي ماهو", "خله زي ما هو", "leave it", "keep it", "as it is"))
    return { ...base, kind: "keep_booking" };
  if (
    has(t, "موعدي", "حجزي", "موعدي باقي", "my appointment", "still booked", "is it booked", "my booking") &&
    !has(t, "الغي", "غير", "بدل", "cancel", "change")
  )
    return { ...base, kind: "booking_status" };
  if (has(t, "اغير الوقت", "غير الوقت", "اغير الموعد", "غير الموعد", "ابدل الموعد", "بدل الموعد", "انقل الموعد", "اقدم الموعد", "اخر الموعد", "وقت ثاني", "موعد ثاني", "change the time", "move it", "reschedule", "different time", "another time"))
    return { ...base, kind: "reschedule" };

  if (CONFIRM_NEGATED.test(t)) {
    // A NEGATION INSIDE A REQUEST IS A CONSTRAINT ON THE REQUEST, NOT A WALK-AWAY.
    // The old line returned `decline` on any «لا» / «ما» / «مو» anywhere in the
    // message, so «أبي موعد أسنان بس ما أبي أنتظر مرة ثانية» — a patient booking —
    // counted as an objection, and the second one closed the thread on them.
    const carriesAnAsk =
      base.need !== null ||
      base.districtAr !== null ||
      base.payment !== null ||
      base.preferredWindowAr !== null ||
      has(t, "موعد", "احجز", "حجز", "appointment", "book") ||
      /\d{1,2}(?::\d{2})?/.test(t);
    if (CONFIRM_HEDGE.test(t)) return { ...base, kind: "objection_delay" };
    if (!carriesAnAsk) return { ...base, kind: "decline" };
    // …otherwise fall through and let the ask be read. CONFIRM_RE is anchored at
    // both ends, so nothing here can be mistaken for a yes on the way down.
  }
  if (!CONFIRM_BLOCKED.test(t) && (CONFIRM_RE.test(t) || CONFIRM_NAMED_RE.test(t)))
    return { ...base, kind: "confirm", preferredWindowAr: findWindow(t) };

  // Slots.
  // A bare «موعد» belongs here: «أبغى موعد عند دكتور قلب» and «موعد أشعة الصدر» are
  // both booking asks, and both were falling to `fallback.honest_unknown` because
  // the needles were all multi-word. It sits AFTER price and insurance, so
  // «كم سعر الموعد؟» still reads as a price question.
  // A booking ask that names its clinic keeps the clinic: «احجز لي موعد اسنان في
  // الشفا» carries both the district and the need, or the routing has to ask again.
  if (has(t, "موعد", "المواعيد", "متابعه", "متي اقدر اجي", "احجز", "حجز", "appointment", "book", "slots", "times", "what time", "follow up"))
    return { ...base, kind: "slots_question" };

  // The legacy bare-no line (the confirm block above already read the hedges and
  // negations; this catches a plain «لا» that reached here past the slots branch).
  // NOTE THE BOUNDARY: `\b` is ASCII-word-based in JS and never matched an Arabic
  // token; a letter-or-digit lookahead is the boundary everywhere in this file.
  const wordEnd = "(?![ء-يa-z0-9])";
  if (new RegExp(`^(?:لا|ما ابي|مو الحين|no|nope|not now)${wordEnd}`).test(t)) return { ...base, kind: "decline" };

  // Courtesy is read as courtesy in EVERY scene. The old test was a bare `includes`
  // on «شكرا», so «شكرا بس أبي أغير الوقت» closed the conversation while «تسلم يا
  // فيصل، مع السلامة» — which has no «شكرا» in it — did not.
  if (base.courtesyOnly) return { ...base, kind: "close" };

  // A stated need — checked after the specific intents so «كم سعر الليزر» reads as
  // a price question about laser, not as a bare need.
  if (base.need) return { ...base, kind: "need" };
  if (base.districtAr) return { ...base, kind: "district" };

  // A district we do not serve is an ANSWER to «أنت بأي حي؟», not an unknown.
  if (UNSERVED_DISTRICTS.some((d) => t.includes(normalizeArabic(d)))) return { ...base, kind: "unserved_district" };

  // A doctor-gender request with NOTHING else in the message is its own intent; in
  // any other message it is a preference carried by `prefersFemale` (§9 turn 10).
  // It sits BELOW the district: «انا في الروضة، وابغى دكتورة» is a patient telling
  // us where they are, and answering it with «وش تحتاج وبأي حي؟» — which is what
  // happened — asks for the sentence they just typed.
  if (base.prefersFemale || base.prefersMale) return { ...base, kind: "female_doctor" };

  // A bare window — the «الصبح» / «بعد العصر» chips, and «بعد الساعة ٧». It answers
  // whatever question is open (the callback window, or which half of the day), so
  // it is classified deterministically and the scene machine consumes it.
  if (base.preferredWindowAr) return { ...base, kind: "other" };

  // Greeting only — «السلام عليكم» with nothing after it.
  if (GREETING_TOKENS.test(t) && t.split(" ").length <= 6) return { ...base, kind: "greeting_only" };

  return null; // NOT confident → ask the model.
}

// ── the LLM seam ────────────────────────────────────────────────────────────

const CLASSIFIER_SYSTEM = `أنت مصنّف نوايا لمحادثة حجز مواعيد في مجمع طبي بالرياض. لست وكيلاً ولا ترد على المريض.
مهمتك الوحيدة: تقرأ آخر رسالة من المريض وتُخرج JSON فقط، بدون أي نص آخر.

الحقول:
{"kind": <واحد من القائمة>, "need": <واحد من قائمة الاحتياجات أو null>, "district": <اسم الحي كما كتبه المريض أو null>, "carrier": <اسم شركة التأمين كما كتبها أو null>, "payment": "insurance"|"cash"|null, "slotPick": 1|2|null, "window": "الصبح"|"بعد العصر"|null}

kind ∈ [greeting_only, need, district, payment, insurance_question, price_question, package_question, slots_question, pick_slot, confirm, decline, cancel, prefer_nearest, objection_distance, objection_price, objection_delay, rating, competitor, identity, female_doctor, doctor_quality, clinical_question, drug_question, records, complaint, handoff, hours_question, unsupported_specialty, close, other]

need ∈ [laser, dermatology, dental, orthodontics, endodontics, paediatrics, obgyn, ent, internal, general, employment_medical, neurology, after_hours, null]

قواعد ملزمة:
- لا تخترع حياً ولا شركة تأمين ولا وقتاً. انسخ كلام المريض حرفياً أو اكتب null.
- لا تخرج أي رقم، ولا سعر، ولا اسم طبيب، ولا اسم فرع.
- لهجة المريض ليست إشارة على شيء: «أبغى» و«أبي» و«إيش» و«وش» كلها عادية.
- أخرج JSON فقط.`;

const KIND_SET = new Set<IntentKind>([
  "greeting_only", "need", "district", "payment", "insurance_question", "price_question",
  "package_question", "slots_question", "pick_slot", "confirm", "decline", "cancel",
  "prefer_nearest", "objection_distance", "objection_price", "objection_delay", "rating",
  "competitor", "identity", "female_doctor", "doctor_quality", "clinical_question",
  "drug_question", "records", "complaint", "handoff", "hours_question", "unsupported_specialty", "close", "other",
]);

const NEED_SET = new Set<string>(Object.keys(NEED_PLANS));

function parseClassifierJson(text: string, language: Classification["language"]): Classification | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const kind = String(raw.kind ?? "");
  if (!KIND_SET.has(kind as IntentKind)) return null;
  const need = String(raw.need ?? "");
  const slotPick = Number(raw.slotPick);
  const window = String(raw.window ?? "");
  return {
    kind: kind as IntentKind,
    need: NEED_SET.has(need) ? (need as DemoNeed) : null,
    // The model may return the patient's own words for a district; the DOMAIN
    // resolves those to a site, and an unrecognised district resolves to nothing.
    districtAr: typeof raw.district === "string" && raw.district.trim() ? raw.district.trim().slice(0, 40) : null,
    carrierRaw: typeof raw.carrier === "string" && raw.carrier.trim() ? raw.carrier.trim().slice(0, 40) : null,
    payment: raw.payment === "insurance" ? "insurance" : raw.payment === "cash" ? "cash" : null,
    slotPick: slotPick === 1 || slotPick === 2 ? slotPick : null,
    preferredWindowAr: window === "الصبح" || window === "بعد العصر" ? window : null,
    language,
    deterministic: false,
    // These four are read from the TEXT, never from the model: they are cheap,
    // exact, and a model that invents «the patient said thank you» would close a
    // live booking. The model tier only ever supplies the intent label.
    prefersFemale: false,
    prefersMale: false,
    courtesyOnly: false,
    correction: false,
    offerAsked: false,
    preferredDayAr: null,
  };
}

/**
 * ONE model call per turn, at most, and only when the deterministic pass shrugged.
 * Any failure — no key, mock adapter, malformed JSON, an unknown label, a network
 * error — degrades to `other`, which the scene machine answers with the honest-
 * unknown path (§8.2) rather than with a guess.
 */
export async function classify(
  raw: string,
  history: { role: "user" | "assistant"; content: string }[],
  offeredCount: number,
): Promise<Classification> {
  const quick = classifyDeterministic(raw, offeredCount);
  if (quick) return quick;

  const language = detectLanguage(raw);
  if (!isClaudeConfigured()) return { ...EMPTY, kind: "other", language, ...extractFacts(raw, normalizeArabic(raw)) };

  try {
    const adapter = await getAdapter();
    const trimmed = history.slice(-FAYSAL_MAX_HISTORY);
    const result = await adapter.generate(
      {
        system: CLASSIFIER_SYSTEM,
        messages: [
          ...trimmed.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: raw },
        ],
        maxTokens: 200,
      },
      "perception",
    );
    const parsed = parseClassifierJson(result.text, language);
    // The model supplies the LABEL; the facts stay deterministic. A model that
    // decided on its own that the patient said goodbye would close a live booking.
    const facts = extractFacts(raw, normalizeArabic(raw));
    if (!parsed) return { ...EMPTY, kind: "other", language, ...facts };
    return {
      ...parsed,
      ...facts,
      need: parsed.need ?? facts.need,
      districtAr: parsed.districtAr ?? facts.districtAr,
      carrierRaw: parsed.carrierRaw ?? facts.carrierRaw,
      payment: parsed.payment ?? facts.payment,
      preferredWindowAr: parsed.preferredWindowAr ?? facts.preferredWindowAr,
    };
  } catch {
    return { ...EMPTY, kind: "other", language, ...extractFacts(raw, normalizeArabic(raw)) };
  }
}
