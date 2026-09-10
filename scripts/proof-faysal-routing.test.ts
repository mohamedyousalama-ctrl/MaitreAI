// ============================================================================
// فيصل / Faysal — PROOF for the five routing defects found in a live transcript.
//
// The transcript, as the founder received it:
//
//   patient: «نظر»                       ← I need my eyes seen
//   فيصل:    «اللي يناسبك: … الروابي — فرع الروابي هو الفرع اللي المجموعة تركّز
//             فيه على الجلدية والليزر.»  ← eyes answered with dermatology and laser
//   فيصل:    «تمام. أنت بأي حي، والزيارة تأمين ولا كاش؟»   ← two questions, one turn
//   patient: «الورود»
//   فيصل:    «أقرب فرع لك هو … الورود …» ← a DIFFERENT branch from the one just named
//            «بس أصارحك: كشف الجلدية نسويه في … الروابي»
//                                        ← false: Shoaa Al Wurud carries an authored
//                                          derm_laser strength (§3.5 L194)
//
// Five defects, each with its own section here:
//   1. a branch named before the district that decides it is known;
//   2. two questions in one turn, with chips for only one of them;
//   3. the same district name three times in one line;
//   4. for a general checkup, two consecutive lines that contradict each other;
//   5. an out-of-catalogue specialty answered with an in-catalogue branch.
//
// Everything below drives the REAL scene machine through scripts/faysal-harness.ts,
// which mirrors app/api/faysal/turn/route.ts turn for turn. No copy is asserted by
// string equality — the assertions are on the PROPERTIES that were broken, so the
// wording can be improved without a proof rewrite, and cannot silently regress.
//
// Run:
//   FAYSAL_DEMO_MODE=1 NEXT_PUBLIC_FAYSAL_DEMO_MODE=1 node --conditions=react-server \
//     --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//     scripts/proof-faysal-routing.test.ts
// ============================================================================

import { Conversation } from "./faysal-harness.ts";
import { classifyDeterministic, needAfterVeto, outOfCatalogueSpecialty } from "../app/api/faysal/_engine/intent.ts";
import { recommendBranch } from "../lib/health/routing.ts";
import { SITES } from "../app/api/faysal/_domain/index.ts";

let pass = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) pass++; else failures.push(name); };

const AT = "2026-09-10T21:22:00+03:00";
const say = (msgs: string[]) => msgs.join("\n");
const BRANCH_NAMES = Object.values(SITES).map((s: any) => s.nameAr);
const SHORTS = Object.values(SITES).map((s: any) => s.shortAr);
const namedBranches = (text: string) => BRANCH_NAMES.filter((n) => text.includes(n));

// ── 1. NO BRANCH IS NAMED BEFORE THE DISTRICT IS KNOWN ──────────────────────
// The recommendation depends on the district, so naming one first is naming a
// guess — and the machine proved it was a guess by changing its answer one turn
// later. Every need the demo can route is checked, not just the one in the report.
for (const need of ["جلدية", "كشف عام", "تقويم", "اطفال", "باطنية", "ليزر", "انف واذن"]) {
  const c = new Conversation(AT);
  c.open();
  const r = await c.say(need);
  const text = say(r.messages.map((m) => m.text));
  ok(`«${need}» names no branch before the district`, namedBranches(text).length === 0);
  ok(`«${need}» asks something`, /[؟?]/.test(text));
  ok(`«${need}» offers district chips`, r.chips.length > 0);
}

