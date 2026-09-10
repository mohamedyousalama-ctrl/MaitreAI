// ============================================================================
// فيصل / Faysal — THE SCENE MACHINE (SPEC-2 §7).
//
// Every inbound passes S0 (the safety screen) before anything here runs; that is
// in `turn/route.ts`, above this module, so a red flag cannot reach a scene even
// by mistake. What is left is S1–S14.
//
// THE DETERMINISM BOUNDARY (§8.3) is the architecture of this file:
//
//   code owns          the five greetings · the rail · the confirmation and
//                      pre-visit blocks · `insurance.class_honesty` ·
//                      `price.not_loaded` · `rating.no_argument` ·
//                      `competitor.decline` · `fallback.honest_unknown` ·
//                      EVERY number, price, time, phone, address, branch and
//                      doctor name · digit style · the emoji allowlist · the
//                      one-question rule · the ≤3-message cadence
//   the model owns     which intent this message carries, and nothing else
//
// Every FACT comes from `lib/health` through `_domain`. There is no code path in
// this file that can produce one: it selects a frozen string, and the engine
// fills the slots.
//
// CADENCE is enforced here rather than hoped for (§4.2): ≤2 messages per turn
// (3 only under the split-recap pattern), ONE question mark per message.
// `assertCadence()` is the mechanical form of that rule.
// ============================================================================

import { callback as domainCallback, canBook, cancel as domainCancel, clinicsAtSite, confirm as domainConfirm, genderAvailability, hold as domainHold, insurance, NEED_PLANS, nextOpening, normalizeArabic, openState, OPS, packageFor, planFor, price, REAL_CONTACTS, recommend, riyadhDateISO, riyadhParts, serviceNameAr, siteInDistrict, SITES, twoSlotsAcrossDays, type Appointment, type DemoNeed, type FaysalStore, type SiteId, type SiteView, type SlotView } from "../_domain";
import { EN } from "./english";
import { compose } from "./render";
import { classifyDeterministic, detectLanguage, nameInConfirm, nameShaped, outOfCatalogueSpecialty } from "./intent";
import type { Classification } from "./intent";
import type { FaysalSession } from "./session";
import * as S from "./strings";

export interface OutMsg {
  from: "system" | "faysal";
  text: string;
}

export interface Reply {
  messages: OutMsg[];
  /** WhatsApp-style quick replies. Never on the greeting (§2.1: the opener is a
   *  sentence, never a menu of buttons) and never on the rail (SPEC-4 §4.1:
   *  `presentation: null` — a tappable "Book now" beside an ambulance instruction
   *  is the defect). At most two, mirroring §4.1 #4's two-option cap. */
  chips: string[];
  stopReason: string | null;
  scene: string;
}

// ── cadence guard (§4.2) ────────────────────────────────────────────────────

/**
 * §4.2 is «at most TWO messages per turn; three only under the split-recap pattern».
 * This guard capped at three unconditionally, so the rule that governed the product
 * was not the rule anyone had written down — and three design proposals in one
 * afternoon each quietly assumed a third message was free. Measured over 150 turns
 * across ten journeys and three clocks, the engine emits three exactly never; the
 * only path that can is the bundled opening, which IS the split-recap and says so.
 */
