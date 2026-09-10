// ============================================================================
// PROOF — Faysal reads a typed yes, and ONLY a yes.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs \
//        --experimental-strip-types scripts/proof-faysal-confirm.test.ts
//
// Two corpora, on purpose kept apart:
//   * MUST-CONFIRM is GENERATED from the axes the classifier is composed from
//     (yes-words × leads × objects × tails), so a spelling the author forgot is
//     still covered by the next axis over;
//   * MUST-NOT is DERIVED INDEPENDENTLY — hand-written shapes a patient sends at
//     the hold step that are not a yes: negations, hedges, change requests,
//     questions, courtesy, booking requests that merely START with a confirm stem.
//     It is deliberately not built from the generator's axes: a corpus generated
//     from the same lists as the code cannot object to a widening. The first
//     version of this file passed 669/0 while «ابي اغير الوقت» booked an
//     appointment; three independent reviewers found forty such strings in an
//     hour. Most of them are here now, as the shape they belong to.
//
// A third set, NOT-A-NO: questions and idioms that must not count as a decline —
// two declines close the conversation, and two questions once did.
// ============================================================================
import { classifyDeterministic, nameShaped, nameInConfirm, CONFIRM_RE, CONFIRM_NEGATED, CONFIRM_BLOCKED } from "../app/api/faysal/_engine/intent.ts";
import { greetingEcho } from "../app/api/faysal/_engine/strings.ts";
import { normalizeArabic } from "../app/api/faysal/_domain/index.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, detail?: unknown) => { if (c) pass++; else { fail++; console.log("  FAIL", name, detail ?? ""); } };
const cls = (t: string) => classifyDeterministic(t, 2);
const kind = (t: string) => cls(t)?.kind;

// ── must-confirm, generated ─────────────────────────────────────────────────
const YES = ["أكد", "أكّد", "اكد", "ثبت", "ثبّت", "ثبته", "ثبّته", "أثبته", "اثبته", "أثبت", "اعتمد", "اعتمده", "كمل", "كمّل", "احجز", "احجزه", "احجز لي",
  "تأكيد", "تثبيت", "اعتماد", "إي", "ايه", "أيوه", "ايوه", "نعم", "تمام", "زين", "طيب", "خلاص", "تم", "صح", "أوك", "اوكي", "اوكيه", "أكيد", "موافق", "ماشي", "أبشر", "ابشر", "يلا", "يالله",
  "إن شاء الله", "انشالله", "ما عندي مانع", "ما فيه مشكلة", "ma fi mushkila".replace("ma fi mushkila", "no problem"),
  "ok", "okay", "yes", "yep", "sure", "fine", "go ahead", "confirm", "confirmed", "book it", "👍", "✅"];
const LEADS = ["", "و", "ف", "إي، ", "ايه ", "تمام، ", "اوكي ", "طيب، ", "خلاص ", "أنا "];
const OBJS = ["", "ه", "ها", " لي", " الموعد", " الحجز", "ه الموعد", " لي الموعد"];
const TAILS = ["", " شكرا", " يا فيصل", " 🙏", ".", "، يعطيك العافية", " thanks"];
const BARE_STEMS = new Set(["أكد", "أكّد", "اكد", "ثبت", "ثبّت", "أثبت", "اعتمد", "كمل", "كمّل", "احجز"]);
const mustConfirm = new Set<string>();
for (const y of YES) {
  const latin = /^[a-z✅👍]/i.test(y);
  // An Arabic lead in front of a Latin yes («وok») is not something anyone types;
  // «أنا» leads only an adjective-yes («أنا موافق»), never a verb.
  const leads = latin ? [""] : LEADS.filter((l) => l !== "أنا " || y === "موافق");
  for (const l of leads) {
    mustConfirm.add(`${l}${y}`);
    for (const tail of TAILS) mustConfirm.add(`${l}${y}${tail}`);
    if (BARE_STEMS.has(y)) for (const o of OBJS) mustConfirm.add(`${l}${y}${o}`);
  }
}
// The two chips byte-exact, the WhatsApp-typed variants, a doubled yes, and the
// shapes the reviewers pinned as yeses.
["إي، ثبّته", "إي ثبته", "ايه ثبته", "إي، ثبّته الموعد", "إي إي ثبّته", "إي، إي", "تمام تمام", "اي اكد", "تمام يا فيصل", "اوكي شكرا",
  "خلاص ثبته", "طيب ثبته", "تم ثبته", "صح ثبته", "أنا موافق", "إن شاء الله ثبته", "يعطيك العافية ثبته", "اوكي كمل الموعد", "اكد الموعد لي",
  "ما شاء الله تمام"].forEach((x) => mustConfirm.add(x));

