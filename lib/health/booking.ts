// ============================================================================
// فيصل / Faysal — hold-then-confirm. SPEC-1-DOMAIN.md §7.5, §7.6, §4.6, §11.
//
// WhatsApp is asynchronous, so the two-phase shape is not optional: between
// "10:30 works" and the patient's confirmation there is a real gap in which
// someone else must not take the slot, and in which we must not have told a
// clinic to expect anyone.
//
//   HOLD-1  a hold is NOT a booking. Faysal never says «تم الحجز» for a held slot.
//   HOLD-2  one active hold per WhatsApp identity; a new hold RELEASES the old
//           one atomically. A family block counts as one.
//   HOLD-3  expiry is enforced server-side ON READ, never by a client timer.
//   HOLD-4  confirm() is IDEMPOTENT on the hold token. A double-tap returns the
//           same appointmentId, never a second appointment.
//   HOLD-5  confirm() RE-VALIDATES the window before writing. A confirm whose
//           window became unbookable fails with `hours_changed_reverify` — the
//           direct analogue of order-pricing.ts recomputing rather than trusting
//           the draft's stored price.
//   HOLD-6  confirming at a contested site yields pendingBranchConfirmation.
//   FAM-1…7 family blocks: atomic, contiguous, one site, one day, one hold.
//   MED-6   cancellation is never argued and no penalty is quoted. [OPEN-09]
// ============================================================================

import {
  DEMO_BOOKING_SUFFIX_AR,
  FAYSAL_FAMILY_MAX_GAP_MINUTES,
  FAYSAL_HOLD_TTL_MS,
  demoModeFromEnv,
} from "./config";
import { serviceById } from "./catalogue";
import { clinicianById } from "./clinicians";
import { formatPhoneAr, isContested, patientPhoneFor, siteById } from "./sites";
import {
  fnv1a32,
  meetsLeadTime,
  parseSlotId,
  slotFromId,
  slotIsStillBookable,
  type GenerateOpts,
} from "./slots";
import {
  activeHoldFor,
  appointmentIdForHold,
  defaultStore,
  expireStaleHolds,
  holdBySlotId,
  type FaysalStore,
} from "./store";
import { dayKeyOf, isFriday, minutesOf } from "./time";
import type { Appointment, Hold, PatientRef, SiteId, Slot } from "./types";

export interface BookingOpts extends GenerateOpts {
  store?: FaysalStore;
  now?: string;
}

function ctx(opts: BookingOpts): { store: FaysalStore; now: string; demoMode: boolean } {
  const now = opts.now ?? new Date().toISOString();
  return {
    store: opts.store ?? defaultStore,
    now,
    demoMode: opts.demoMode ?? demoModeFromEnv(),
  };
}

export interface HoldResult {
  holdId: string;
  expiresAt: string;
}

/**
 * Reserve a slot for ten minutes. NOT a booking (HOLD-1).
 *
 * Re-holding a slot you already hold is idempotent. Holding a different slot
 * releases your previous hold in the same synchronous block — there are no
 * accumulating locks from an indecisive conversation (HOLD-2).
 */
export function holdSlot(slotId: string, who: PatientRef, opts: BookingOpts = {}): HoldResult {
  const { store, now, demoMode } = ctx(opts);
  const o: BookingOpts = { ...opts, now, demoMode };
  expireStaleHolds(store, now);

  if (!who?.waNumber) throw new Error("patient_required");

  const slot = slotFromId(slotId, o);
  if (!slot) throw new Error("slot_unbookable");
  if (!meetsLeadTime(slot, now)) throw new Error("lead_time_too_short");

  const existing = holdBySlotId(store, slotId, now);
  if (existing) {
    if (existing.patient.waNumber !== who.waNumber) throw new Error("slot_taken");
    if (existing.state === "active") return { holdId: existing.holdId, expiresAt: existing.expiresAt };
    if (existing.state === "confirmed") throw new Error("already_confirmed");
  }
  if (isSlotBooked(store, slotId)) throw new Error("slot_taken");

  return mintHold(store, [slotId], who, now);
}