function assertCadence(messages: OutMsg[], splitRecap = false): OutMsg[] {
  const mine = messages.filter((m) => m.from === "faysal");
  const cap = splitRecap ? 3 : 2;
  if (mine.length > cap) {
    throw new Error(
      `[faysal] cadence: ${mine.length} messages in one turn; §4.2 allows ${cap}` +
        (splitRecap ? " under the split-recap pattern." : " — pass splitRecap only for the documented three-part shape."),
    );
  }
  for (const m of mine) {
    const marks = (m.text.match(/[؟?]/g) ?? []).length;
    if (marks > 1) {
      throw new Error(`[faysal] cadence: ${marks} question marks in one message — that is two messages, or it is wrong.`);
    }
  }
  return messages;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const site = (id: SiteId | null): SiteView | null => (id ? SITES[id] : null);

function branchPhoneFor(s: FaysalSession): string | null {
  return site(s.siteId)?.phoneAr ?? site(s.nearSiteId)?.phoneAr ?? null;
}

function faysal(
  s: FaysalSession,
  text: string,
  opts: { quotedPackage?: boolean; packageTermsAr?: string | null; isConfirmation?: boolean } = {},
): OutMsg {
  return { from: "faysal", text: compose(text, { branchPhone: branchPhoneFor(s), ...opts }) };
}

function reply(s: FaysalSession, msgs: OutMsg[], chips: string[] = [], stopReason: string | null = null): Reply {
  return { messages: assertCadence(msgs), chips: chips.slice(0, 2), stopReason, scene: s.scene };
}

/** The question currently open in this thread, for a greeting echo to nudge back to. */
/** The language of the last SUBSTANTIVE user message before this one — greetings and
 *  one-word replies decide nothing; the tie-break is Arabic (§3.1). */
function threadLanguage(s: FaysalSession, current: string): "ar" | "en" | "other" {
  const users = s.history.filter((h) => h.role === "user").map((h) => h.content);
  if (users.length && users[users.length - 1] === current) users.pop();
  for (let i = users.length - 1; i >= 0; i--) {
    const text = users[i];
    if ((text.match(/[A-Za-z؀-ۿ]/g) ?? []).length >= 6) return detectLanguage(text);
  }
  return "ar";
}
function openQuestionFor(s: FaysalSession, language: "ar" | "en" | "other" = "ar"): string | null {
  const en = language === "en";
  if (s.scene === "S6_close" && s.holdId) return en ? "Shall I confirm the appointment I am holding for you?" : "أثبّت لك الموعد اللي ماسكه لك؟";
  if (s.scene === "S5_slots" && s.offeredSlots.length) return en ? "Which time shall I book?" : "أي وقت أثبّت لك؟";
  if (s.awaitingCallbackWindow) return en ? "Morning, or after Asr?" : "الصبح ولا بعد العصر؟";
  if (s.scene === "S3_route" || s.scene === "S4_insurance") return en ? "Is the visit on insurance or cash?" : "الزيارة تأمين ولا كاش؟";
  return null;
}
/**
 * THE CHIPS ARE THE ANSWER TO THE QUESTION HE JUST ASKED. Nothing else.
 *
 * They were previously attached at about a dozen call sites and absent at twenty
 * more, so a patient who asked about the doctor, the rating, a competitor, their
 * records, or a cancellation got a reply with nothing to tap and no question to
 * answer — a dead end they had to rescue by guessing what to type next.
 *
 * This reads the SPINE POSITION rather than the intent, because the right two
 * options depend on where the booking has got to, not on what was asked. Two is the
 * cap: §4.1 #4's two-option rule, and more than two on a phone is a menu.
 */
function chipsFor(s: FaysalSession): string[] {
  // The rail never reaches this file — `turn/route.ts` returns before `runTurn` on a
  // red flag, with chips [] hard-coded (SPEC-4 §4.1: never a tappable button beside
  // an ambulance instruction). There is no S0 branch here because there cannot be.
  if (s.scene === "S6_close" && s.holdId) return ["إي، ثبّته", "لا، غيّره"];
  if (s.scene === "S5_slots" && s.offeredSlots.length) return s.offeredSlots.slice(0, 2).map((x) => x.labelAr);
  if (s.awaitingCallbackWindow) return ["الصبح", "بعد العصر"];
  if (s.scene === "S7_confirmed" || s.booked) return ["أغيّر الموعد", "شكراً"];
  if (s.scene === "S14_closed") return ["أبغى موعد"];
  if (s.forkOffered && s.nearSiteId && s.siteId) return [SITES[s.nearSiteId].districtAr, SITES[s.siteId].districtAr];
  if (!s.need) return ["كشف عام", "عيادة معيّنة"];
  if (!s.districtAr) return BOOKABLE_DISTRICTS;
  if (!s.payment) return ["تأمين", "كاش"];
  return ["أقرب موعد"];
}

/** The two districts the demo can actually book in, offered when he asks where the
 *  patient is. Naming a district we cannot book is an availability claim (§8.1 #12). */
const BOOKABLE_DISTRICTS: string[] = [SITES["wattan-2"].districtAr, SITES["shoaa-wurud"].districtAr];

/**
 * THE ONE QUESTION THE CONVERSATION IS WAITING ON, whatever the patient just said.
 *
 * A clinic conversation has a spine — what do you need, which branch, how are you
 * paying, which time, confirm, what to bring — and a coordinator walks it whether or
 * not the patient's last message was about it. Faysal answered off-spine messages
 * («انت روبوت؟», «شفت تقييمكم», «وين نتيجة تحليلي») honestly and then STOPPED, so the
 * patient had to restart the booking themselves. The answer keeps its own voice; this
 * is what gets added after it, so the thread always has a next move.
 *
 * Returns null at a terminal position — the rail, a finished booking, a closed
 * thread — because those are the three places a conversation is allowed to end.
 */
function spineQuestion(s: FaysalSession, language: "ar" | "en" | "other"): string | null {
  if (s.scene === "S7_confirmed" || s.scene === "S14_closed") return null;
  if (s.scene === "S6_close" && s.holdId) return openQuestionFor(s, language);
  if (s.scene === "S5_slots" && s.offeredSlots.length) return openQuestionFor(s, language);
  if (s.awaitingCallbackWindow) return openQuestionFor(s, language);
  const en = language === "en";
  if (!s.need) return en ? "What do you need — a general consultation, or a specific clinic?" : "وش تحتاج — كشف عام ولا عيادة معيّنة؟";
  if (!s.districtAr) return en ? "Which district are you in?" : "أنت بأي حي؟";
  if (!s.payment) return en ? "Is the visit on insurance or cash?" : "الزيارة تأمين ولا كاش؟";
  return en ? "Shall I find you the earliest appointment?" : "أشوف لك أقرب موعد؟";
}

const needOf = (s: FaysalSession): DemoNeed | null => s.need;

// ── the opener (S1) ─────────────────────────────────────────────────────────

/**
 * Rule DEMO-1(b): the system line is the FIRST message of every conversation and
 * it precedes the greeting. It is not attributed to Faysal, and it carries the
 * real booking numbers 920009303 / 0504490460 and 997.
 *
 * The red-flag screen runs before it — "if the inbound message carries a red-flag
 * symptom, NO greeting is sent at all." That precedence lives in the route.
 */
export function openConversation(s: FaysalSession, now: Date, language: "ar" | "en" | "other" = "ar"): Reply {
  const msgs: OutMsg[] = [];
  if (!s.demoLineSent) {
    msgs.push({ from: "system", text: compose(S.DEMO_1_B) });
    s.demoLineSent = true;
  }
  s.scene = "S2_discover";
  msgs.push({ from: "faysal", text: compose(selectGreeting(s, now, language)) });
  s.greeted = true;
  // §2.1: "Never a menu of buttons as the opener." Zero chips on this turn.
  return reply(s, msgs, []);
}

function selectGreeting(s: FaysalSession, now: Date, language: "ar" | "en" | "other"): string {
  if (language === "en") return EN.greeting;

  const p = riyadhParts(now);

  // G4 — after midnight. `erSites({ now })` is SPEC-4 §4.4's call, and no site in
  // this build satisfies its freshness requirement (a named verifier inside 30
  // days). Zero eligible sites is the branch this reaches, and §4.4 is explicit
  // that it is the correct default, not a degradation.
  if (p.hour >= 0 && p.hour < 6) {
    s.scene = "S11_offhours";
    return S.GREETING_AFTER_MIDNIGHT_NO_ER;
  }

  // G3 — Friday, before the branch opens. States the REAL opening time from data.
  if (p.weekday === 5) {
    const anchor = SITES["wattan-2"];
    const state = openState("wattan-2", now);
    if (state.state === "CLOSED" && state.opensAtAr) {
      s.scene = "S11_offhours";
      s.siteId = "wattan-2";
      // Rule FRI-1 is applied by the renderer: this message names Friday, so the
      // branch phone is appended by `compose`, not by this line remembering to.
      return compose(S.greetingFridayBeforeOpen(anchor.nameAr, state.opensAtAr), { branchPhone: anchor.phoneAr });
    }
  }

  return S.GREETING_NEW_PATIENT;
}

// ── the fork ────────────────────────────────────────────────────────────────

function forkReply(s: FaysalSession, bestId: SiteId, nearId: SiteId, reasonAr: string, now: Date): Reply {
  const best = SITES[bestId];
  const near = SITES[nearId];
  const nearState = openState(nearId, now);
  const plan = planFor(needOf(s));
  const capability = clinicsAtSite(nearId).slice(0, 2).join(" و") || "عيادات عامة";

  s.siteId = bestId;
  s.nearSiteId = nearId;
  s.forkOffered = true;
  s.scene = "S3_route";

  const optionBest = `${best.shortAr} بموعد مثبّت من الحين — الكشف والجلسة في نفس الزيارة، وما تتنقل.`;

  // Rule C4-1: a contested site is bookable, but NEVER silently. Rule C4-3: the
  // contradiction is never explained away. So the near option promises a CALLBACK
  // and a phone number, not a time.
  const contested = nearState.state === "UNVERIFIED";
  const optionNear = contested
    ? `أسجّل لك طلب في ${near.shortAr}، والفرع يتصل عليك ويثبت الوقت — وقبل ما تطلع اتصل على ${near.phoneAr} وتأكد إنه فاتح.`
    : `كشف في ${near.shortAr} لأنه قريب، و${plan.nounAr} بعدين في ${best.shortAr}.`;

  // «مجمع الوطن الطبي 2 — الروابي — الروابي فرع الأسنان والتقويم عندهم. الروابي أبعد
  // عليك» — three times in one line, which is the founder's defect #3 and it was only
  // half fixed: `motionMatchForkFocus` got the strip, this template did not. The
  // authored reasons mostly OPEN with the branch's short name, and the template has
  // just written the full name, which already ends in it. Same strip, same reason.
  const bestReason = withoutLeadBranch(reasonAr, best.shortAr) ?? reasonAr;

  const args = {
    nearBranch: near.nameAr,
    nearCapability: capability,
    procedure: plan.nounAr,
    bestBranch: best.nameAr,
    bestShort: best.shortAr,
    bestReason,
    optionNear,
    optionBest,
  };
  const text = contested ? S.motionMatchForkUnverified(args) : S.motionMatchFork(args);

  return reply(s, [faysal(s, text)], [near.districtAr, best.districtAr]);
}

/**
 * An authored strength line with its own leading branch mention removed.
 *
 * The templates that use these lines have ALREADY named the branch — its full name
 * ends in the short one — so re-opening with it produced «مجمع الوطن الطبي 2 —
 * الروابي — فرع الروابي هو الفرع اللي…»: the district three times in one line, which
 * is the founder's defect #3. Two lead-ins occur in the table, «الروابي …» and «فرع
 * الروابي …», and a first fix handled only the first, which is why three of five
 * districts still shipped the reported sentence verbatim.
 *
 * Returns null when the line does not open with the branch at all (twelve of the
 * thirty-six do not), so callers can fall back rather than splice something
 * ungrammatical into the middle of a sentence.
 */
function withoutLeadBranch(line: string, shortAr: string): string | null {
  for (const lead of [`فرع ${shortAr}`, shortAr]) {
    if (line.startsWith(lead)) return line.slice(lead.length).trim();
  }
  return null;
}

/** The near branch can do it too — see `S.motionMatchForkFocus`. */
function focusForkReply(s: FaysalSession, bestId: SiteId, nearId: SiteId, bestReason: string, nearAlsoAr: string): Reply {
  const best = SITES[bestId];
  const near = SITES[nearId];

  s.siteId = bestId;
  s.nearSiteId = nearId;
  s.forkOffered = true;
  s.scene = "S3_route";

  // The authored strength lines start with the branch's own short name («شعاع الورود
  // كمان يسوّق…»), and this sentence has already named it. Strip it, so the branch is
  // named once per clause instead of twice in a row.
  // The authored strength lines mostly start with the branch's own short name
  // («شعاع الورود فيه طب أسرة») and this sentence has already named it — so the name
  // is stripped and the rest is used. TWELVE of the thirty-six do NOT start that way
  // («فرع الروابي هو الفرع اللي…», «عيادة المخ والأعصاب مذكورة في…»), and splicing
  // those in produced «وهو فرع الشفا فيه تقويم معلن» — ungrammatical, and it names
  // the branch twice in a row, which is the very defect this template exists to fix.
  // When the line does not start with the short name, its clinic list is used
  // instead: always grammatical, never re-names, and still specific to that branch.
  // startsWith/slice rather than a RegExp: `shortAr` is data and nothing enforces
  // that it stays free of regex metacharacters.
  const nearAlso =
    withoutLeadBranch(nearAlsoAr, near.shortAr) ??
    `فيه ${clinicsAtSite(nearId).slice(0, 2).join(" و") || "عيادات عامة"}`;

  return reply(
    s,
    [
      faysal(
        s,
        S.motionMatchForkFocus({
          nearBranch: near.nameAr,
          nearShort: near.shortAr,
          nearAlso,
          bestShort: best.shortAr,
          bestReason,
        }),
      ),
    ],
    [near.districtAr, best.districtAr],
  );
}

type ForkChoice = "near" | "best" | null;

function readForkChoice(raw: string, s: FaysalSession): ForkChoice {
  if (!s.forkOffered || !s.nearSiteId || !s.siteId) return null;
  const t = normalizeArabic(raw);
  const near = SITES[s.nearSiteId];
  const best = SITES[s.siteId];
  const hit = (v: SiteView) => t.includes(normalizeArabic(v.districtAr)) || t.includes(normalizeArabic(v.nameAr));
  if (hit(best)) return "best";
  if (hit(near)) return "near";
  if (/(^|\s)(2|الثاني|الثانيه)(\s|$)/.test(t)) return "best";
  if (/(^|\s)(1|الاول|الاولي)(\s|$)/.test(t)) return "near";
  return null;
}

// ── slots, hold, confirm ────────────────────────────────────────────────────

/**
 * Does an offered slot fall inside the window the patient asked for?
 *
 * Labels are «اليوم الثلاثاء 4:30 م» — hour plus a ص/م meridiem — so the hour is read
 * from the label rather than from a Date the caller would have to carry. «الصبح» is
 * anything ص; «بعد العصر» is 3 pm onward; «بعد الساعة ٧» is that hour onward, read in
 * the half of the day the patient plainly meant (nobody asks for an evening
 * appointment «بعد الساعة ٧» and means seven in the morning).
 */
function slotInWindow(labelAr: string, windowAr: string): boolean {
  const m = /(\d{1,2}):(\d{2})\s*(ص|م)/.exec(normalizeArabic(labelAr));
  if (!m) return true; // a label we cannot read is never filtered OUT
  const h12 = Number(m[1]);
  const pm = m[3] === "م";
  const hour24 = pm ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
  if (windowAr.includes("الصبح")) return !pm;
  if (windowAr.includes("بعد العصر")) return hour24 >= 15;
  const clock = /(\d{1,2})/.exec(normalizeArabic(windowAr));
  if (clock) {
    const asked = Number(clock[1]);
    return hour24 >= (asked <= 11 ? asked + 12 : asked);
  }
  return true;
}

function offerSlots(
  s: FaysalSession,
  now: Date,
  language: "ar" | "en" | "other",
  store: FaysalStore,
  from: Date = now,
): Reply {
  const target = s.siteId;
  if (!target) return askDistrict(s);
  const view = SITES[target];
  const plan = planFor(needOf(s));

  // A PATIENT WHO SAID «بكرة» AND IS OFFERED TODAY FIRST HAS NOT BEEN LISTENED TO,
  // however good the slot is. The named day moves the search origin; it never
  // invents inventory, so if that day has none the honest empty-list path still runs.
  if (from === now && s.preferredDayAr && s.preferredDayAr !== "اليوم") {
    const days = s.preferredDayAr === "بعد بكرة" ? 2 : 1;
    from = new Date(now.getTime() + days * 24 * 3600_000);
  }

  // Invariant H4 + Rule C4-1: an unbookable or contested site never produces a
  // time. It produces a callback request and a phone number, out loud.
  let slots = twoSlotsAcrossDays(target, needOf(s), from, now, store);

  // «ابغى موعد مسائي بعد الساعة ٧» answered with 4:30 pm and 9:45 am is not an
  // answer. The window the patient named filters what is OFFERED — and when nothing
  // in inventory matches it, that is said out loud rather than quietly ignored,
  // because the alternative is a patient reading a time they already ruled out.
  let windowMissed = false;
  if (s.preferredWindowAr) {
    const inWindow = slots.filter((x) => slotInWindow(x.labelAr, s.preferredWindowAr as string));
    if (inWindow.length) slots = inWindow;
    else if (slots.length) windowMissed = true;
  }
  if (slots.length === 0) {
    s.awaitingCallbackWindow = true;
    s.scene = "S11_offhours";
    return reply(
      s,
      [faysal(s, S.greetingBranchUnverifiedBookAnyway(view.nameAr, view.phoneAr))],
      ["الصبح", "بعد العصر"],
    );
  }

  s.offeredSlots = slots;
  s.scene = "S5_slots";

  // The window they named had nothing in it. Say that FIRST, in their own words, and
  // then offer what does exist — never the other way round, and never silently.
  const missed = windowMissed && language !== "en" ? `${S.windowNotAvailable(s.preferredWindowAr as string, view.shortAr)}\n` : "";

  if (slots.length === 1) {
    return reply(s, [faysal(s, `${missed}${S.motionCloseSingle(slots[0].labelAr, view.shortAr)}`)], [slots[0].labelAr]);
  }

  const text =
    language === "en"
      ? EN.close(view.nameEn, plan.clinicAr, slots[0].labelAr, slots[1].labelAr)
      : `${missed}${S.motionClose(view.nameAr, plan.clinicAr, slots[0].labelAr, slots[1].labelAr)}`;

  // A Friday slot in the list makes this a Friday reply, and Rule FRI-1 appends
  // the branch phone here — the same code path that renders the slot.
  return reply(s, [faysal(s, text)], [slots[0].labelAr, slots[1].labelAr]);
}

function pickSlot(
  s: FaysalSession,
  index: number,
  language: "ar" | "en" | "other",
  now: Date,
  store: FaysalStore,
): Reply {
  const slot = s.offeredSlots[index - 1];
  if (!slot) return offerSlots(s, now, language, store);
  const held = domainHold(slot.slotId, s.id, s.patientNameAr, now, store);
  if (!held) return reply(s, [faysal(s, S.fallbackHonestUnknown("أشوف لك وقت ثاني في نفس الفرع"))]);
  s.holdId = held.holdId;
  s.heldSlot = slot;
  s.scene = "S6_close";
  const branch = SITES[slot.siteId];
  const text =
    language === "en"
      ? EN.hold(slot.labelAr, branch.nameEn, held.holdMinutes, s.patientNameAr)
      : S.holdMessage(slot.labelAr, branch.shortAr, slot.clinicAr, held.holdMinutes, s.patientNameAr);
  return reply(s, [faysal(s, text)], ["إي، ثبّته", "لا، غيّره"]);
}

/**
 * WHAT IS BOOKED, SAID BACK. Reached by «موعدي باقي صح؟», «خليه», a yes after the
 * confirmation, and by any courtesy that is not a goodbye. It reads only what
 * `renderAppointment` recorded — it never re-derives a time, and it never touches
 * the store, so it cannot create a second appointment.
 */
function bookingStands(s: FaysalSession): Reply {
  if (!s.booked) return reply(s, [faysal(s, S.NO_BOOKING_YET)], ["أقرب موعد"]);
  const text =
    s.booked.kind === "callback"
      ? S.bookingStandsCallback(s.booked.branchShortAr)
      : S.bookingStands(s.booked.slotLabelAr, s.booked.branchShortAr, s.booked.clinicAr);
  // A patient asking whether their booking survived is not objecting to anything.
  s.objections.decline = 0;
  return reply(s, [faysal(s, text)]);
}

/**
 * «أبي أغير الوقت» — SPEC-1 §8's التعديل, which had no implementation at all: the
 * word «أغير» reached the negation layer and the patient was answered as if they
 * had walked away. The current appointment is named first, then two alternatives;
 * nothing is cancelled until the patient picks one.
 */
function rescheduleReply(s: FaysalSession, raw: string, now: Date, language: "ar" | "en" | "other", store: FaysalStore): Reply {
  if (!s.booked && !s.holdId) return offerSlots(s, now, language, store);
  if (!s.booked) return offerSlots(s, now, language, store); // only a hold — re-offering IS the change
  const target = s.siteId ?? "wattan-2";
  const alternatives = twoSlotsAcrossDays(target, needOf(s), now, now, store).filter(
    (x) => x.labelAr !== s.booked?.slotLabelAr,
  );
  if (alternatives.length < 2) {
    const phone = branchPhoneFor(s) ?? REAL_CONTACTS.unified;
    return reply(s, [faysal(s, S.rescheduleNoAlternative(s.booked.slotLabelAr, phone))]);
  }
  s.offeredSlots = alternatives.slice(0, 2);
  s.scene = "S5_slots";
  return reply(
    s,
    [faysal(s, S.rescheduleOffer(s.booked.slotLabelAr, s.offeredSlots[0].labelAr, s.offeredSlots[1].labelAr))],
    s.offeredSlots.map((x) => x.labelAr),
  );
}

function confirmHeld(s: FaysalSession, now: Date, store: FaysalStore): Reply {
  if (!s.holdId || !s.heldSlot) return reply(s, [faysal(s, S.fallbackHonestUnknown("أشوف لك أقرب موعد من جديد"))]);
  const appt = domainConfirm(s.holdId, s.id, s.patientNameAr, now, store);
  if (!appt) {
    // §6.5: "wait for real confirmation before claiming it." A hold that expired,
    // or a window that closed between the hold and the confirm, is NOT a booking.
    s.holdId = null;
    s.heldSlot = null;
    return reply(s, [faysal(s, "الحجز ما ثبت — الوقت اللي كنت ماسكه لك انتهى. أشوف لك أقرب وقت من جديد؟")]);
  }
  return renderAppointment(s, appt);
}

/**
 * FRI-1 on a CONFIRMED Friday booking.
 *
 * The rule's post-pass fires on a message that names Friday, and the confirmation
 * block — which does name it — is atomic (§6.7), so the suffix used to land after
 * «حجز تجريبي — غير مسجّل لدى الفرع»: an instruction below the block's own legal
 * label, on the one screenshot the whole demo is built around. It rides on the
 * pre-visit message instead, which is where a thing-to-do-before-you-leave belongs.
 *
 * It appends the rule's OWN suffix rather than a second sentence about Friday: the
 * first attempt wrote its own version and the patient read the warning twice.
 */
function fridaySuffix(s: FaysalSession): string {
  const label = s.booked?.slotLabelAr || s.heldSlot?.labelAr || "";
  if (!/الجمعه/.test(normalizeArabic(label))) return "";
  const phone = branchPhoneFor(s);
  return phone ? `\n${S.friday1Suffix(phone)}` : "";
}

function renderAppointment(s: FaysalSession, appt: Appointment): Reply {
  const branch = SITES[appt.siteId];
  s.bookingRef = appt.ref;
  s.holdId = null;
  s.scene = "S7_confirmed";
  // WHAT WAS BOOKED, IN THE WORDS THE PATIENT READ. Everything after this turn —
  // «موعدي باقي صح؟», «خليه», «تسلم» — is answered from here. The offered slots go
  // with it: leaving them behind made the next «تمام مشكور» try to hold a slot that
  // was already booked, and the patient saw a SECOND appointment appear.
  s.booked = {
    kind: appt.kind === "callback_request" ? "callback" : "slot",
    slotLabelAr: s.heldSlot?.labelAr ?? "",
    branchShortAr: branch.shortAr,
    clinicAr: s.heldSlot?.clinicAr ?? serviceNameAr(appt.serviceId),
  };
  s.offeredSlots = [];
  s.heldSlot = appt.kind === "callback_request" ? s.heldSlot : s.heldSlot;

  // §6.7: the confirmation block is ATOMIC — its own message, nothing appended,
  // no question glued on. The pre-visit block is a SEPARATE message.
  if (appt.kind === "callback_request") {
    // SPEC-1 §4.6 — a callback consumes no inventory and NEVER renders a time.
    // There is no `الموعد:` row in this template at all, by construction.
    const block = S.motionConfirmBlockCallback({
      patientName: appt.patient.displayName,
      branchName: branch.nameAr,
      branchAddress: branch.addressAr,
      clinic: serviceNameAr(appt.serviceId),
      preferredWindow: appt.preferredWindowAr ?? "",
      branchPhone: branch.phoneAr,
    });
    return reply(
      s,
      [
        { from: "faysal", text: compose(block, { isConfirmation: true, branchPhone: branch.phoneAr }) },
        faysal(s, S.preVisitCallback(s.payment) + fridaySuffix(s)),
      ],
      [],
    );
  }

  const block = S.motionConfirmBlock({
    patientName: appt.patient.displayName,
    branchName: branch.nameAr,
    branchAddress: branch.addressAr,
    clinic: s.heldSlot?.clinicAr ?? serviceNameAr(appt.serviceId),
    slot: s.heldSlot?.labelAr ?? "",
    insurer: s.carrierAr,
  });
  return reply(
    s,
    [
      { from: "faysal", text: compose(block, { isConfirmation: true, branchPhone: branch.phoneAr }) },
      // FRI-1's Friday line rides HERE now, on the pre-visit message, because the
      // confirmation block above it is atomic (§6.7). The renderer's post-pass fires
      // on a message that NAMES Friday, and the pre-visit text does not — so the day
      // is carried in explicitly. Dropping it silently is worse than the placement
      // problem it replaced: FRI-1 exists because a Friday booking needs a phone call
      // before the patient leaves home.
      faysal(s, S.motionPreVisit(OPS.arrivalBufferMinutes, s.payment) + fridaySuffix(s)),
    ],
    [],
  );
}

function confirmCallback(s: FaysalSession, windowAr: string, now: Date, store: FaysalStore): Reply {
  const target = s.siteId ?? s.nearSiteId;
  if (!target) return askDistrict(s);
  const appt = domainCallback(
    { siteId: target, need: needOf(s), waNumber: s.id, displayName: s.patientNameAr, preferredWindowAr: windowAr },
    now,
    store,
  );
  if (!appt) {
    return reply(s, [faysal(s, S.fallbackHonestUnknown(`تتصل على ${SITES[target].phoneAr} والاستقبال يسجّل لك الطلب`))]);
  }
  s.awaitingCallbackWindow = false;
  return renderAppointment(s, appt);
}

// ── discovery ───────────────────────────────────────────────────────────────

/**
 * THE CHIPS ARE DERIVED FROM THE QUESTION, so the two cannot drift apart.
 *
 * `askDistrict` asked «أنت بأي حي؟» and offered «تأمين / كاش» — the two-in-one
 * defect inverted, and invisible because that function is reached from `offerSlots`
 * and `confirmCallback` rather than from the booking path a proof walks. Pairing
 * them by hand at each ask site is what allowed it; reading the question is what
 * stops it. Exported so it can be proved directly.
 */
export function chipsAnswering(question: string, s: FaysalSession): string[] {
  if (/بأي حي|أي حي|which district/i.test(question)) return BOOKABLE_DISTRICTS;
  if (/تأمين ولا كاش|insurance or cash/i.test(question)) return ["تأمين", "كاش"];
  return chipsFor(s);
}

function askDistrict(s: FaysalSession): Reply {
  s.scene = "S2_discover";
  const text = s.need ? S.MOTION_DISCOVER_SHORT : S.MOTION_DISCOVER;
  return reply(s, [faysal(s, text)], chipsAnswering(text, s));
}

function matchAndAsk(s: FaysalSession, now: Date, language: "ar" | "en" | "other", store: FaysalStore, raw = ""): Reply {
  const rec = recommend(needOf(s), { districtAr: s.districtAr, now });
  if (!rec) return unsupportedSpecialty(s, raw);

  // NEVER NAME A BRANCH BEFORE THE DISTRICT IS KNOWN.
  //
  // The recommendation depends on the district — that is the whole point of asking
  // for it — so announcing one first is announcing a guess. It read like this:
  //   «اللي يناسبك: مجمع الوطن الطبي 2 — الروابي»   ← before the district
  //   «تمام. أنت بأي حي؟»
  //   «الورود»
  //   «أقرب فرع لك هو مجمع شعاع الطبي — الورود»      ← a different branch, one turn later
  // Two recommendations, contradicting each other, from a coordinator who is meant to
  // sound like he was listening. The ask on its own is the whole turn; the branch is
  // named once, when it is actually known.
  if (!s.districtAr) {
    s.scene = "S2_discover";
    // ASKED THREE TIMES IS NOT ASKED. A patient who types «ابي اقرب موعد» and never
    // names a district got the identical sentence again and again — every other
    // repeat risk in this file is capped (`s.objections.*`, `alreadySaid`) and this
    // one was not. After two asks he stops asking and offers the two branches he can
    // actually book, which is the answer to «أقرب» without the district.
    s.objections.district = (s.objections.district ?? 0) + 1;
    if (s.objections.district > 2) {
      return reply(s, [faysal(s, S.districtNotServed(BOOKABLE_DISTRICTS.join(" و")))], BOOKABLE_DISTRICTS);
    }
    // `planFor(null)` yields the general-checkup noun, so asking «تمام، الكشف العام.
    // أنت بأي حي؟» of someone who only said «ابغى موعد» puts a need in their mouth.
    // With no need on the session, the need is what is missing — ask for that.
    const need = needOf(s);
    if (!need) return reply(s, [faysal(s, language === "en" ? EN.discover : S.MOTION_DISCOVER)], chipsFor(s));
    const ask = language === "en" ? EN.askDistrictBecause : S.askDistrictFor(planFor(need).nounAr);
    return reply(s, [faysal(s, ask)], chipsAnswering(ask, s));
  }

  if (rec.nearestSiteId && rec.nearestSiteId !== rec.siteId) {
    // Which fork: the near branch has NO strength for this need (say plainly where
    // it is done), or it has one the group only markets (say both, deny neither).
    // A `named_capability` near the patient never gets here — the router already
    // chose it, so there is nothing to fork.
    // A GATED OR CONTESTED near branch always takes the original fork, whatever its
    // strength says. `forkReply` is the one that carries Rule C4-1's copy — a
    // callback instead of a time, the branch's phone number, and «قبل ما تطلع اتصل
    // … وتأكد إنه فاتح». The focus fork offers a flat choice of a fixed time, which
    // at الشفا is a promise the next turn walks back.
    const nearIsSafe = !rec.nearestGated && !rec.nearestContested && openState(rec.nearestSiteId, now).state !== "UNVERIFIED";
    return nearIsSafe && rec.nearestServesNeed && rec.nearestStrengthAr
      ? focusForkReply(s, rec.siteId, rec.nearestSiteId, rec.reasonAr, rec.nearestStrengthAr)
      : forkReply(s, rec.siteId, rec.nearestSiteId, rec.reasonAr, now);
  }

  s.siteId = rec.siteId;
  s.scene = "S3_route";
  const branch = SITES[rec.siteId];
  // THE RECOMMENDATION IS SAID ONCE PER BRANCH. «أبغى كشف عام» → «اللي يناسبك:
  // الروابي…» and then «أنا في الروابي» → the identical sentence again, because the
  // ask was still outstanding. Repeating it verbatim is the loudest possible tell
  // that the last message was not read; the ask on its own is the whole turn.
  const alreadySaid = s.announcedSiteId === rec.siteId;
  s.announcedSiteId = rec.siteId;
  const matchText = language === "en" ? EN.match(branch.nameEn, rec.reasonEn) : S.motionMatch(branch.nameAr, rec.reasonAr);

  // Split-recap (§4.2): the match is one atomic message, the ask is the next. Two
  // messages in one turn — within cadence, and the ask carries the only «؟».
  // ASK ONLY WHAT IS STILL MISSING. The combined question went out even to a patient
  // who had just named their district AND their insurer in the same sentence, which
  // is the moment testers said he stopped sounding like he was listening.
  // The district is known by the time execution reaches here — the branch above
  // returns without it — so payment is the only thing that can still be missing.
  // The old district/payment fan-out here was dead the moment that branch went in.
  if (!s.payment) {
    const ask = language === "en" ? EN.discoverPayment : S.MOTION_DISCOVER_PAYMENT;
    const msgs = alreadySaid ? [faysal(s, ask)] : [faysal(s, matchText), faysal(s, ask)];
    // THE CHIPS ANSWER THE QUESTION THAT WAS ASKED — read off it, never paired by hand.
    return reply(s, msgs, chipsAnswering(ask, s));
  }
  return offerSlots(s, now, language, store);
}

/**
 * Rule SPEC-1 + Rule STR-3. `recommendBranch` throws `need_unrecognised` for a
 * specialty §6.2 records as group-wide only — orthopaedics, urology, cardiology —
 * because naming a branch we cannot claim runs that clinic is an
 * `availability_claim`. The honest answer is «let me confirm which branch runs
 * that clinic», never a quiet substitution into a general consultation.
 */
function unsupportedSpecialty(s: FaysalSession, raw: string): Reply {
  // THE OLD LINE WAS THE GENERIC «هذي المعلومة ما أقدر أأكدها» — the same paragraph a
  // patient gets for anything unknown. A 68-year-old who typed «عندي ألم في الركبة من
  // شهر» and then «أبي موعد عظام» received it VERBATIM THREE TIMES and left. Two
  // things were missing: he never acknowledged what they said, and he never offered
  // the one thing he can actually do, which is write the request down.
  //
  // It must not presuppose the clinic exists either — «الاستقبال يقول لك أي فرع فيه
  // العيادة» quietly asserts there is one (§8.1 #12). Reception is asked WHETHER and
  // where, in that order.
  // The SAME list that classified this turn, so the apology names the clinic the
  // detector actually matched. Two lists drift, and drifting here means apologising
  // for the wrong specialty.
  const asked = outOfCatalogueSpecialty(raw) ?? specialtyWordIn(raw);
  s.objections.unsupported = (s.objections.unsupported ?? 0) + 1;
  const opener = s.objections.unsupported === 1 ? "الله يعافيك." : "أعرف، وأعتذر إني ما أقدر أثبّتها من هنا.";
  return reply(
    s,
    [
      faysal(
        s,
        `${opener}\n${asked ? `عيادة ${asked}` : "هذي العيادة"} ما أقدر أثبّت لها موعد من هنا، وما أبي أقول لك فيه وأطلع مو موجود.\n` +
          `أسجّل لك طلب مكتوب فيه اللي تحتاجه والفرع يتصل عليك، ولا تتصل أنت على ${REAL_CONTACTS.unified}؟`,
      ),
    ],
    ["سجّل لي طلب"],
  );
}

/** The specialty the patient actually typed, said back to them in their own word. */
function specialtyWordIn(raw: string): string | null {
  const t = normalizeArabic(raw);
  const words: [string, string][] = [
    ["عظام", "العظام"], ["الركبه", "العظام"], ["ركبه", "العظام"], ["كتف", "العظام"], ["المفاصل", "العظام"],
    ["قلب", "القلب"], ["قلبيه", "القلب"], ["مسالك", "المسالك"], ["كلي", "الكلى"], ["اورام", "الأورام"],
    ["نفسي", "النفسية"], ["نفسيه", "النفسية"], ["سكري", "السكري"], ["تجميل", "التجميل"],
    ["تخاطب", "التخاطب"], ["علاج طبيعي", "العلاج الطبيعي"], ["روماتيزم", "الروماتيزم"],
    ["الظهر", "العظام"], ["ظهري", "العظام"],
  ];
  for (const [needle, label] of words) if (t.includes(needle)) return label;
  return null;
}

// ── the expansion gate (§6.6) ───────────────────────────────────────────────

const RELATIONS: readonly { words: string[]; pronoun: string }[] = [
  { words: ["امي", "والدتي", "الوالده"], pronoun: "لوالدتك" },
  { words: ["ابوي", "والدي", "الوالد"], pronoun: "لوالدك" },
  { words: ["ولدي", "ابني"], pronoun: "لولدك" },
  { words: ["بنتي", "ابنتي"], pronoun: "لبنتك" },
  { words: ["زوجتي", "مرتي", "حرمتي"], pronoun: "لزوجتك" },
  { words: ["اخوي"], pronoun: "لأخوك" },
  { words: ["اختي"], pronoun: "لأختك" },
];

function expansionPronoun(raw: string): string | null {
  const t = normalizeArabic(raw);
  for (const r of RELATIONS) if (r.words.some((w) => t.includes(w))) return r.pronoun;
  return null;
}

/**
 * FOUR GATES, all of which must be true, checked here rather than trusted to a
 * prompt: (1) the primary booking is LOCKED, (2) the patient raised the need
 * themselves in this conversation, (3) it saves them a real second trip — same
 * branch, same day, and (4) it is never clinical: a slot in a specialty the
 * patient named, never a test, a screening or a follow-up no clinician ordered.
 */
function tryExpand(s: FaysalSession, raw: string, cls: Classification, now: Date, store: FaysalStore): Reply | null {
  if (s.scene !== "S7_confirmed" || !s.bookingRef) return null; // gate 1
  if (!cls.need) return null; // gate 2 — they must have named it
  const pronoun = expansionPronoun(raw) ?? "لك";
  const target = s.siteId;
  if (!target) return null;

  const clinicAr = planFor(cls.need).clinicAr;

  // Gate 3. The clinic the patient just named is not one this branch can book, so
  // «في نفس الفرع» would save nothing and «عند العظام» would be an
  // `availability_claim` (§8.1 #12). The EXPANSION move does not run; what runs
  // instead is the honest version of the same kindness — the clinical question is
  // refused, the limit is stated, and a callback at the SAME branch is offered so
  // the second trip may still be saved if the branch confirms.
  if (!canBook(target, cls.need, now, store)) {
    s.awaitingCallbackWindow = true;
    s.need = cls.need;
    s.scene = "S11_offhours";
    return reply(
      s,
      [
        faysal(s, `أكيد، وأحسن لكم تجون مرة وحدة بدل زيارتين.\n${S.CLINICAL_DIAGNOSIS_REFUSAL}`),
        faysal(
          s,
          `بس أصارحك: عيادة ${clinicAr} موجودة عندنا كمجموعة، وما أقدر أأكد لك جدولها في ${SITES[target].shortAr} من عندي — وما أبي أعطيك وقت وتطلعون على الفاضي.\n` +
            `أسجّل ${pronoun} طلب في نفس الفرع والاستقبال يتصل ويثبت الوقت — الصبح ولا بعد العصر؟`,
        ),
      ],
      ["الصبح", "بعد العصر"],
    );
  }

  const heldDate = s.heldSlot ? s.heldSlot.dateISO : riyadhDateISO(now);
  const sameDay = twoSlotsAcrossDays(target, cls.need, now, now, store).filter((x) => x.dateISO === heldDate);
  if (!sameDay.length) return null;

  s.scene = "S9_expand";
  s.offeredSlots = [sameDay[0]];

  // Gate 4 in the words themselves: he refuses to say anything about the symptom
  // and books the CLINIC. `clinical_diagnosis` is declined explicitly.
  return reply(
    s,
    [
      faysal(s, `أكيد، وأحسن لكم تجون مرة وحدة بدل زيارتين.\n${S.CLINICAL_DIAGNOSIS_REFUSAL}`),
      faysal(s, S.motionExpand(clinicAr, pronoun, clinicAr, sameDay[0].labelAr)),
    ],
    [sameDay[0].labelAr],
  );
}

// ── the turn ────────────────────────────────────────────────────────────────

export function runTurn(s: FaysalSession, raw: string, cls: Classification, now: Date, store: FaysalStore): Reply {
  const language = cls.language;
  s.turns += 1;

  // §3.3 — the only bilingual message in the product. Faysal does not pretend
  // fluency and does not machine-translate a clinical conversation.
  if (language === "other") {
    // With no branch in play the group's own unified line is the right number —
    // it is the one Rule DEMO-1(b) already published in this thread.
    const phone = branchPhoneFor(s) ?? REAL_CONTACTS.unified;
    // The frozen bilingual sentence, with a way back in. Without chips this was the
    // last hard dead end in the product: no question, nothing to tap, thread over.
    return reply(s, [faysal(s, S.languageThirdLanguage(phone))], ["العربية", "English"]);
  }

  // Rule DEMO-1(b), detail 4b: deferred to the first NON-RAIL turn if turn 1 was
  // a rail. It fires once, in the same position and the same system voice.
  const prefix: OutMsg[] = [];
  if (!s.demoLineSent) {
    prefix.push({ from: "system", text: compose(S.DEMO_1_B) });
    s.demoLineSent = true;
  }

  const out = dispatch(s, raw, cls, now, language, store);

  // THE URGENT LINE LEADS THE TURN. It is set in the route BEFORE the spend guard
  // (see `urgentPending`), so it is here whether or not the rest of the turn was
  // paid for. Booking stays open underneath it — that is the whole difference
  // between `urgent` and the emergency rail, which allows no booking at all.
  if (s.urgentPending) {
    s.urgentPending = false;
    const rest = out.messages;
    // §4.2 caps a normal turn at two. The safety line is never the one dropped; the
    // message that carries the open question is the one worth keeping beside it.
    out.messages = rest.length > 1 ? [faysal(s, S.SAFETY_URGENT_OFFER), rest[rest.length - 1]] : [faysal(s, S.SAFETY_URGENT_OFFER), ...rest];
  }

  // §9 turn 10's shape: the preference is noted OUT LOUD, on the turn that moves the
  // booking, as the last line of a message that is already doing something — never as
  // a paragraph of its own, and never twice. Saying it once and forgetting it is what
  // produced a confirmation block with no mention of the request the patient made.
  if (
    s.prefersFemaleDoctor &&
    !s.genderNoteSent &&
    language !== "en" &&
    (out.scene === "S5_slots" || out.scene === "S6_close" || out.scene === "S7_confirmed")
  ) {
    const last = [...out.messages].reverse().find((m) => m.from === "faysal");
    if (last) {
      last.text = `${last.text}\n${S.GENDER_NOTED}`;
      s.genderNoteSent = true;
    }
  }

  // ── THE SPINE (§7). Every reply carries the next step, or it ends the thread. ──
  //
  // A coordinator answers what you asked AND keeps the booking moving. Faysal
  // answered — honestly, in his own voice — and then stopped: «انت روبوت؟», «شفت
  // تقييمكم بجوجل», «وين نتيجة تحليلي», «ألغي الموعد» each produced a reply with no
  // question and nothing to tap, and the patient had to restart the booking
  // themselves. Twenty branches had that shape.
  //
  // The fix is one rule applied centrally rather than twenty edits: after the branch
  // has said its piece, if the thread is not at a terminal position and the reply
  // does not already ask something, the spine's open question is appended to the LAST
  // message (a line, not a new message, so the cadence is untouched) and the chips
  // for that position are attached. A branch that set its own chips keeps them.
  // THE SPINE SPEAKS THE THREAD'S LANGUAGE. A short reply carries no language of its
  // own — «hello again» is five Latin letters, under the §3.1 threshold, so
  // `detectLanguage` returns "other" and the tie-break is Arabic. That is right for
  // picking a language from nothing and wrong here: an English thread got an English
  // greeting echo with «أنت بأي حي؟» stapled underneath it, in one message. The
  // greeting branch already resolves this the same way; the spine now does too.
  const question = spineQuestion(s, language);
  const asks = out.messages.some((m) => m.from === "faysal" && /[؟?]/.test(m.text));
  if (question && !asks) {
    const last = [...out.messages].reverse().find((m) => m.from === "faysal");
    if (last) last.text = `${last.text}\n${question}`;
  }
  if (!out.chips.length) {
    const chips = chipsFor(s);
    if (chips.length) out.chips = chips.slice(0, 2);
  }

  // The Rule DEMO-1(b) system line is not one of Faysal's messages and never counted
  // toward the cadence; it is prepended here and the count is unchanged.
  if (prefix.length) out.messages = assertCadence([...prefix, ...out.messages]);
  return out;
}

function dispatch(
  s: FaysalSession,
  raw: string,
  cls: Classification,
  now: Date,
  language: "ar" | "en" | "other",
  store: FaysalStore,
): Reply {
  // Record what the patient told us. NOTHING here is inferred: a district only
  // becomes a district because the patient typed one, and a carrier only becomes a
  // carrier because it resolved against the engine's own payer table.
  if (cls.need) s.need = cls.need;
  if (cls.districtAr) s.districtAr = cls.districtAr;
  if (cls.payment) s.payment = cls.payment;
  if (cls.carrierRaw) s.carrierAr = cls.carrierRaw;
  if (cls.preferredWindowAr) s.preferredWindowAr = cls.preferredWindowAr;
  if (cls.preferredDayAr) s.preferredDayAr = cls.preferredDayAr;
  if (cls.kind !== "other") s.objections.unread = 0;
  if (cls.prefersFemale) {
    s.prefersFemaleDoctor = true;
    s.askedFemaleDoctor = true;
  }
  if (cls.prefersMale) s.askedFemaleDoctor = true;

  // A pending callback window outranks a fresh read: the patient was asked one
  // question and this is the answer to it.
  if (s.awaitingCallbackWindow) {
    const win = cls.preferredWindowAr ?? readWindow(raw);
    if (win) return confirmCallback(s, win, now, store);
  }

  // Picking a slot by its OWN WORDS — «السبت 11», «الخميس», «11:30». Only this
  // layer can see the offered labels, so the classifier deliberately does not try:
  // it reads ordinals, and this reads the times we actually named.
  // The decline exclusion used to sit here too, so «اليوم 4:30 بس أبي أتأكد إني ما
  // أنتظر» — a patient CHOOSING a slot while complaining — never reached the picker.
  if (s.offeredSlots.length && cls.kind !== "cancel") {
    if (namesBothOffers(raw, s.offeredSlots) && matchOfferedSlot(raw, s.offeredSlots) === null) {
      return reply(
        s,
        [faysal(s, S.whichOfTwo(s.offeredSlots[0].labelAr, s.offeredSlots[1].labelAr))],
        s.offeredSlots.slice(0, 2).map((x) => x.labelAr),
      );
    }
    const picked = matchOfferedSlot(raw, s.offeredSlots);
    if (picked) return pickSlot(s, picked, language, now, store);
    const origin = weekdayOrigin(raw, now);
    if (origin && s.siteId) return offerSlots(s, now, language, store, origin);
  }

  const forkChoice = readForkChoice(raw, s);
  if (forkChoice) {
    s.forkOffered = false;
    if (forkChoice === "near" && s.nearSiteId) s.siteId = s.nearSiteId;
    return offerSlots(s, now, language, store);
  }

  const expanded = tryExpand(s, raw, cls, now, store);
  if (expanded) return expanded;

  // A TYPED NAME AT S6_close IS A YES UNDER THAT NAME. Faysal just asked «أثبّته
  // باسم ضيف العرض التجريبي؟»; a patient who replies «محمد الشهري 0551234567» has
  // answered it. Scoped to exactly this scene with a live hold — a name anywhere
  // else is not a confirmation. The mobile is kept in the session envelope only,
  // never written anywhere; the confirmation block still carries the demo label.
  // Gate: the deterministic classifier must have had NOTHING to say. Any typed
  // yes, no, question, greeting or slot pick is handled by its own branch; only a
  // message the rules could not read is tried as a name.
  if (s.scene === "S6_close" && s.holdId && classifyDeterministic(raw, s.offeredSlots.length) === null) {
    // Positive signal required (a mobile, or «اسمي»/«انا»/«باسم»): an unread message
    // with neither is NOT a name — see the `default` branch, which re-asks instead.
    const named = nameShaped(raw);
    if (named) {
      s.patientNameAr = named.nameAr;
      return confirmHeld(s, now, store);
    }
  }

  switch (cls.kind) {
    case "identity":
      return reply(s, [faysal(s, language === "en" ? EN.identity : S.PERSONA_IDENTITY_HONEST)]);

    // §5.3 — own it FIRST, no explanation before the apology, then ONE concrete
    // action. Compensation is never self-authorised.
    case "complaint": {
      // A COMPLAINT WHILE SOMETHING IS HELD OR BOOKED MUST NOT RE-SEARCH. The old
      // code called `twoSlotsAcrossDays` unconditionally; the held slot is out of
      // inventory by then, so it vanished from the offer list and the patient's
      // 4:30 — which they had just argued for — was silently gone.
      const live = s.booked?.slotLabelAr || s.heldSlot?.labelAr;
      if (live) {
        const phone = branchPhoneFor(s) ?? REAL_CONTACTS.unified;
        const first = (s.objections.complaint ?? 0) === 0;
        s.objections.complaint = (s.objections.complaint ?? 0) + 1;
        const own = first ? S.complaintWaitOwnIt(planFor(needOf(s)).clinicAr, live) : S.COMPLAINT_OWN_IT_AGAIN;
        return reply(s, [faysal(s, `${own}\n${S.complaintRoute(phone)}`)], chipsFor(s));
      }
      const slots = s.siteId ? twoSlotsAcrossDays(s.siteId, needOf(s), now, now, store) : [];
      if (!slots.length) {
        s.scene = "S10_escalate";
        s.escalationOffered = true;
        return reply(s, [faysal(s, S.COMPLAINT_OWN_IT_NO_SLOT)], ["إي، حوّلني"]);
      }
      s.offeredSlots = slots.slice(0, 1);
      s.scene = "S5_slots";
      return reply(s, [faysal(s, S.complaintWaitOwnIt(planFor(needOf(s)).clinicAr, slots[0].labelAr))], [slots[0].labelAr]);
    }

    case "handoff":
      s.scene = "S10_escalate";
      s.escalationOffered = true;
      return reply(s, [faysal(s, S.COMPLAINT_ESCALATE_OFFER)], ["إي، حوّلني"]);

    // §5.4 — no rating number leaves this conversation, in either direction, and
    // the accreditation is offered as a difference between OUR branches, not as a
    // rebuttal. Rule RATE-1's reactive half.
    case "rating": {
      const accredited = SITES["shoaa-wurud"];
      return reply(s, [
        faysal(
          s,
          `${S.RATING_NO_ARGUMENT}\nوإذا الاعتماد يهمك: ${accredited.nameAr} حاصل على ${accredited.accreditationAr} — أذكره لك عشان تعرف الفرق بين فروعنا، مو عشان أبيعك عليه.`,
        ),
      ]);
    }

    case "competitor": {
      const b = site(s.siteId) ?? SITES["wattan-2"];
      const rec = recommend(needOf(s), { districtAr: s.districtAr, now });
      return reply(s, [
        faysal(
          s,
          S.competitorDecline(
            `${b.nameAr} — ${rec?.reasonAr ?? "الفرع اللي فيه العيادة اللي تحتاجها"}`,
            `${SITES["shoaa-wurud"].nameAr} حاصل على ${SITES["shoaa-wurud"].accreditationAr}`,
          ),
        ),
      ]);
    }

    // §8.1 #1/#2/#19 — refused in voice, then the one thing he CAN do.
    case "clinical_question":
      return reply(
        s,
        [faysal(s, `${S.CLINICAL_DIAGNOSIS_REFUSAL}\nأقرب طريق: أثبّت لك موعد عند ${planFor(needOf(s)).clinicAr}.`)],
        ["أقرب موعد"],
      );
    case "drug_question":
      return reply(s, [faysal(s, `${S.DRUG_NAMING_REFUSAL}\n${S.TREATMENT_ADVICE_REFUSAL}`)]);
    case "records": {
      const b = site(s.siteId) ?? SITES["wattan-1"];
      return reply(s, [faysal(s, `${S.RECORDS_OVER_CHAT_REFUSAL}\n${S.doctorContactRefusal(b.phoneAr)}`)]);
    }

    // §8.1 #13 — never promise a female doctor from memory, and never infer the
    // patient's gender from the service they asked for.
    case "female_doctor":
      s.askedFemaleDoctor = true;
      if (cls.prefersFemale) s.prefersFemaleDoctor = true;
      return genderReply(s, cls.prefersMale ? "male" : "female", now);

    case "doctor_quality":
      return reply(s, [faysal(s, S.motionObjectionDoctor("ما عندي تفاصيله، والاستقبال يعطيك إياها"))]);

    case "cancel": {
      if (s.bookingRef) domainCancel(s.bookingRef, now, store);
      s.bookingRef = null;
      s.holdId = null;
      s.heldSlot = null;
      // The cancelled booking must go with it, or the next turn offers «أغيّر الموعد»
      // for an appointment that no longer exists.
      s.booked = null;
      s.offeredSlots = [];
      s.scene = "S14_closed";
      return reply(s, [faysal(s, S.CANCEL_DONE)]);
    }

    case "need":
    case "district":
    case "prefer_nearest":
      return matchAndAsk(s, now, language, store, raw);

    case "payment":
      if (s.carrierAr) return insuranceReply(s, s.carrierAr, now, language, store);
      if (!s.siteId) return matchAndAsk(s, now, language, store, raw);
      return offerSlots(s, now, language, store);

    case "insurance_question": {
      const carrier = s.carrierAr ?? cls.carrierRaw;
      const target = insuranceSite(s, now);
      if (!carrier) {
        return reply(s, [faysal(s, S.insuranceNetworksListed(SITES[target].nameAr, "بوبا والتعاونية وميدغلف"))]);
      }
      s.carrierAr = carrier;
      return insuranceReply(s, carrier, now, language, store);
    }

    case "price_question":
      return priceReply(s, now, store);

    case "package_question":
      return packageReply(s);

    case "other_branch": {
      // The branch they are NOT currently being offered, named, with its hours state
      // honest. Never a claim that it is open — that is `openState`'s job.
      const current = s.siteId;
      const alt = (["wattan-2", "shoaa-wurud", "shoaa-rawdah"] as SiteId[]).find((id) => id !== current) ?? "wattan-2";
      s.siteId = alt;
      s.announcedSiteId = null;
      const next = nextOpening(alt, now);
      const b = SITES[alt];
      return reply(
        s,
        [faysal(s, next ? S.branchClosedUntil(b.shortAr, `${next.labelAr} ${next.timeAr}`) : S.fallbackHonestUnknown(`تتصل على ${b.phoneAr} والاستقبال يأكد لك الدوام`))],
        ["أقرب موعد", "فرع ثاني"],
      );
    }

    case "language_choice":
      // The patient chose a language. Arabic is what this engine speaks natively and
      // English is the parity path; either way the answer is to get back to the work.
      return reply(s, [faysal(s, language === "en" ? EN.discoverShort : S.MOTION_DISCOVER)], chipsFor(s));

    case "pre_visit":
      return reply(s, [faysal(s, S.whatToBring(s.payment, OPS.arrivalBufferMinutes))], chipsFor(s));

    case "unserved_district":
      // An answer, not an unknown. The short list is the point: it teaches the
      // patient that there are three, which is why «العليا» kept coming back.
      return reply(s, [faysal(s, S.districtNotServed(BOOKABLE_DISTRICTS.join(" و")))], BOOKABLE_DISTRICTS);

    case "labs_question":
      return reply(s, [faysal(s, S.LABS_NOT_BOOKABLE)], ["سجّل لي طلب", "كشف عام"]);

    case "callback_request": {
      // «سجّل لي طلب» is now a real request, not a chip that apologises. It needs the
      // window the branch will call in, which is the one question left to ask.
      s.awaitingCallbackWindow = true;
      s.siteId = s.siteId ?? recommend(needOf(s), { districtAr: s.districtAr, now })?.siteId ?? "wattan-2";
      s.scene = "S11_offhours";
      return reply(s, [faysal(s, "أبشر، أسجّل لك الطلب وأكتب فيه اللي تحتاجه، والفرع يتصل عليك ويثبّت الوقت.\nالصبح ولا بعد العصر؟")], ["الصبح", "بعد العصر"]);
    }

    case "location_question": {
      const b = site(s.siteId) ?? site(recommend(needOf(s), { districtAr: s.districtAr, now })?.siteId ?? null) ?? SITES["wattan-2"];
      return reply(s, [faysal(s, S.branchLocation(b.shortAr, b.addressAr, b.phoneAr))], chipsFor(s));
    }

    case "clinic_list": {
      // Only what the demo can actually book, read off the plans rather than typed
      // out here — a hand-written list drifts from the roster the moment one changes.
      const bookable = [...new Set(Object.values(NEED_PLANS).map((plan) => plan.clinicAr))].slice(0, 5);
      return reply(s, [faysal(s, S.clinicList(bookable.join("، ")))], bookable.slice(0, 2));
    }

    case "hours_question": {
      // «فرع الشفا فاتح؟» was answered about Ar Rawabi, because the target was read
      // from the session and never from the sentence. The branch they NAMED wins.
      const named = siteInDistrict(raw);
      const target = named ?? s.siteId ?? recommend(needOf(s), { districtAr: s.districtAr, now })?.siteId ?? null;
      if (!target) return unsupportedSpecialty(s, raw);
      const state = openState(target, now);
      const b = SITES[target];
      if (state.state === "UNVERIFIED") {
        // G5 — never asserts open OR closed. Offers a working alternative AND the
        // branch line, right now, in the same message.
        const altId = recommend(needOf(s), { now })?.siteId ?? "wattan-2";
        const alt = SITES[altId];
        s.nearSiteId = target;
        return reply(s, [faysal(s, S.greetingBranchUnverified(b.nameAr, alt.nameAr, b.phoneAr))], [alt.districtAr, b.districtAr]);
      }
      s.siteId = target;
      // «يفتح اليوم 9:00 ص» went out at 11:40 PM, and «اليوم» was hard-coded into the
      // sentence. What a patient asking «الحين فاتحين؟» needs is two facts: whether
      // it is open RIGHT NOW, and when it next opens if it is not.
      const next = nextOpening(target, now);
      if (state.state === "OPEN") return reply(s, [faysal(s, S.branchOpenNow(b.shortAr))], ["أقرب موعد", "وين الفرع"]);
      if (!next) return reply(s, [faysal(s, S.fallbackHonestUnknown(`تتصل على ${b.phoneAr} والاستقبال يأكد لك الدوام`))], ["فرع ثاني"]);
      return reply(s, [faysal(s, S.branchClosedUntil(b.shortAr, `${next.labelAr} ${next.timeAr}`))], ["أقرب موعد", "فرع ثاني"]);
    }

    case "slots_question":
      if (!s.siteId) return matchAndAsk(s, now, language, store, raw);
      return offerSlots(s, now, language, store);

    case "pick_slot":
      return pickSlot(s, cls.slotPick ?? 1, language, now, store);

    case "confirm": {
      // A yes AFTER the booking is confirmed is agreement with what he just said,
      // not an instruction to book again. It was re-opening the slot list and
      // placing a second hold on the same thread.
      // The expansion gate (§6.6) REQUIRES a confirmed booking, so putting the
      // booked-already guard first made S9 unreachable by any typed yes: «إي» after
      // «أثبّته؟» recited the first appointment and the second one evaporated.
      if (s.scene === "S9_expand" && s.offeredSlots.length) return pickSlot(s, 1, language, now, store);
      if (s.booked && !s.holdId) return bookingStands(s);
      if (s.scene === "S6_close" && s.holdId) {
        const named = nameInConfirm(raw); // «ثبته باسم محمد الشهري»
        if (named) s.patientNameAr = named.nameAr;
        return confirmHeld(s, now, store);
      }
      if (s.awaitingCallbackWindow) {
        const win = cls.preferredWindowAr ?? readWindow(raw);
        if (win) return confirmCallback(s, win, now, store);
        return reply(s, [faysal(s, "قل لي الوقت اللي يناسبك — الصبح ولا بعد العصر.")], ["الصبح", "بعد العصر"]);
      }
      if (s.escalationOffered) {
        // §8.1 #22 — the handoff is narrated only after it has actually fired. In
        // this build "firing" is a real callback_request row, and the message says
        // exactly that and nothing more.
        s.escalationOffered = false;
        s.siteId = s.siteId ?? "wattan-1";
        return confirmCallback(s, s.preferredWindowAr ?? "أقرب وقت", now, store);
      }
      if (s.scene === "S5_slots" && s.offeredSlots.length) return pickSlot(s, 1, language, now, store);
      if (s.siteId) return offerSlots(s, now, language, store);
      // «تمام» AND «اوك» ARE NOT A NEED. Both match the confirm shape, and with no
      // site this fell through to `matchAndAsk`, which asked `recommend(null)` and got
      // general practice — so two filler words put a patient one tap from a booking in
      // a clinic they never mentioned, with the discovery step skipped entirely.
      if (!s.need) return reply(s, [faysal(s, S.MOTION_DISCOVER)], chipsFor(s));
      return matchAndAsk(s, now, language, store, raw);
    }

    case "decline":
      // §6.4 — one objection handled once. A second decline and he stops selling
      // and holds the door open.
      s.objections.decline = (s.objections.decline ?? 0) + 1;
      if (s.objections.decline >= 2) {
        s.scene = "S14_closed";
        return reply(s, [faysal(s, S.MOTION_OBJECTION_STOP)]);
      }
      return reply(s, [faysal(s, S.motionObjectionDelay(s.offeredSlots[0]?.labelAr ?? "أقرب موعد"))], ["إي", "لا"]);

    case "objection_distance": {
      s.objections.distance = (s.objections.distance ?? 0) + 1;
      if (s.objections.distance >= 2) return reply(s, [faysal(s, S.MOTION_OBJECTION_STOP)]);
      const near = site(s.nearSiteId) ?? site(s.siteId);
      const best = site(s.siteId) ?? SITES["wattan-2"];
      if (!near) return offerSlots(s, now, language, store);
      return reply(
        s,
        [faysal(s, S.motionObjectionDistance(near.shortAr, planFor(needOf(s)).nounAr, best.shortAr))],
        [near.districtAr, best.districtAr],
      );
    }

    case "objection_price": {
      s.objections.price = (s.objections.price ?? 0) + 1;
      if (s.objections.price >= 2) return reply(s, [faysal(s, S.MOTION_OBJECTION_STOP)]);
      // §5.2: "the price is the price; he is not embarrassed by it and he does not
      // defend it." One reframe, on a SPECIFIC, then stop. Never a discount — that
      // is `invented_price_or_discount` and it is not his to give.
      const b = site(s.siteId) ?? SITES["wattan-2"];
      return reply(
        s,
        [faysal(s, S.motionObjectionPrice(`أثبّت لك الكشف أول، والدكتور يحدد التفاصيل قبل ما تدفع أي شي في ${b.shortAr}`))],
        ["إي", "لا"],
      );
    }

    // AFTER A BOOKING EXISTS. Three ordinary sentences, each of which used to
    // produce a second hold, a refusal, or the honest-unknown line.
    case "booking_status":
    case "keep_booking":
      return bookingStands(s);

    case "reschedule":
      return rescheduleReply(s, raw, now, language, store);

    case "objection_delay":
      return reply(s, [faysal(s, S.motionObjectionDelay(s.offeredSlots[0]?.labelAr ?? "أقرب موعد"))], ["إي", "لا"]);

    case "unsupported_specialty":
      return unsupportedSpecialty(s, raw);

    case "close": {
      // A goodbye at S6_close with a live hold is NOT a goodbye — the hold step owns
      // that turn (a bare courtesy there re-asks; a courtesy after a yes confirms).
      if (s.scene === "S6_close" && s.holdId) {
        return reply(s, [faysal(s, language === "en" ? EN.holdReask : S.HOLD_REASK)], chipsFor(s));
      }
      s.scene = "S14_closed";
      if (language === "en") return reply(s, [faysal(s, EN.closing)]);
      if (s.booked?.kind === "slot") {
        // §4.4 — one religious courtesy per conversation, and a farewell after a
        // booking is exactly where a Riyadh coordinator spends it.
        const text = s.blessingUsed
          ? S.closeBookedPlain(s.booked.slotLabelAr, s.booked.branchShortAr)
          : S.closeBooked(s.booked.slotLabelAr, s.booked.branchShortAr);
        s.blessingUsed = true;
        return reply(s, [faysal(s, text)]);
      }
      if (s.booked?.kind === "callback") return reply(s, [faysal(s, S.CLOSE_BOOKED_CALLBACK)]);
      return reply(s, [faysal(s, S.SCENE_CLOSE)]);
    }

    case "greeting_only":
      if (!s.greeted) return openConversation(s, now, language);
      // ALREADY GREETED. A coordinator who has said hello answers «مساء الخير» with
      // «مساء النور», not with a second introduction. The first version replayed
      // GREETING_NEW_PATIENT here, so a patient who opened with a courtesy after
      // Faysal's own greeting got introduced to Faysal twice in a row — driven on
      // a real phone at 02:00. Mirror the greeting, then nudge back to whatever
      // was open, and re-offer the same chips so the thread does not lose its place.
      {
        // A bare greeting carries no language of its own («hello again» is five Latin
        // letters — under the §3.1 threshold), so the echo speaks the language of the
        // thread's last substantive message, not the tie-break.
        const lang = language === "en" ? "en" : threadLanguage(s, raw);
        // `spineQuestion`, not `openQuestionFor`: the latter is null at S2_discover, so
        // the echo ended without a «؟» and the spine appended its own question below —
        // computed from THIS turn's language, which for a bare «hello» is Arabic by
        // §3.1's tie-break. An English thread got an English greeting with «أنت بأي
        // حي؟» stapled underneath it, in one message. Asking here, in `lang`, means
        // the reply already carries a question and the spine leaves it alone.
        return reply(s, [faysal(s, S.greetingEcho(raw, spineQuestion(s, lang), lang))], chipsFor(s));
      }

    default: {
      // A BARE «الصبح» OR «بكرة» IS THE ANSWER TO «أي وقت أثبّت لك؟». `extractFacts`
      // writes the preference into the session and the classifier then returns
      // `other`, so he recorded what they wanted and told them he could not confirm
      // it — with his own question still on the screen above.
      if ((cls.preferredWindowAr || cls.preferredDayAr) && s.siteId) {
        return offerSlots(s, now, language, store);
      }
      // A live hold and a message the rules could not read: the honest move is to say
      // so and ask the open question AGAIN with its chips — never to guess a yes, and
      // never to book the message as a name (the first version did exactly that).
      if (s.scene === "S6_close" && s.holdId) {
        return reply(s, [faysal(s, language === "en" ? EN.holdReask : S.HOLD_REASK)], chipsFor(s));
      }
      // §8.2 — the universal fallback. `{concrete_alternative}` is always a branch
      // phone, a booking he CAN make, or an offered handoff. Never "check the
      // website", never "try again later", never nothing.
      const b = site(s.siteId);
      // ONE honest «I don't know» is character. The SAME paragraph twice in a row is
      // the moment he stops being a person — and «تحاليل وأشعة / أشعة / تحليل دم» got
      // it three times running. A second miss changes the move.
      s.objections.unread = (s.objections.unread ?? 0) + 1;
      if (s.objections.unread >= 2 && language !== "en") {
        s.objections.unread = 0;
        return reply(s, [faysal(s, S.secondMiss(branchPhoneFor(s) ?? REAL_CONTACTS.unified))], ["سجّل لي طلب", "أحوّلني لمسؤول"]);
      }
      const alternative = b
        ? `أثبّت لك موعد في ${b.shortAr}، أو تتصل على ${b.phoneAr}`
        : `تقول لي وش تحتاج وبأي حي، وأرتّب لك موعد — أو تتصل على ${REAL_CONTACTS.unified}`;
      return reply(s, [faysal(s, language === "en" ? EN.unknown(alternative) : S.fallbackHonestUnknown(alternative))]);
    }
  }
}

// ── small readers ───────────────────────────────────────────────────────────

const WEEKDAY_WORDS = ["الاحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس", "الجمعه", "السبت"];

/**
 * Does this message name one of the two slots we just offered? Matched on the DAY
 * the label carries plus, when the patient gave one, the hour — so «السبت» picks
 * the Saturday slot and «السبت 11» still picks it when both offers are Saturdays.
 * A day we did not offer matches nothing, and the turn falls through rather than
 * booking a time we never said.
 */
/**
 * Which of the two offered slots did the patient name?
 *
 * THE FIRST NUMBER IN THE MESSAGE IS NOT THE ANSWER. «ليش 5:15؟ انت قلت 4:30!! ثبت
 * 4:30» held 5:15 — the time the patient was complaining about — and «no no, I said
 * the 9:15 one, not 11:30» held 11:30. Both were driven; both are the same bug: a
 * single `exec` takes the leftmost match, and in a correction the leftmost number is
 * the one being rejected. So every time in the message is collected, the ones that
 * sit right after a negation or a question word are dropped, and a pick verb — if
 * there is one — decides which of the survivors is the choice.
 *
 * When two survive and both map to offers, NOTHING is held: he asks which. One
 * re-ask costs a turn; a wrong hold costs the appointment.
 */
const PICK_STEM_RE = /(?:^|\s)(?:ثبت|اثبت|ثبته|احجز|احجزه|ابي|ابغي|خله|خليه|اعطني|اعطيني|book|take|the|that|please)(?![ء-ي])/g;
// A time that follows one of these is being QUESTIONED or REJECTED, not chosen:
// «ليش 5:15؟», «مو 4:30», «is the 9:15 tomorrow?», «هل 9:15 بكرة؟».
const REJECT_HEAD_RE = /(?:^|\s)(?:مو|مب|موب|لا|ليش|مش|هل|وش|ايش|not|no|why|is|are|was)(?![ء-يa-z])/;
function matchOfferedSlot(raw: string, offered: SlotView[]): number | null {
  const t = normalizeArabic(raw);

  // Where each weekday word sits, so a time can be paired with the day IN FRONT OF
  // IT rather than with the first weekday in the message. «اليوم الأحد 4:30 ولا بكرة
  // الاثنين 9:15؟» names both offers; taking the first weekday made 9:15 unmatchable
  // and the message read as an unambiguous pick of 4:30.
  const days: { day: string; at: number }[] = [];
  for (const d of WEEKDAY_WORDS) {
    let from = 0;
    for (;;) {
      const at = t.indexOf(d, from);
      if (at < 0) break;
      days.push({ day: d, at });
      from = at + d.length;
    }
  }
  days.sort((a, b) => a.at - b.at);
  const dayBefore = (at: number): string | null => {
    let best: string | null = null;
    for (const d of days) if (d.at < at) best = d.day;
    return best;
  };

  // Every clock time in the message, with where it sits.
  const times: { hour: number; at: number }[] = [];
  for (const m of t.matchAll(/(?:^|\D)(\d{1,2})(?::(\d{2}))?(?=\D|$)/g)) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12) times.push({ hour: h, at: (m.index ?? 0) + m[0].indexOf(m[1]) });
  }
  const indexOf = (h: number, dayHint: string | null): number | null => {
    const byHour: number[] = [];
    for (let i = 0; i < offered.length; i++) {
      const label = normalizeArabic(offered[i].labelAr);
      const labelHour = /(\d{1,2}):(\d{2})/.exec(label);
      if (labelHour && Number(labelHour[1]) === h) byHour.push(i + 1);
    }
    if (byHour.length <= 1) return byHour[0] ?? null;
    // The hour alone is ambiguous — the day decides.
    const withDay = byHour.filter((i) => dayHint && normalizeArabic(offered[i - 1].labelAr).includes(dayHint));
    return withDay.length === 1 ? withDay[0] : null;
  };
  const indexOfHour = (h: number): number | null => indexOf(h, days.length === 1 ? days[0].day : null);

  // A time within three tokens after «مو» / «لا» / «ليش» / «not» is the one being
  // REJECTED, not chosen.
  const kept = times.filter(({ at }) => {
    const before = t.slice(Math.max(0, at - 24), at);
    return !(REJECT_HEAD_RE.test(before) && before.split(/\s+/).filter(Boolean).length <= 3);
  });
  const resolve = (x: { hour: number; at: number }) => indexOf(x.hour, dayBefore(x.at) ?? (days.length === 1 ? days[0].day : null));
  const candidates = (kept.length ? kept : times).filter((x) => resolve(x) !== null);

  if (candidates.length > 1) {
    // A pick verb resolves it: the time that comes AFTER the last «ثبت / that one».
    const stems = [...t.matchAll(PICK_STEM_RE)].map((m) => (m.index ?? 0));
    const lastStem = stems.length ? stems[stems.length - 1] : -1;
    const after = candidates.filter((x) => x.at > lastStem);
    if (lastStem >= 0 && after.length === 1) return resolve(after[0]);
    const distinct = new Set(candidates.map(resolve));
    if (distinct.size > 1) return null; // two real choices, no verb — ask, do not guess
  }
  if (candidates.length >= 1) return resolve(candidates[0]);

  // No usable time: a single named weekday picks its offer; two named days are two
  // choices, and he asks rather than guessing.
  const namedDays = [...new Set(days.map((d) => d.day))].filter((d) =>
    offered.some((o) => normalizeArabic(o.labelAr).includes(d)),
  );
  if (namedDays.length !== 1) return null;
  for (let i = 0; i < offered.length; i++) {
    if (normalizeArabic(offered[i].labelAr).includes(namedDays[0])) return i + 1;
  }
  return null;
}

