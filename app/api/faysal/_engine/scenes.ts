// ============================================================================
// فيصل / Faysal — THE SCENE MACHINE (SPEC-2 §7).
//
// Every inbound passes S0 (the safety screen) before anything here runs; that is
// in `turn/route.ts`, above this module, so that a red flag cannot reach a scene
// even by mistake. What is left is S1–S14.
//
// THE DETERMINISM BOUNDARY (§8.3) is the whole architecture of this file:
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
// So there is no code path in this file through which the model can produce a
// fact. It selects a frozen string; the domain fills the slots.
//
// CADENCE, enforced here rather than hoped for (§4.2): default 1–3 short lines,
// ≤2 messages per turn (3 only under the split-recap pattern), ONE question mark
// per message. `assertCadence()` is the mechanical form of that rule.
// ============================================================================

import {
  OPS,
  REAL_CONTACTS,
  SITES,
  bookableWindows,
  cancelBooking,
  carrierNameAr,
  confirmBooking,
  holdSlot,
  insuranceAnswer,
  openStateAt,
  packageFor,
  priceFor,
  recommendBranch,
  requestCallback,
  riyadhDateISO,
  riyadhParts,
  searchSlots,
} from "../_domain";
import { ROUTES as ROUTE_CACHE } from "../_domain";
import type { NeedKey, SeedSite, SiteId, Slot } from "../_domain";
import { normalizeArabic } from "../_domain/safety";
import { EN } from "./english";
import { compose } from "./render";
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
 * "One question mark per message. If a draft has two ؟, it is two messages or it
 * is wrong." Applied to Faysal's own messages only — the system line has none and
 * the rail is exempt from composition entirely.
 */
