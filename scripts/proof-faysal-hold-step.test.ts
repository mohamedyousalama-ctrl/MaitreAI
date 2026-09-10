// ============================================================================
// PROOF — the hold step (S6_close) books on a yes and on NOTHING else.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs \
//        --experimental-strip-types scripts/proof-faysal-hold-step.test.ts
//
// Drives real scenes through scripts/faysal-harness.ts (the route, minus HTTP). Every
// «does not book» row here was a CONFIRMED APPOINTMENT in the first version of the
// typed-confirmation fix, booked under the message as the patient name — «ابي اغير
// الوقت» got a booking. Three independent reviewers found it; this file keeps it found.
// ============================================================================
import { Conversation } from "./faysal-harness";
import { classifyDeterministic } from "../app/api/faysal/_engine/intent";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d?: any) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, "\n     ", JSON.stringify(d).slice(0, 500)); } };
const txt = (r: any) => r.messages.map((m: any) => m.text).join(" | ");
async function toS6(clock = "2026-09-13T10:00:00+03:00") {
  const c = new Conversation(clock); c.open();
  await c.say("أبغى ليزر"); await c.say("أنا في الروابي"); await c.say("كاش"); const r = await c.say("الأول");
  if (r.scene !== "S6_close") throw new Error("no S6: " + r.scene + " " + txt(r));
  return c;
}
let c: Conversation, r: any;
for (const t of ["ابي اغير الوقت", "مين الدكتور", "وعليكم السلام", "يعطيك العافيه", "0551234567", "محمد الشهري", "غيره لو سمحت", "اشاور زوجتي", "عندي صداع", "not yet"]) {
  c = await toS6(); r = await c.say(t);
  ok(`S6 «${t}» does not book`, r.scene !== "S7_confirmed" && !txt(r).includes("تم الحجز"), { scene: r.scene, text: txt(r) });
}
c = await toS6(); r = await c.say("0551234567");
ok("S6 mobile-only → re-ask with the hold chips", r.scene === "S6_close" && r.chips.length === 2 && (txt(r).match(/[؟?]/g) ?? []).length === 1, { scene: r.scene, chips: r.chips, text: txt(r) });
c = await toS6(); r = await c.say("محمد الشهري");
ok("S6 bare name → re-ask (no positive signal)", r.scene === "S6_close" && r.chips.length === 2, { scene: r.scene, chips: r.chips, text: txt(r) });
c = await toS6(); r = await c.say("خلاص ثبته");
ok("S6 «خلاص ثبته» books under the guest name", r.scene === "S7_confirmed" && txt(r).includes("ضيف العرض التجريبي"), { scene: r.scene, text: txt(r) });
c = await toS6(); r = await c.say("اسمي محمد الشهري");
ok("S6 «اسمي محمد الشهري» books under the name", r.scene === "S7_confirmed" && txt(r).includes("الاسم: محمد الشهري"), { scene: r.scene, text: txt(r) });
c = await toS6(); r = await c.say("ثبته باسم سارة العتيبي");
ok("S6 «ثبته باسم سارة العتيبي» books under the typed spelling", r.scene === "S7_confirmed" && txt(r).includes("الاسم: سارة العتيبي"), { scene: r.scene, text: txt(r) });
c = await toS6(); r = await c.say("محمد الشهري، ٠٥٥١٢٣٤٥٦٧");
ok("S6 name + Arabic-Indic mobile books under the name, mobile never printed", r.scene === "S7_confirmed" && txt(r).includes("الاسم: محمد الشهري") && !txt(r).includes("0551234567") && !txt(r).includes("٠٥٥"), { scene: r.scene, text: txt(r) });
c = await toS6(); r = await c.say("ما عندي مانع");
ok("S6 «ما عندي مانع» books", r.scene === "S7_confirmed", { scene: r.scene, text: txt(r) });
c = await toS6(); await c.say("ايش اسم الدكتور؟"); r = await c.say("أي وقت متاح؟");
ok("two questions at S6 do not close the conversation", r.scene !== "S14_closed" && c.s.objections.decline !== 2, { scene: r.scene, declines: c.s.objections.decline, text: txt(r) });
c = await toS6(); r = await c.say("اكد بس بكرا");
ok("S6 «اكد بس بكرا» does not book", r.scene !== "S7_confirmed", { scene: r.scene, text: txt(r) });
c = await toS6(); r = await c.say("إي إي ثبّته");
ok("S6 «إي إي ثبّته» books", r.scene === "S7_confirmed", { scene: r.scene, text: txt(r) });
c = new Conversation("2026-09-13T10:00:00+03:00"); c.open(); r = await c.say("احجز لي موعد اسنان في الشفا");
ok("«احجز لي موعد اسنان في الشفا» routes to الشفا with a dental need", c.s.districtAr === "الشفا" && c.s.need === "dental", { scene: r.scene, d: c.s.districtAr, need: c.s.need, text: txt(r) });
c = new Conversation("2026-09-13T10:00:00+03:00"); c.open(); await c.say("I need a dermatology appointment"); r = await c.say("hello again");
ok("English thread: greeting echo stays English", !/[ء-ي]/.test(txt(r)), { scene: r.scene, text: txt(r) });
c = new Conversation("2026-09-13T10:00:00+03:00"); c.open(); r = await c.say("عندي ألم في صدري وأتعرق"); r = await c.say("اسمي محمد الشهري 0551234567");
ok("rail holds against a name+mobile", r.stopReason === "faysal_redflag_emergency", { scene: r.scene, text: txt(r) });
// ── THE CONTINUITY AUDIT'S FINDINGS, EACH PINNED TO ITS OWN REPRODUCTION ────
// Forty-eight driven conversations found seventeen ways the thread stopped moving.
// Every row here is the exact message that produced the defect, not a paraphrase.
{
  const WALL = "ما أقدر أأكدها لك من عندي";
  const run = async (prefix: string[], last: string, clock = "2026-09-13T10:00:00+03:00") => {
    const c = new Conversation(clock); c.open();
    for (const line of prefix) await c.say(line);
    const r = await c.say(last);
    return { c, r, text: txt(r) };
  };
  const BOOKED = ["أبغى ليزر", "أنا في الروابي", "كاش", "الأول", "أكد"];
  const SLOTS = ["أبغى ليزر", "أنا في الروابي", "كاش"];

  let x = await run([], "ولدي عمره 5 سنوات ويحتاج كشف");
  ok("«كشف» alone is a need — the commonest thing a parent types first", !x.text.includes(WALL) && x.c.s.need !== null, { need: x.c.s.need, text: x.text });
  x = await run(["أبغى ليزر"], "أنا في العليا");
  ok("a Riyadh district we do not serve is an ANSWER, not an unknown", !x.text.includes(WALL) && x.text.includes("فروعنا"), { text: x.text });
  x = await run(BOOKED, "وش أجيب معي؟");
  ok("«وش أجيب معي؟» is answered from the line he wrote one message earlier", !x.text.includes(WALL) && x.text.includes("الهوية"), { text: x.text });
  x = await run(["أبي موعد عظام"], "سجّل لي طلب");
  ok("his own «سجّل لي طلب» chip records a request instead of apologising", !x.text.includes(WALL) && x.c.s.awaitingCallbackWindow, { text: x.text });
  x = await run([], "تحاليل وأشعة");
  ok("the greeting's own third door is not a wall", !x.text.includes(WALL) && x.text.includes("التحاليل والأشعة"), { text: x.text });
  x = await run(SLOTS, "الصبح");
  ok("a bare «الصبح» answers «أي وقت أثبّت لك؟»", !x.text.includes(WALL), { text: x.text });
  x = await run([], "عطني الموقع على قوقل ماب");
  ok("a map request is not answered with a speech about star ratings", !x.text.includes("ما راح أجادلك في التقييم") && x.text.includes("Unayzah"), { text: x.text });
  x = await run(SLOTS, "first");
  ok("an English patient can pick a time", x.c.s.holdId !== null, { held: x.c.s.heldSlot?.labelAr, text: x.text });
  x = await run([], "تمام");
  ok("a filler word does not invent a need", x.c.s.need === null && !x.text.includes("اللي يناسبك"), { need: x.c.s.need, text: x.text });
  {
    const c = new Conversation("2026-09-13T10:00:00+03:00"); c.open();
    const a = await c.say("؟"); const b = await c.say("...");
    ok("the same refusal paragraph is never sent twice in a row", txt(a) !== txt(b), { first: txt(a).slice(0, 60), second: txt(b).slice(0, 60) });
  }
  x = await run(BOOKED, "ألغه");
  ok("«ألغه» cancels — «الغي» was the only spelling listed", x.c.s.bookingRef === null && x.text.includes("تم الإلغاء"), { text: x.text });
  x = await run([], "فرع الشفا فاتح؟");
  ok("the hours answer is about the branch they NAMED", x.text.includes("الشفا"), { text: x.text });
  x = await run([], "مرحبا, मुझे अपॉइंटमेंट चाहिए");
  ok("the third-language reply offers a way back in", x.r.chips.length > 0, { chips: x.r.chips, text: x.text });
  x = await run(["انتظرت الأسبوع الماضي ٥٠ دقيقة"], "ما أبي أعتذار أبي حل");
  ok("a patient demanding a fix is not read as walking away", !x.text.includes("خذ راحتك"), { text: x.text });

  // §6.7 — the confirmation block is ATOMIC. FRI-1's suffix was landing AFTER the
  // demo label, on the one screenshot the whole demo is built around.
  for (const [clock, friday] of [["2026-09-11T12:00:00+03:00", true], ["2026-09-13T10:00:00+03:00", false]] as [string, boolean][]) {
    const c = new Conversation(clock); c.open();
    let r: { messages: { from: string; text: string }[] } = { messages: [] };
    for (const line of BOOKED) r = await c.say(line);
    const block = r.messages.find((m) => m.text.includes("تم الحجز"));
    const after = r.messages[r.messages.length - 1];
    ok(`the confirmation block ends at its own demo label (${clock.slice(0, 10)})`, !!block && block.text.trimEnd().endsWith("غير مسجّل لدى الفرع."), { block: block?.text });
    ok(`…and the Friday warning is ${friday ? "on the next message" : "absent"} (${clock.slice(0, 10)})`, after.text.includes("يوم الجمعة") === friday, { after: after.text });
    if (friday) ok("…exactly once", (after.text.match(/يوم الجمعة/g) ?? []).length === 1, { after: after.text });
  }
}