// ── must-NOT-confirm, derived independently ─────────────────────────────────
const NEG = ["لا تأكد", "لا تثبت", "لا تثبته", "ما أبي أثبت", "ما ابغى اكد", "مو الحين", "مب الحين", "لا، غيّره", "لا غيره",
  "لا مو مناسب", "ما ابي", "بعدين", "لاحقاً", "خلني أفكر", "خلني افكر", "ثبته لا تغيره", "no", "not now", "no thanks"];
const HEDGE = ["تمام بس مو الحين", "تمام بس بعدين", "إي بس غالي", "ايه بس بعيد", "اوكي بس خلني اشوف", "زين بس بعدين", "تمام بس أشوف زوجتي أول",
  "اكد بس بكرا", "ثبته بس بكرا", "ثبته بس غير الوقت", "احجز بس بعد العصر", "اكد بس تاكد من الفرع",
  "نعم ولكن", "نعم ولكن ابي اغير الفرع", "تمام لكن ممكن اغير الوقت", "ايوه لكن بكرا", "yes but tomorrow", "ok but change the time"];
const CHANGE = ["ثبته وابي اغير الفرع", "تمام غيره", "ايه غير الوقت", "تمام اشاور زوجتي", "تمام اشاور زوجتي واردلك", "ابي اغير الوقت", "غيره لو سمحت", "ممكن اغير الوقت"];
const OTHER_OBJECT = ["أكد لي الدوام", "أكد لي الدوام أول", "اكد لي التأمين", "أكد لي إن الفرع فاتح", "ثبت لي السعر أول", "أكد لي الدكتورة موجودة"];
const QUESTION = ["أثبته؟", "أأكد؟", "ثبت؟", "أثبت الموعد؟", "أكد؟", "confirm?", "تمام؟", "ايه؟", "اي وقت", "اي موعد", "اي يوم", "أي وقت متاح؟", "ايش اسم الدكتور؟",
  "ايوه وين الفرع؟", "ايش الاجراءات؟", "تمام أي وقت", "اوكي أي فرع أقرب", "إي أي دكتور موجود", "زين الدكتور؟", "تمام وش الأسعار؟", "أكيد الدوام الجمعة؟"];
const NAMED_QUESTION = ["ثبته باسم زوجتي؟", "ثبته باسم محمد الشهري؟", "اكد الموعد على اسم مين؟"];
const BOOKING_REQUEST = ["احجز لي موعد اسنان في الشفا", "ابي احجز لي موعد ليزر", "ثبت لي موعد بالنسيم", "book an appointment for laser", "احجز لي موعد بكرة الصبح"];
const CHATTER = [ // stems as substrings inside ordinary clinic Arabic
  "مؤكد الفرع فاتح؟", "التأكيد من التأمين ياخذ وقت؟", "ثبات الحرارة عند الطفل طبيعي؟", "معتمد عندكم بوبا؟", "الاعتماد الطبي عندكم؟",
  "كملت العلاج بس لسا في ألم", "أبغى أحجز لأمي", "حجزت قبل عندكم", "وين المواقف؟", "كم سعر التقويم؟",
  "الموعد اللي ماسكه لي كم دقيقة؟", "ماشي الحال", "يلا وين أقرب فرع؟", "مين الدكتور", "وعليكم السلام", "يعطيك العافيه", "0551234567",
];
const mustNot = [...NEG, ...HEDGE, ...CHANGE, ...OTHER_OBJECT, ...QUESTION, ...NAMED_QUESTION, ...BOOKING_REQUEST, ...CHATTER];
// Questions and idioms are not a NO either.
// A confirm stem with a hedge is a not-yet, not a no: it must re-ask, not count as an objection.
const notANo = [...QUESTION, ...NAMED_QUESTION, "اكد بس بكرا", "ثبته بس بكرا", "احجز بس بعد العصر", "ما عندي مانع", "ما فيه مشكلة", "اي ما فيه مشكلة", "ما شاء الله تمام", "no problem"];