function assertCadence(messages: OutMsg[]): OutMsg[] {
  const faysal = messages.filter((m) => m.from === "faysal");
  if (faysal.length > 3) {
    throw new Error(`[faysal] cadence: ${faysal.length} messages in one turn; the cap is 3 (split-recap) and the norm is 2.`);
  }
  for (const m of faysal) {
    const marks = (m.text.match(/[؟?]/g) ?? []).length;
    if (marks > 1) {
      throw new Error(`[faysal] cadence: ${marks} question marks in one message — that is two messages, or it is wrong.`);
    }
  }
  return messages;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const site = (id: SiteId | null): SeedSite | null => (id ? SITES[id] : null);

function branchPhoneFor(s: FaysalSession): string | null {
  return site(s.siteId)?.phoneAr ?? site(s.nearSiteId)?.phoneAr ?? null;
}

function faysal(s: FaysalSession, text: string, opts: { quotedPackage?: boolean; isConfirmation?: boolean } = {}): OutMsg {
  return { from: "faysal", text: compose(text, { branchPhone: branchPhoneFor(s), ...opts }) };
}

function reply(s: FaysalSession, msgs: OutMsg[], chips: string[] = [], stopReason: string | null = null): Reply {
  return { messages: assertCadence(msgs), chips: chips.slice(0, 2), stopReason, scene: s.scene };
}

/** The clinic the current need routes to, as loaded data — never a guess. */
function clinicFor(need: NeedKey | null): { key: string; ar: string } {
  if (!need) return { key: "general", ar: "الكشف العام" };
  const route = ROUTE_CACHE[need];
  return { key: route.clinicKey, ar: route.clinicAr };
}


/** The service whose price is loaded for a need. Null → `price.not_loaded` (§5.2). */
function priceIdsFor(need: NeedKey | null): { consult: string | null; procedure: string | null } {
  switch (need) {
    case "laser":
      return { consult: "consult-derm", procedure: "laser-medium-session" };
    case "dermatology":
      return { consult: "consult-derm", procedure: null };
    case "orthodontics":
      return { consult: "ortho-assessment", procedure: "ortho-metal" };
    case "dental":
      return { consult: "consult-general", procedure: "dental-scaling" };
    case "paediatrics":
      return { consult: "consult-paeds", procedure: null };
    case "obgyn":
      return { consult: "consult-obgyn", procedure: null };
    case "ent":
      return { consult: "consult-ent", procedure: null };
    case "internal":
      return { consult: "consult-internal", procedure: null };
    case "neurology":
      return { consult: "consult-neuro", procedure: null };
    case "general":
      return { consult: "consult-general", procedure: null };
    case "employment_medical":
      return { consult: "employment-basic", procedure: null };
    // Deliberately unpriced: SPEC-1 §9.4 — no lab or radiology price list exists,
    // and inventing one invents dozens of clinical claims at once.
    default:
      return { consult: null, procedure: null };
  }
}

/**
 * The noun the fork template puts in front of «نسويه». It is masculine-agreeing by
 * construction, because the frozen template reads «{procedure} نسويه في
 * {best_branch}» — a slot filled with «جلسات الليزر» would ship «جلسات الليزر
 * نسويه», and a grammar error in the showpiece turn reads as a machine.
 */
const NEED_NOUN_AR: Readonly<Partial<Record<NeedKey, string>>> = {
  laser: "الليزر",
  dermatology: "كشف الجلدية",
  dental: "علاج الأسنان",
  orthodontics: "التقويم",
  endodontics: "علاج الجذور",
  orthopaedics: "كشف العظام",
  paediatrics: "كشف الأطفال",
  obgyn: "كشف النساء والولادة",
  ent: "كشف الأنف والأذن",
  internal: "كشف الباطنة",
  neurology: "كشف المخ والأعصاب",
  employment_medical: "فحص ما قبل التوظيف",
};

const needNounAr = (need: NeedKey | null): string => (need && NEED_NOUN_AR[need]) || "هالنوع من الكشف";

// ── the opener (S1) ─────────────────────────────────────────────────────────

/**
 * Rule DEMO-1(b): the system line is the FIRST message of every conversation and
 * it precedes the greeting. It is not attributed to Faysal, and it carries the
 * real booking numbers 920009303 / 0504490460 and 997.
 *
 * Greeting selection is SPEC-2 §2.2, and the red-flag screen runs before it —
 * "if the inbound message carries a red-flag symptom, NO greeting is sent at all."
 * That precedence lives in the route.
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

  // G4 — after midnight. `erSites({ now })` is SPEC-4 §4.4's call, and this build
  // has no roster that can satisfy its freshness requirement (a named verifier
  // inside 30 days). Zero eligible sites is the branch this reaches, and §4.4 is
  // explicit that it is the correct default, not a degradation.
  if (p.hour >= 0 && p.hour < 6) {
    s.scene = "S11_offhours";
    return S.GREETING_AFTER_MIDNIGHT_NO_ER;
  }

  // G3 — Friday, before the branch opens. States the REAL opening time from data.
  if (p.weekday === 5) {
    const anchor = SITES["wattan-2"];
    const state = openStateAt("wattan-2", now);
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

function forkReply(s: FaysalSession, bestId: SiteId, nearId: SiteId, reasonAr: string): Reply {
  const best = SITES[bestId];
  const near = SITES[nearId];
  const nearState = openStateAt(nearId, new Date());
  const procedure = needNounAr(s.need);
  const capability = near.clinicsAr.slice(0, 2).join(" و");

  s.siteId = bestId;
  s.nearSiteId = nearId;
  s.forkOffered = true;
  s.scene = "S3_route";

  const optionBest = `${best.shortAr} بموعد مثبّت من الحين — الكشف والجلسة في نفس الزيارة، وما تتنقل.`;

  // Rule C4-1: a contested site is bookable, but NEVER silently, and Rule C4-3:
  // the contradiction is never explained away. So the near option here promises a
  // CALLBACK and a phone number, not a time.
  const contested = nearState.state === "UNVERIFIED";
  const optionNear = contested
    ? `أسجّل لك طلب في ${near.shortAr}، والفرع يتصل عليك ويثبت الوقت — وقبل ما تطلع اتصل على ${near.phoneAr} وتأكد إنه فاتح.`
    : `كشف في ${near.shortAr} لأنه قريب، و${procedure} بعدين في ${best.shortAr}.`;

  const text = contested
    ? S.motionMatchForkUnverified({
        nearBranch: near.nameAr,
        nearCapability: capability,
        procedure,
        bestBranch: best.nameAr,
        bestShort: best.shortAr,
        bestReason: reasonAr,
        optionNear,
        optionBest,
      })
    : S.motionMatchFork({
        nearBranch: near.nameAr,
        nearCapability: capability,
        procedure,
        bestBranch: best.nameAr,
        bestShort: best.shortAr,
        bestReason: reasonAr,
        optionNear,
        optionBest,
      });

  // The near branch's phone is already in the contested option, so FRI-1's
  // post-pass sees a number and does not double it.
  return reply(s, [faysal(s, text)], [near.districtAr, best.districtAr]);
}

type ForkChoice = "near" | "best" | null;

function readForkChoice(raw: string, s: FaysalSession): ForkChoice {
  if (!s.forkOffered || !s.nearSiteId || !s.siteId) return null;
  const t = normalizeArabic(raw);
  const near = SITES[s.nearSiteId];
  const best = SITES[s.siteId];
  const hit = (site_: SeedSite) =>
    t.includes(normalizeArabic(site_.districtAr)) || t.includes(normalizeArabic(site_.nameAr));
  if (hit(best)) return "best";
  if (hit(near)) return "near";
  if (/(^|\s)(2|الثاني|الثانيه)(\s|$)/.test(t)) return "best";
  if (/(^|\s)(1|الاول|الاولي)(\s|$)/.test(t)) return "near";
  return null;
}

// ── slots, hold, confirm ────────────────────────────────────────────────────

function offerSlots(s: FaysalSession, now: Date, language: "ar" | "en" | "other", from: Date = now): Reply {
  const target = s.siteId;
  if (!target) return askDistrict(s);
  const target_ = SITES[target];
  const clinic = clinicFor(s.need);

  // Invariant H4 + Rule C4-1: an unbookable or contested site never produces a
  // time. It produces a callback request and a phone number, out loud.
  if (!target_.bookable || openStateAt(target, now).state === "UNVERIFIED") {
    s.awaitingCallbackWindow = true;
    s.scene = "S11_offhours";
    return reply(
      s,
      [faysal(s, S.greetingBranchUnverifiedBookAnyway(target_.nameAr, target_.phoneAr))],
      ["الصبح", "بعد العصر"],
    );
  }

  // Two options, on TWO DIFFERENT DAYS. §6.5 caps the offer at two; §9's transcript
  // offers «بكرة الجمعة 5:30 م» and «السبت 11:00 ص», and that is not decoration —
  // two times an hour apart is one option wearing a hat, and it forces a patient
  // who cannot make that morning straight back to «متى فيه غيره؟».
  const slots = twoAcrossDays(target, clinic.key, from, now);
  if (slots.length === 0) {
    // §6.5 `motion.close.none` — the alternative is a real one from the fallback
    // chain, never "try again later".
    const alt = recommendBranch(s.need ?? "general", {});
    const altSite = SITES[alt.siteId === target ? "shoaa-wurud" : alt.siteId];
    const altSlots = searchSlots({ siteId: altSite.id, clinicKey: clinic.key, fromISO: now.toISOString(), limit: 1 });
    if (!altSlots.length) {
      return reply(s, [faysal(s, S.fallbackHonestUnknown(`تتصل على ${target_.phoneAr} والاستقبال يعطيك أقرب وقت`))]);
    }
    return reply(
      s,
      [faysal(s, S.motionCloseNone(target_.shortAr, altSlots[0].labelAr, altSite.shortAr, altSlots[0].labelAr))],
      [altSlots[0].labelAr],
    );
  }

  s.offeredSlots = slots;
  s.scene = "S5_slots";

  if (slots.length === 1) {
    return reply(s, [faysal(s, S.motionCloseSingle(slots[0].labelAr, target_.shortAr))], [slots[0].labelAr]);
  }

  const text =
    language === "en"
      ? EN.close(target_.nameEn, clinic.ar, slots[0].labelAr, slots[1].labelAr)
      : S.motionClose(target_.nameAr, clinic.ar, slots[0].labelAr, slots[1].labelAr);

  // A Friday slot in the list makes this a Friday reply, and Rule FRI-1 appends
  // the branch phone here — the same code path that renders the slot.
  return reply(s, [faysal(s, text)], [slots[0].labelAr, slots[1].labelAr]);
}

function pickSlot(s: FaysalSession, index: number, language: "ar" | "en" | "other"): Reply {
  const slot = s.offeredSlots[index - 1];
  if (!slot) return offerSlots(s, new Date(), language);
  const hold = holdSlot(slot.slotId, s.id);
  if (!hold) {
    return reply(s, [faysal(s, S.fallbackHonestUnknown("أشوف لك وقت ثاني في نفس الفرع"))]);
  }
  s.holdId = hold.holdId;
  s.heldSlot = slot;
  s.scene = "S6_close";
  const branch = SITES[slot.siteId];
  const text =
    language === "en"
      ? EN.hold(slot.labelAr, branch.nameEn, hold.holdMinutes, s.patientNameAr)
      : S.holdMessage(slot.labelAr, branch.shortAr, slot.clinicAr, hold.holdMinutes, s.patientNameAr);
  return reply(s, [faysal(s, text)], ["إي، ثبّته", "لا، غيّره"]);
}

function confirmHeld(s: FaysalSession): Reply {
  if (!s.holdId || !s.heldSlot) return reply(s, [faysal(s, S.fallbackHonestUnknown("أشوف لك أقرب موعد من جديد"))]);
  const booking = confirmBooking(s.holdId, { nameAr: s.patientNameAr, carrierAr: s.carrierAr });
  if (!booking) {
    // The hold expired. Never claim a booking that did not happen (§6.5: "wait for
    // real confirmation before claiming it").
    s.holdId = null;
    s.heldSlot = null;
    return reply(s, [faysal(s, "الحجز ما ثبت — الوقت اللي كنت ماسكه لك انتهى. أشوف لك أقرب وقت من جديد؟")]);
  }
  const branch = SITES[booking.siteId];
  s.bookingRef = booking.ref;
  s.holdId = null;
  s.scene = "S7_confirmed";

  // §6.7: the confirmation block is ATOMIC — its own message, nothing appended,
  // no question glued on. The pre-visit block is a SEPARATE message.
  const block = S.motionConfirmBlock({
    patientName: booking.patientNameAr,
    branchName: branch.nameAr,
    branchAddress: branch.addressAr,
    clinic: booking.clinicAr,
    slot: booking.slotLabelAr ?? "",
    insurer: booking.carrierAr,
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

function confirmCallback(s: FaysalSession, windowAr: string): Reply {
  const target = s.siteId ?? s.nearSiteId;
  if (!target) return askDistrict(s);
  const branch = SITES[target];
  const booking = requestCallback(target, {
    nameAr: s.patientNameAr,
    carrierAr: s.carrierAr,
    preferredWindowAr: windowAr,
  });
  s.bookingRef = booking.ref;
  s.awaitingCallbackWindow = false;
  s.scene = "S7_confirmed";

  const block = S.motionConfirmBlockCallback({
    patientName: booking.patientNameAr,
    branchName: branch.nameAr,
    branchAddress: branch.addressAr,
    clinic: clinicFor(s.need).ar,
    preferredWindow: windowAr,
    branchPhone: branch.phoneAr,
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

// ── discovery ───────────────────────────────────────────────────────────────

function askDistrict(s: FaysalSession): Reply {
  s.scene = "S2_discover";
  return reply(s, [faysal(s, s.need ? S.MOTION_DISCOVER_SHORT : S.MOTION_DISCOVER)], ["تأمين", "كاش"]);
}

function matchAndAsk(s: FaysalSession, now: Date, language: "ar" | "en" | "other"): Reply {
  const need = s.need ?? "general";
  const rec = recommendBranch(need, { districtAr: s.districtAr, preferNearest: false });

  if (rec.nearest && rec.nearest.siteId !== rec.siteId) {
    return forkReply(s, rec.siteId, rec.nearest.siteId, rec.reasonAr);
  }

  s.siteId = rec.siteId;
  s.scene = "S3_route";
  const branch = SITES[rec.siteId];
  const matchText =
    language === "en" ? EN.match(branch.nameEn, rec.reasonAr) : S.motionMatch(branch.nameAr, rec.reasonAr);

  // Split-recap (§4.2): the match is one atomic message, the ask is the next. Two
  // messages in one turn — within cadence, and the ask carries the only «؟».
  if (!s.districtAr || !s.payment) {
    const ask = language === "en" ? EN.discoverShort : S.MOTION_DISCOVER_SHORT;
    return reply(s, [faysal(s, matchText), faysal(s, ask)], ["تأمين", "كاش"]);
  }
  return offerSlots(s, now, language);
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
function tryExpand(s: FaysalSession, raw: string, cls: Classification, now: Date): Reply | null {
  if (s.scene !== "S7_confirmed" || !s.bookingRef) return null; // gate 1
  if (!cls.need) return null; // gate 2 — they must have named it
  const pronoun = expansionPronoun(raw) ?? "لك";
  const target = s.siteId;
  if (!target || !SITES[target].bookable) return null; // gate 3 — same branch, same day

  const clinic = clinicFor(cls.need);
  const heldDate = s.heldSlot ? riyadhDateISO(new Date(s.heldSlot.startISO)) : riyadhDateISO(now);
  const dayStart = new Date(`${heldDate}T00:00:00+03:00`);
  const slots = searchSlots({ siteId: target, clinicKey: clinic.key, fromISO: dayStart.toISOString(), nowISO: now.toISOString(), limit: 4 })
    .filter((x) => riyadhDateISO(new Date(x.startISO)) === heldDate);
  if (!slots.length) return null;

  const near = s.heldSlot ? nearestTo(slots, new Date(s.heldSlot.startISO)) : slots[0];
  s.scene = "S9_expand";
  s.offeredSlots = [near];

  // Gate 4 in the words themselves: he refuses to say anything about the symptom
  // and books the CLINIC. `clinical_diagnosis` is declined explicitly.
  return reply(
    s,
    [
      faysal(s, `أكيد، وأحسن لكم تجون مرة وحدة بدل زيارتين.\n${S.CLINICAL_DIAGNOSIS_REFUSAL}`),
      faysal(s, S.motionExpand(cls.need === "orthopaedics" ? "ألم الركبة" : clinic.ar, pronoun, clinic.ar, near.labelAr)),
    ],
    [near.labelAr],
  );
}

/**
 * The earliest slot, then the earliest slot on a LATER day. Two searches rather
 * than one wide one, because a single window holds a dozen free half-hours and a
 * `limit: 12` read never leaves the first day at all — which is exactly what the
 * first cut did, and it offered the patient «10:00 ص» and «11:30 ص».
 */
function twoAcrossDays(siteId: SiteId, clinicKey: string, from: Date, now: Date): Slot[] {
  const first = searchSlots({ siteId, clinicKey, fromISO: from.toISOString(), nowISO: now.toISOString(), limit: 1 })[0];
  if (!first) return [];
  const dayAfter = new Date(new Date(first.startISO).getTime() + 24 * 3600_000);
  const p = riyadhParts(dayAfter);
  const nextDayStart = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0) - 3 * 3600_000);
  const second = searchSlots({ siteId, clinicKey, fromISO: nextDayStart.toISOString(), nowISO: now.toISOString(), limit: 1 })[0];
  return second ? [first, second] : [first];
}

