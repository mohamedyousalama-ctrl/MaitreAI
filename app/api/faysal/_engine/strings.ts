// ============================================================================
// فيصل / Faysal — THE FROZEN STRINGS.
//
// Every string below is a `[FROZEN]` id from docs/faysal/SPEC-2-PERSONA.md, or a
// `[FROZEN]` rule string from SPEC-1 §11 / SPEC-4 §4.2. They ship as constants,
// the way `frozenAddressAsk()` and `frozenSafetyDeflection()` do in
// `lib/ai/delivery-readiness.ts`. Changing one is a reviewed change, not a prompt
// tweak. A `[FROZEN]` string may carry data slots; it may not be paraphrased.
//
// THE MODEL NEVER SEES THESE AS SUGGESTIONS. `_engine/scenes.ts` selects them and
// the route emits them. The LLM seam (`_engine/intent.ts`) classifies intent and
// extracts entities — it does not compose a reply, and it cannot reach a number,
// a slot, a price, a doctor or a branch status.
//
// REGISTER NOTES that bind every string here (SPEC-2 §1.3):
//   · `أبي`, never `أريد`, and NEVER `أبغى` — `أبغى` is on the shared linter's
//     HIJAZI axis and Faysal is Najdi. It stays fully accepted INBOUND: patients
//     say it constantly and no matcher may narrow on a dialect axis.
//   · `زين`, never `كويس` (SPEC-2 §11.2b `NAJDI_LEXICAL` — the shared linter is
//     deaf to it, because `كويس` is not a foreign marker, it is just not Najdi).
//   · Western digits everywhere; `ر.س` AFTER the amount; single-asterisk emphasis
//     only. `formatCustomerVisibleText(…, "saudi")` enforces the first two on
//     every outbound in `turn/route.ts`, in both directions.
//   · Emoji allowlist is THREE, with three contexts: ✅ (confirmation header only),
//     🙏 (a serious apology, and rail C), 🚨 (the rail only). Nothing else, ever.
// ============================================================================

import { OPS, REAL_CONTACTS } from "../_domain";

// ESLint's `local-rules/no-arabic-name-number-interpolation` warns on every
// interpolated Arabic template below, and that is expected here rather than a
// smell to silence. The rule's fix — "compose it in JSX with <Bdi>/<Num>/<Phone>"
// — presumes a React tree; these are WhatsApp MESSAGE strings and there is no JSX
// on the wire. The same warning fires 168 times across `lib/ai`, for the same
// reason. The actual mitigation is applied where the text is rendered:
// `app/faysal/FaysalChat.tsx` sets `unicode-bidi: plaintext` per bubble, so each
// LINE resolves its own direction — which is what WhatsApp itself does, and what
// makes «011 496 4455» read left-to-right inside a right-to-left message.

const nbsp = (s: string) => s; // marker for strings whose spacing is load-bearing

// ── Rule DEMO-1 — three placements (SPEC-1 §11) ─────────────────────────────

/** (a) Page chrome, persistent. Never scrolls away. Rendered by `app/faysal`. */
export const DEMO_1_A = "عرض تجريبي — ليس قناة حجز فعلية لمجموعة الوطن الطبية";

/**
 * (b) First message of every conversation, BEFORE Faysal's greeting, as a SYSTEM
 * line and NOT in Faysal's voice — putting it in his voice would make it a claim
 * he is making, and SPEC-2 §8.1 #16 `machine_jargon` would then have to allow
 * self-description as software.
 *
 * It MUST carry the REAL booking numbers. A demo that wears a clinic's name and
 * offers no route to the actual clinic is the version that could hurt someone.
 *
 * Detail 4b: when the FIRST inbound fires the rail, (b) is DEFERRED to the first
 * non-rail turn — not dropped, and never appended to a rail turn (detail 5).
 */
export const DEMO_1_B =
  `هذا عرض تجريبي. الأطباء والمواعيد والأسعار المعروضة هنا افتراضية للعرض فقط، وغير معتمدة من مجموعة الوطن الطبية. ` +
  `للحجز الفعلي: ${REAL_CONTACTS.unified} أو واتساب ${REAL_CONTACTS.whatsapp}. وللطوارئ: ${REAL_CONTACTS.emergency}.`;

/**
 * (c) On EVERY confirmation block. This is the one that survives a screenshot —
 * the artefact that leaves the UI with no page chrome attached, carrying the
 * group's real registered trade name and a real branch address.
 *
 * Emitted by the renderer, never by the model. It is plain and deliberately flat:
 * it is not in Faysal's register, because it is not Faysal speaking. No emoji.
 */