console.log(`corpus: ${mustConfirm.size} must-confirm · ${mustNot.length} must-not · ${notANo.length} not-a-no`);
for (const t of mustConfirm) ok(`confirms: «${t}»`, kind(t) === "confirm", kind(t));
for (const t of mustNot) ok(`does NOT confirm: «${t}»`, kind(t) !== "confirm", kind(t));
for (const t of notANo) ok(`is not a decline: «${t}»`, kind(t) !== "decline", kind(t));
// A booking request that starts with a confirm stem keeps its district and its need.
ok("«احجز لي موعد اسنان في الشفا» is a slots question in الشفا", kind("احجز لي موعد اسنان في الشفا") === "slots_question" && cls("احجز لي موعد اسنان في الشفا")?.districtAr === "الشفا", cls("احجز لي موعد اسنان في الشفا"));
ok("«ابي احجز لي موعد ليزر» is a slots question", kind("ابي احجز لي موعد ليزر") === "slots_question", kind("ابي احجز لي موعد ليزر"));
// The regexes never disagree on the corpus: a yes is never also a no or blocked.
for (const t of mustConfirm) { const n = normalizeArabic(t); ok(`no overlap on «${t}»`, CONFIRM_RE.test(n) && !CONFIRM_NEGATED.test(n) && !CONFIRM_BLOCKED.test(n)); }

// ── ReDoS guard: the route caps input at 400 chars; nothing here may take long ──
for (const adv of ["تمام ".repeat(80), "اي ".repeat(130), "كمل".repeat(130), "ثبته لي ".repeat(50), "ok, ".repeat(100), "اي، ".repeat(100) + "؟"]) {
  const s = adv.slice(0, 400); const t0 = performance.now();
  CONFIRM_RE.test(s); CONFIRM_NEGATED.test(s); CONFIRM_BLOCKED.test(s); classifyDeterministic(s, 2);
  const ms = performance.now() - t0; ok(`400-char adversarial input classifies in <50ms (${ms.toFixed(1)}ms)`, ms < 50);
}

// ── name-shaped input — RAW in, display name out ────────────────────────────
const N = (t: string) => nameShaped(t);
ok("name + mobile is name-shaped", N("محمد الشهري 0551234567")?.mobile === "0551234567");
ok("display name is cut from the RAW text (hamza and ة survive)", N("سارة العتيبي 0551234567")?.nameAr === "سارة العتيبي");
ok("Latin name keeps its capitals", N("Sara Alotaibi 0551234567")?.nameAr === "Sara Alotaibi");
ok("«د.» prefix normalised", N("د سارة العتيبي 0501234567")?.nameAr === "د. سارة العتيبي" && N("د. سارة العتيبي 0501234567")?.nameAr === "د. سارة العتيبي");
ok("+966 form recognised", N("سارة العتيبي +966551234567")?.mobile === "+966551234567");
ok("Arabic-Indic digits recognised", N("محمد الشهري ٠٥٥١٢٣٤٥٦٧")?.mobile === "0551234567");
ok("comma / dash / spaced mobile recognised", N("محمد الشهري، 0551234567")?.mobile === "0551234567" && N("محمد الشهري - 0551234567")?.mobile === "0551234567" && N("محمد الشهري 055 123 4567")?.mobile === "0551234567");
ok("a trailing yes after the name is allowed", N("محمد الشهري 0551234567 ثبته")?.nameAr === "محمد الشهري");
ok("«اسمي محمد الشهري» — lead is the positive signal", N("اسمي محمد الشهري")?.nameAr === "محمد الشهري");
ok("«انا محمد الشهري» — lead is the positive signal", N("انا محمد الشهري")?.nameAr === "محمد الشهري");
ok("«اسمي محمد» — one token with a lead", N("اسمي محمد")?.nameAr === "محمد");
ok("«my name is Sara Ali» — English lead", N("my name is Sara Ali")?.nameAr === "Sara Ali");
ok("«خالد حسن 0551234567» — «حسن» is a name, not a tooth", N("خالد حسن 0551234567")?.nameAr === "خالد حسن" && cls("خالد حسن 0551234567") === null);
ok("«ثبته باسم محمد الشهري» confirms AND carries the name", kind("ثبته باسم محمد الشهري") === "confirm" && nameInConfirm("ثبته باسم محمد الشهري")?.nameAr === "محمد الشهري");
ok("«اكد الموعد على اسم سارة العتيبي» carries the name", nameInConfirm("اكد الموعد على اسم سارة العتيبي")?.nameAr === "سارة العتيبي");
// NOT names — no positive signal, or a stop word inside. Every one of these was
// booked as a patient by the first version.
const NOT_NAMES = ["محمد الشهري", "ابي اغير الوقت", "غيره لو سمحت", "وقت ثاني", "ابي بكرا", "بعد الظهر افضل", "خلني اشوف", "اشاور زوجتي", "لحظه شوي",
  "not yet", "not sure", "maybe later", "عيادة عيون", "ابي دكتور احمد", "ابي دكتور ثاني", "عندي صداع", "الم بالبطن", "وين الفرع", "ايش الاسعار", "كم الانتظار",
  "مين الدكتور", "مين ضيف العرض التجريبي", "على اسم زوجتي", "كيف الحال", "حياك الله", "الله يسلمك", "جزاك الله خير", "يعطيك العافية", "وعليكم السلام",
  "خلاص ثبته", "طيب ثبته", "انا موافق", "ان شاء الله", "go ahead", "0551234567", "اسمي ابي اغير الوقت", "انا في الشفا", "اسمي في الروابي",
  "مساء الخير", "صباح الخير", "السلام عليكم", "هلا والله", "hello there", "hi faysal", "اكد الموعد", "لا تاكد", "أبغى ليزر", "الشفا", "محمد", "محمد عبدالله سعد الشهري من الرياض"];