/**
 * The patient named a weekday we did not offer — «السبت» against two Thursdays.
 * That is not an unknown; it is a preference, and the honest answer is to look on
 * that day rather than to run `fallback.honest_unknown` at someone who told us
 * exactly what they wanted. Returns the next instant on that weekday, or null.
 */
function weekdayOrigin(raw: string, now: Date): Date | null {
  const t = normalizeArabic(raw);
  const idx = WEEKDAY_WORDS.findIndex((d) => t.includes(d));
  if (idx < 0) return null;
  for (let i = 0; i <= 7; i++) {
    const probe = new Date(now.getTime() + i * 24 * 3600_000);
    if (riyadhParts(probe).weekday === idx) {
      const p = riyadhParts(probe);
      return new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0) - 3 * 3600_000);
    }
  }
  return null;
}

function nearestTo(slots: Slot[], anchor: Date): Slot {
  return slots.reduce((best, x) =>
    Math.abs(new Date(x.startISO).getTime() - anchor.getTime()) < Math.abs(new Date(best.startISO).getTime() - anchor.getTime())
      ? x
      : best,
  );
}

// ── the turn ────────────────────────────────────────────────────────────────

export function runTurn(s: FaysalSession, raw: string, cls: Classification, now: Date): Reply {
  const language = cls.language;
  s.turns += 1;

  // §3.3 — the only bilingual message in the product. Faysal does not pretend
  // fluency and does not machine-translate a clinical conversation.
  if (language === "other") {
    const phone = branchPhoneFor(s) ?? SITES["wattan-1"].phoneAr;
    return reply(s, [faysal(s, S.languageThirdLanguage(phone))]);
  }

  // Rule DEMO-1(b), detail 4b: deferred to the first NON-RAIL turn if turn 1 was
  // a rail. It fires once, in the same position and the same system voice.
  const prefix: OutMsg[] = [];
  if (!s.demoLineSent) {
    prefix.push({ from: "system", text: compose(S.DEMO_1_B) });
    s.demoLineSent = true;
  }

  const out = dispatch(s, raw, cls, now, language);
  if (prefix.length) out.messages = assertCadence([...prefix, ...out.messages]);
  return out;
}

