// ============================================================================
// فيصل / Faysal — THE DOMAIN SEAM, wired to `lib/health`.
//
// This file is the ONLY place the demo surface names a domain function. It was
// written first as a bridge over a transcription of SPEC-1, because the engine
// was still being built; `lib/health/*` has now landed and THE SWAP IS DONE —
// every fact below comes from the reviewed engine, and the bridge, its seed and
// its reduced red-flag detector are deleted.
//
// WHAT IS LEFT HERE IS AN ADAPTER, AND ONLY AN ADAPTER. `lib/health` speaks in
// `SpecialtyKey`, `serviceId`, `"HH:MM"` and a tri-state `"open"|"closed"|
// "unknown"`; the chat surface speaks in branch labels, Arabic slot captions and
// a three-state branch status. Translating between those is presentation, which
// is this app's job. Nothing below decides a fact:
//
//   · no hours are computed here — `openStateAt` / `bookableWindows` are called
//   · no slot is minted here — `searchSlots` is called
//   · no price is computed here — `priceFor` is called, and its `demoLabel`
//     travels with the figure (Rule PRICE-2's single calculator)
//   · no coverage is decided here — `insuranceAnswer` is called
//   · no red flag is matched here — `isFaysalSafetyInbound` is called, and it is
//     the total, exception-degrading union SPEC-4 §1.5 R3 specifies
//
// TWO THINGS THE ADAPTER DOES DECIDE, both stated out loud:
//
// 1. DEMO_MODE IS ON, EXPLICITLY, IN ONE PLACE. `bookableWindows()` returns
//    nothing at all six sites unless demo mode is set, which is the correct
//    PRODUCTION behaviour and the reason `[OPEN-01]` is the first question on the
//    client call. This surface is the demo build by definition — it is the page
//    Rule DEMO-1's three placements exist for — so it passes `demoMode: true`
//    rather than relying on an environment variable a deploy can forget. If the
//    flag were read from the env and the env were unset, the founder would open
//    the page in front of a client and Faysal would offer callbacks at every
//    branch, correctly and uselessly.
//
// 2. THE STORE TRAVELS WITH THE CONVERSATION. `lib/health`'s `defaultStore` is a
//    process-local Map, and on Vercel the turn that holds a slot and the turn
//    that confirms it can land on different instances — `confirmBooking` would
//    throw `hold_unknown` with the patient's chosen time still on their screen.
//    So the store is serialised into the sealed session token (`_engine/session`)
//    and rebuilt per request. It is small by construction: one hold and one
//    appointment per conversation. `lib/health/db/` is what replaces it.
// ============================================================================

import {
  DEMO_BOOKING_SUFFIX_AR,
  GROUP_UNIFIED_920_WATTAN,
  GROUP_WHATSAPP,
  PRICE_LABEL_AR,
  SITE_IDS,
  SERVICES,
  bookableWindows as healthBookableWindows,
  cancelBooking as healthCancelBooking,
  carrierNameAr as healthCarrierNameAr,
  confirmBooking as healthConfirmBooking,
  createStore,
  holdSlot as healthHoldSlot,
  insuranceAnswer as healthInsuranceAnswer,
  cliniciansFor,
  isBookableSpecialty,
  isContested,
  isNeedKey,
  isSiteId,
  openStateAt as healthOpenStateAt,
  packageFor as healthPackageFor,
  patientPhoneDisplay,
  payerByName,
  priceFor as healthPriceFor,
  recommendBranch as healthRecommendBranch,
  requestCallback as healthRequestCallback,
  searchSlots as healthSearchSlots,
  serviceById,
  siteById,
  siteInDistrict,
} from "@/lib/health";
import type {
  Appointment,
  BranchRecommendation,
  FaysalStore,
  NeedKey,
  PriceAnswer,
  Site,
  SiteId,
  Slot as HealthSlot,
  SpecialtyKey,
} from "@/lib/health";
import { emergencyRail, isFaysalSafetyInbound, normalizeForSafety } from "@/lib/health/safety";

export type { Appointment, BranchRecommendation, FaysalStore, NeedKey, PriceAnswer, SiteId };
export { PRICE_LABEL_AR, SITE_IDS, isNeedKey, isSiteId, siteInDistrict };