// ── THE CADENCE THAT ACTUALLY GOVERNS ──────────────────────────────────────
// §4.2 is «at most TWO messages per turn; three only under the split-recap». The
// guard capped at three unconditionally, so the written rule and the enforced rule
// were different numbers and three design proposals in one afternoon each assumed
// the third message was free. Ten journeys × three clocks, every turn counted.
{
  const JOURNEYS: string[][] = [
    ["أبغى ليزر", "أنا في الروابي", "كاش", "الأول", "أكد"],
    ["مساء الخير، أبغى موعد جلدية بكرة الصبح في فرع الروابي، عندي تأمين بوبا، وأفضّل دكتورة", "الأول", "أكد"],
    ["أبغى كشف عام", "الورود", "تأمين", "بوبا", "الأول", "أكد", "شكرا"],
    ["كم سعر الليزر؟", "فيه باقات؟", "الروابي", "كاش", "الأول"],
    ["الحين فاتحين؟", "أقرب موعد", "الروابي", "كاش"],
    ["أبغى أسنان", "بعيد علي", "الورود", "كاش", "الأول", "لا، غيّره"],
  ];
  let turns = 0;
  for (const clock of ["2026-09-13T10:00:00+03:00", "2026-09-10T23:40:00+03:00", "2026-09-11T13:00:00+03:00"]) {
    for (const journey of JOURNEYS) {
      const c = new Conversation(clock); c.open();
      for (const line of journey) {
        const r = await c.say(line);
        const mine = r.messages.filter((m: { from: string }) => m.from === "faysal");
        turns++;
        ok(`at most two messages — «${line}» at ${clock.slice(11, 16)}`, mine.length <= 2, { count: mine.length, texts: mine.map((m: { text: string }) => m.text.split("\n")[0]) });
      }
    }
  }
  console.log(`   cadence swept over ${turns} turns`);
}