export const DEMO_1_C = "حجز تجريبي — غير مسجّل لدى الفرع.";

// ── §1.5 — identity ─────────────────────────────────────────────────────────

export const PERSONA_IDENTITY_HONEST =
  "أنا فيصل، أرتّب مواعيد مرضى مجموعة الوطن الطبية وأتابع معك من هنا. تفضّل، وش تحتاج؟";

// ── §2.2 — the five greetings ───────────────────────────────────────────────

/** G1 — new patient, inside opening hours. The default. */
/** §2.2 addendum — the greeting ECHO. Used only when Faysal has already greeted
 *  and the patient sends a courtesy. Mirrors the form («مساء الخير» → «مساء
 *  النور», «السلام عليكم» → «وعليكم السلام»), then nudges back to the open
 *  question if there is one. One question mark at most; nothing else appended. */
/** A live hold and a message the rules could not read — re-ask, and say how to
 *  book under a name. Exactly one question mark. */
export const HOLD_REASK = "ما فهمت عليك، وما أبي أخمّن.\nأثبّت لك الموعد اللي ماسكه لك؟ ولو تبيه باسمك، اكتب اسمك ورقم جوالك.";

export const greetingEcho = (raw: string, openQuestion: string | null, language: "ar" | "en" | "other" = "ar"): string => {
  const t = raw.trim();
  let ack: string;
  if (language === "en") {
    // An English thread gets an English echo AND an English open question — never
    // an English hello glued to an Arabic question (§3.1 register).
    ack = "Hello, welcome back.";
    return openQuestion ? `${ack}\n${openQuestion}` : `${ack}\nTell me what you need and which district, and I will arrange it.`;
  }
  if (/^(?:ال)?سلام/.test(t)) ack = "وعليكم السلام ورحمة الله.";
  else if (/^مساء/.test(t)) ack = "مساء النور.";
  else if (/^صباح/.test(t)) ack = "صباح النور.";
  else if (/^(?:hi|hello|hey)/i.test(t)) ack = "Hello, welcome back.";
  else ack = "هلا والله.";
  return openQuestion ? `${ack}\n${openQuestion}` : `${ack}\nقل لي وش تحتاج وبأي حي، وأرتّب لك.`;
};

export const GREETING_NEW_PATIENT = nbsp(
  `حياك الله، معك فيصل من مجموعة الوطن الطبية.
أنا اللي أرتّب المواعيد بين فروعنا في الرياض، وأقدر أشوف لك الأقرب لك والأنسب لحالتك.
وش اللي تحتاجه اليوم — كشف عام، عيادة معيّنة، ولا تحاليل وأشعة؟`,
);

/** G2 — returning patient. Memory is LOGISTICS only; never clinical content. */
export const greetingReturningPatient = (firstName: string, lastBranch: string, lastSpecialty: string) =>
  `هلا ${firstName}، حياك الله. معك فيصل من مجموعة الوطن الطبية.
آخر زيارة لك كانت في ${lastBranch} عند ${lastSpecialty}.
تبي نكمل مع نفس الدكتور، ولا عندك شي ثاني اليوم؟`;

export const greetingReturningShort = (firstName: string, lastDoctor: string, lastBranch: string) =>
  `هلا ${firstName}، حياك الله.
تبي نكمل مع ${lastDoctor} في ${lastBranch}، ولا عندك شي ثاني اليوم؟`;

/** G3 — Friday, before the branch opens. States the REAL time, then converts. */
export const greetingFridayBeforeOpen = (branchName: string, openTime: string) =>
  `هلا بك، معك فيصل من مجموعة الوطن الطبية.
اليوم جمعة والدوام يبدأ متأخر — ${branchName} يفتح ${openTime}.
أقدر أثبّت لك موعد من الحين وتجي على الجاهز، ولا ترتاح وأرتّب لك بكرة الصبح؟`;

/**
 * G4 — after midnight. The middle line asserts OPEN NOW, which is precisely what
 * `erSites({ now })` returns. It does NOT claim 24 hours: a site whose Friday ER
 * runs 16:00–02:00 is eligible at 00:40, and a patient who reads «around the
 * clock» arrives at 03:00 to a locked door.
 */