/** Two offered times named in one message with no pick verb — «4:30 ولا 5:15؟». */
function namesBothOffers(raw: string, offered: SlotView[]): boolean {
  if (offered.length < 2) return false;
  const t = normalizeArabic(raw);
  const hours = new Set<number>();
  for (const m of t.matchAll(/(?:^|\D)(\d{1,2})(?::(\d{2}))?(?=\D|$)/g)) hours.add(Number(m[1]));
  const byHour = offered.every((o) => {
    const h = /(\d{1,2}):(\d{2})/.exec(normalizeArabic(o.labelAr));
    return h ? hours.has(Number(h[1])) : false;
  });
  if (byHour) return true;
  return offered.every((o) => WEEKDAY_WORDS.some((d) => t.includes(d) && normalizeArabic(o.labelAr).includes(d)));
}

/**
 * The patient named a weekday we did not offer — «السبت» against two Thursdays.
 * That is not an unknown; it is a preference, and the honest answer is to look on
 * that day rather than run `fallback.honest_unknown` at someone who told us
 * exactly what they wanted.
 */
function weekdayOrigin(raw: string, now: Date): Date | null {
  const t = normalizeArabic(raw);
  const idx = WEEKDAY_WORDS.findIndex((d) => t.includes(d));
  if (idx < 0) return null;
  for (let i = 0; i <= 7; i++) {
    const probe = new Date(now.getTime() + i * 24 * 3600_000);
    if (riyadhParts(probe).weekday === idx) return probe;
  }
  return null;
}