// ── NO DEAD ENDS. The property, not a list of examples. ─────────────────────
// A clinic conversation has a spine — what do you need, which branch, how are you
// paying, which time, confirm — and a coordinator walks it whatever the patient
// says. Twenty branches answered honestly and then STOPPED: no question, nothing to
// tap, and the patient had to restart the booking themselves. Every message below is
// something a real patient sends mid-booking; the assertion is mechanical and holds
// for all of them at every point in the flow.
{
  const OFF_SPINE = [
    "انت روبوت؟", "شفت تقييمكم بجوجل ٣ نجوم بس", "وين نتيجة تحليلي؟", "أي دواء آخذ للحكة؟",
    "الدكتور زين؟", "عندكم تأمين؟", "وين المواقف؟", "كم سعر الكشف؟", "مين أفضل من مستشفى ثاني؟",
    "أبي موظف يكلمني", "ألغي الموعد", "وش عندي؟", "فيه باقات؟", "الحين فاتحين؟", "شكرا", "ok",
    "أبغى دكتورة", "عندي ألم في الركبة", "بعيد علي", "غالي شوي", "خلني أفكر",
  ];
  // Four points in the booking: nothing known, need known, slots on screen, hold live.
  const PREFIXES: [string, string[]][] = [
    ["fresh", []],
    ["need known", ["أبغى ليزر"]],
    ["slots offered", ["أبغى ليزر", "أنا في الروابي", "كاش"]],
    ["hold live", ["أبغى ليزر", "أنا في الروابي", "كاش", "الأول"]],
  ];
  const TERMINAL = new Set(["S7_confirmed", "S14_closed"]);
  let deadEnds = 0;
  for (const [label, prefix] of PREFIXES) {
    for (const message of OFF_SPINE) {
      const c = new Conversation("2026-09-13T10:00:00+03:00"); c.open();
      for (const line of prefix) await c.say(line);
      const r = await c.say(message);
      const text = txt(r);
      const terminal = TERMINAL.has(r.scene) || r.stopReason === "faysal_redflag_emergency";
      // TWO assertions, not one «either/or». A reply with chips and no question, or a
      // question and no chips, is half a next step — and an OR cannot tell which half
      // went missing: turning either one off leaves the other holding the proof up.
      const asksSomething = /[؟?]/.test(text);
      const offersSomething = r.chips.length > 0;
      if (!terminal && !(asksSomething && offersSomething)) deadEnds++;
      ok(`asks the next question — «${message}» at ${label}`, terminal || asksSomething, { scene: r.scene, text });
      ok(`offers something to tap — «${message}» at ${label}`, terminal || offersSomething, { scene: r.scene, chips: r.chips, text });
      // …and never two questions in one message, whatever was appended to it.
      for (const m of r.messages) {
        ok(`one question mark at most — «${message}» at ${label}`, (m.text.match(/[؟?]/g) ?? []).length <= 1, m.text);
      }
    }
  }
  ok(`the whole off-spine grid has no dead ends (${OFF_SPINE.length * PREFIXES.length} turns)`, deadEnds === 0, { deadEnds });
}