export const greetingAfterMidnight = (erBranchName: string) =>
  `حياك الله، معك فيصل من مجموعة الوطن الطبية.
أعرف إن الوقت متأخر — العيادات مسكّرة الحين، والطوارئ في ${erBranchName} مفتوحة الحين.
إذا الموضوع يستنى الصبح، أثبّت لك موعد من الحين — تفضّل الصبح ولا بعد العصر؟`;

/**
 * G4 fallback — `erSites({ now })` returned zero eligible sites, INCLUDING because
 * every row is stale and INCLUDING because the tool errored. This is the DEFAULT
 * the code reaches whenever anything is uncertain, not a rare degradation.
 * `997` is a frozen literal, not a slot: a slot that can render empty in the
 * highest-consequence sentence in the product is not a slot.
 */
export const GREETING_AFTER_MIDNIGHT_NO_ER =
  `حياك الله، معك فيصل من مجموعة الوطن الطبية.
أعرف إن الوقت متأخر — العيادات مسكّرة الحين. لو الحالة ما تستنى، روح لأقرب طوارئ أو اتصل على 997.
إذا الموضوع يستنى الصبح، أثبّت لك موعد من الحين — تفضّل الصبح ولا بعد العصر؟`;

/** G5 — a branch whose open/closed status is UNVERIFIED. The honesty showpiece. */
export const greetingBranchUnverified = (branchName: string, altBranchName: string, branchPhone: string) =>
  `حياك الله، معك فيصل من مجموعة الوطن الطبية.
بخصوص ${branchName} — دوامه اليوم مو مؤكد عندي، وما أبي أعطيك معلومة غير أكيدة وتطلع من بيتك على الفاضي.
أثبّت لك في ${altBranchName} وهو شغّال أكيد، ولا تتأكد من ${branchName} مباشرة على ${branchPhone} وأنا موجود هنا؟`;

/**
 * G5 third option — Rule C4-1: a contested site is bookable, but NEVER silently.
 * It asks for a coarse window in the patient's words and promises the branch will
 * call. It renders NO time: a provisional time is still a time someone drives
 * forty minutes for.
 */
export const greetingBranchUnverifiedBookAnyway = (branchName: string, branchPhone: string) =>
  `تمام، أسجّل لك طلب في ${branchName} — بس بشرط تكون عارف: دوامه قيد التأكيد، فما أعطيك وقت محدد عشان ما أخليك تجي على الفاضي.
قل لي الوقت اللي يناسبك — الصبح ولا بعد العصر — والفرع يتصل عليك ويثبته.
قبل ما تطلع من بيتك، اتصل على ${branchPhone} وتأكد إنه فاتح.`;

// ── §3.3 — third languages, the ONLY bilingual message in the product ───────

export const languageThirdLanguage = (branchPhone: string) =>
  `I can help you in Arabic or English. If you prefer another language, please call ${branchPhone} and reception will assist you.
أقدر أساعدك بالعربي أو الإنجليزي. لو تفضّل لغة ثانية، اتصل على ${branchPhone} والاستقبال يساعدك.`;

// ── §5.1 — the `urgent` tier (a persona surface, NOT the rail) ──────────────

/**
 * No ambulance instruction, no ER as mandatory, no emoji (`urgent` is a clinical
 * message and 🚨 belongs to the rail alone). The escalation sentence is LAST,
 * never buried mid-message and never omitted to keep the tone light.
 */
export const safetyUrgent = (sameDaySlot: string, branch: string) =>
  `اللي وصفته يحتاج يتشاف اليوم، مو بعد أيام.
عندي ${sameDaySlot} في ${branch}. أثبّته لك؟
ولو زاد عليك قبل الموعد، لا تنتظر — الطوارئ و 997 موجودين.`;

// ── §5.2 — price and insurance ─────────────────────────────────────────────

export const priceNotLoaded = (knownFact: string) =>
  `السعر ما أقدر أعطيك إياه من راسي — الرقم يطلع من الاستقبال حسب العيادة ونوع الزيارة.
اللي أقدر أقوله لك أكيد: ${knownFact}.
تبي أثبّت لك الكشف وتاخذ الرقم من الاستقبال قبل ما تدخل؟`;

/**
 * `insurance.class_honesty`. The canonical copy lives with `insuranceAnswer()` in
 * the domain, because the carrier name has to be resolved against the network
 * list before it can be spoken. This is the same sentence, kept here so the
 * frozen-string snapshot test has one place to read every id.
 */
export const insuranceClassHonesty = (insurer: string) =>
  `شبكة ${insurer} والفئة والتحمّل تطلع من بطاقتك نفسها، والاستقبال يأكدها لك قبل الكشف.
ما أبي أقول لك "مغطّى" وتطلع غير كذا.`;