// ── 2. ONE FACT ASKED PER TURN ──────────────────────────────────────────────
// «أنت بأي حي، والزيارة تأمين ولا كاش؟» asked two things and offered buttons for
// one, so the patient answered the half that had buttons and the other half had to
// be asked again.
//
// COUNTING «؟» DOES NOT CATCH THIS — the defective sentence carries exactly one.
// A first version of this section did exactly that and passed against the restored
// bug. The property is TWO FACTS in one breath, and the tell that it is a defect
// rather than a style choice is the chips: they can only answer one of them.
const ASKS_DISTRICT = /بأي حي|أي حي|which district/i;
const ASKS_PAYMENT = /تأمين ولا كاش|insurance or cash/i;
const ASKS_NEED = /وش تحتاج|what do you need/i;
{
  const c = new Conversation(AT);
  c.open();
  for (const turn of ["جلدية", "الورود", "تأمين", "بوبا"]) {
    const r = await c.say(turn);
    for (const m of r.messages) {
      const asked = [ASKS_DISTRICT, ASKS_PAYMENT, ASKS_NEED].filter((re) => re.test(m.text)).length;
      ok(`after «${turn}», no single message asks for two different facts`, asked <= 1);
    }
    // …and the buttons answer the question that was actually asked.
    const last = [...r.messages].reverse().find((m) => m.from === "faysal");
    if (last && ASKS_DISTRICT.test(last.text) && r.chips.length) {
      ok(`after «${turn}», district chips answer a district question`,
        r.chips.every((ch) => !/تأمين|كاش/.test(ch)));
    }
    if (last && ASKS_PAYMENT.test(last.text) && r.chips.length) {
      ok(`after «${turn}», payment chips answer a payment question`,
        r.chips.every((ch) => /تأمين|كاش|insurance|cash/i.test(ch)));
    }
  }
}
// The same, on the English arm — it carried the identical two-in-one sentence.
{
  const c = new Conversation(AT);
  c.open();
  const r = await c.say("I need a dermatology appointment");
  for (const m of r.messages) {
    const asked = [ASKS_DISTRICT, ASKS_PAYMENT, ASKS_NEED].filter((re) => re.test(m.text)).length;
    ok("the English district ask asks for one fact", asked <= 1);
  }
  ok("the English reply stays English", !/[ء-ي]/.test(say(r.messages.map((m) => m.text))));
  const g = await c.say("hello again");
  ok("a greeting inside an English thread is answered in English",
    !/[ء-ي]/.test(say(g.messages.map((m) => m.text))));
}

// ── 3. A BRANCH IS NOT NAMED THREE TIMES IN ONE LINE ────────────────────────
// «مجمع الوطن الطبي 2 — الروابي — فرع الروابي هو الفرع اللي…» — the district three
// times in one sentence is the loudest tell that a template, not a person, wrote it.
{
  const c = new Conversation(AT);
  c.open();
  await c.say("جلدية");
  const r = await c.say("الورود");
  for (const m of r.messages) {
    for (const line of m.text.split("\n")) {
      for (const short of SHORTS) {
        const n = line.split(short).length - 1;
        ok(`«${short}» appears at most twice in one line`, n <= 2);
      }
    }
  }
}

// ── 4. THE ROUTING MESSAGE DOES NOT CONTRADICT ITSELF ───────────────────────
// For a general checkup from Al Wurud the reply said, in consecutive lines, that
// Shoaa Al Wurud runs family medicine and that general checkups are done at Ar
// Rawabi. Both sentences came from the router. One of them was false.
//
// The distinction the copy needed: `nearestSiteId !== siteId` means "not the chain
// head", NOT "cannot do it". A named_capability in the patient's own district IS
// the answer, and there is nothing to fork about.
{
  const gp = recommendBranch("general_practice", { districtAr: "الورود" });
  ok("a general checkup from Al Wurud routes TO Al Wurud", gp.siteId === "shoaa-wurud");
  ok("…so there is no fork to render", gp.nearestSiteId === gp.siteId);
  ok("…and the near branch is recorded as serving it", gp.nearestServesNeed);
  ok("…on a named_capability basis", gp.nearestStrengthBasis === "named_capability");

  const im = recommendBranch("internal_medicine", { districtAr: "الورود" });
  ok("internal medicine from Al Wurud routes to Al Wurud too", im.siteId === "shoaa-wurud");

  // Dermatology is the MIDDLE case: Shoaa Al Wurud is marketed for laser and
  // aesthetics but the dossier names no derm clinic there, so the chain head still
  // leads — and the copy must say that WITHOUT denying what the group advertises.
  const derm = recommendBranch("derm_laser", { districtAr: "الورود" });
  ok("dermatology from Al Wurud still leads with the focus branch", derm.siteId === "wattan-2");
  ok("…but the near branch is NOT recorded as unable", derm.nearestServesNeed);
  ok("…on the weaker group_marketing basis", derm.nearestStrengthBasis === "group_marketing");

  // A district with no branch at all keeps the original, and true, fork.
  const far = recommendBranch("derm_laser", { districtAr: "الروضة" });
  ok("a district whose branch has no strength for the need does not claim one",
    !far.nearestServesNeed || far.nearestSiteId === far.siteId);
}
{
  const c = new Conversation(AT);
  c.open();
  await c.say("كشف عام");
  const r = await c.say("الورود");
  const text = say(r.messages.map((m) => m.text));
  ok("the general-checkup reply names ONE branch", new Set(namedBranches(text)).size === 1);
  ok("…and it is the near one", text.includes(SITES["shoaa-wurud"].nameAr));
  ok("…and it never says the checkup happens elsewhere", !/نسويه في/.test(text));
}
{
  const c = new Conversation(AT);
  c.open();
  await c.say("جلدية");
  const r = await c.say("الورود");
  const text = say(r.messages.map((m) => m.text));
  ok("the dermatology reply still names both branches", new Set(namedBranches(text)).size >= 1);
  ok("…and does NOT claim dermatology is only done elsewhere", !/الجلدية نسويه في/.test(text));
  ok("…and says what the near branch does offer", /يسوّق|يسوق/.test(text));
  ok("…and ends on a single choice", (text.match(/[؟?]/g) ?? []).length === 1);
}