// ── THE WHOLE EMITTED CHIP VOCABULARY, READ OFF THE SOURCE ─────────────────
// The journey-driven checks below only reach the chips on the paths they walk. THREE
// trapdoor chips shipped anyway — «سجّل لي طلب», «فرع ثاني», «وين الفرع» — each of
// them the only tappable thing on its scene, and each producing «ما أقدر أأكدها لك
// من عندي» when tapped. So this reads every chip LITERAL out of scenes.ts and asserts
// the classifier can read it. A chip the engine cannot understand is worse than no
// chip: the patient taps the thing he offered them and he says he did not follow.
{
  const source = readFileSync(resolve(import.meta.dirname, "../app/api/faysal/_engine/scenes.ts"), "utf8");
  const literals = new Set<string>();
  // A chips array is the argument AFTER the messages array in a `reply(...)` call —
  // `reply(s, [ … ], ["إي، ثبّته", "لا، غيّره"])`. Matching bare array literals instead
  // swept up the specialty word-pair table and every other `[string, string]` in the
  // file, which is why this anchors on the `], [` that only a chips argument has.
  // …and the chips array is the LAST argument, so a closing paren follows it. Without
  // that, the `[string, string][]` specialty table matches too: consecutive rows put
  // a literal `], [` between them, which is the same shape as a chips argument.
  for (const m of source.matchAll(/\]\s*,\s*\[\s*("(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*")*)\s*\]\s*\)/g)) {
    for (const raw of m[1].split(/"\s*,\s*"/)) {
      const chip = raw.replace(/^"|"$/g, "").trim();
      // Latin chips count too — «English» is exactly as tappable as «العربية», and
      // leaving it out of the scan is how a trapdoor survives a proof about chips.
      if (!chip || chip.length > 24 || !/[ء-يA-Za-z]/.test(chip)) continue;
      literals.add(chip);
    }
  }
  ok(`the chip scan found chips in scenes.ts (${literals.size})`, literals.size >= 8, { found: [...literals] });
  for (const chip of literals) {
    const c = classifyDeterministic(chip, 2);
    // «الصبح» and «بعد العصر» are read as a WINDOW rather than as an intent — the
    // scene machine consumes the fact, and that is a real answer. So the bar is that
    // the chip carries something actionable, not that it names an intent.
    const actionable =
      !!c &&
      (c.kind !== "other" ||
        c.need !== null ||
        c.districtAr !== null ||
        c.payment !== null ||
        c.preferredWindowAr !== null ||
        c.preferredDayAr !== null);
    ok(`the engine can read the chip «${chip}»`, actionable, { chip, kind: c?.kind ?? null, window: c?.preferredWindowAr ?? null });
  }
}