/** Rule INS-4 — aesthetic services. Stated as posture, never as fact. */
export const INSURANCE_AESTHETIC_NOTE =
  "وبالعادة جلسات الليزر تنحسب كاش، بس ما أجزم لك — الاستقبال يأكدها من بطاقتك.";

// ── §5.3 — complaint ───────────────────────────────────────────────────────

export const complaintWaitOwnIt = (doctorOrSpecialty: string, slot: string) =>
  `معك حق، والانتظار اللي صار مو مقبول، وأعتذر لك عنه 🙏
اللي بيدي أسويه لك الحين: موعد مثبّت باسمك مع ${doctorOrSpecialty} في وقت محدد، بدل ما تجي وتنتظر دورك.
تبي أثبّت لك ${slot}؟`;

/**
 * `complaint.wait_own_it`, for the case where there is no slot to offer yet — the
 * patient complained before naming a need. Line 1 is `complaint.wait_own_it`'s
 * first line VERBATIM, because that line is the whole rule: own it first, no
 * explanation before the apology. Line 2 keeps the shape — one thing he controls,
 * then one question — and offers the handoff rather than a slot he does not have.
 * 🙏 is on the three-item allowlist for exactly this: a serious apology for a wait.
 */
export const COMPLAINT_OWN_IT_NO_SLOT =
  `معك حق، والانتظار اللي صار مو مقبول، وأعتذر لك عنه 🙏
اللي بيدي أسويه لك: موعد مثبّت باسمك في وقت محدد بدل ما تجي وتنتظر دورك — ولو تبي مسؤول من الفرع يكلمك، أحوّلك لهم الحين؟`;

export const COMPLAINT_ESCALATE_OFFER =
  `هذا الموضوع يحتاج مسؤول من الفرع يتكلم معك، وما أبي أعدك بشي ما أملكه.
أحوّلك لهم الحين؟`;

// ── §5.4 — competitor and rating ───────────────────────────────────────────

export const competitorDecline = (specific1: string, specific2: string) =>
  `ما أقدر أتكلم عن غيرنا، وما هو من شغلي.
اللي أقدر أقوله لك عنّا بالتحديد: ${specific1}، و${specific2}.`;

/**
 * He does NOT quote a rating number, does not dispute one, does not explain the
 * reviews away, and does not promise the rating will improve. «أضمنه» is permitted
 * here because it guarantees a BOOKING he controls — never an outcome, a wait, or
 * a result.
 */
export const RATING_NO_ARGUMENT =
  `ما راح أجادلك في التقييم، وما أدافع عن شي أنت شفته بنفسك.
اللي بيدي أسويه لك: موعد مثبّت باسمك مع دكتور محدد ووقت محدد، بدل ما تجي وتنتظر دورك في الاستقبال. هذا اللي أقدر أضمنه لك اليوم.`;

// ── §6 — the sales motion ──────────────────────────────────────────────────

export const MOTION_DISCOVER = "عشان أرتّب لك صح: وش تحتاج بالضبط، وأنت بأي حي؟";
export const MOTION_DISCOVER_PAYMENT = "تمام. وآخر شي: الزيارة تأمين ولا كاش؟";
export const MOTION_DISCOVER_SHORT = "تمام. أنت بأي حي، والزيارة تأمين ولا كاش؟";

/** The window the patient named has nothing in it. Their words back, then the truth,
 *  then what does exist — «ابغى بعد الساعة ٧» answered with 4:30 م and nothing said
 *  is a patient reading a time they had already ruled out. */
export const windowNotAvailable = (windowAr: string, branch: string) =>
  `ما لقيت لك ${windowAr} في ${branch} — هذا اللي متاح، ولو ما ناسبك أسجّل لك طلب بالوقت اللي تبيه.`;

/** One branch, and the reason it is that branch. Never «أي فرع يمشي». */
// The reason comes from the routing table and half of those rows end in a full
// stop already, so the template was printing «…والتقويم عندهم..» to every patient
// it routed. Two dots is the smallest possible tell that a machine wrote the line.
export const motionMatch = (branchName: string, reason: string) =>
  `اللي يناسبك: ${branchName} — ${reason.replace(/[.。]+$/, "")}.`;

/**
 * The geography fork. Order is BINDING: nearest first (he is not hiding it),
 * honesty marker second («بس أصارحك»), the cost stated plainly («أبعد عليك»), two
 * options, one question. He never says the near branch is worse — he says what is
 * ONLY at the further one.
 */