for (const t of NOT_NAMES) ok(`is not a name: «${t}»`, N(t) === null, N(t));

// ── needs: short needles are word-bounded ───────────────────────────────────
ok("«بعد العصر أحسن» is not a dental need", kind("بعد العصر أحسن") !== "need", cls("بعد العصر أحسن"));
ok("«بكره احسن» is not a dental need", kind("بكره احسن") !== "need", cls("بكره احسن"));
ok("«سني يعورني» is dental", cls("سني يعورني")?.need === "dental");
ok("«عندي التهاب اذن» is ENT", cls("عندي التهاب اذن")?.need === "ent");
ok("«بعد اذنك» is not ENT", cls("بعد اذنك")?.need !== "ent", cls("بعد اذنك"));
ok("English «appointment» is not ENT", cls("appointment tomorrow morning")?.need !== "ent", cls("appointment tomorrow morning"));
ok("«انا حامل» is obgyn", cls("انا حامل")?.need === "obgyn");

// ── greeting echo ───────────────────────────────────────────────────────────
ok("مساء الخير → مساء النور", greetingEcho("مساء الخير", null).startsWith("مساء النور"));
ok("السلام عليكم → وعليكم السلام", greetingEcho("السلام عليكم", "أي وقت أثبّت لك؟").startsWith("وعليكم السلام"));
ok("صباح الخير → صباح النور", greetingEcho("صباح الخير", null).startsWith("صباح النور"));
ok("echo carries the open question", greetingEcho("هلا", "الزيارة تأمين ولا كاش؟").includes("تأمين ولا كاش"));
ok("echo never re-introduces", !greetingEcho("مساء الخير", null).includes("معك فيصل"));
ok("echo has at most one question mark", (greetingEcho("مساء الخير", "أي وقت أثبّت لك؟").match(/[؟?]/g) ?? []).length <= 1);
ok("English echo carries no Arabic", !/[ء-ي]/.test(greetingEcho("hello there", "Which time shall I book?", "en")));
ok("English echo with no open question is English", !/[ء-ي]/.test(greetingEcho("hi", null, "en")));
const GREETINGS = ["مساء الخير", "صباح الخير", "السلام عليكم", "سلام عليكم", "هلا والله", "مساء النور", "صباح النور", "hello there", "hi faysal",
  "أهلا", "أهلاً وسهلاً", "السلام عليكم ورحمة الله وبركاته", "مرحبا"];
for (const g of GREETINGS) ok(`greeting classifies as greeting_only: «${g}»`, kind(g) === "greeting_only", kind(g));
ok("a greeting with a request is NOT greeting_only", kind("السلام عليكم ابغى موعد ليزر") !== "greeting_only", kind("السلام عليكم ابغى موعد ليزر"));

console.log(`\nFAYSAL CONFIRM PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
