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
import type { NeedKey } from "../_domain";
import { CARRIERS, SITES, SITE_IDS } from "../_domain";
import { normalizeArabic } from "../_domain/safety";
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
  | "close"
  | "other";

export interface Classification {
  kind: IntentKind;
  need: NeedKey | null;
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
};

// ── language (§3.1) ─────────────────────────────────────────────────────────

const GREETING_TOKENS =
  /^(?:hi|hello|hey|salam|salaam|السلام عليكم|سلام عليكم|هلا|مرحبا|مساء الخير|صباح الخير|اهلا|السلام)\b/;

/**
 * "Faysal replies in the language of the patient's most recent SUBSTANTIVE
 * clause. Greeting tokens do not count. Arabic is the home register and the
 * tie-break." A single English word inside Arabic (`MRI`, `laser`) does not flip
 * the language, so the test is on the majority of letters, not on presence.
 */
export function detectLanguage(raw: string): "ar" | "en" | "other" {
  const stripped = raw.replace(GREETING_TOKENS, " ").trim();
  const probe = stripped || raw;
  const arabic = (probe.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (probe.match(/[A-Za-z]/g) ?? []).length;
  const other = (probe.match(/[ऀ-ॿঀ-৿ሀ-፿฀-๿]/g) ?? []).length;
  if (other > arabic && other > latin) return "other";
  if (latin > arabic * 2 && latin >= 6) return "en";
  return "ar"; // mixed with no clear majority → Arabic (the tie-break)
}

// ── deterministic matchers ──────────────────────────────────────────────────

const has = (t: string, ...needles: string[]) => needles.some((n) => t.includes(normalizeArabic(n)));

const NEEDS: readonly { need: NeedKey; words: string[] }[] = [
  { need: "laser", words: ["ليزر", "ازاله شعر", "إزالة الشعر", "laser", "hair removal"] },
  { need: "orthodontics", words: ["تقويم", "braces", "aligner", "الينر"] },
  { need: "endodontics", words: ["عصب", "حشو عصب", "علاج جذور", "root canal"] },
  { need: "dental", words: ["اسنان", "سن", "ضرس", "تنظيف اسنان", "تبييض", "dental", "teeth", "tooth"] },
  { need: "dermatology", words: ["جلديه", "جلدية", "بشره", "حبوب الوجه", "derma", "skin"] },
  { need: "paediatrics", words: ["اطفال", "طفلي", "ابني الصغير", "بيبي", "pediatric", "paediatric"] },
  { need: "obgyn", words: ["نساء وولاده", "نسائيه", "حمل", "ولاده", "obgyn", "gynae"] },
  { need: "ent", words: ["انف واذن", "حنجره", "اذن", "ent"] },
  { need: "orthopaedics", words: ["عظام", "ركبه", "الركبه", "كتف", "ظهري", "ortho", "knee"] },
  { need: "employment_medical", words: ["فحص توظيف", "ما قبل التوظيف", "employment medical", "pre-employment"] },
  { need: "neurology", words: ["مخ واعصاب", "اعصاب", "صداع مزمن", "neurology"] },
  { need: "internal", words: ["باطنه", "باطنية", "internal medicine"] },
  { need: "general", words: ["كشف عام", "طب اسره", "عياده عامه", "general checkup", "family medicine"] },
];

/** District recognition is over the site seed's own `nearDistrictsAr`, never a guess. */
function findDistrict(t: string): string | null {
  for (const id of SITE_IDS) {
    for (const d of SITES[id].nearDistrictsAr) {
      const n = normalizeArabic(d);
      if (n.length >= 3 && t.includes(n)) return d;
    }
  }
  return null;
}

function findCarrier(t: string): string | null {
  for (const c of CARRIERS) {
    for (const a of c.aliases) {
      const n = normalizeArabic(a);
      if (n.length >= 3 && t.includes(n)) return c.nameAr;
    }
  }
  return null;
}

function findWindow(t: string): string | null {
  if (has(t, "الصبح", "الصباح", "بكره الصبح", "صباحا")) return "الصبح";
  if (has(t, "بعد العصر", "العصر", "بعد الظهر", "المسا", "المساء", "بالليل")) return "بعد العصر";
  return null;
}

/**
 * The deterministic pass. Returns `null` when it is NOT confident, which is the
 * only condition under which the model is asked.
 */
export function classifyDeterministic(raw: string, offeredCount: number): Classification | null {
  const t = normalizeArabic(raw);
  const language = detectLanguage(raw);
  const base: Classification = { ...EMPTY, language, deterministic: true };
  if (!t) return { ...base, kind: "other" };

  // Identity — asked sincerely (§1.5). Checked early: it outranks a booking read.
  if (has(t, "انت روبوت", "انت بوت", "انت انسان", "انت ذكاء", "are you a bot", "are you human", "انت مين", "من انت", "انت حقيقي"))
    return { ...base, kind: "identity" };

  // Handoff / escalation (§5.3, Rule MED-7).
  if (has(t, "ابي موظف", "ابي بشر", "ابي انسان يكلمني", "حولني", "ابي مسؤول", "ابي مدير", "speak to a human", "talk to someone"))
    return { ...base, kind: "handoff" };

  // Complaint (§5.3) — outranks price and booking in the stance order (§5.5).
  if (has(t, "انتظرت", "تاخرت عليكم", "زعلان", "مستاء", "سيئ", "شكوي", "اشتكي", "ضاع علي", "ما احترمتوا", "استرجاع", "ارجعوا فلوسي", "تعويض"))
    return { ...base, kind: "complaint" };

  // Rating (§5.4) — before competitor, because it names us, not them.
  if (has(t, "تقييم", "نجوم", "جوجل", "قوقل", "review", "stars", "rating")) return { ...base, kind: "rating" };

  if (has(t, "احسن من", "افضل من", "ارخص من", "مستشفي ثاني", "مجمع ثاني", "عيادات ثانيه", "compared to", "better than"))
    return { ...base, kind: "competitor" };

  // Clinical (§8.1 #1) and drug (#2) — never answered, always routed.
  if (has(t, "وش عندي", "ايش عندي", "وش سببه", "هل هو خطير", "تشخيص", "what do i have", "is it serious", "diagnose"))
    return { ...base, kind: "clinical_question" };
  if (has(t, "اي دواء", "وش اخذ", "مرهم", "مضاد حيوي", "حبوب اخذها", "what medicine", "which medicine", "antibiotic"))
    return { ...base, kind: "drug_question" };

  if (has(t, "نتيجه التحليل", "نتيجه الاشعه", "تقريري", "تقرير الاشعه", "التحاليل طلعت", "lab result", "my report"))
    return { ...base, kind: "records" };

  if (has(t, "دكتوره", "طبيبه", "female doctor", "lady doctor")) return { ...base, kind: "female_doctor" };
  if (has(t, "الدكتور زين", "الدكتور شاطر", "احسن دكتور", "افضل دكتور", "is the doctor good", "best doctor"))
    return { ...base, kind: "doctor_quality" };

  // Cancellation (Rule MED-6 — never argued).
  if (has(t, "الغي", "الغاء", "ابي الغي", "cancel")) return { ...base, kind: "cancel" };

  // Slot pick by ordinal. Picking by the slot's OWN WORDS — «السبت 11» — is matched
  // in the scene machine, which is the only layer that can see the offered labels.
  if (offeredCount > 0) {
    if (/(^|\s)(1|الاول|الاولي|الخيار الاول)(\s|$)/.test(t)) return { ...base, kind: "pick_slot", slotPick: 1 };
    if (/(^|\s)(2|الثاني|الثانيه|الخيار الثاني)(\s|$)/.test(t) && offeredCount > 1)
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
  const district = findDistrict(t);
  if (nearest && district) return { ...base, kind: "prefer_nearest", districtAr: district };
  if (nearest) return { ...base, kind: "prefer_nearest" };

  // Price (§5.2). «كم» / «السعر» / «التكلفة».
  if (has(t, "باقه", "باقات", "package", "packages")) return { ...base, kind: "package_question" };
  if (has(t, "كم سعر", "السعر", "بكم", "التكلفه", "كم يكلف", "كم تكلف", "how much", "price", "cost"))
    return { ...base, kind: "price_question" };

  // Insurance (§5.2). Distinguish "do you take X?" from "I have X".
  const carrier = findCarrier(t);
  if (has(t, "تامين", "التامين", "insurance") || carrier) {
    const declaring = has(t, "عندي", "معي", "معاي", "i have", "my insurance is");
    if (declaring && carrier) return { ...base, kind: "payment", payment: "insurance", carrierRaw: carrier };
    return { ...base, kind: "insurance_question", carrierRaw: carrier };
  }
  if (has(t, "كاش", "نقدا", "ادفع كاش", "cash")) return { ...base, kind: "payment", payment: "cash" };

  // Hours / branch status (§2.3, Rule C4-1).
  if (has(t, "الدوام", "متي تفتحون", "متي يفتح", "مفتوح", "مسكر", "شغالين", "open now", "opening hours"))
    return { ...base, kind: "hours_question", districtAr: district };

  // Slots.
  if (has(t, "اقرب موعد", "متي فيه موعد", "المواعيد", "متي اقدر اجي", "ابي موعد", "احجز", "حجز", "appointment", "book", "slots"))
    return { ...base, kind: "slots_question", districtAr: district };

  // Confirm / decline. Kept LATE so «إي غالي» reads as an objection, not a yes.
  //
  // NOTE THE BOUNDARY. These used `\b`, and `\b` in JS is ASCII-word-based: between
  // «ي» and a space there is NO boundary, so `/^(?:اي|…)\b/` never matched a single
  // Arabic token in its life. Driven: «إي ثبته» fell through to `other` and the
  // patient got the honest-unknown line one tap from a confirmed booking. Same
  // class of bug as SPEC-4 §1.2's first row, in a different file.
  //
  // The boundary is a negative lookahead for a LETTER OR DIGIT, not `\s|$`: the
  // patient taps the chip «إي، ثبّته» and normalization leaves the «،» in place, so
  // a whitespace-only boundary missed the yes on the turn before a confirmed
  // booking. Punctuation is a boundary; a letter is not.
  const wordEnd = "(?![ء-يa-z0-9])";
  if (new RegExp(`^(?:اي|ايه|ايوه|نعم|تمام|زين|اوك|ok|okay|yes|yep|اكيد|موافق|اثبته|ثبته|ثبت|اثبت|اثبتها|احجزه|يالله|ماشي)${wordEnd}`).test(t) ||
      has(t, "اثبته", "ثبته", "احجزه", "احجز لي", "confirm it", "book it"))
    return { ...base, kind: "confirm", preferredWindowAr: findWindow(t) };
  if (new RegExp(`^(?:لا|ما ابي|مو الحين|no|nope|not now)${wordEnd}`).test(t)) return { ...base, kind: "decline" };

  if (has(t, "شكرا", "مشكور", "الله يعطيك العافيه", "thanks", "thank you", "bye", "سلام عليكم فقط"))
    return { ...base, kind: "close" };

  // A stated need — checked after the specific intents so «كم سعر الليزر» reads as
  // a price question about laser, not as a bare need.
  for (const row of NEEDS) {
    if (has(t, ...row.words)) {
      return { ...base, kind: "need", need: row.need, districtAr: district, carrierRaw: carrier };
    }
  }

  if (district) return { ...base, kind: "district", districtAr: district };

  // Greeting only — «السلام عليكم» with nothing after it.
  if (GREETING_TOKENS.test(raw.trim()) && t.split(" ").length <= 4) return { ...base, kind: "greeting_only" };

  return null; // NOT confident → ask the model.
}

// ── the LLM seam ────────────────────────────────────────────────────────────

const CLASSIFIER_SYSTEM = `أنت مصنّف نوايا لمحادثة حجز مواعيد في مجمع طبي بالرياض. لست وكيلاً ولا ترد على المريض.
مهمتك الوحيدة: تقرأ آخر رسالة من المريض وتُخرج JSON فقط، بدون أي نص آخر.

الحقول:
{"kind": <واحد من القائمة>, "need": <واحد من قائمة الاحتياجات أو null>, "district": <اسم الحي كما كتبه المريض أو null>, "carrier": <اسم شركة التأمين كما كتبها أو null>, "payment": "insurance"|"cash"|null, "slotPick": 1|2|null, "window": "الصبح"|"بعد العصر"|null}

kind ∈ [greeting_only, need, district, payment, insurance_question, price_question, package_question, slots_question, pick_slot, confirm, decline, cancel, prefer_nearest, objection_distance, objection_price, objection_delay, rating, competitor, identity, female_doctor, doctor_quality, clinical_question, drug_question, records, complaint, handoff, hours_question, close, other]

need ∈ [laser, dermatology, dental, orthodontics, endodontics, paediatrics, obgyn, ent, orthopaedics, internal, general, employment_medical, neurology, after_hours, null]

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
  "drug_question", "records", "complaint", "handoff", "hours_question", "close", "other",
]);

const NEED_SET = new Set<string>([
  "laser", "dermatology", "dental", "orthodontics", "endodontics", "paediatrics", "obgyn",
  "ent", "orthopaedics", "internal", "general", "employment_medical", "neurology", "after_hours",
]);

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
    need: NEED_SET.has(need) ? (need as NeedKey) : null,
    // The model may return the patient's own words for a district; the DOMAIN
    // resolves those to a site, and an unrecognised district resolves to nothing.
    districtAr: typeof raw.district === "string" && raw.district.trim() ? raw.district.trim().slice(0, 40) : null,
    carrierRaw: typeof raw.carrier === "string" && raw.carrier.trim() ? raw.carrier.trim().slice(0, 40) : null,
    payment: raw.payment === "insurance" ? "insurance" : raw.payment === "cash" ? "cash" : null,
    slotPick: slotPick === 1 || slotPick === 2 ? slotPick : null,
    preferredWindowAr: window === "الصبح" || window === "بعد العصر" ? window : null,
    language,
    deterministic: false,
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
  if (!isClaudeConfigured()) return { ...EMPTY, kind: "other", language };

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
    return parseClassifierJson(result.text, language) ?? { ...EMPTY, kind: "other", language };
  } catch {
    return { ...EMPTY, kind: "other", language };
  }
}
