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
console.log(`\nFAYSAL HOLD-STEP PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
