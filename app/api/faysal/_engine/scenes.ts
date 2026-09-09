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

import {
  OPS,
  REAL_CONTACTS,
  SITES,
  callback as domainCallback,
  cancel as domainCancel,
  canBook,
  clinicsAtSite,
  confirm as domainConfirm,
  hold as domainHold,
  insurance,
  normalizeArabic,
  openState,
  packageFor,
  planFor,
  price,
  recommend,
  riyadhDateISO,
  riyadhParts,
  serviceNameAr,
  twoSlotsAcrossDays,
  type Appointment,
  type DemoNeed,
  type FaysalStore,
  type SiteId,
  type SiteView,
  type SlotView,
} from "../_domain";
import { EN } from "./english";
import { compose } from "./render";
import { classifyDeterministic, nameShaped } from "./intent";
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

function assertCadence(messages: OutMsg[]): OutMsg[] {
  const mine = messages.filter((m) => m.from === "faysal");
  if (mine.length > 3) {
    throw new Error(`[faysal] cadence: ${mine.length} messages in one turn; the cap is 3 (split-recap) and the norm is 2.`);
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
function openQuestionFor(s: FaysalSession): string | null {
  if (s.scene === "S6_close" && s.holdId) return "أثبّت لك الموعد اللي ماسكه لك؟";
  if (s.scene === "S5_slots" && s.offeredSlots.length) return "أي وقت أثبّت لك؟";
  if (s.awaitingCallbackWindow) return "الصبح ولا بعد العصر؟";
  if (s.scene === "S3_route" || s.scene === "S4_insurance") return "الزيارة تأمين ولا كاش؟";
  return null;
}
/** The chips that were on screen for the open question, re-offered unchanged. */
function chipsFor(s: FaysalSession): string[] {
  if (s.scene === "S6_close" && s.holdId) return ["إي، ثبّته", "لا، غيّره"];
  if (s.scene === "S5_slots" && s.offeredSlots.length) return s.offeredSlots.slice(0, 2).map((x) => x.labelAr);
  if (s.awaitingCallbackWindow) return ["الصبح", "بعد العصر"];
  if (s.scene === "S3_route" || s.scene === "S4_insurance") return ["تأمين", "كاش"];
  return [];
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

  const args = {
    nearBranch: near.nameAr,
    nearCapability: capability,
    procedure: plan.nounAr,
    bestBranch: best.nameAr,
    bestShort: best.shortAr,
    bestReason: reasonAr,
    optionNear,
    optionBest,
  };
  const text = contested ? S.motionMatchForkUnverified(args) : S.motionMatchFork(args);

  return reply(s, [faysal(s, text)], [near.districtAr, best.districtAr]);
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

  // Invariant H4 + Rule C4-1: an unbookable or contested site never produces a
  // time. It produces a callback request and a phone number, out loud.
  const slots = twoSlotsAcrossDays(target, needOf(s), from, now, store);
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

  if (slots.length === 1) {
    return reply(s, [faysal(s, S.motionCloseSingle(slots[0].labelAr, view.shortAr))], [slots[0].labelAr]);
  }

  const text =
    language === "en"
      ? EN.close(view.nameEn, plan.clinicAr, slots[0].labelAr, slots[1].labelAr)
      : S.motionClose(view.nameAr, plan.clinicAr, slots[0].labelAr, slots[1].labelAr);

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

function renderAppointment(s: FaysalSession, appt: Appointment): Reply {
  const branch = SITES[appt.siteId];
  s.bookingRef = appt.ref;
  s.holdId = null;
  s.scene = "S7_confirmed";

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
        faysal(s, S.PRE_VISIT_CALLBACK),
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
      faysal(s, S.motionPreVisit(OPS.arrivalBufferMinutes)),
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

function askDistrict(s: FaysalSession): Reply {
  s.scene = "S2_discover";
  return reply(s, [faysal(s, s.need ? S.MOTION_DISCOVER_SHORT : S.MOTION_DISCOVER)], ["تأمين", "كاش"]);
}

function matchAndAsk(s: FaysalSession, now: Date, language: "ar" | "en" | "other", store: FaysalStore): Reply {
  const rec = recommend(needOf(s), { districtAr: s.districtAr, now });
  if (!rec) return unsupportedSpecialty(s);

  if (rec.nearestSiteId && rec.nearestSiteId !== rec.siteId) {
    return forkReply(s, rec.siteId, rec.nearestSiteId, rec.reasonAr, now);
  }

  s.siteId = rec.siteId;
  s.scene = "S3_route";
  const branch = SITES[rec.siteId];
  const matchText = language === "en" ? EN.match(branch.nameEn, rec.reasonEn) : S.motionMatch(branch.nameAr, rec.reasonAr);

  // Split-recap (§4.2): the match is one atomic message, the ask is the next. Two
  // messages in one turn — within cadence, and the ask carries the only «؟».
  if (!s.districtAr || !s.payment) {
    const ask = language === "en" ? EN.discoverShort : S.MOTION_DISCOVER_SHORT;
    return reply(s, [faysal(s, matchText), faysal(s, ask)], ["تأمين", "كاش"]);
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
function unsupportedSpecialty(s: FaysalSession): Reply {
  return reply(s, [
    faysal(
      s,
      S.fallbackHonestUnknown(
        `تتصل على ${REAL_CONTACTS.unified} والاستقبال يقول لك أي فرع فيه العيادة، وأنا موجود هنا لو تبي أرتّب لك شي ثاني`,
      ),
    ),
  ]);
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
    return reply(s, [faysal(s, S.languageThirdLanguage(phone))]);
  }

  // Rule DEMO-1(b), detail 4b: deferred to the first NON-RAIL turn if turn 1 was
  // a rail. It fires once, in the same position and the same system voice.
  const prefix: OutMsg[] = [];
  if (!s.demoLineSent) {
    prefix.push({ from: "system", text: compose(S.DEMO_1_B) });
    s.demoLineSent = true;
  }

  const out = dispatch(s, raw, cls, now, language, store);
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

  // A pending callback window outranks a fresh read: the patient was asked one
  // question and this is the answer to it.
  if (s.awaitingCallbackWindow) {
    const win = cls.preferredWindowAr ?? readWindow(raw);
    if (win) return confirmCallback(s, win, now, store);
  }

  // Picking a slot by its OWN WORDS — «السبت 11», «الخميس», «11:30». Only this
  // layer can see the offered labels, so the classifier deliberately does not try:
  // it reads ordinals, and this reads the times we actually named.
  if (s.offeredSlots.length && cls.kind !== "cancel" && cls.kind !== "decline") {
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
    const named = nameShaped(normalizeArabic(raw));
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
      return reply(s, [faysal(s, S.GENDER_CARE_HONESTY)]);

    case "doctor_quality":
      return reply(s, [faysal(s, S.motionObjectionDoctor("ما عندي تفاصيله، والاستقبال يعطيك إياها"))]);

    case "cancel": {
      if (s.bookingRef) domainCancel(s.bookingRef, now, store);
      s.bookingRef = null;
      s.holdId = null;
      s.heldSlot = null;
      s.scene = "S14_closed";
      return reply(s, [faysal(s, S.CANCEL_DONE)]);
    }

    case "need":
    case "district":
    case "prefer_nearest":
      return matchAndAsk(s, now, language, store);

    case "payment":
      if (s.carrierAr) return insuranceReply(s, s.carrierAr, now, language, store);
      if (!s.siteId) return matchAndAsk(s, now, language, store);
      return offerSlots(s, now, language, store);

    case "insurance_question": {
      const carrier = s.carrierAr ?? cls.carrierRaw;
      const target = s.siteId ?? recommend(needOf(s), { districtAr: s.districtAr, now })?.siteId ?? "wattan-2";
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

    case "hours_question": {
      const target = s.siteId ?? recommend(needOf(s), { districtAr: s.districtAr, now })?.siteId ?? null;
      if (!target) return unsupportedSpecialty(s);
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
      if (!state.opensAtAr) return reply(s, [faysal(s, S.fallbackHonestUnknown(`تتصل على ${b.phoneAr} والاستقبال يأكد لك الدوام`))]);
      return reply(s, [faysal(s, `${b.nameAr} يفتح اليوم ${state.opensAtAr}.\nتبي أثبّت لك موعد؟`)], ["أقرب موعد"]);
    }

    case "slots_question":
      if (!s.siteId) return matchAndAsk(s, now, language, store);
      return offerSlots(s, now, language, store);

    case "pick_slot":
      return pickSlot(s, cls.slotPick ?? 1, language, now, store);

    case "confirm": {
      if (s.scene === "S6_close" && s.holdId) return confirmHeld(s, now, store);
      if (s.scene === "S9_expand" && s.offeredSlots.length) return pickSlot(s, 1, language, now, store);
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
      return matchAndAsk(s, now, language, store);
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

    case "objection_delay":
      return reply(s, [faysal(s, S.motionObjectionDelay(s.offeredSlots[0]?.labelAr ?? "أقرب موعد"))], ["إي", "لا"]);

    case "unsupported_specialty":
      return unsupportedSpecialty(s);

    case "close":
      s.scene = "S14_closed";
      return reply(s, [faysal(s, language === "en" ? EN.closing : S.SCENE_CLOSE)]);

    case "greeting_only":
      if (!s.greeted) return openConversation(s, now, language);
      // ALREADY GREETED. A coordinator who has said hello answers «مساء الخير» with
      // «مساء النور», not with a second introduction. The first version replayed
      // GREETING_NEW_PATIENT here, so a patient who opened with a courtesy after
      // Faysal's own greeting got introduced to Faysal twice in a row — driven on
      // a real phone at 02:00. Mirror the greeting, then nudge back to whatever
      // was open, and re-offer the same chips so the thread does not lose its place.
      return reply(s, [faysal(s, S.greetingEcho(raw, openQuestionFor(s)))], chipsFor(s));

    default: {
      // §8.2 — the universal fallback. `{concrete_alternative}` is always a branch
      // phone, a booking he CAN make, or an offered handoff. Never "check the
      // website", never "try again later", never nothing.
      const b = site(s.siteId);
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
function matchOfferedSlot(raw: string, offered: SlotView[]): number | null {
  const t = normalizeArabic(raw);
  const hour = /(?:^|\D)(\d{1,2})(?::(\d{2}))?(?:\D|$)/.exec(t);
  const wantedDay = WEEKDAY_WORDS.find((d) => t.includes(d)) ?? null;
  if (!wantedDay && !hour) return null;

  let dayMatch: number | null = null;
  for (let i = 0; i < offered.length; i++) {
    const label = normalizeArabic(offered[i].labelAr);
    if (wantedDay && !label.includes(wantedDay)) continue;
    if (hour) {
      const h = Number(hour[1]);
      const labelHour = /(\d{1,2}):(\d{2})/.exec(label);
      if (labelHour && Number(labelHour[1]) === h) return i + 1;
    }
    if (wantedDay && dayMatch === null) dayMatch = i + 1;
  }
  return dayMatch;
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

function insuranceReply(
  s: FaysalSession,
  carrier: string,
  now: Date,
  language: "ar" | "en" | "other",
  store: FaysalStore,
): Reply {
  const target = s.siteId ?? recommend(needOf(s), { districtAr: s.districtAr, now })?.siteId ?? "wattan-2";
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