function isSlotBooked(store: FaysalStore, slotId: string): boolean {
  for (const appt of store.appointments.values()) {
    if ((appt.state === "confirmed" || appt.state === "checked_in") && appt.slotIds.includes(slotId)) {
      return true;
    }
  }
  return false;
}

function mintHold(store: FaysalStore, slotIds: string[], who: PatientRef, now: string): HoldResult {
  // HOLD-2 — release the patient's previous hold FIRST, in the same synchronous
  // block, so the two states can never both be live.
  const prev = activeHoldFor(store, who.waNumber, now);
  if (prev) {
    prev.state = "released";
    store.activeHoldByPatient.delete(who.waNumber);
  }

  store.seq += 1;
  const holdId = `hold_${fnv1a32(`${slotIds.join(",")}|${who.waNumber}|${now}|${store.seq}`).toString(36)}${store.seq}`;
  const expiresAt = new Date(Date.parse(now) + FAYSAL_HOLD_TTL_MS).toISOString();
  const hold: Hold = {
    holdId,
    slotId: slotIds[0],
    slotIds: [...slotIds],
    patient: who,
    createdAt: now,
    expiresAt,
    state: "active",
  };
  store.holds.set(holdId, hold);
  store.activeHoldByPatient.set(who.waNumber, holdId);
  return { holdId, expiresAt };
}

/** Give the inventory back before the TTL. */
export function releaseHold(holdId: string, opts: BookingOpts = {}): void {
  const { store, now } = ctx(opts);
  expireStaleHolds(store, now);
  const hold = store.holds.get(holdId);
  if (!hold || hold.state !== "active") return;
  hold.state = "released";
  if (store.activeHoldByPatient.get(hold.patient.waNumber) === holdId) {
    store.activeHoldByPatient.delete(hold.patient.waNumber);
  }
}

/**
 * Turn a hold into an appointment.
 *
 * HOLD-4 — idempotent on the hold token: a second confirm returns the SAME
 * appointmentId. WhatsApp double-taps and network retries are routine.
 * HOLD-5 — the window is RE-VALIDATED here. Hours can be edited during the ten
 * minutes; a hold must never become an appointment in a window that stopped
 * being open while the patient was typing.
 */
export function confirmBooking(holdId: string, patient: PatientRef, opts: BookingOpts = {}): Appointment {
  const { store, now, demoMode } = ctx(opts);
  const o: BookingOpts = { ...opts, now, demoMode };
  expireStaleHolds(store, now);

  const hold = store.holds.get(holdId);
  if (!hold) throw new Error("hold_unknown");
  if (patient?.waNumber && hold.patient.waNumber !== patient.waNumber) throw new Error("patient_mismatch");

  const appointmentId = appointmentIdForHold(holdId);
  const already = store.appointments.get(appointmentId);
  if (hold.state === "confirmed" && already) return already; // HOLD-4
  if (hold.state === "expired" || Date.parse(hold.expiresAt) <= Date.parse(now)) {
    throw new Error("hold_expired");
  }
  if (hold.state === "released") throw new Error("hold_released");

  // HOLD-5 — every leg, every time. Nothing is trusted from ten minutes ago.
  const slots: Slot[] = [];
  for (const slotId of hold.slotIds) {
    if (!slotIsStillBookable(slotId, o)) throw new Error("hours_changed_reverify");
    const slot = slotFromId(slotId, o);
    if (!slot) throw new Error("hours_changed_reverify");
    slots.push(slot);
  }

  const first = slots[0];
  const last = slots[slots.length - 1];
  const appointment: Appointment = {
    appointmentId,
    ref: bookingRef(appointmentId),
    kind: "slot",
    state: "confirmed",
    siteId: first.siteId,
    clinicianId: first.clinicianId,
    serviceId: first.serviceId,
    dateISO: first.dateISO,
    start: first.start,
    end: last.end,
    preferredWindowAr: null,
    // Identity is the HOLD's number (checked above); the name is whatever the patient
    // gave by the time they said yes. A hold placed as «ضيف العرض التجريبي» and
    // confirmed as «محمد الشهري» is one patient who typed a name — not two patients.
    patient: { ...hold.patient, displayName: patient?.displayName?.trim() || hold.patient.displayName },
    // HOLD-6 / Rule C4-1 — a contested branch never renders a bare "confirmed".
    pendingBranchConfirmation: isContested(first.siteId),
    branchPhone: patientPhoneFor(first.siteId),
    createdAt: now,
    source: "faysal_demo",
    isTest: true,
    demoSeeded: slots.some((s) => s.demoSeeded),
    slotIds: [...hold.slotIds],
  };

  store.appointments.set(appointmentId, appointment);
  hold.state = "confirmed";
  if (store.activeHoldByPatient.get(hold.patient.waNumber) === holdId) {
    store.activeHoldByPatient.delete(hold.patient.waNumber);
  }
  return appointment;
}

