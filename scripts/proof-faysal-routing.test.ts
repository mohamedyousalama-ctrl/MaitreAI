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
import { classifyDeterministic, vetoedNeed, outOfCatalogueSpecialty, SPECIALTY_NEEDLES } from "../app/api/faysal/_engine/intent.ts";
import { recommendBranch } from "../lib/health/routing.ts";
import { SITES } from "../app/api/faysal/_domain/index.ts";
import { chipsAnswering } from "../app/api/faysal/_engine/scenes.ts";
import * as S from "../app/api/faysal/_engine/strings.ts";
import { EN } from "../app/api/faysal/_engine/english.ts";

let pass = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) pass++; else failures.push(name); };

const AT = "2026-09-10T21:22:00+03:00";
const say = (msgs: string[]) => msgs.join("\n");
const SITE_LIST = Object.values(SITES) as any[];
/** Which SITES a text names, by full name OR short name. Matching only `nameAr` made
 *  section 4 insensitive: the fork copy names the far branch by `shortAr`, so
 *  "the reply names ONE branch" passed even with the fix disabled. */
const namedBranches = (text: string): string[] =>
  SITE_LIST.filter((x) => text.includes(x.nameAr) || text.includes(x.shortAr)).map((x) => x.siteId ?? x.nameAr);

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
  ok(`«${need}» offers district chips`,
    r.chips.length > 0 && r.chips.every((ch: string) => !/تأمين|كاش|insurance|cash/i.test(ch)));
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
// The constants themselves, because `matchAndAsk` no longer reaches
// MOTION_DISCOVER_SHORT — `askDistrict` is its only remaining caller and the
// conversation above does not pass through it. A section that only walks a run would
// pass with the two-in-one sentence restored; this was measured.
for (const [name, text] of [
  ["MOTION_DISCOVER_SHORT", S.MOTION_DISCOVER_SHORT],
  ["MOTION_DISCOVER_PAYMENT", S.MOTION_DISCOVER_PAYMENT],
  ["askDistrictFor", S.askDistrictFor("كشف الجلدية")],
  ["EN.discoverShort", EN.discoverShort],
  ["EN.discoverPayment", EN.discoverPayment],
  ["EN.askDistrictBecause", EN.askDistrictBecause],
] as const) {
  const asked = [ASKS_DISTRICT, ASKS_PAYMENT, ASKS_NEED].filter((re) => re.test(text)).length;
  ok(`${name} asks for one fact`, asked <= 1);
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

// ── 3. A BRANCH IS NOT RE-NAMED THE INSTANT IT HAS BEEN NAMED ──────────────
// «اللي يناسبك: مجمع الوطن الطبي 2 — الروابي — فرع الروابي هو الفرع اللي…»
//
// COUNTING OCCURRENCES DOES NOT CATCH THIS. «الروابي» appears exactly twice in that
// line, so a "no more than twice" threshold passes against the very sentence the
// section is named after — the first version of this section did exactly that. The
// defect is the SHAPE: the full name, and then the short name again a few characters
// later, before the sentence has said anything about it.
{
  const c = new Conversation(AT);
  c.open();
  await c.say("جلدية");
  const r1 = await c.say("الورود");
  const more = [] as any[];
  // EVERY district that has a branch, not just the one the first version drove:
  // three of the five still shipped the reported sentence verbatim because the
  // original fork template never got the strip that the new one did.
  for (const [need, district] of [
    ["كشف عام", "الورود"], ["تقويم", "انا في الشفا"], ["جلدية", "الروضة"],
    ["اطفال", "اليمامة"], ["باطنية", "الربوة"], ["ليزر", "الروضة"],
  ] as const) {
    const cc = new Conversation(AT);
    cc.open();
    await cc.say(need);
    more.push(await cc.say(district));
  }
  for (const r of [r1, ...more]) {
    for (const m of r.messages) {
      for (const line of m.text.split("\n")) {
        for (const site of SITE_LIST) {
          const i = line.indexOf(site.nameAr);
          if (i < 0) continue;
          // The window is sized to the short name plus a connector («‏ — فرع ‎»), not a
          // fixed 10 characters: «شعاع الورود» is eleven, so a fixed window could not
          // fit the very thing it was looking for and the mutation walked past it.
          const from = i + site.nameAr.length;
          const after = line.slice(from, from + site.shortAr.length + 12);
          ok(`«${site.shortAr}» is not re-named immediately after its full name`,
            !after.includes(site.shortAr));
        }
      }
    }
  }
}

// ── 4. THE ROUTING MESSAGE DOES NOT CONTRADICT ITSELF ───────────────────────
// For a general checkup from Al Wurud the reply said, in consecutive lines, that
// Shoaa Al Wurud runs family medicine and that general checkups are done at Ar
// Rawabi. Both sentences came from the router. One of them was false.
//
// `nearestSiteId !== siteId` was being rendered as "the nearest branch cannot do
// this". It means only that the nearest branch is not the chain HEAD.
//
// THE FIX IS THE SENTENCE, NOT THE PICK. An earlier attempt let the patient's own
// district win the clinical pick when it carried a named_capability; it fixed the
// copy and broke four bookings, because the gate that decides whether a site can
// mint a service is §6.2's capability matrix, not a strength row. The pick is back
// where §5.3 puts it, and `nearestServesNeed` carries what the copy needed.
{
  const gp = recommendBranch("general_practice", { districtAr: "الورود" });
  ok("the clinical pick is still the chain head", gp.siteId === "wattan-2");
  ok("…and the district is REPORTED, not substituted", gp.nearestSiteId === "shoaa-wurud");
  ok("…and the near branch is recorded as serving the need", gp.nearestServesNeed);
  ok("…on a named_capability basis", gp.nearestStrengthBasis === "named_capability");
  ok("…with its own authored line, so the caller invents nothing", !!gp.nearestStrengthAr);

  const derm = recommendBranch("derm_laser", { districtAr: "الورود" });
  ok("dermatology from Al Wurud reports the near branch too", derm.nearestServesNeed);
  ok("…on the weaker group_marketing basis", derm.nearestStrengthBasis === "group_marketing");

  const far = recommendBranch("derm_laser", { districtAr: "الروضة" });
  ok("a district whose branch has no strength for the need claims none", !far.nearestServesNeed);
}
// Every district that has a branch: the reply must never say the service is done
// elsewhere when the near branch is recorded as serving it.
for (const [need, district] of [
  ["كشف عام", "الورود"], ["باطنية", "الورود"], ["جلدية", "الورود"],
  ["اطفال", "الورود"], ["انف واذن", "الورود"],
] as const) {
  const c = new Conversation(AT);
  c.open();
  await c.say(need);
  const r = await c.say(district);
  const text = say(r.messages.map((m) => m.text));
  const rec = recommendBranch(
    need === "كشف عام" ? "general_practice" : need === "باطنية" ? "internal_medicine"
      : need === "جلدية" ? "derm_laser" : need === "اطفال" ? "paediatrics" : "ent",
    { districtAr: district },
  );
  if (rec.nearestServesNeed && rec.nearestSiteId !== rec.siteId) {
    ok(`«${need}» from ${district} never says the service is done elsewhere`, !/نسويه في/.test(text));
    ok(`…and says what the near branch DOES offer`, text.includes("أقرب فرع لك"));
    ok(`…and ends on one question`, (text.match(/[؟?]/g) ?? []).length === 1);
  }
}

// ── 4b. A GATED OR CONTESTED NEAR BRANCH KEEPS ITS RULE C4-1 DISCLOSURE ─────
// الشفا is the contested site and its dental_ortho strength is gated. The truthful
// fork must not intercept it: `forkReply` is the one that offers a CALLBACK instead
// of a time, names the branch's phone, and says to call before leaving.
{
  const shifa = recommendBranch("dental_ortho", { districtAr: "الشفا" });
  ok("a gated or contested near branch is flagged as such", shifa.nearestGated || shifa.nearestContested);

  const c = new Conversation(AT);
  c.open();
  await c.say("تقويم");
  const r = await c.say("انا في الشفا");
  const text = say(r.messages.map((m) => m.text));
  ok("a contested branch is offered as a CALLBACK, not a fixed time", /أسجّل لك طلب/.test(text));
  ok("…with its phone number", /\d{3}\s?\d{3}\s?\d{4}/.test(text));
  ok("…and the warning to call before leaving", /تأكد إنه فاتح/.test(text));
  ok("…and no double full stop from the template", !/\.\./.test(text));
}

// ── 4c. THE CHIPS ANSWER THE QUESTION, AT EVERY ASK SITE ───────────────────
// `askDistrict` asked «أنت بأي حي؟» and offered «تأمين / كاش» — the two-in-one
// defect inverted. It is not reachable from `matchAndAsk`, so only a direct check
// catches it.
{
  const c = new Conversation(AT);
  c.open();
  await c.say("جلدية");
  const r = await c.say("الورود");
  ok("the fork offers the two branches as chips", r.chips.length === 2);
  // The pairing itself, at every ask site — this is the function they all read.
  const blank: any = { scene: "S2_discover", offeredSlots: [], history: [] };
  for (const q of [S.MOTION_DISCOVER_SHORT, S.askDistrictFor("كشف الجلدية"), EN.discoverShort, EN.askDistrictBecause]) {
    ok(`a district question gets district chips: «${q.slice(0, 24)}…»`,
      chipsAnswering(q, blank).every((ch) => !/تأمين|كاش|insurance|cash/i.test(ch)));
  }
  for (const q of [S.MOTION_DISCOVER_PAYMENT, EN.discoverPayment]) {
    ok(`a payment question gets payment chips: «${q.slice(0, 24)}…»`,
      chipsAnswering(q, blank).every((ch) => /تأمين|كاش|insurance|cash/i.test(ch)));
  }
  ok("…named by district, so they answer «أيهم»", r.chips.every((ch) => !/تأمين|كاش/.test(ch)));
}

// ── 5. EYES ARE BOOKED, NOT REFUSED ─────────────────────────────────────────
// «نظر» reached the model tier, which read it as laser vision correction and
// returned `laser`, whose chain head is the dermatology branch — a patient asking
// about their eyes routed to hair removal.
//
// THE FIRST FIX WAS WORSE THAN THE BUG. It answered «عيادة العيون ما أقدر أثبّت لها
// موعد من هنا», which is false: §6.2 marks ophthalmology `named_at_site` at Ar
// Rawabi, the dossier names it there (§3.2 L146), the catalogue prices «كشف عيون»,
// and a specialist is rostered. Refusing a clinic the client runs is inventing
// UNavailability, in front of a manager who knows their own branch has one.
{
  const rec = recommendBranch("ophthalmology", {});
  ok("ophthalmology routes to exactly one branch", rec.siteId === "wattan-2");
  ok("…with an authored reason", !!rec.reasonAr);
  ok("…and names no second branch it cannot claim", rec.alternates.length === 0);
}
for (const raw of [
  "نظر", "ابغى دكتور عيون", "عندي ضعف نظري", "ابي نظارات", "عدسات", "eye doctor",
  "عيني تعورني", "جفن عيني", "ابي ليزك", "عندي مياه بيضاء", "3indi da3f nathar",
  // the phrasings that used to be swallowed by the rules above the specialty check
  "ابغى موعد عيون", "كم سعر كشف العيون", "احجز لي عند دكتور عيون",
  // …and the one the model turned into hair removal
  "ليزر للعين", "ليزر للعيون",
]) {
  ok(`«${raw}» is read as the eye clinic`, classifyDeterministic(raw, 0)?.need === "ophthalmology");
  ok(`«${raw}» is not refused as out of catalogue`, outOfCatalogueSpecialty(raw) === null);
}
ok("a plain laser request is still the dermatology laser", classifyDeterministic("ابغى ليزر", 0)?.need === "laser");
{
  const c = new Conversation(AT);
  c.open();
  await c.say("نظر");
  const r1 = await c.say("الروابي");
  const text1 = say(r1.messages.map((m) => m.text));
  ok("the eye request routes to Ar Rawabi", text1.includes(SITES["wattan-2"].nameAr));
  ok("…and never mentions dermatology or the laser", !/جلدي|ليزر/.test(text1));
  const r2 = await c.say("كاش");
  const text2 = say(r2.messages.map((m) => m.text));
  ok("…and real times are offered, so the clinic is genuinely bookable", r2.chips.length >= 1);
  ok("…named as the eye clinic", /العيون/.test(text2) || /عيون/.test(text2));
}

// ── 6. THE SUBSTRING TRAPS THAT THIS DETECTOR MUST NOT FALL INTO ────────────
// Two of these were live before this change: «ابغى موعد بعد الظهر» was answered
// with "I cannot book an orthopaedics clinic from here" (الظهر = noon, not a back),
// and «بروح بنفسي للعيادة» with the psychiatry version (نفسي inside بنفسي).
for (const raw of [
  "ابغى موعد بعد الظهر", "موعد الظهر", "ابي موعد بعد الظهر لو تكرمت",
  "بروح بنفسي للعياده", "اجي بنفسي للموعد", "انتظر شوي", "المنظر حلو",
  "خذيت عينة دم", "شخص معين", "تعيين موعد", "من القلب اشكركم", "ابي اكلم دكتور",
  // A CLINIC WORD SOMEWHERE IN THE MESSAGE IS NOT ENOUGH. Each of these carries one
  // AND an ambiguous specialty word, and each was answered with a refusal for a
  // clinic nobody asked about. They are why the gate is adjacency, not presence.
  "من القلب اشكركم على الموعد", "حاسس نفسي تعبان وابي موعد", "بشكل كلي ابي موعد",
  "كلي الثقة فيكم وابي موعد", "ابي اجي بنفسي للموعد", "الفتره الظهريه تناسبني",
  "ابي موعد بالفتره الظهريه",
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

// ── 7. THE BOUNDARY, DERIVED FROM THE NEEDLES THEMSELVES ───────────────────
// A hand-written trap list is stale the moment a needle is added, and this one was:
// it missed «المركبة», «مظهري», «منظري» and `television`, each of which shipped as a
// refusal. So the corpus is GENERATED from the table. «م» is not one of the Arabic
// prefixes the matcher accepts, so a needle preceded by it is inside a longer word
// by construction, and must never fire. Same for a Latin needle behind any letter.
for (const needle of SPECIALTY_NEEDLES) {
  const latin = /^[a-z ]+$/i.test(needle);
  // EVERY word of the needle is buried, not just the first: «معيادة عيون» still
  // contains a standalone «عيون», which is a different needle and SHOULD fire.
  const buried = needle.split(" ").map((w) => (latin ? `x${w}` : `م${w}`)).join(" ");
  ok(`«${buried}» does not fire (${needle} is buried inside it)`, outOfCatalogueSpecialty(buried) === null);
  // …and with a clinic word beside it, which is what makes the gated table dangerous.
  ok(`«عندي موعد ${buried}» does not fire either`, outOfCatalogueSpecialty(`عندي موعد ${buried}`) === null);
}
// The four that were live regressions, kept by name so they can never come back
// silently even if the generator changes.
for (const raw of [
  "وين اوقف المركبه", "عندي مركبه كبيره", "ابغى احسن مظهري", "مظهري مهم لي",
  "منظري تعبان", "ابغى تحسين منظري", "I saw it on television", "I need a revision",
]) {
  ok(`«${raw}» is not read as an unsupported specialty`,
    classifyDeterministic(raw, 0)?.kind !== "unsupported_specialty");
}
// A specialty phrasing must reach the specialty rule rather than being swallowed by
// «موعد» or «كم سعر» above it — the hoist that made that true is what stops a GP
// price being quoted for a clinic the group does not run.
for (const raw of ["ابغى موعد عظام", "كم سعر كشف العظام", "احجز لي عند دكتور مسالك", "ابي موعد علاج طبيعي"]) {
  ok(`«${raw}» reaches the specialty rule, not price or slots`,
    classifyDeterministic(raw, 0)?.kind === "unsupported_specialty");
}
// The veto's `need` parameter is load-bearing on the path where nothing is vetoed.
ok("the veto returns the need untouched when no out-of-catalogue word is present",
  vetoedNeed("ابغى تقويم", "orthodontics" as any) === "orthodontics");
ok("…and returns null when the text names an absent specialty and no need",
  vetoedNeed("عظام", null) === null);
for (const guess of ["dermatology", "laser", "general", "dental"]) {
  ok(`…and refuses «${guess}» when the text says «عظام»`, vetoedNeed("عظام", guess as any) === null);
}
// «كشف» is the generic exam noun and must not keep a general need alive beside an
// absent specialty — «كم سعر كشف العظام» quoted a family-medicine fee until it did not.
ok("a bare «كشف» does not survive beside an absent specialty",
  vetoedNeed("كم سعر كشف العظام", "general" as any) === null);
ok("…but «كشف عام» does, because it says so specifically",
  vetoedNeed("ابغى كشف عام وعندي سؤال عن العظام", "general" as any) === "general");

console.log(`proof-faysal-routing: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures.slice(0, 25)) console.error(`  ✗ ${f}`);
  if (failures.length > 25) console.error(`  … and ${failures.length - 25} more`);
  process.exit(1);
}