export const motionMatchFork = (a: {
  nearBranch: string;
  nearCapability: string;
  procedure: string;
  bestBranch: string;
  /** The same branch, as a coordinator says it the second time. */
  bestShort: string;
  bestReason: string;
  optionNear: string;
  optionBest: string;
}) =>
  // Same trailing-stop strip as `motionMatch`: the routing reasons are data and half
  // of them already end in a full stop.
  `أقرب فرع لك هو ${a.nearBranch}، وفيه ${a.nearCapability}.
بس أصارحك: ${a.procedure} نسويه في ${a.bestBranch} — ${a.bestReason.replace(/[.。]+$/, "")}. ${a.bestShort} أبعد عليك، وهذا الفرق الوحيد بين الخيارين.
عندك طريقين:
1) ${a.optionNear}
2) ${a.optionBest}
أي طريق أريح لك؟`;

// §6.4 — acknowledge → one specific → one fork. Never argue, never a third attempt.
export const motionObjectionDistance = (nearBranch: string, capability: string, bestBranch: string) =>
  `المسافة فرق حقيقي، ما أنكره. لو تفضّل الأقرب أثبّت لك في ${nearBranch} على طول — بس أبي تكون عارف إن ${capability} في ${bestBranch}. تختار؟`;

export const motionObjectionPrice = (specificAlternative: string) =>
  `السعر هو السعر، وما راح أزوّقه لك. اللي أقدر أسويه: ${specificAlternative}. يناسبك؟`;

export const motionObjectionDelay = (slot: string) =>
  `خذ راحتك. أثبّت لك ${slot} مبدئياً، وإذا غيّرت رأيك ترد هنا وألغيه — بدون أي التزام؟`;

export const motionObjectionDoctor = (credential: string) =>
  `ما أقيّم لك دكتور، وما هو من شغلي. اللي أقدر أقوله: ${credential}. وإذا ما ارتحت بعد الزيارة، رد هنا وأغيّر لك.`;

/** One objection handled once. Declined twice → stop selling, hold the door open. */
export const MOTION_OBJECTION_STOP =
  "تمام، ما فيه أي ضغط. المحادثة هذي مفتوحة، متى ما تحتاج ترد هنا.";

/** §6.5 — two named times. Never an open question, never more than two. */
export const motionClose = (branch: string, clinic: string, slot1: string, slot2: string) =>
  `عندي موعدين في ${branch} عند ${clinic}:
• ${slot1}
• ${slot2}
أي وقت أثبّت لك؟`;

export const motionCloseSingle = (slot: string, branch: string) => `عندي ${slot} في ${branch}. أثبّته باسمك؟`;

export const motionCloseNone = (branch: string, altSlot: string, altBranch: string, altSlot2: string) =>
  `ما فيه موعد في ${branch} في الوقت اللي تبيه. أقرب شي عندي ${altSlot}، أو ${altBranch} في ${altSlot2}. أيهما؟`;

/**
 * §6.6 EXPAND — gated on FOUR conditions, all of which must be true: the primary
 * booking is LOCKED, the patient raised the need themselves in their own words, it
 * saves them a real second trip, and it is never clinical.
 */
export const motionExpand = (statedNeed: string, forPronoun: string, specialty: string, slot: string) =>
  `وبما إنك ذكرت ${statedNeed} — أقدر أحجز ${forPronoun} عند ${specialty} في نفس الفرع ونفس اليوم، قريب من موعدك عشان تجون مرة وحدة.
عندي ${slot}. أثبّته؟`;

// ── §6.7 — the confirmation block (ATOMIC: its own message, nothing appended) ─

export const motionConfirmBlock = (a: {
  patientName: string;
  branchName: string;
  branchAddress: string;
  clinic: string;
  slot: string;
  insurer: string | null;
}) =>
  `تم الحجز ✅

الاسم: ${a.patientName}
الفرع: ${a.branchName} — ${a.branchAddress}
العيادة: ${a.clinic}
الموعد: ${a.slot}${a.insurer ? `\nالتأمين: ${a.insurer} — الاستقبال يأكد الفئة والتحمّل من البطاقة` : ""}

${DEMO_1_C}`;

/**
 * The `callback_request` variant. SPEC-1 §4.6: it "does not consume slot inventory
 * and NEVER renders a time the patient could turn up for." So there is NO `الموعد:`
 * row at all — not a greyed one, not a provisional one, not a time with a caveat.
 * `{preferred_window}` is a coarse window in the PATIENT's own words, echoed back;
 * it is not a proposal.
 */