function bookingRef(appointmentId: string): string {
  return `FSL-${fnv1a32(appointmentId).toString(36).toUpperCase()}`;
}

/**
 * §4.6 — the Complex 4 path, and the production path for every site once
 * DEMO_MODE is off. It captures the patient's name, need and PREFERRED WINDOW
 * IN THEIR OWN WORDS, states that the branch confirms the time by phone, and
 * gives the branch number. It consumes no slot inventory and NEVER renders a
 * time the patient could turn up for (§14 criterion 10).
 */
export function requestCallback(
  args: { siteId: SiteId; serviceId: string; patient: PatientRef; preferredWindowAr: string },
  opts: BookingOpts = {}
): Appointment {
  const { store, now } = ctx(opts);
  const site = siteById(args.siteId);
  if (!serviceById(args.serviceId)) throw new Error(`service_unknown:${args.serviceId}`);
  if (/\d{1,2}[:：]\d{2}/.test(args.preferredWindowAr)) {
    // The preferred window is a COARSE window in the patient's own words
    // («الصبح», «بعد العصر») — never a clock time, because a clock time we echo
    // back reads as a time we offered.
    throw new Error("preferred_window_must_not_be_a_clock_time");
  }

  store.seq += 1;
  const appointmentId = `cb_${fnv1a32(`${args.siteId}|${args.patient.waNumber}|${now}|${store.seq}`).toString(36)}`;
  const appointment: Appointment = {
    appointmentId,
    ref: bookingRef(appointmentId),
    kind: "callback_request",
    state: "confirmed",
    siteId: args.siteId,
    clinicianId: null,
    serviceId: args.serviceId,
    dateISO: null,
    start: null,
    end: null,
    preferredWindowAr: args.preferredWindowAr,
    patient: args.patient,
    pendingBranchConfirmation: site.operatingStatus.requiresLiveConfirmation || isContested(args.siteId),
    branchPhone: patientPhoneFor(args.siteId),
    createdAt: now,
    source: "faysal_demo",
    isTest: true,
    demoSeeded: true,
    slotIds: [],
  };
  store.appointments.set(appointmentId, appointment);
  return appointment;
}

/** MED-6 — cancel on request, without friction, quoting no penalty. Idempotent. */
export function cancelBooking(ref: string, opts: BookingOpts = {}): void {
  const { store, now } = ctx(opts);
  expireStaleHolds(store, now);
  const appt =
    store.appointments.get(ref) ??
    [...store.appointments.values()].find((a) => a.ref === ref) ??
    null;
  if (!appt) throw new Error(`booking_unknown:${ref}`);
  if (appt.state === "cancelled") return;
  appt.state = "cancelled";
  for (const hold of store.holds.values()) {
    if (hold.state === "confirmed" && hold.slotIds.some((id) => appt.slotIds.includes(id))) {
      hold.state = "released";
    }
  }
}