function readWindow(raw: string): string | null {
  const t = normalizeArabic(raw);
  if (/(الصبح|الصباح|صباحا|بكره الصبح)/.test(t)) return "الصبح";
  if (/(بعد العصر|العصر|بعد الظهر|المسا|المساء|بالليل)/.test(t)) return "بعد العصر";
  return null;
}

// ── insurance and price ─────────────────────────────────────────────────────

/**
 * The branch an insurance answer is ABOUT must be one the patient would recognise.
 * With an unsupported specialty there is no route at all, so `recommend` fell back to
 * the default and answered a 68-year-old who had just written «أنا في الورود» about
 * Ar Rawabi. Their own district first, the recommendation second, the default last.
 */
/**
 * THE HONEST ANSWER TO A GENDERED REQUEST. Rule DOC-1 makes gender a filter, and
 * the product had no way to apply it: every «أبغى دكتورة» got the same
 * promise-nothing paragraph and the booking went to whoever the slot generator
 * produced. At Ar Rawabi's dermatology clinic — two women, no man, the demo's
 * busiest path — a patient asking for a male doctor was quietly booked with a woman.
 *
 * Three truths, no fourth: here, elsewhere, or nowhere. The third one is an apology,
 * not a workaround, and it is a better demo than a booking made under a false
 * expectation.
 */
