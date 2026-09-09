// ============================================================================
// PROOF — a typed «أكد» confirms a held appointment, and nothing that is not a
// yes ever does.
//
// Run:  node --conditions=react-server --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//         scripts/proof-faysal-confirm.test.ts
//
// THE DEFECT. After a slot was held, Faysal asked «أثبّته باسم ضيف العرض التجريبي؟»
// with the chips «إي، ثبّته» / «لا، غيّره». Tapping confirmed; typing «أكد» — the
// most ordinary way to say yes — fell to the honest-unknown fallback, because the
// confirm classifier was a hand-typed list missing that stem. Same failure class
// this repo hit four times today on the restaurant emergency detector.
//
// BOTH SIDES ARE GENERATED. must-confirm is composed from the same axes the
// classifier is composed from (stems × prefixes × objects × leads), in TYPED
// spelling so the normaliser is under test too. must-NOT-confirm is derived
// INDEPENDENTLY — negations, hedges, objections, questions, other-object requests,
// and ordinary clinic Arabic that contains the stems as substrings — because a
// quiet corpus that shares the firing corpus's generator cannot object to a
// widening; this repo proved that the hard way this afternoon.
// ============================================================================
import { classifyDeterministic, nameShaped, CONFIRM_RE, CONFIRM_NEGATED } from "../app/api/faysal/_engine/intent.ts";
import { greetingEcho } from "../app/api/faysal/_engine/strings.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: boolean, detail?: unknown) => { if (c) pass++; else { fail++; console.log("  FAIL", name, detail ?? ""); } };
const kind = (t: string) => classifyDeterministic(t, 2)?.kind;

// ── must-confirm, generated ─────────────────────────────────────────────────
const YES = ["أكد","أكّد","اكد","ثبت","ثبّت","ثبته","ثبّته","أثبته","اثبته","أثبت","اعتمد","اعتمده","كمل","كمّل","احجز","احجزه","احجز لي",
  "تأكيد","تثبيت","اعتماد","إي","ايه","أيوه","ايوه","نعم","تمام","زين","أوك","اوكي","اوكيه","أكيد","موافق","ماشي","أبشر","ابشر","يلا","يالله",
  "ok","okay","yes","yep","sure","confirm","confirm it","book it","confirmed"];
const LEADS = ["", "و", "ف", "إي، ", "ايه ", "تمام، ", "اوكي "];
const OBJS = ["", "ه", "ها", " لي", " الموعد", " الحجز"];
const mustConfirm = new Set<string>();
// Objects attach only to BARE stems — «احجزه» already carries one; «احجزهه» is not Arabic.
const BARE_STEMS = new Set(["أكد", "أكّد", "اكد", "ثبت", "ثبّت", "أثبت", "اعتمد", "كمل", "كمّل", "احجز"]);
for (const y of YES) {
  // An Arabic lead in front of a Latin yes («وok») is not something anyone types.
  for (const l of /^[a-z]/i.test(y) ? [""] : LEADS) {
    mustConfirm.add(`${l}${y}`);
    if (BARE_STEMS.has(y)) for (const o of OBJS) mustConfirm.add(`${l}${y}${o}`);
  }
}
// The two chips, byte-exact, and the WhatsApp-typed variants of them.
["إي، ثبّته", "إي ثبته", "ايه ثبته", "إي، ثبّته الموعد"].forEach((x) => mustConfirm.add(x));

// ── must-NOT-confirm, derived independently ─────────────────────────────────
const NEG = ["لا تأكد", "لا تثبت", "لا تثبته", "ما أبي أثبت", "ما ابغى اكد", "مو الحين", "مب الحين", "لا، غيّره", "لا غيره",
  "لا مو مناسب", "ما ابي", "بعدين", "لاحقاً", "خلني أفكر", "خلني افكر"];