export const motionConfirmBlockCallback = (a: {
  patientName: string;
  branchName: string;
  branchAddress: string;
  clinic: string;
  preferredWindow: string;
  branchPhone: string;
}) =>
  `تم تسجيل طلبك ✅

الاسم: ${a.patientName}
الفرع: ${a.branchName} — ${a.branchAddress}
العيادة: ${a.clinic}
الوقت اللي تفضّله: ${a.preferredWindow}
الفرع يتصل عليك ويثبت الوقت. ولو تبي تستعجل: ${a.branchPhone}

${DEMO_1_C}`;

/**
 * Pre-visit, as a SEPARATE message. Logistics ONLY — never a clinical preparation
 * (fasting, stopping a medication, shaving an area, avoiding sun) unless it is a
 * loaded, clinician-authored field on the appointment type.
 */
export const motionPreVisit = (arrivalBuffer: number = OPS.arrivalBufferMinutes, payment: "insurance" | "cash" | null = null) =>
  // A patient who said «كاش» was still being told to bring an insurance card. It is
  // a small line and it is the last thing they read, so it is the line that decides
  // whether the whole confirmation sounds like it was written for them.
  `تجيب معك ${payment === "cash" ? "الهوية أو الإقامة" : "الهوية أو الإقامة وبطاقة التأمين"}، وتحاول توصل قبل الموعد بـ ${arrivalBuffer} دقيقة عشان إجراءات الاستقبال.
وأي تعديل بعدين، ترد هنا على نفس المحادثة وأنا أتابع معك.`;

/**
 * Pre-visit for a `callback_request`. The slot variant tells the patient to arrive
 * fifteen minutes before «الموعد» — and a callback has no موعد, by construction
 * (SPEC-1 §4.6). Telling someone to arrive early for an appointment that does not
 * exist is the same defect as rendering a provisional time, one message later.
 */
export const preVisitCallback = (payment: "insurance" | "cash" | null = null) =>
  `لما يتصلون ويثبتون الوقت، تجيب معك ${payment === "cash" ? "الهوية أو الإقامة" : "الهوية أو الإقامة وبطاقة التأمين"}.
وأي تعديل بعدين، ترد هنا على نفس المحادثة وأنا أتابع معك.`;

// ── §7 — scene strings ─────────────────────────────────────────────────────

export const sceneFollowup = (firstName: string, branch: string) =>
  `هلا ${firstName}. زيارتك في ${branch} تمت أمس — تحتاج أي شي متعلق بها، موعد متابعة أو تعديل؟`;

export const SCENE_CLOSE = "تم. أي شي ثاني تحتاجه، أنا هنا.";

/**
 * THE BOOKING IS MADE AND THE PATIENT SAID THANK YOU. He was answering that with
 * «ما أقدر أأكدها لك من عندي» — the honest-unknown line — or, worse, with a fresh
 * slot list that placed a SECOND hold. A person who has just booked someone says
 * the appointment back to them and lets them go.
 */
export const bookingStands = (slot: string, branch: string, clinic: string) =>
  `إي، باقي زي ما هو: ${slot} في ${branch} عند ${clinic}.
وأي تعديل، رد هنا وأنا أعدّله لك.`;
export const bookingStandsCallback = (branch: string) =>
  `طلبك مسجّل في ${branch} والفرع يتصل عليك يثبّت الوقت.
وأي تعديل، رد هنا وأنا أتابع معك.`;
export const NO_BOOKING_YET = `ما عندي حجز مثبّت لك في هذي المحادثة.
تبيني أشوف لك أقرب موعد؟`;
export const closeBooked = (slot: string, branch: string) =>
  `الله يسلمك. موعدك ${slot} في ${branch}، ونشوفك على خير.`;
export const closeBookedPlain = (slot: string, branch: string) =>
  `تم. موعدك ${slot} في ${branch}، وأي شي ثاني أنا هنا.`;
export const CLOSE_BOOKED_CALLBACK =
  "تم. طلبك مسجّل والفرع يتصل عليك يثبّت الوقت، وأي تعديل رد هنا.";

/** «أبي أغير الوقت» after a confirmed booking. The current appointment is said
 *  back FIRST — a patient who is not sure what they have cannot choose. */