// ── EVERY CHIP IS UNDERSTOOD WHEN IT IS TAPPED ──────────────────────────────
// A chip the engine cannot read is worse than no chip: the patient taps the thing
// he offered them and gets «ما فهمت عليك». So each chip is tapped, at the exact
// point it is offered, and the turn must move — never the honest-unknown fallback.
{
  const JOURNEYS: [string, string[]][] = [
    ["opener", []],
    ["need known", ["أبغى ليزر"]],
    ["district known", ["أبغى ليزر", "أنا في الروابي"]],
    ["slots offered", ["أبغى ليزر", "أنا في الروابي", "كاش"]],
    ["hold live", ["أبغى ليزر", "أنا في الروابي", "كاش", "الأول"]],
    ["booked", ["أبغى ليزر", "أنا في الروابي", "كاش", "الأول", "أكد"]],
    ["hours at night", []],
  ];
  for (const [label, prefix] of JOURNEYS) {
    const probe = new Conversation("2026-09-13T10:00:00+03:00"); probe.open();
    let last: { chips: string[] } = { chips: [] };
    for (const line of prefix) last = await probe.say(line);
    if (!prefix.length) last = await probe.say(label === "hours at night" ? "الحين فاتحين؟" : "السلام عليكم");
    for (const chip of last.chips) {
      // A fresh conversation per chip: tapping one must not depend on the others.
      const c = new Conversation("2026-09-13T10:00:00+03:00"); c.open();
      for (const line of prefix) await c.say(line);
      if (!prefix.length) await c.say(label === "hours at night" ? "الحين فاتحين؟" : "السلام عليكم");
      const r = await c.say(chip);
      const text = txt(r);
      ok(`chip «${chip}» is understood at ${label}`, !text.includes("ما أقدر أأكدها لك من عندي") && !text.includes("ما فهمت عليك"), { chip, scene: r.scene, text });
    }
  }

  // …AND A CHIP MUST ADVANCE THE BOOKING, NOT MERELY BE UNDERSTOOD. «وين المواقف» is
  // a perfectly readable message and a useless thing to offer someone who has just
  // been asked which district they are in: swap the district chips for it and the
  // «understood» assertion above stays green while the conversation stops moving.
  // The chips at a step where a fact is missing must FILL that fact.
  // The district and payment chips must FILL their field — no escape clause. The
  // spine appends a question to every reply, so «the reply asks something» is true of
  // everything and cannot discriminate; it was in the first version of this check and
  // it kept a deliberately wrong chip set green. Only the «need» step is allowed to
  // answer with a sub-question, because «عيادة معيّنة» legitimately opens one.
  const FILLS: [string, string[], (c: Conversation) => unknown, boolean][] = [
    ["need", [], (c) => c.s.need, true],
    ["district", ["أبغى ليزر"], (c) => c.s.districtAr, false],
    ["payment", ["أبغى ليزر", "أنا في الروابي"], (c) => c.s.payment, false],
  ];
  for (const [field, prefix, read, mayOpenSubQuestion] of FILLS) {
    const probe = new Conversation("2026-09-13T10:00:00+03:00"); probe.open();
    let last: { chips: string[] } = { chips: [] };
    for (const line of prefix) last = await probe.say(line);
    if (!prefix.length) last = await probe.say("السلام عليكم");
    ok(`chips exist at the «${field}» step`, last.chips.length > 0, { chips: last.chips });
    for (const chip of last.chips) {
      const c = new Conversation("2026-09-13T10:00:00+03:00"); c.open();
      for (const line of prefix) await c.say(line);
      if (!prefix.length) await c.say("السلام عليكم");
      const before = read(c);
      const r = await c.say(chip);
      const after = read(c);
      // Either the missing fact is now known, or the tap opened the next question
      // about it («عيادة معيّنة» lists the clinics and asks which) — never nothing.
      const filled = after !== before && after !== null && after !== undefined;
      const listsClinics = txt(r).includes("اللي أقدر أثبّت لك فيه");
      const moved = filled || (mayOpenSubQuestion && listsClinics);
      ok(`chip «${chip}» advances the «${field}» step`, moved, { chip, before, after, text: txt(r) });
    }
  }
}