/** SPEC-4 §1.1's normalizer, reused verbatim rather than re-derived. */
export const normalizeArabic = normalizeForSafety;
/** Arabic-Indic digits → ASCII, nothing else. The engine reads mobiles and ages through
 *  this seam, never from lib/health/safety directly (proof-faysal-safety §W keeps every
 *  Faysal surface behind the union). */
export { foldDigits } from "@/lib/health/safety/normalize";

/** Rule DEMO-1(b) — the REAL booking numbers, from the engine's own constants. */
export const REAL_CONTACTS = {
  unified: GROUP_UNIFIED_920_WATTAN,
  whatsapp: GROUP_WHATSAPP,
  emergency: "997",
} as const;

/** Rule DEMO-1(c), from the engine. The renderer appends it; the model cannot. */
export const DEMO_1_C_SUFFIX = DEMO_BOOKING_SUFFIX_AR;

export const OPS = { arrivalBufferMinutes: 15, holdMinutes: 10 } as const;

// ── DEMO_MODE, in one place (see header note 1) ─────────────────────────────
const DEMO = { demoMode: true } as const;

// ── the store, carried by the conversation (see header note 2) ──────────────

export type StoreSnapshot = {
  holds: [string, unknown][];
  appointments: [string, unknown][];
  activeHoldByPatient: [string, string][];
  seq: number;
};

export function storeFromSnapshot(snap: StoreSnapshot | null | undefined): FaysalStore {
  const store = createStore();
  if (!snap) return store;
  try {
    for (const [k, v] of snap.holds ?? []) store.holds.set(k, v as never);
    for (const [k, v] of snap.appointments ?? []) store.appointments.set(k, v as never);
    for (const [k, v] of snap.activeHoldByPatient ?? []) store.activeHoldByPatient.set(k, v);
    store.seq = Number(snap.seq) || 0;
  } catch {
    return createStore(); // a malformed snapshot is no snapshot, never a partial one
  }
  return store;
}

export function snapshotOfStore(store: FaysalStore): StoreSnapshot {
  return {
    holds: [...store.holds.entries()] as [string, unknown][],
    appointments: [...store.appointments.entries()] as [string, unknown][],
    activeHoldByPatient: [...store.activeHoldByPatient.entries()],
    seq: store.seq,
  };
}

// ── sites, as the chat surface needs to say them ────────────────────────────

export interface SiteView {
  id: SiteId;
  /** The registered name plus its district — the form used on FIRST mention and
   *  in the confirmation block, where the name is doing identification work. */
  nameAr: string;
  nameEn: string;
  /** What a coordinator says the second time: «الروابي», not the full name. */
  shortAr: string;
  districtAr: string;
  /** Rule PHONE-1 — primary / unified / whatsapp only, grouped, never a fax.
   *  NO-BREAK spaces: SPEC-2 §3.4 forbids a phone wrapping across a line, and in a
   *  420px bubble «011 497 7900» broke after «497» into two undialable halves. */
  phoneAr: string;
  addressAr: string;
  contested: boolean;
  accreditationAr: string | null;
}

const CBAHI_AR = "اعتماد المجلس السعودي للمنشآت الصحية CBAHI";

function viewOf(site: Site): SiteView {
  return {
    id: site.id,
    nameAr: `${site.nameAr} — ${site.district.ar}`,
    nameEn: `${site.nameEn} — ${site.district.en}`,
    shortAr: site.brand === "shoaa" ? `شعاع ${site.district.ar}` : site.district.ar,
    districtAr: site.district.ar,
    phoneAr: patientPhoneDisplay(site.id).replace(/ /g, " "),
    // §3.2 records no Arabic address for Ar Rawabi and does NOT back-fill one.
    // The English street is what the dossier has, so it is what the patient gets.
    addressAr: site.addressAr ?? site.addressEn,
    contested: isContested(site.id),
    accreditationAr: site.accreditation.cbahi === "accredited" ? CBAHI_AR : null,
  };
}

export const SITES: Readonly<Record<SiteId, SiteView>> = Object.freeze(
  Object.fromEntries(SITE_IDS.map((id) => [id, viewOf(siteById(id))])) as Record<SiteId, SiteView>,
);

/** Clinics a site genuinely carries, for the fork's «وفيه …» clause. */
export function clinicsAtSite(siteId: SiteId): string[] {
  const out: string[] = [];
  for (const [specialty, label] of SPECIALTY_LABELS) {
    if (isBookableSpecialty(siteId, specialty, true)) out.push(label);
  }
  return out;
}