export const rescheduleOffer = (current: string, a: string, b: string) =>
  `أكيد. موعدك الحالي ${current}.
عندي بداله:
• ${a}
• ${b}
أي وقت أنقله له؟`;
export const rescheduleNoAlternative = (current: string, branchPhone: string) =>
  `موعدك الحالي ${current}، وما لقيت له بديل مثبّت من عندي.
تتصل على ${branchPhone} والاستقبال ينقله لك، وأنا موجود هنا.`;

/** Two offered times, both named in one message («4:30 ولا 5:15؟»). Faysal must not
 *  guess: he holds NOTHING and asks which. */
export const whichOfTwo = (a: string, b: string) => `أي وقت أثبّت لك: ${a} ولا ${b}؟`;

/** A complaint while a slot is held or booked. The held time is NEVER re-searched
 *  away (that silently lost the 4:30 a patient had just fought for), and no
 *  wait-time is promised — only a route to a human. */
// «وأنا أتابع معهم» narrates an action with a third party that has not happened —
// §8.1 #22 escalation_pre_claim, the same rule that keeps the handoff line from
// being said before the handoff fires. What he can honestly promise is that this
// thread stays open and that the branch has a number.
export const complaintRoute = (branchPhone: string) =>
  `وإذا وصلت وصار تأخير عند الاستقبال، رد هنا على نفس المحادثة وأنا أتابع معك، أو تتصل على ${branchPhone}.`;
export const COMPLAINT_OWN_IT_AGAIN = "معك حق، وأعتذر لك.";

// ── §8.2 — the universal fallback ──────────────────────────────────────────

/**
 * `{concrete_alternative}` is ALWAYS one of: a branch phone number, a booking he
 * CAN make, or an offered handoff. Never "check the website", never "try again
 * later", never nothing.
 */
export const fallbackHonestUnknown = (concreteAlternative: string) =>
  `هذي المعلومة ما أقدر أأكدها لك من عندي، وما أبي أعطيك شي غير أكيد.
أقرب طريق لك: ${concreteAlternative}.`;

// ── refusals from §8.1, in-voice ───────────────────────────────────────────

export const CLINICAL_DIAGNOSIS_REFUSAL = "ما أقدر أقول لك وش السبب — هذا شغل الدكتور، وأنا أوصّلك له بأسرع موعد.";

export const DRUG_NAMING_REFUSAL = "الدواء يكتبه الدكتور بعد الكشف.";
export const TREATMENT_ADVICE_REFUSAL =
  "ما أعطي إرشادات علاجية. لو الوضع يزيد، الطوارئ أقرب لك من الموعد.";
/**
 * A LATER TURN INSIDE AN OPEN TRIAGE HOLD (SPEC-4 §1.5 R2, H-3 and H-6).
 *
 * The first message of a red flag is §4.2's frozen rail, byte for byte, and it stays
 * that way. What changed is turn three: the full four-line siren was re-sent verbatim
 * for «شكرا», for «يعطيك العافية», and for «عطني رقم الفرع أتصل عليهم بكرة» — six
 * identical copies in one thread. Two testers named that as the moment he stopped
 * being a person, and H-6 is explicit that a patient under a hold «may always be
 * handed a phone number. The hold blocks committing, never unwinding or helping.»
 *
 * So the hold is unchanged — no booking, no slot, no chips, the same stopReason and
 * the same S0_safety scene — and only the WORDS change: §5.3's own refusal with the
 * booking clause removed, the emergency route restated, and the number they asked
 * for. A new HARD hit re-fires the byte-exact rail (H-7), which the route enforces.
 *
 * WORDING PROVENANCE: assembled from sentences already frozen in SPEC-2 §5.1/§5.3;
 * it introduces no new clinical claim. It is nonetheless a rail-adjacent string and
 * is recorded in docs/faysal/AUDIT-WAVE2.md for the §12 row 4 clinician review.
 */
export const holdTurn = (branchPhone: string) =>
  `${TREATMENT_ADVICE_REFUSAL}
997 و الطوارئ موجودين لك الحين، وما أقدر أثبّت لك موعد والوضع كذا.
ورقم الفرع لو تحتاجه: ${branchPhone}.`;

export const GUARANTEED_OUTCOME_REFUSAL =
  "النتيجة تختلف من حالة لحالة، والدكتور يقول لك المتوقع بعد التقييم.";
/** The same promise-nothing sentence, shortened to ride at the END of a reply that
 *  is doing something else. §9 turn 10's shape: the booking moves, the preference
 *  is noted out loud, and nothing about a specific clinician is claimed. */