function genderReply(s: FaysalSession, wanted: "female" | "male", now: Date): Reply {
  const whoAr = wanted === "female" ? "دكتورة" : "دكتور رجّال";
  const target = s.siteId ?? recommend(needOf(s), { districtAr: s.districtAr, now })?.siteId ?? null;
  if (!target || !s.need) {
    // Nothing to check against yet — ask what is missing rather than guess a clinic.
    return reply(s, [faysal(s, `${S.GENDER_CARE_HONESTY}`)], chipsFor(s));
  }
  const clinicAr = planFor(needOf(s)).clinicAr;
  // He has just answered the gender question with the real roster. The generic
  // «طلبك مع دكتورة مسجّل» note that rides on the booking turn would repeat it in
  // vaguer words, so it is spent here.
  s.genderNoteSent = true;
  const found = genderAvailability(target, needOf(s), wanted);
  if (found.hereAr) {
    return reply(s, [faysal(s, S.genderHere(whoAr, clinicAr, found.hereAr))], chipsFor(s));
  }
  if (found.elsewhereAr && found.elsewhereId) {
    s.nearSiteId = target;
    return reply(
      s,
      [faysal(s, S.genderElsewhere(whoAr, clinicAr, SITES[target].shortAr, found.elsewhereAr))],
      [found.elsewhereAr, SITES[target].shortAr],
    );
  }
  return reply(
    s,
    [faysal(s, S.genderNowhere(whoAr, clinicAr, branchPhoneFor(s) ?? REAL_CONTACTS.unified))],
    ["سجّل لي طلب", "أقرب موعد"],
  );
}