const SPECIALTY_LABELS: readonly [SpecialtyKey, string][] = [
  ["general_family", "طب الأسرة"],
  ["internal_medicine", "الباطنة"],
  ["paediatrics", "الأطفال"],
  ["obgyn", "النساء والولادة"],
  ["ent", "الأنف والأذن"],
  ["ophthalmology", "العيون"],
  ["dermatology", "الجلدية"],
  ["laser_aesthetics", "الليزر"],
  ["dentistry", "الأسنان"],
  ["orthodontics", "التقويم"],
  ["endodontics", "علاج الجذور"],
  ["employment_medicals", "فحوصات ما قبل التوظيف"],
];

// ── needs → what to book, what to call it, what to price ────────────────────

export interface NeedPlan {
  /** `lib/health`'s own NeedKey — `recommendBranch` refuses anything else. */
  need: NeedKey;
  /** The service actually booked. Null → this need has no bookable service and
   *  the conversation takes the callback path, which is the honest answer. */
  serviceId: string | null;
  /** The clinic as Faysal names it in a sentence and in the confirmation block. */
  clinicAr: string;
  /** Masculine-agreeing, because the frozen fork template reads «{x} نسويه في …». */
  nounAr: string;
  /** Extra figures quoted alongside the booked service (§9.3). */
  extraPriceIds: string[];
}

/**
 * The demo's needs, each pinned to one of `lib/health`'s NeedKeys.
 *
 * ORTHOPAEDICS IS DELIBERATELY ABSENT, and that absence is the engine's verdict,
 * not an omission: SPEC-1 §6.2 records orthopaedics as `G` — group-wide only — at
 * all six sites, so there is no NeedKey for it and no site can book it. The
 * classifier routes «ألم بالركبة» to the unsupported-specialty answer instead,
 * which is Rule STR-3 (never a silent substitution) doing its job.
 */
export const NEED_PLANS: Readonly<Record<string, NeedPlan>> = {
  laser: { need: "derm_laser", serviceId: "derm-consult", clinicAr: "الجلدية والليزر", nounAr: "الليزر", extraPriceIds: ["laser-medium-session"] },
  dermatology: { need: "derm_laser", serviceId: "derm-consult", clinicAr: "الجلدية", nounAr: "كشف الجلدية", extraPriceIds: [] },
  dental: { need: "dental_ortho", serviceId: "dental-scaling", clinicAr: "الأسنان", nounAr: "علاج الأسنان", extraPriceIds: [] },
  orthodontics: { need: "dental_ortho", serviceId: "ortho-assessment", clinicAr: "التقويم", nounAr: "التقويم", extraPriceIds: ["ortho-metal"] },
  endodontics: { need: "endodontics", serviceId: null, clinicAr: "علاج الجذور", nounAr: "علاج الجذور", extraPriceIds: [] },
  paediatrics: { need: "paediatrics", serviceId: "paeds-consult", clinicAr: "الأطفال", nounAr: "كشف الأطفال", extraPriceIds: [] },
  obgyn: { need: "obgyn", serviceId: "obgyn-consult", clinicAr: "النساء والولادة", nounAr: "كشف النساء والولادة", extraPriceIds: [] },
  ent: { need: "ent", serviceId: "ent-consult", clinicAr: "الأنف والأذن والحنجرة", nounAr: "كشف الأنف والأذن", extraPriceIds: [] },
  internal: { need: "internal_medicine", serviceId: "internal-consult", clinicAr: "الباطنة", nounAr: "كشف الباطنة", extraPriceIds: [] },
  general: { need: "general_practice", serviceId: "gp-consult", clinicAr: "الكشف العام", nounAr: "الكشف العام", extraPriceIds: [] },
  employment_medical: { need: "employment_medical", serviceId: "emp-basic", clinicAr: "فحوصات ما قبل التوظيف", nounAr: "فحص ما قبل التوظيف", extraPriceIds: [] },
  neurology: { need: "neurology", serviceId: "neuro-consult", clinicAr: "المخ والأعصاب", nounAr: "كشف المخ والأعصاب", extraPriceIds: [] },
  after_hours: { need: "after_hours_er", serviceId: null, clinicAr: "الطوارئ", nounAr: "الكشف العاجل", extraPriceIds: [] },
};

export type DemoNeed = keyof typeof NEED_PLANS;

