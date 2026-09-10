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