function insuranceSite(s: FaysalSession, now: Date): SiteId {
  return (
    s.siteId ??
    (s.districtAr ? siteInDistrict(s.districtAr) : null) ??
    recommend(needOf(s), { districtAr: s.districtAr, now })?.siteId ??
    "wattan-2"
  );
}

function insuranceReply(
  s: FaysalSession,
  carrier: string,
  now: Date,
  language: "ar" | "en" | "other",
  store: FaysalStore,
): Reply {
  const target = insuranceSite(s, now);
  // Rule INS-1 — the ENGINE owns the sentence. This layer never composes one, and
  // «مغطّى» is a word it cannot reach.
  const answer = insurance(carrier, target);
  s.scene = "S4_insurance";

  const aesthetic = s.need === "laser" || s.need === "orthodontics";
  const body =
    language === "en"
      ? EN.insurance(carrier)
      : aesthetic
        ? `${answer.sentenceAr}\n${S.INSURANCE_AESTHETIC_NOTE}`
        : answer.sentenceAr;

  // Split-recap (§4.2, and §9's turn 5): the insurance note is its own atomic
  // message and the ONE question follows it.
  //
  // WHEN THE PATIENT ALREADY TOLD US EVERYTHING, THE NOTE IS A NOTE — NOT THE TURN.
  // «أبغى موعد جلدية بكرة الصبح في الروابي، عندي بوبا» ended on the insurance
  // paragraph and no appointment, so the next thing the patient read was silence
  // where the slots should have been. The note goes first, the slots follow it: the
  // §4.2 split-recap shape, which is exactly what this case is.
  // Routing has not run yet when the patient names their clinic, their district and
  // their insurer in ONE message — the payment branch reaches here first. Adopt the
  // recommendation only when there is no geography fork to put to them; a fork is a
  // question, and a question is not something to answer on the patient's behalf.
  if (!s.siteId && s.need) {
    const rec = recommend(needOf(s), { districtAr: s.districtAr, now });
    if (rec && !(rec.nearestSiteId && rec.nearestSiteId !== rec.siteId)) s.siteId = rec.siteId;
  }
  if (s.siteId && s.need && !s.forkOffered) {
    const slots = offerSlots(s, now, language, store);
    return { ...slots, messages: assertCadence([faysal(s, body), ...slots.messages]) };
  }
  const msgs = [faysal(s, body)];
  if (s.forkOffered) {
    msgs.push(faysal(s, "أي طريق أريح لك؟"));
    return reply(s, msgs, [SITES[s.nearSiteId ?? target].districtAr, SITES[target].districtAr]);
  }
  if (!s.offeredSlots.length && s.siteId) {
    const follow = offerSlots(s, now, language, store);
    return reply(s, [...msgs, ...follow.messages], follow.chips);
  }
  return reply(s, msgs);
}