export const planFor = (need: DemoNeed | null): NeedPlan => NEED_PLANS[need ?? "general"] ?? NEED_PLANS.general;

// ── Riyadh presentation (the engine keeps time; this names it in Arabic) ────

const RIYADH_OFFSET_MIN = 3 * 60;
const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export interface RiyadhParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

export function riyadhParts(when: Date): RiyadhParts {
  const s = new Date(when.getTime() + RIYADH_OFFSET_MIN * 60_000);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
    weekday: s.getUTCDay(),
  };
}

export function riyadhDateISO(when: Date): string {
  const p = riyadhParts(when);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function fromRiyadh(dateISO: string, hhmm = "00:00"): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0) - RIYADH_OFFSET_MIN * 60_000);
}

/** SPEC-2 §3.4 — «5:30 م». Western digits, 12-hour, never 24-hour. */
export function timeAr(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(":");
  const h = Number(hRaw) % 24;
  const suffix = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mRaw ?? "00"} ${suffix}`;
}

/** «السبت 11:00 ص», with «اليوم»/«بكرة» resolved against NOW, not the search origin. */
export function slotLabelAr(dateISO: string, hhmm: string, now: Date): string {
  const day = WEEKDAY_AR[riyadhParts(fromRiyadh(dateISO, "12:00")).weekday];
  const today = riyadhDateISO(now);
  const tomorrow = riyadhDateISO(new Date(now.getTime() + 24 * 3600_000));
  const prefix = dateISO === today ? "اليوم " : dateISO === tomorrow ? "بكرة " : "";
  return `${prefix}${day} ${timeAr(hhmm)}`;
}

// ── hours ───────────────────────────────────────────────────────────────────

export type OpenState = "OPEN" | "CLOSED" | "UNVERIFIED";

export interface OpenStateResult {
  state: OpenState;
  opensAtAr: string | null;
  isFriday: boolean;
  contested: boolean;
}

/**
 * SPEC-2 §2.3's THREE-state branch status, from the engine's tri-state answer.
 *
 * The mapping is not cosmetic. `lib/health` answers `"unknown"` for a contested
 * site, for a stale record and for a day it was never given — and every one of
 * those is SPEC-2's `UNVERIFIED`, which is the state that fires G5 and never
 * asserts open OR closed. A boolean here is how a patient is sent to a locked door.
 */
export function openState(siteId: SiteId, when: Date): OpenStateResult {
  const nowISO = when.toISOString();
  const dateISO = riyadhDateISO(when);
  const state = healthOpenStateAt(siteId, when, "clinic", { ...DEMO, now: nowISO });
  const windows = healthBookableWindows(siteId, dateISO, { ...DEMO, now: nowISO });
  const isFriday = riyadhParts(when).weekday === 5;
  const contested = isContested(siteId);
  if (state === "unknown" || contested) {
    return { state: "UNVERIFIED", opensAtAr: null, isFriday, contested };
  }
  return {
    state: state === "open" ? "OPEN" : "CLOSED",
    opensAtAr: windows.length ? timeAr(windows[0].open) : null,
    isFriday,
    contested: false,
  };
}

/**
 * THE NEXT TIME THIS BRANCH ACTUALLY OPENS — not the first window of today, which is
 * what `opensAtAr` returns and what produced «الروابي يفتح اليوم 9:00 ص» AT 11:40 PM.
 * Today's nine o'clock is fourteen hours in the past by then, and the word «اليوم»
 * had been hard-coded into the sentence besides.
 *
 * Scans forward from `now`, day by day, up to a week, and returns the first window
 * that has not already closed, labelled the way a person says it: «اليوم», «بكرة»,
 * or the weekday. A branch with no window in the next seven days returns null, and
 * the caller must then say it does not know rather than guess.
 */
export function nextOpening(siteId: SiteId, now: Date): { labelAr: string; timeAr: string } | null {
  const nowISO = now.toISOString();
  for (let i = 0; i <= 7; i++) {
    const day = new Date(now.getTime() + i * 24 * 3600_000);
    const dateISO = riyadhDateISO(day);
    for (const w of healthBookableWindows(siteId, dateISO, { ...DEMO, now: nowISO })) {
      // A window that has already closed today is not an opening.
      if (fromRiyadh(dateISO, w.close).getTime() <= now.getTime()) continue;
      const weekday = WEEKDAY_AR[riyadhParts(fromRiyadh(dateISO, "12:00")).weekday];
      const today = riyadhDateISO(now);
      const tomorrow = riyadhDateISO(new Date(now.getTime() + 24 * 3600_000));
      const labelAr = dateISO === today ? "اليوم" : dateISO === tomorrow ? `بكرة ${weekday}` : weekday;
      return { labelAr, timeAr: timeAr(w.open) };
    }
  }
  return null;
}

export interface BookableWindowView {
  labelAr: string;
  isFriday: boolean;
  branchPhone: string;
}

export function windowsFor(siteId: SiteId, dateISO: string, now: Date): BookableWindowView[] {
  return healthBookableWindows(siteId, dateISO, { ...DEMO, now: now.toISOString() }).map((w) => ({
    labelAr: `${timeAr(w.open)} – ${timeAr(w.close)}`,
    isFriday: w.isFriday,
    branchPhone: w.branchPhone,
  }));
}

// ── routing ─────────────────────────────────────────────────────────────────

export interface Recommendation {
  siteId: SiteId;
  reasonAr: string;
  reasonEn: string;
  /** SPEC-2 §6.2's geography fork — REPORTED, never substituted (Rule STR-3). */
  nearestSiteId: SiteId | null;
  /** Rule C4-2 — a contested site is never the only option offered. */
  mustNameAlternate: boolean;
  alternates: SiteId[];
  appointmentKind: "slot" | "callback_request";
}

export function recommend(need: DemoNeed | null, opts: { districtAr?: string | null; dateISO?: string; now?: Date } = {}): Recommendation | null {
  const plan = planFor(need);
  try {
    const r: BranchRecommendation = healthRecommendBranch(plan.need, {
      ...DEMO,
      now: (opts.now ?? new Date()).toISOString(),
      districtAr: opts.districtAr ?? undefined,
      dateISO: opts.dateISO,
    });
    return {
      siteId: r.siteId,
      reasonAr: r.reasonAr,
      reasonEn: r.reasonEn,
      nearestSiteId: r.nearestSiteId,
      mustNameAlternate: r.mustNameAlternate,
      alternates: r.alternates,
      appointmentKind: r.appointmentKind,
    };
  } catch {
    // `need_unrecognised` / `no_site_for_need`. The caller runs the honest-unknown
    // path; it never falls back to "some branch".
    return null;
  }
}

// ── slots ───────────────────────────────────────────────────────────────────

export interface SlotView {
  slotId: string;
  siteId: SiteId;
  serviceId: string;
  clinicAr: string;
  dateISO: string;
  labelAr: string;
  isFriday: boolean;
  branchPhone: string;
  pendingBranchConfirmation: boolean;
}

function toView(s: HealthSlot, clinicAr: string, now: Date): SlotView {
  return {
    slotId: s.slotId,
    siteId: s.siteId,
    serviceId: s.serviceId,
    clinicAr,
    dateISO: s.dateISO,
    labelAr: slotLabelAr(s.dateISO, s.start, now),
    isFriday: s.isFriday,
    branchPhone: s.branchPhone,
    pendingBranchConfirmation: s.pendingBranchConfirmation,
  };
}

/**
 * The earliest slot, then the earliest slot on a LATER day.
 *
 * Two searches rather than one wide one: a clinic window holds a dozen free
 * half-hours, so a single `limit: 2` read returns two times an hour apart — one
 * option wearing a hat, and a patient who cannot make that morning is straight
 * back to «متى فيه غيره؟». §9's transcript offers «بكرة الجمعة 5:30 م» and
 * «السبت 11:00 ص» for exactly this reason.
 */
export function twoSlotsAcrossDays(
  siteId: SiteId,
  need: DemoNeed | null,
  from: Date,
  now: Date,
  store: FaysalStore,
): SlotView[] {
  const plan = planFor(need);
  if (!plan.serviceId) return [];
  const nowISO = now.toISOString();
  const horizonISO = riyadhDateISO(new Date(from.getTime() + 14 * 24 * 3600_000));

  let first: HealthSlot | undefined;
  try {
    first = healthSearchSlots(
      { serviceId: plan.serviceId, siteId, dateFromISO: riyadhDateISO(from), dateToISO: horizonISO, limit: 1, now: nowISO, ...DEMO },
      { store, now: nowISO, ...DEMO },
    )[0];
  } catch {
    return [];
  }
  if (!first) return [];

  const nextDay = riyadhDateISO(new Date(fromRiyadh(first.dateISO, "12:00").getTime() + 24 * 3600_000));
  let second: HealthSlot | undefined;
  try {
    second = healthSearchSlots(
      { serviceId: plan.serviceId, siteId, dateFromISO: nextDay, dateToISO: horizonISO, limit: 1, now: nowISO, ...DEMO },
      { store, now: nowISO, ...DEMO },
    )[0];
  } catch {
    second = undefined;
  }

  const out = [toView(first, plan.clinicAr, now)];
  if (second) out.push(toView(second, plan.clinicAr, now));
  return out;
}

/** Can this branch actually see this patient for this need, on any day soon? */
export function canBook(siteId: SiteId, need: DemoNeed | null, now: Date, store: FaysalStore): boolean {
  return twoSlotsAcrossDays(siteId, need, now, now, store).length > 0;
}

// ── hold → confirm → cancel ─────────────────────────────────────────────────

export interface HoldView {
  holdId: string;
  expiresAtISO: string;
  holdMinutes: number;
}

export function hold(slotId: string, waNumber: string, displayName: string, now: Date, store: FaysalStore): HoldView | null {
  try {
    const r = healthHoldSlot(slotId, { waNumber, displayName }, { store, now: now.toISOString(), ...DEMO });
    return { holdId: r.holdId, expiresAtISO: r.expiresAt, holdMinutes: OPS.holdMinutes };
  } catch {
    return null;
  }
}

export function confirm(holdId: string, waNumber: string, displayName: string, now: Date, store: FaysalStore): Appointment | null {
  try {
    return healthConfirmBooking(holdId, { waNumber, displayName }, { store, now: now.toISOString(), ...DEMO });
  } catch {
    // `hold_expired` / `hold_unknown` / `window_closed`. §6.5: wait for REAL
    // confirmation before claiming it — the caller says the time is gone.
    return null;
  }
}

export function callback(
  args: { siteId: SiteId; need: DemoNeed | null; waNumber: string; displayName: string; preferredWindowAr: string },
  now: Date,
  store: FaysalStore,
): Appointment | null {
  const plan = planFor(args.need);
  // A callback still needs a service to name; where the need has none bookable,
  // the general consultation is what reception is being asked to call about.
  const serviceId = plan.serviceId ?? "gp-consult";
  try {
    return healthRequestCallback(
      { siteId: args.siteId, serviceId, patient: { waNumber: args.waNumber, displayName: args.displayName }, preferredWindowAr: args.preferredWindowAr },
      { store, now: now.toISOString(), ...DEMO },
    );
  } catch {
    return null;
  }
}

export function cancel(ref: string, now: Date, store: FaysalStore): boolean {
  try {
    healthCancelBooking(ref, { store, now: now.toISOString(), ...DEMO });
    return true;
  } catch {
    return false;
  }
}

// ── money ───────────────────────────────────────────────────────────────────

/**
 * Rule PRICE-1/PRICE-2: the ONE calculator, and the label travels with the
 * figure. `quote()` THROWS for a service §9.4 deliberately leaves unpriced (lab,
 * radiology, ER, day-case, an extraction) — that throw is the honest answer and
 * it is turned into `null` here so the caller runs `price.not_loaded` rather than
 * inventing a range.
 */
export function price(serviceId: string, siteId: SiteId): PriceAnswer | null {
  try {
    return healthPriceFor(serviceId, siteId);
  } catch {
    return null;
  }
}

/**
 * Rule PKG-1 — «باقة ٦ جلسات بسعر ٥», with the sentence and the numbers pinned to
 * each other mechanically inside the engine. This only reads the pair back.
 */
export function packageFor(serviceId: string): {
  sessionAr: string;
  sessionAmount: number;
  packageAr: string;
  packageAmount: number;
  sessions: number;
  paidSessions: number;
  termsAr: string | null;
} | null {
  const p = healthPackageFor(serviceId);
  if (!p) return null;
  return {
    sessionAr: serviceNameAr(p.sessionId),
    sessionAmount: p.sessionAmount,
    packageAr: serviceNameAr(p.packageId),
    packageAmount: p.packageAmount,
    sessions: p.sessions,
    paidSessions: p.paidSessions,
    termsAr: serviceTermsAr(p.packageId),
  };
}

/**
 * WHO IS ACTUALLY IN THIS CLINIC, BY GENDER — the honest answer to «أبغى دكتورة»
 * and «أبغى دكتور رجّال».
 *
 * Rule DOC-1 makes gender a FILTER, never a recommendation, and the product had no
 * way to apply the filter: it answered every gendered request with the same
 * promise-nothing paragraph and booked whoever the slot generator produced. On the
 * demo's busiest path — dermatology and laser at Ar Rawabi — that meant a patient
 * asking for a male dermatologist was quietly booked with one of the two women who
 * work there.
 *
 * There is no third answer to invent here. Either the branch has someone, or
 * another branch does, or nobody does and that is a thing to say out loud.
 */
export function genderAvailability(
  siteId: SiteId,
  need: DemoNeed | null,
  wanted: "female" | "male",
): { hereAr: string | null; elsewhereAr: string | null; elsewhereId: SiteId | null } {
  const plan = planFor(need);
  const service = plan.serviceId ? serviceById(plan.serviceId) : null;
  if (!service) return { hereAr: null, elsewhereAr: null, elsewhereId: null };
  const specialty = service.specialty;
  const matches = (id: SiteId) =>
    isBookableSpecialty(id, specialty, DEMO.demoMode) &&
    cliniciansFor(id, specialty).some((clinician) => clinician.gender === wanted);
  if (matches(siteId)) return { hereAr: SITES[siteId].shortAr, elsewhereAr: null, elsewhereId: null };
  const other = (Object.keys(SITES) as SiteId[]).find((id) => id !== siteId && matches(id)) ?? null;
  return { hereAr: null, elsewhereAr: other ? SITES[other].shortAr : null, elsewhereId: other };
}

export const serviceNameAr = (serviceId: string): string => serviceById(serviceId)?.nameAr ?? serviceId;
export const serviceTermsAr = (serviceId: string): string | null => serviceById(serviceId)?.termsAr ?? null;
export { SERVICES };

// ── insurance ───────────────────────────────────────────────────────────────

export function insurance(carrier: string, siteId: SiteId) {
  return healthInsuranceAnswer(carrier, siteId);
}

/**
 * The payer as the engine names it, or null when the text names no payer we know.
 *
 * `lib/health`'s own `carrierNameAr` echoes the input back when it recognises
 * nothing, which is right for rendering and wrong for DETECTION — the classifier
 * must be able to tell «عندي بوبا» from «عندي موعد». So recognition goes through
 * `payerByName`, and Rule INS-2 holds either way: a `directory_source` is never
 * named to a patient as an accepted payer.
 */
export const carrierNameAr = (raw: string): string | null => {
  const p = payerByName(raw);
  return p && p.kind !== "directory_source" ? p.nameAr : null;
};
export { healthCarrierNameAr as renderCarrierNameAr };

// ── safety (SPEC-4) ─────────────────────────────────────────────────────────

export interface RedFlagVerdict {
  fired: boolean;
  cls: string | null;
  tier: "emergency" | "urgent" | null;
  ruleId: string;
  label: string | null;
}

/**
 * The union `isFaysalSafetyInbound` — pre-model, pure, total, and degrading a
 * throw or a non-conforming return to `emergency`, never to `urgent` (§1.5 R3).
 * This app calls nothing else on the safety path.
 */
export function readRedFlag(text: string): RedFlagVerdict {
  const v = isFaysalSafetyInbound(text);
  return { fired: v.fired, cls: v.class, tier: v.tier, ruleId: v.ruleId ?? "none", label: v.label };
}

/**
 * SPEC-4 §4.2's verbatim copy. Branch B is what this surface reaches, and that is
 * §4.4's instruction rather than a shortfall: branch A requires an ER site whose
 * `hours_verified_at` is inside 30 days with a named verifier, and no site in this
 * build carries one. "Branch B is not a degraded fallback to be avoided… it must
 * be the default the code reaches when anything is uncertain."
 */
export function emergencyRailText(verdict: RedFlagVerdict): string {
  return emergencyRail({
    cls: (verdict.cls ?? null) as never,
    tier: (verdict.tier ?? "emergency") as never,
    sites: [],
    now: new Date(),
  }).text;
}

/** SPEC-4 §4.1 — the rail's stop reason, on every branch A, B and C. */
export const RAIL_STOP_REASON = "faysal_redflag_emergency";