function dispatch(
  s: FaysalSession,
  raw: string,
  cls: Classification,
  now: Date,
  language: "ar" | "en" | "other",
): Reply {
  // Record what the patient told us. NOTHING here is inferred: a district only
  // becomes a district because the patient typed one, a carrier only becomes a
  // carrier because it resolves against the network list.
  if (cls.need) s.need = cls.need;
  if (cls.districtAr) s.districtAr = cls.districtAr;
  if (cls.payment) s.payment = cls.payment;
  if (cls.carrierRaw) s.carrierAr = carrierNameAr(cls.carrierRaw) ?? cls.carrierRaw;

  // A pending callback window outranks a fresh read: the patient was asked one
  // question and this is the answer to it.
  if (s.awaitingCallbackWindow) {
    const win = cls.preferredWindowAr ?? readWindow(raw);
    if (win) return confirmCallback(s, win);
  }

  // Picking a slot by its OWN WORDS — «السبت 11», «الخميس», «11:30». Only this
  // layer can see the offered labels, so the classifier deliberately does not try:
  // it reads ordinals, and this reads the times we actually named. Driven from the
  // §9 transcript, where the patient's pick is literally «السبت 11».
  if (s.offeredSlots.length && cls.kind !== "cancel" && cls.kind !== "decline") {
    const picked = matchOfferedSlot(raw, s.offeredSlots);
    if (picked) return pickSlot(s, picked, language);
    const origin = weekdayOrigin(raw, now);
    if (origin && s.siteId) return offerSlots(s, now, language, origin);
  }

  // A pending fork choice, likewise.
  const forkChoice = readForkChoice(raw, s);
  if (forkChoice) {
    s.forkOffered = false;
    if (forkChoice === "near" && s.nearSiteId) {
      s.siteId = s.nearSiteId;
      return offerSlots(s, now, language);
    }
    return offerSlots(s, now, language);
  }

  // Expansion, only after S7 and only on a need the patient just raised.
  const expanded = tryExpand(s, raw, cls, now);
  if (expanded) return expanded;

  switch (cls.kind) {
    case "identity":
      return reply(s, [faysal(s, language === "en" ? EN.identity : S.PERSONA_IDENTITY_HONEST)]);

    // §5.3 — own it FIRST, no explanation before the apology, then ONE concrete
    // action. Compensation is never self-authorised.
    case "complaint": {
      const clinic = clinicFor(s.need);
      const slots = s.siteId && SITES[s.siteId].bookable
        ? searchSlots({ siteId: s.siteId, clinicKey: clinic.key, fromISO: now.toISOString(), limit: 1 })
        : [];
      if (!slots.length) {
        s.scene = "S10_escalate";
        s.escalationOffered = true;
        return reply(s, [faysal(s, S.COMPLAINT_ESCALATE_OFFER)], ["إي، حوّلني"]);
      }
      s.offeredSlots = slots;
      s.scene = "S5_slots";
      return reply(s, [faysal(s, S.complaintWaitOwnIt(clinic.ar, slots[0].labelAr))], [slots[0].labelAr]);
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
      return reply(s, [
        faysal(s, S.competitorDecline(`${b.nameAr} — ${ROUTE_CACHE[s.need ?? "general"].reasonAr}`, `${SITES["shoaa-wurud"].nameAr} حاصل على ${SITES["shoaa-wurud"].accreditationAr}`)),
      ]);
    }

    // §8.1 #1/#2/#19 — refused in voice, then the one thing he CAN do.
    case "clinical_question":
      return reply(s, [faysal(s, `${S.CLINICAL_DIAGNOSIS_REFUSAL}\nأقرب طريق: أثبّت لك موعد عند ${clinicFor(s.need).ar}.`)], ["أقرب موعد"]);
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
      if (s.bookingRef) cancelBooking(s.bookingRef);
      s.bookingRef = null;
      s.holdId = null;
      s.heldSlot = null;
      s.scene = "S14_closed";
      return reply(s, [faysal(s, S.CANCEL_DONE)]);
    }

    case "need":
    case "district":
      return matchAndAsk(s, now, language);

    case "prefer_nearest": {
      const need = s.need ?? "general";
      const rec = recommendBranch(need, { districtAr: s.districtAr, preferNearest: true });
      if (rec.nearest && rec.nearest.siteId !== rec.siteId) return forkReply(s, rec.siteId, rec.nearest.siteId, rec.reasonAr);
      s.siteId = rec.siteId;
      return offerSlots(s, now, language);
    }

    case "payment":
      // The carrier is recorded; the coverage answer still refuses to compute.
      if (s.carrierAr) return insuranceReply(s, s.carrierAr, now, language);
      if (!s.siteId) return matchAndAsk(s, now, language);
      return offerSlots(s, now, language);

    case "insurance_question": {
      const carrier = s.carrierAr ?? (cls.carrierRaw ? carrierNameAr(cls.carrierRaw) : null);
      if (!carrier) {
        const b = site(s.siteId) ?? SITES["wattan-2"];
        return reply(s, [faysal(s, S.insuranceNetworksListed(b.nameAr, b.networks.slice(0, 3).join(" و")))]);
      }
      s.carrierAr = carrier;
      return insuranceReply(s, carrier, now, language);
    }

    case "price_question":
      return priceReply(s, now, language);

    case "package_question":
      return packageReply(s, now);

    case "hours_question": {
      const target = nearestNamed(cls.districtAr) ?? s.siteId ?? "wattan-2";
      const state = openStateAt(target, now);
      const b = SITES[target];
      if (state.state === "UNVERIFIED") {
        // G5 — never asserts open OR closed. Offers a working alternative AND the
        // branch line, right now, in the same message.
        const alt = SITES[recommendBranch(s.need ?? "general", {}).siteId];
        s.nearSiteId = target;
        return reply(s, [faysal(s, S.greetingBranchUnverified(b.nameAr, alt.nameAr, b.phoneAr))], [alt.districtAr, b.districtAr]);
      }
      const windows = bookableWindows(target, riyadhDateISO(now));
      const hours = windows.length ? windows[0].labelAr : null;
      if (!hours) return reply(s, [faysal(s, S.fallbackHonestUnknown(`تتصل على ${b.phoneAr} والاستقبال يأكد لك الدوام`))]);
      s.siteId = target;
      return reply(s, [faysal(s, `${b.nameAr} اليوم ${hours}.\nتبي أثبّت لك موعد؟`)], ["أقرب موعد"]);
    }

    case "slots_question":
      if (!s.siteId) return matchAndAsk(s, now, language);
      return offerSlots(s, now, language);

    case "pick_slot":
      return pickSlot(s, cls.slotPick ?? 1, language);

    case "confirm": {
      if (s.scene === "S6_close" && s.holdId) return confirmHeld(s);
      if (s.scene === "S9_expand" && s.offeredSlots.length) return pickSlot(s, 1, language);
      if (s.awaitingCallbackWindow) {
        const win = cls.preferredWindowAr ?? readWindow(raw);
        if (win) return confirmCallback(s, win);
        return reply(s, [faysal(s, "قل لي الوقت اللي يناسبك — الصبح ولا بعد العصر.")], ["الصبح", "بعد العصر"]);
      }
      if (s.escalationOffered) {
        // §8.1 #22 — the handoff is narrated only after it has actually fired. In
        // this build "firing" is a real callback_request row, and the message says
        // exactly that and nothing more.
        s.escalationOffered = false;
        const b = site(s.siteId) ?? SITES["wattan-1"];
        s.siteId = b.id;
        return confirmCallback(s, s.preferredWindowAr ?? "أقرب وقت");
      }
      if (s.scene === "S5_slots" && s.offeredSlots.length) return pickSlot(s, 1, language);
      if (s.siteId) return offerSlots(s, now, language);
      return matchAndAsk(s, now, language);
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
      if (!near) return offerSlots(s, now, language);
      return reply(s, [faysal(s, S.motionObjectionDistance(near.shortAr, needNounAr(s.need), best.shortAr))], [near.districtAr, best.districtAr]);
    }

    case "objection_price": {
      s.objections.price = (s.objections.price ?? 0) + 1;
      if (s.objections.price >= 2) return reply(s, [faysal(s, S.MOTION_OBJECTION_STOP)]);
      // §5.2: "the price is the price; he is not embarrassed by it and he does not
      // defend it." One reframe, on a SPECIFIC, then stop. Never a discount — that
      // is `invented_price_or_discount` and it is not his to give.
      const b = site(s.siteId) ?? SITES["wattan-2"];
      return reply(s, [faysal(s, S.motionObjectionPrice(`أثبّت لك الكشف أول، والدكتور يحدد المنطقة وعدد الجلسات قبل ما تدفع أي شي في ${b.shortAr}`))], ["إي", "لا"]);
    }

    case "objection_delay":
      return reply(s, [faysal(s, S.motionObjectionDelay(s.offeredSlots[0]?.labelAr ?? "أقرب موعد"))], ["إي", "لا"]);

    case "close":
      s.scene = "S14_closed";
      return reply(s, [faysal(s, language === "en" ? EN.closing : S.SCENE_CLOSE)]);

    case "greeting_only":
      if (!s.greeted) return openConversation(s, now, language);
      return reply(s, [faysal(s, language === "en" ? EN.greeting : S.GREETING_NEW_PATIENT)]);

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

const WEEKDAY_WORDS = ["الاحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس", "الجمعه", "السبت"];

/**
 * Does this message name one of the two slots we just offered? Matched on the
 * DAY the label carries plus, when the patient gave one, the hour — so «السبت»
 * picks the Saturday slot, and «السبت 11» still picks it when both offered slots
 * are Saturdays. A day we did not offer matches nothing, and the turn falls
 * through to the ordinary read rather than booking a time we never said.
 */
function matchOfferedSlot(raw: string, offered: Slot[]): number | null {
  const t = normalizeArabic(raw);
  const hour = /(?:^|\D)(\d{1,2})(?::(\d{2}))?(?:\D|$)/.exec(t);
  const wantedDay = WEEKDAY_WORDS.find((d) => t.includes(d)) ?? null;
  if (!wantedDay && !hour) return null;

  let dayMatch: number | null = null;
  for (let i = 0; i < offered.length; i++) {
    const label = normalizeArabic(offered[i].labelAr);
    const dayOk = wantedDay ? label.includes(wantedDay) : true;
    if (!dayOk) continue;
    if (hour) {
      const h = Number(hour[1]);
      const labelHour = /(\d{1,2}):(\d{2})/.exec(label);
      if (labelHour && Number(labelHour[1]) === h) return i + 1;
    }
    if (wantedDay && dayMatch === null) dayMatch = i + 1;
  }
  return dayMatch;
}

function readWindow(raw: string): string | null {
  const t = normalizeArabic(raw);
  if (/(الصبح|الصباح|صباحا|بكره الصبح)/.test(t)) return "الصبح";
  if (/(بعد العصر|العصر|بعد الظهر|المسا|المساء|بالليل)/.test(t)) return "بعد العصر";
  return null;
}

function nearestNamed(districtAr: string | null): SiteId | null {
  if (!districtAr) return null;
  const t = normalizeArabic(districtAr);
  for (const id of Object.keys(SITES) as SiteId[]) {
    if (SITES[id].nearDistrictsAr.some((d) => t.includes(normalizeArabic(d)))) return id;
  }
  return null;
}

// ── insurance and price ─────────────────────────────────────────────────────

function insuranceReply(s: FaysalSession, carrier: string, now: Date, language: "ar" | "en" | "other"): Reply {
  const target = s.siteId ?? recommendBranch(s.need ?? "general", { districtAr: s.districtAr }).siteId;
  const answer = insuranceAnswer(carrier, target);
  s.scene = "S4_insurance";

  const aesthetic = s.need === "laser" || s.need === "orthodontics";
  const body =
    language === "en"
      ? EN.insurance(carrier)
      : aesthetic
        ? `${answer.sentenceAr}\n${S.INSURANCE_AESTHETIC_NOTE}`
        : answer.sentenceAr;

  // Split-recap (§4.2, and the §9 transcript's turn 5): the insurance note is its
  // own atomic message and the ONE question follows it.
  const msgs = [faysal(s, body)];
  if (s.forkOffered) {
    msgs.push(faysal(s, "أي طريق أريح لك؟"));
    return reply(s, msgs, [SITES[s.nearSiteId ?? target].districtAr, SITES[target].districtAr]);
  }
  if (!s.offeredSlots.length && s.siteId) {
    const follow = offerSlots(s, now, language);
    return reply(s, [...msgs, ...follow.messages], follow.chips);
  }
  return reply(s, msgs);
}

function priceReply(s: FaysalSession, now: Date, language: "ar" | "en" | "other"): Reply {
  const target = s.siteId ?? recommendBranch(s.need ?? "general", { districtAr: s.districtAr }).siteId;
  const ids = priceIdsFor(s.need);
  const consult = ids.consult ? priceFor(ids.consult, target) : null;
  const procedure = ids.procedure ? priceFor(ids.procedure, target) : null;
  s.scene = "S4_insurance";
  s.quotedPrice = true;

  // §5.2 / Rule PRICE-1: nothing is loaded → the honest-unknown price line, and
  // NEVER an invented range. `{known_fact}` is a loaded fact, not a hedge.
  if (!consult && !procedure) {
    const b = SITES[target];
    return reply(s, [faysal(s, S.priceNotLoaded(`${b.nameAr} هو الفرع اللي يناسب حالتك — ${ROUTE_CACHE[s.need ?? "general"].reasonAr}`))], ["أقرب موعد"]);
  }

  const parts: string[] = [];
  if (consult) parts.push(`${consult.serviceAr} بـ ${consult.amount} ر.س`);
  if (procedure) parts.push(`و${procedure.serviceAr} بـ ${procedure.amount} ر.س`);
  const tail =
    s.need === "laser"
      ? "\nوالمناطق تختلف، والدكتورة تحدد المنطقة وعدد الجلسات بعد تقييم البشرة."
      : "";

  // The PRICE-1 label is appended by the renderer, not by this line — the same law
  // as Rule PRICE-2's single calculator.
  const priceMsg = faysal(s, `${parts.join("، ")}.${tail}`);

  // Reframe EXACTLY ONCE, on a specific, then stop and let the price stand.
  const b = SITES[target];
  const reframe = b.bookable
    ? faysal(s, `وإذا مهم عندك تخلّصه بأسرع وقت، أشوف لك أقرب موعد في ${b.shortAr}؟`)
    : faysal(s, `${S.fallbackHonestUnknown(`تتصل على ${b.phoneAr} والاستقبال يعطيك أقرب وقت`)}`);
  void language;
  return reply(s, [priceMsg, reframe], ["أقرب موعد"]);
}

function packageReply(s: FaysalSession, now: Date): Reply {
  void now;
  const ids = priceIdsFor(s.need);
  const pair = ids.procedure ? packageFor(ids.procedure) : null;
  if (!pair) return reply(s, [faysal(s, S.priceNotLoaded("الاستقبال يعطيك الباقات المتاحة حسب المنطقة"))]);
  s.quotedPrice = true;
  return reply(
    s,
    [
      faysal(
        s,
        `${pair.single.serviceAr} بـ ${pair.single.amount} ر.س، و${pair.pkg.serviceAr} بـ ${pair.pkg.amount} ر.س — يعني 6 جلسات بسعر 5.`,
        { quotedPackage: true },
      ),
    ],
    ["أقرب موعد"],
  );
}