export function appointmentByRef(ref: string, opts: BookingOpts = {}): Appointment | null {
  const { store } = ctx(opts);
  return store.appointments.get(ref) ?? [...store.appointments.values()].find((a) => a.ref === ref) ?? null;
}

/** The name the demo surface's swap point uses for the same lookup. */
export const getBooking = appointmentByRef;

// ── §7.6 Family blocks ──────────────────────────────────────────────────────

export interface FamilyLeg {
  slotId: string;
  patientLabel: string;
}

/**
 * FAM-1 ATOMIC — all legs hold or none do. A partial family block is worse than
 * a refusal: it commits the family to a trip that only half works.
 * FAM-2 contiguous, ≤ 15 minutes between legs INCLUDING each leg's buffer.
 * FAM-3 one site, one day. FAM-6 one hold, one confirmation.
 */
export function holdFamilyBlock(legs: FamilyLeg[], who: PatientRef, opts: BookingOpts = {}): HoldResult {
  const { store, now, demoMode } = ctx(opts);
  const o: BookingOpts = { ...opts, now, demoMode };
  expireStaleHolds(store, now);
  if (legs.length === 0) throw new Error("family_block_empty");

  const refs = legs.map((l) => parseSlotId(l.slotId));
  const sites = new Set(refs.map((r) => r.siteId));
  const days = new Set(refs.map((r) => r.dateISO));
  if (sites.size > 1) throw new Error("family_block_multi_site"); // FAM-3
  if (days.size > 1) throw new Error("family_block_multi_day"); // FAM-3

  // FAM-4 — every leg must sit inside ITS OWN clinic's bookable windows. The
  // intersection is computed per leg, never once for the site.
  const slots: Slot[] = [];
  for (const leg of legs) {
    const slot = slotFromId(leg.slotId, o);
    if (!slot) throw new Error("family_block_leg_unbookable");
    if (!meetsLeadTime(slot, now)) throw new Error("lead_time_too_short");
    if (holdBySlotId(store, leg.slotId, now) || isSlotBooked(store, leg.slotId)) {
      throw new Error("family_block_leg_taken");
    }
    slots.push(slot);
  }

  slots.sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
  for (let i = 1; i < slots.length; i++) {
    const gap = minutesOf(slots[i].start) - minutesOf(slots[i - 1].blockEnd);
    if (gap < 0) throw new Error("family_block_overlaps");
    if (gap > FAYSAL_FAMILY_MAX_GAP_MINUTES) throw new Error("family_block_not_contiguous"); // FAM-2
  }

  // FAM-6 — ONE hold covering all legs, and one confirmation.
  return mintHold(store, slots.map((s) => s.slotId), who, now);
}

// ── Rule DEMO-1(c) — the suffix that survives a screenshot ──────────────────

/**
 * The confirmation block, emitted by the RENDERER and never by the model.
 *
 * SPEC-2-PERSONA.md §6.7 owns the block's wording and its atomicity (its own
 * message, nothing appended, no question glued on). What this function
 * guarantees is the part SPEC-1 owns: «حجز تجريبي — غير مسجّل لدى الفرع.»
 * renders on EVERY confirmation — `slot` and `callback_request`, contested and
 * operational — while any of the booking's data carries a demo basis. There is
 * no branch of this code that emits a confirmation without it.
 *
 * Rule C4-1: a contested branch never renders a bare "confirmed" — the block
 * says the status is being reconfirmed and carries the branch number.
 * Rule FRI-1: a Friday appointment always carries the branch phone.
 */