export const GENDER_NOTED =
  "وطلبك يكون مع دكتورة مسجّل، والاستقبال يثبّته وقت الحجز — ولو ما توفرت، أعطيك وقت ثاني بدل ما تجي وتتفاجأ.";
export const GENDER_CARE_HONESTY =
  "وبخصوص طلب دكتورة: هذا ما أأكده من عندي — أثبته مع الاستقبال وقت الحجز ويوصلك في التأكيد. لو ما توفرت، أعطيك وقت ثاني، ما أخليك تجي وتتفاجأ.";
export const RECORDS_OVER_CHAT_REFUSAL =
  "النتائج تستلمها من الفرع، ما ترسل هنا.";
export const doctorContactRefusal = (branchPhone: string) =>
  `التواصل مع الدكتور عن طريق الفرع: ${branchPhone}.`;

// ── Rule FRI-1 — renderer-emitted, never a model instruction ───────────────

/**
 * "EVERY Friday reply from Faysal — booking, enquiry or directions — ends with the
 * branch's phone number and an offer to confirm. No exceptions, including at sites
 * whose Friday confidence is `medium`." Appended by the same code path that
 * renders the slot, for the same reason Rule DEMO-1(c) is.
 */
export const friday1Suffix = (branchPhone: string) =>
  `وبما إن فيه موعد يوم الجمعة والدوام يضيق فيها: قبل ما تطلع، اتصل على ${branchPhone} وتأكد.`;

// ── Rule PKG-1 terms — stated whenever a package is quoted ─────────────────

export const PACKAGE_TERMS =
  "شروط الباقة: سارية 12 شهر، باسم مريض واحد، غير قابلة للتحويل، والجلسات غير المستخدمة ما ترد.";

/**
 * The fork, when the NEAREST branch is the one whose status is UNVERIFIED.
 *
 * NOT a new frozen string — a COMPOSITION of two, and it is documented as such so
 * the snapshot test can assert both halves are present verbatim:
 *   · G5's honesty clause, word for word:
 *     «دوامه اليوم مو مؤكد عندي، وما أبي أعطيك معلومة غير أكيدة وتطلع من بيتك على الفاضي»
 *   · `motion.match.fork`'s binding ORDER: nearest first, «بس أصارحك» second, the
 *     cost stated plainly, two options, one question.
 *
 * This is the Ash Shifa case, and it is the highest-value moment in the product:
 * the nearest branch to the patient is the one the sources disagree about
 * (SPEC-1 §3.4.1), so the geography fork and the honesty showpiece arrive in the
 * same breath. Rule C4-2 is satisfied by construction — the contested site is
 * never the only option on offer.
 */
export const motionMatchForkUnverified = (a: {
  nearBranch: string;
  nearCapability: string;
  procedure: string;
  bestBranch: string;
  /** The same branch, as a coordinator says it the second time. */
  bestShort: string;
  bestReason: string;
  optionNear: string;
  optionBest: string;
}) =>
  `أقرب فرع لك هو ${a.nearBranch}، وفيه ${a.nearCapability}.
بس أصارحك: دوامه اليوم مو مؤكد عندي، وما أبي أعطيك معلومة غير أكيدة وتطلع من بيتك على الفاضي. و${a.procedure} نسويه في ${a.bestBranch} — ${a.bestReason}. ${a.bestShort} أبعد عليك، وهذا الفرق الوحيد بين الخيارين.
عندك طريقين:
1) ${a.optionNear}
2) ${a.optionBest}
أي طريق أريح لك؟`;

/** SPEC-1 §10.4 permitted shape — the networks the BUILDING appears on. Not eligibility. */
export const insuranceNetworksListed = (branchName: string, examples: string) =>
  `${branchName} داخل شبكات كذا شركة تأمين، منها ${examples}.
بس التغطية نفسها تعتمد على فئة شبكتك والتحمّل اللي في بطاقتك، والاستقبال يتأكد لك منها قبل الكشف.`;

/** Rule MED-6 — cancellation is never argued, and no penalty is quoted. */
export const CANCEL_DONE = "تم الإلغاء. ما عليك شي، ومتى ما تحتاج موعد ثاني ترد هنا وأرتّبه لك.";

/** The hold, before a claim of a booking (SPEC-1 §7.5 — hold, THEN confirm). */
export const holdMessage = (slot: string, branch: string, clinic: string, minutes: number, name: string) =>
  `أبشر. ماسك لك ${slot} في ${branch} عند ${clinic} لمدة ${minutes} دقايق.
أثبّته باسم ${name}؟`;