function priceReply(s: FaysalSession, now: Date, store: FaysalStore): Reply {
  const target = s.siteId ?? recommend(needOf(s), { districtAr: s.districtAr, now })?.siteId ?? "wattan-2";
  const plan = planFor(needOf(s));
  s.scene = "S4_insurance";
  s.quotedPrice = true;

  const quotes = [plan.serviceId, ...plan.extraPriceIds]
    .filter((id): id is string => !!id)
    .map((id) => price(id, target))
    .filter((q): q is NonNullable<typeof q> => !!q);

  // §5.2 / Rule PRICE-1: nothing is loaded → the honest-unknown price line, and
  // NEVER an invented range. §9.4 leaves lab, radiology, ER and day-case unpriced
  // on purpose, and the engine's `quote()` throws rather than guessing.
  if (!quotes.length) {
    const b = SITES[target];
    const rec = recommend(needOf(s), { districtAr: s.districtAr, now });
    return reply(
      s,
      [faysal(s, S.priceNotLoaded(`${b.nameAr} هو الفرع اللي يناسب حالتك — ${rec?.reasonAr ?? "العيادة اللي تحتاجها عندهم"}`))],
      ["أقرب موعد"],
    );
  }

  const parts = quotes.map((q, i) => `${i ? "و" : ""}${serviceNameAr(q.serviceId)} بـ ${q.amount} ر.س`);
  const tail = s.need === "laser" ? "\nوالمناطق تختلف، والدكتورة تحدد المنطقة وعدد الجلسات بعد تقييم البشرة." : "";

  // The PRICE-1 label is appended by the renderer, not by this line — the same law
  // as Rule PRICE-2's single calculator.
  const priceMsg = faysal(s, `${parts.join("، ")}.${tail}`);

  // Reframe EXACTLY ONCE, on a specific, then stop and let the price stand.
  const b = SITES[target];
  const reframe = canBook(target, needOf(s), now, store)
    ? faysal(s, `وإذا مهم عندك تخلّصه بأسرع وقت، أشوف لك أقرب موعد في ${b.shortAr}؟`)
    : faysal(s, S.fallbackHonestUnknown(`تتصل على ${b.phoneAr} والاستقبال يعطيك أقرب وقت`));
  return reply(s, [priceMsg, reframe], ["أقرب موعد"]);
}

function packageReply(s: FaysalSession): Reply {
  const plan = planFor(needOf(s));
  const anchor = plan.extraPriceIds[0] ?? plan.serviceId;
  const pair = anchor ? packageFor(anchor) : null;
  if (!pair) return reply(s, [faysal(s, S.priceNotLoaded("الاستقبال يعطيك الباقات المتاحة حسب المنطقة"))]);
  s.quotedPrice = true;
  return reply(
    s,
    [
      faysal(
        s,
        `${pair.sessionAr} بـ ${pair.sessionAmount} ر.س، و${pair.packageAr} بـ ${pair.packageAmount} ر.س — يعني ${pair.sessions} جلسات بسعر ${pair.paidSessions}.`,
        { quotedPackage: true, packageTermsAr: pair.termsAr },
      ),
    ],
    ["أقرب موعد"],
  );
}