const HEDGE = ["تمام بس مو الحين", "تمام بس بعدين", "إي بس غالي", "ايه بس بعيد", "اوكي بس خلني اشوف", "زين بس بعدين", "تمام بس أشوف زوجتي أول"];
const OTHER_OBJECT = ["أكد لي الدوام", "أكد لي الدوام أول", "اكد لي التأمين", "أكد لي إن الفرع فاتح", "ثبت لي السعر أول", "أكد لي الدكتورة موجودة"];
const QUESTION = ["أثبته؟", "أأكد؟", "ثبت؟", "أثبت الموعد؟", "أكد؟", "confirm?"];
const CHATTER = [ // stems as substrings inside ordinary clinic Arabic
  "مؤكد الفرع فاتح؟", "التأكيد من التأمين ياخذ وقت؟", "ثبات الحرارة عند الطفل طبيعي؟", "معتمد عندكم بوبا؟", "الاعتماد الطبي عندكم؟",
  "كملت العلاج بس لسا في ألم", "أبغى أحجز لأمي", "حجزت قبل عندكم", "وين المواقف؟", "كم سعر التقويم؟", "تمام وش الأسعار؟",
  "الموعد اللي ماسكه لي كم دقيقة؟", "أكيد الدوام الجمعة؟", "زين الدكتور؟", "ماشي الحال", "يلا وين أقرب فرع؟",
  "تمام أي وقت", "اوكي أي فرع أقرب", "إي أي دكتور موجود",
];
const mustNot = [...NEG, ...HEDGE, ...OTHER_OBJECT, ...QUESTION, ...CHATTER];

console.log(`corpus: ${mustConfirm.size} must-confirm · ${mustNot.length} must-not`);
for (const t of mustConfirm) ok(`confirms: «${t}»`, kind(t) === "confirm", kind(t));
for (const t of mustNot) ok(`does NOT confirm: «${t}»`, kind(t) !== "confirm", kind(t));

// ── the negation guard wins over the yes ────────────────────────────────────
ok("negation regex catches «لا تأكد»", CONFIRM_NEGATED.test("لا تاكد"));
ok("yes regex matches «اكد» (post-normalisation)", CONFIRM_RE.test("اكد"));
ok("yes regex does not match «اكد لي الدوام»", !CONFIRM_RE.test("اكد لي الدوام") || CONFIRM_NEGATED.test("اكد لي الدوام"));

// ── name-shaped input ───────────────────────────────────────────────────────
const N = (t: string) => nameShaped(t.normalize("NFC").toLowerCase());
ok("name + mobile is name-shaped", !!N("محمد الشهري 0551234567") && N("محمد الشهري 0551234567")!.mobile === "0551234567");
ok("name alone is name-shaped", !!N("محمد الشهري"));
ok("name strips the mobile from the display name", N("محمد الشهري 0551234567")!.nameAr === "محمد الشهري");
ok("+966 form recognised", N("سارة العتيبي +966551234567")!.mobile === "+966551234567");
ok("a confirmation is not a name", N("اكد الموعد") === null);
ok("a negation is not a name", N("لا تاكد") === null);
ok("a need phrase is not a name (has a need word → classifier wins upstream)", kind("أبغى ليزر") === "need");
ok("single token is not a name", N("محمد") === null);
ok("six tokens is not a name", N("محمد عبدالله سعد الشهري من الرياض") === null);
ok("a district alone is not a name", kind("الشفا") !== "confirm");
// Two-word greetings are exactly the shape of a two-word name. None of them is one.
const GREETINGS = ["مساء الخير", "صباح الخير", "السلام عليكم", "سلام عليكم", "هلا والله", "مساء النور", "صباح النور", "hello there", "hi faysal"];
for (const g of GREETINGS) {
  ok(`greeting is not a name: «${g}»`, N(g) === null);
  ok(`greeting classifies as greeting_only: «${g}»`, kind(g) === "greeting_only", kind(g));
}

// ── greeting echo ───────────────────────────────────────────────────────────
ok("مساء الخير → مساء النور", greetingEcho("مساء الخير", null).startsWith("مساء النور"));
ok("السلام عليكم → وعليكم السلام", greetingEcho("السلام عليكم", "أي وقت أثبّت لك؟").startsWith("وعليكم السلام"));
ok("صباح الخير → صباح النور", greetingEcho("صباح الخير", null).startsWith("صباح النور"));
ok("echo carries the open question", greetingEcho("هلا", "الزيارة تأمين ولا كاش؟").includes("تأمين ولا كاش"));
ok("echo never re-introduces", !greetingEcho("مساء الخير", null).includes("معك فيصل"));
ok("echo has at most one question mark", (greetingEcho("مساء الخير", "أي وقت أثبّت لك؟").match(/[؟?]/g) ?? []).length <= 1);
ok("greeting classifies as greeting_only", kind("مساء الخير") === "greeting_only");

console.log(`\nFAYSAL CONFIRM PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