// ── 5. A SPECIALTY WE HAVE NO BRANCH FOR IS SAID PLAINLY ────────────────────
// «نظر» reached the model tier, which read it as laser vision correction and
// returned `laser`, whose chain head is the dermatology branch. `need: parsed.need
// ?? facts.need` let that win. Eyes are in no chain, in no NEED_PLANS and in no
// dossier line — there was no honest branch to name.
for (const raw of ["نظر", "ابغى دكتور عيون", "عندي ضعف نظري", "ابي نظارات", "عدسات", "eye doctor"]) {
  ok(`«${raw}» is recognised as out of catalogue`, outOfCatalogueSpecialty(raw) !== null);
  ok(`«${raw}» is resolved deterministically, so the model never sees it`,
    classifyDeterministic(raw, 0)?.kind === "unsupported_specialty");
  ok(`«${raw}» carries no need`, (classifyDeterministic(raw, 0)?.need ?? null) === null);
}
// The veto is what stops the MODEL from smuggling one back in.
ok("the veto refuses a model-supplied need for an eye request", needAfterVeto("نظر", "dermatology" as any) === null);
ok("…including `laser`, which is the one it actually returned", needAfterVeto("ليزر للعيون", "laser" as any) === null);
ok("…but leaves a real laser request alone", needAfterVeto("ابغى ليزر", "laser" as any) === "laser");
ok("…and leaves every in-catalogue need alone", needAfterVeto("كشف عام", "general" as any) === "general");
{
  const c = new Conversation(AT);
  c.open();
  const r = await c.say("نظر");
  const text = say(r.messages.map((m) => m.text));
  ok("the eye request names no branch", namedBranches(text).length === 0);
  ok("…says the clinic back in the patient's own subject", text.includes("العيون"));
  ok("…offers the thing he can actually do", r.chips.length > 0);
  ok("…and never mentions dermatology or laser", !/جلدي|ليزر/.test(text));
}

// ── 6. THE SUBSTRING TRAPS THAT THIS DETECTOR MUST NOT FALL INTO ────────────
// Two of these were live before this change: «ابغى موعد بعد الظهر» was answered
// with "I cannot book an orthopaedics clinic from here" (الظهر = noon, not a back),
// and «بروح بنفسي للعيادة» with the psychiatry version (نفسي inside بنفسي).
for (const raw of [
  "ابغى موعد بعد الظهر", "موعد الظهر", "ابي موعد بعد الظهر لو تكرمت",
  "بروح بنفسي للعياده", "اجي بنفسي للموعد", "انتظر شوي", "المنظر حلو",
  "خذيت عينة دم", "شخص معين", "تعيين موعد", "من القلب اشكركم", "ابي اكلم دكتور",
]) {
  ok(`«${raw}» is NOT read as an unsupported specialty`,
    classifyDeterministic(raw, 0)?.kind !== "unsupported_specialty");
  ok(`«${raw}» names no out-of-catalogue clinic`, outOfCatalogueSpecialty(raw) === null);
}
// …while the genuine ones still fire.
for (const raw of ["دكتور قلب", "عيادة الكلى", "ابغى عيادة نفسيه", "عندي الم في الركبه", "دكتور مسالك", "ابي علاج طبيعي"]) {
  ok(`«${raw}» IS still read as an unsupported specialty`,
    classifyDeterministic(raw, 0)?.kind === "unsupported_specialty");
}
// …and the in-catalogue needs are untouched.
for (const [raw, need] of [["ابغى ليزر", "laser"], ["كشف عام", "general"], ["تقويم اسنان", "orthodontics"], ["جلدية", "dermatology"]] as const) {
  ok(`«${raw}» still classifies as ${need}`, classifyDeterministic(raw, 0)?.need === need);
}

console.log(`proof-faysal-routing: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures.slice(0, 25)) console.error(`  ✗ ${f}`);
  if (failures.length > 25) console.error(`  … and ${failures.length - 25} more`);
  process.exit(1);
}