// ── hours that know what day and hour it is ────────────────────────────────
// «الروابي يفتح اليوم 9:00 ص» went out AT 11:40 PM — today's nine o'clock was
// fourteen hours in the past, and «اليوم» was hard-coded into the sentence. The
// property is mechanical and holds at every clock: a stated opening is in the
// FUTURE, and the day word matches the day it names.
{
  const CLOCKS = ["2026-09-10T23:40:00+03:00", "2026-09-11T21:30:00+03:00", "2026-09-13T10:00:00+03:00", "2026-09-13T06:00:00+03:00", "2026-09-15T13:00:00+03:00"];
  for (const clock of CLOCKS) {
    const c = new Conversation(clock); c.open();
    const r = await c.say("الحين فاتحين؟");
    const text = txt(r);
    const openNow = text.includes("مفتوح الحين");
    ok(`hours answer says open or when it next opens: ${clock}`, openNow || text.includes("أقرب دوام") || text.includes("ما أقدر أأكدها"), { text });
    // «اليوم» may only appear when the opening really is later today.
    if (text.includes("أقرب دوام اليوم")) {
      const hhmm = /أقرب دوام اليوم (\d{1,2}):(\d{2})\s*(ص|م)/.exec(text);
      const hour = hhmm ? (hhmm[3] === "م" && Number(hhmm[1]) !== 12 ? Number(hhmm[1]) + 12 : Number(hhmm[1])) : -1;
      const nowHour = Number(clock.slice(11, 13));
      ok(`…and an opening «اليوم» is still ahead of the clock: ${clock}`, hour > nowHour, { text, hour, nowHour });
    }
    ok(`…and it offers a next step: ${clock}`, r.chips.length > 0 || /[؟?]/.test(text), { chips: r.chips, text });
    ok(`…and never claims a round-the-clock building: ${clock}`, !/٢٤ ساعه|24 ساعه|علي مدار الساعه/.test(text.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه")), { text });
  }
}

// ── the urgent tier, which had no voice at all ──────────────────────────────
// `safetyUrgent` sat in strings.ts with zero call sites while the route discarded
// every non-emergency verdict, so «دم مع البول» — a documented `urgent` — was
// answered by the ordinary classifier. §1.3 wants three things in one turn: seen
// today, the ER named, and the booking still open.
{
  const c = new Conversation("2026-09-13T10:00:00+03:00"); c.open();
  const r = await c.say("عندي دم مع البول وأبغى موعد");
  ok("an urgent verdict speaks", txt(r).includes("يحتاج يتشاف اليوم"), { text: txt(r) });
  ok("…and names the emergency route", txt(r).includes("997"), { text: txt(r) });
  ok("…and is NOT the emergency rail", r.stopReason !== "faysal_redflag_emergency" && r.scene !== "S0_safety", { scene: r.scene, stop: r.stopReason });
  ok("…and the booking stays open underneath it", r.messages.length > 1 || /[؟?]/.test(txt(r)), { text: txt(r) });
  const next = await c.say("أنا في الروابي، كاش");
  ok("…and it is said once, not on every later turn", !txt(next).includes("يحتاج يتشاف اليوم"), { text: txt(next) });
  ok("…and the booking actually moves", next.scene === "S5_slots" || next.scene === "S11_offhours", { scene: next.scene, text: txt(next) });
}

// ── nothing is said twice in a row ──────────────────────────────────────────
// «أبغى كشف عام» → «اللي يناسبك: الروابي…» then «أنا في الروابي» → the identical
// sentence again, because the payment ask was still outstanding. Verbatim repetition
// is the loudest possible tell that the previous message was not read.
{
  const c = new Conversation("2026-09-10T19:00:00+03:00"); c.open();
  const first = await c.say("أبغى كشف عام");
  const second = await c.say("أنا في الروابي");
  ok("the branch recommendation is said once, not on every turn", !txt(second).includes("اللي يناسبك"), { first: txt(first), second: txt(second) });
  ok("…and the outstanding question is still asked", /[؟?]/.test(txt(second)), { second: txt(second) });
  const third = await c.say("كاش");
  ok("…and the booking still moves", third.scene === "S5_slots" || third.scene === "S11_offhours", { scene: third.scene, text: txt(third) });
}

// ── the day and the window the patient named ────────────────────────────────
// «بكرة» answered with today, and «بعد الساعة ٧» answered with 4:30 م and nothing
// said about it, are the two ways a slot list ignores the sentence that asked for it.
{
  const c = new Conversation("2026-09-14T17:00:00+03:00"); c.open();
  const r = await c.say("مساء الخير، أبغى موعد جلدية بكرة في الروابي، كاش");
  const first = c.s.offeredSlots[0]?.labelAr ?? "";
  ok("«بكرة» is offered tomorrow first, not today", first.includes("بكرة"), { offered: c.s.offeredSlots.map((x: { labelAr: string }) => x.labelAr), text: txt(r) });
}
{
  const c = new Conversation("2026-09-15T14:20:00+03:00"); c.open();
  await c.say("أبغى ليزر"); await c.say("أنا في الروابي"); await c.say("كاش");
  const r = await c.say("ابغى موعد مسائي بعد الساعة ٧");
  const labels = c.s.offeredSlots.map((x: { labelAr: string }) => x.labelAr);
  const after7 = labels.every((l: string) => /(\d{1,2}):\d{2}\s*م/.test(l) && Number(/(\d{1,2}):/.exec(l)![1]) >= 7);
  ok("a window with nothing in it is SAID, not ignored", after7 || txt(r).includes("ما لقيت لك"), { offered: labels, text: txt(r) });
  ok("…and something bookable is still offered", labels.length > 0, { offered: labels });
}
{
  // …and when the window DOES have inventory, only that inventory is offered. The
  // «ما لقيت لك» line alone is not proof of the filter: it fires precisely when the
  // filter finds nothing, so a corpus that only ever misses cannot constrain it.
  // This clock is chosen because the unfiltered list at Ar Rawabi holds ONE afternoon
  // slot and one morning slot. Without the filter the morning one is still offered to
  // a patient who asked for the afternoon — which is the whole defect.
  const c = new Conversation("2026-09-15T14:20:00+03:00"); c.open();
  await c.say("أبغى ليزر"); await c.say("أنا في الروابي"); await c.say("كاش");
  const r = await c.say("ابغى موعد بعد العصر");
  const labels = c.s.offeredSlots.map((x: { labelAr: string }) => x.labelAr);
  const isPm = (l: string) => {
    const m = /(\d{1,2}):(\d{2})\s*(ص|م)/.exec(l);
    return !!m && m[3] === "م" && (Number(m[1]) === 12 ? 12 : Number(m[1]) + 12) >= 15;
  };
  ok("«بعد العصر» never offers a morning slot", labels.length > 0 && labels.every(isPm), { offered: labels, text: txt(r) });
  ok("…and the honest-miss line is not used when afternoon slots exist", !txt(r).includes("ما لقيت لك"), { offered: labels, text: txt(r) });
}

// ── the slot the patient asked for, with no pick verb in the message ────────
// «ليش 5:15؟ انت قلت 4:30» has no «ثبت» to anchor on, so ONLY the negation-head drop
// can get this right. The version with a verb passes either way, which is exactly why
// it cannot stand alone as the proof.
{
  const c = new Conversation("2026-09-13T10:00:00+03:00"); c.open();
  await c.say("أبغى أسنان"); await c.say("أنا في الروابي"); await c.say("كاش"); await c.say("متى أقرب موعد؟");
  const [a, b] = c.s.offeredSlots.map((x: { labelAr: string }) => x.labelAr);
  const hourOf = (l: string) => (/(\d{1,2}):(\d{2})/.exec(l) ?? [])[1];
  const r = await c.say(`ليش ${hourOf(b)}:00؟ انت قلت ${a}`);
  // The assertion is the HOLD, not the text: an "which of the two?" re-ask mentions
  // both labels, so a text check passes even when nothing was understood.
  ok("a correction with no pick verb holds the time the patient named", (c.s.heldSlot?.labelAr ?? "") === a, { offered: [a, b], held: c.s.heldSlot?.labelAr, text: txt(r) });
  ok("…and never the time being questioned", (c.s.heldSlot?.labelAr ?? "") !== b, { held: c.s.heldSlot?.labelAr });
}

// ── the triage hold: it still blocks, and it stops shouting ─────────────────
// SPEC-4 §1.5 R2. H-7: a new HARD hit re-fires the frozen rail byte for byte.
// H-3/H-6: any other later message gets the refusal plus a phone number — the hold
// blocks committing, never unwinding or helping. Six verbatim sirens in one thread
// is what two testers named as the moment he stopped being a person.
{
  const c = new Conversation("2026-09-11T21:30:00+03:00"); c.open();
  const first = await c.say("أبوي عنده ألم بصدره وتعرق من عشرين دقيقة");
  const railText = txt(first);
  ok("a red flag fires the rail", first.stopReason === "faysal_redflag_emergency" && railText.includes("997"), { scene: first.scene, text: railText });
  const later = await c.say("لا لا هو بخير الحين، بس يبي كشف عام بكرة");
  ok("a later turn still blocks the booking", later.stopReason === "faysal_redflag_emergency" && later.scene === "S0_safety" && later.chips.length === 0, { scene: later.scene, stop: later.stopReason });
  ok("…and is NOT the siren again", txt(later) !== railText, { text: txt(later) });
  ok("…and still names 997", txt(later).includes("997"), { text: txt(later) });
  const asked = await c.say("طيب عطني رقم الفرع أتصل عليهم بكرة، أنا بالروابي");
  ok("a request for the branch number is answered (H-6)", /\d{3}\s?\d{3}\s?\d{4}|920009303/.test(txt(asked)), { text: txt(asked) });
  ok("…while the hold still blocks", asked.stopReason === "faysal_redflag_emergency", { stop: asked.stopReason });
  const thanks = await c.say("يعطيك العافية");
  ok("a thank-you inside the hold is not the siren", txt(thanks) !== railText && thanks.stopReason === "faysal_redflag_emergency", { text: txt(thanks) });
  const again = await c.say("رجع ألم الصدر وصار يتعرق أكثر");
  ok("a NEW hard hit re-fires the frozen rail byte for byte (H-7)", txt(again) === railText, { text: txt(again) });
  const bookNow = await c.say("أكد");
  ok("nothing books inside the hold, ever", bookNow.scene === "S0_safety" && bookNow.stopReason === "faysal_redflag_emergency", { scene: bookNow.scene });
}

console.log(`\nFAYSAL HOLD-STEP PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