export function renderConfirmationBlock(appt: Appointment): string {
  const site = siteById(appt.siteId);
  const clinician = appt.clinicianId ? clinicianById(appt.clinicianId) : null;
  const service = serviceById(appt.serviceId);
  const lines: string[] = [];

  if (appt.kind === "callback_request") {
    lines.push("تم تسجيل طلبك ✅", "");
    lines.push(`الاسم: ${appt.patient.displayName}`);
    lines.push(`الفرع: ${site.nameAr} — ${addressLine(site)}`);
    if (service) lines.push(`العيادة: ${service.nameAr}`);
    // NO «الموعد» row at all — not a greyed one, not a provisional one.
    lines.push(`الوقت اللي تفضّله: ${appt.preferredWindowAr ?? ""}`.trim());
    lines.push(`الفرع يتصل عليك ويثبت الوقت. ولو تبي تستعجل: ${formatPhoneAr(appt.branchPhone)}`);
  } else {
    lines.push("تم الحجز ✅", "");
    lines.push(`الاسم: ${appt.patient.displayName}`);
    lines.push(`الفرع: ${site.nameAr} — ${addressLine(site)}`);
    if (service) lines.push(`العيادة: ${service.nameAr}${clinician ? ` مع ${clinician.nameAr}` : ""}`);
    lines.push(`الموعد: ${spokenWhen(appt.dateISO, appt.start)}`);
    if (appt.pendingBranchConfirmation) {
      lines.push(`وضع الفرع نأكده لك بالاتصال قبل الموعد — رقم الفرع ${formatPhoneAr(appt.branchPhone)}.`);
    }
    if (appt.dateISO && isFriday(appt.dateISO)) {
      // FRI-1 — no exceptions, including at sites whose Friday confidence is medium.
      lines.push(`ويوم الجمعة الدوام يضيق، فأنصحك تتصل على ${formatPhoneAr(appt.branchPhone)} قبل ما تجي.`);
    }
  }

  lines.push("", DEMO_BOOKING_SUFFIX_AR);
  const block = lines.join("\n");
  assertConfirmationMarkers(block, appt);
  return block;
}

/**
 * SPEC-2 §3.4 — Western digits, 12-hour with ص/م, never 24-hour, and the day
 * named in Arabic. The WORDING around it is SPEC-2's; this is the format that
 * document pins, and an ISO timestamp in a patient's confirmation fails it.
 */
const DAY_AR_SHORT: Record<string, string> = {
  sat: "السبت",
  sun: "الأحد",
  mon: "الاثنين",
  tue: "الثلاثاء",
  wed: "الأربعاء",
  thu: "الخميس",
  fri: "الجمعة",
};

/**
 * §3 — the Arabic address where the dossier gives one; otherwise the district in
 * Arabic followed by the street as published. We do NOT translate an address
 * Faysal has never been given (Rule B-1's discipline applied to geography): an
 * invented Arabic street name is a fabricated fact about the client's premises.
 */
function addressLine(site: { addressAr: string | null; addressEn: string; district: { ar: string } }): string {
  return site.addressAr ?? `حي ${site.district.ar} — ${site.addressEn}`;
}

function spokenTime(hhmm: string): string {
  const total = minutesOf(hhmm);
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const meridiem = h24 >= 12 ? "م" : "ص";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${meridiem}`;
}

function spokenWhen(dateISO: string | null, start: string | null): string {
  if (!dateISO || !start) return "";
  const [, month, day] = dateISO.split("-");
  return `${DAY_AR_SHORT[dayKeyOf(dateISO)]} ${Number(day)}/${Number(month)} — ${spokenTime(start)}`;
}

/** A disclaimer a model can forget is not a disclaimer — so this throws. */
export function assertConfirmationMarkers(block: string, appt: Appointment): void {
  if (!block.includes(DEMO_BOOKING_SUFFIX_AR)) throw new Error("demo1c_violated:suffix_missing");
  if (appt.kind === "callback_request" && /الموعد:/.test(block)) {
    throw new Error("callback_rendered_a_time"); // §4.6 / criterion 10
  }
  if (appt.pendingBranchConfirmation && !block.includes(formatPhoneAr(appt.branchPhone))) {
    throw new Error("c4_1_violated:no_phone");
  }
  if (appt.kind === "slot" && appt.dateISO && isFriday(appt.dateISO) && !block.includes(formatPhoneAr(appt.branchPhone))) {
    throw new Error("fri1_violated:no_phone");
  }
}
