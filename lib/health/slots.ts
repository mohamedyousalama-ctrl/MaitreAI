// ============================================================================
// فيصل / Faysal — deterministic slot generation. SPEC-1-DOMAIN.md §7.
//
// Availability in the demo is GENERATED, NOT STORED — but generated
// deterministically, so the same query returns the same day forever and the
// salesperson's screen matches the client's phone.
//
//   seed = fnv1a32(`${siteId}|${clinicianId}|${dateISO}|${FAYSAL_SLOT_SALT}`)
//   rng  = xorshift32(seed)        // pure; no Math.random anywhere in this path
//
// Generation, in order (§7.2):
//   1. take bookableWindows(site, "clinic", day). EMPTY ⇒ NO SLOTS. This is the
//      gate everything else sits behind; there is no path that mints a slot
//      without passing it (Invariant H1).
//   2. lay a 15-minute grid across each window, aligned to the window's open
//   3. drop grid points that cannot fit duration + buffer before close (BUF-2)
//   4. mark points busy with a fixed, documented occupancy curve [INF-10]
//   5. subtract holds and confirmed appointments
//   6. subtract device/room reservations (§7.4)
// ============================================================================

import {
  FAYSAL_BOOKING_HORIZON_DAYS,
  FAYSAL_MAX_SLOTS_PER_REPLY,
  FAYSAL_MIN_LEAD_MINUTES,
  FAYSAL_SLOT_GRID_MINUTES,
  FAYSAL_SLOT_SALT,
  demoModeFromEnv,
} from "./config";
import { cliniciansFor, isBookableSpecialty } from "./clinicians";
import { serviceById } from "./catalogue";
import { bookableWindows, type HoursOpts } from "./hours";
import { isContested, isSiteId, patientPhoneFor } from "./sites";
import { SITE_IDS } from "./sites";
import { defaultStore, takenSlotIds, type FaysalStore } from "./store";
import { addDays, dayKeyOf, hhmmOf, localDateOf, minutesOf } from "./time";
import type { CatalogueService, Slot, SlotQuery, SiteId, Window } from "./types";

// ── the PRNG. Pure, seeded, and reproducible across processes ───────────────

export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619, in 32-bit arithmetic that survives JS number precision.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function xorshift32(seed: number): () => number {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x1_0000_0000;
  };
}

/**
 * [INF-10] — demand peaks 09:00–11:00 and 17:00–20:00, the peaks implied by
 * Complex 1's published clinic-shift pattern. A FIXED, DOCUMENTED curve: the
 * same hour on the same day at the same site always carries the same pressure.
 */
export function busyProbability(hour: number, dayKey: string): number {
  const peak = (hour >= 9 && hour < 11) || (hour >= 17 && hour < 20);
  const base = peak ? 0.62 : 0.32;
  // Friday is a compressed day everywhere in this group — fewer sessions, and
  // the ones that run are not the weekday rush.
  const friday = dayKey === "fri" ? -0.1 : 0;
  return Math.min(0.95, Math.max(0, base + friday));
}

// ── slot ids: deterministic, self-describing, and parseable ────────────────

export interface SlotRef {
  siteId: SiteId;
  clinicianId: string;
  serviceId: string;
  dateISO: string;
  start: string;
}

export function slotIdOf(ref: SlotRef): string {
  return `${ref.siteId}|${ref.clinicianId}|${ref.serviceId}|${ref.dateISO}|${ref.start}`;
}

export function parseSlotId(slotId: string): SlotRef {
  const parts = String(slotId ?? "").split("|");
  if (parts.length !== 5) throw new Error(`slot_id_malformed:${slotId}`);
  const [siteId, clinicianId, serviceId, dateISO, start] = parts;
  if (!isSiteId(siteId)) throw new Error(`slot_id_malformed:${slotId}`);
  return { siteId, clinicianId, serviceId, dateISO, start };
}

// ── generation ──────────────────────────────────────────────────────────────

export interface GenerateOpts extends HoursOpts {
  store?: FaysalStore;
}

function toSlot(
  ref: SlotRef,
  service: CatalogueService,
  window: Window
): Slot {
  const startMin = minutesOf(ref.start);
  return {
    slotId: slotIdOf(ref),
    siteId: ref.siteId,
    clinicianId: ref.clinicianId,
    serviceId: ref.serviceId,
    dateISO: ref.dateISO,
    dayKey: window.dayKey,
    start: ref.start,
    end: hhmmOf(startMin + service.durationMinutes),
    blockEnd: hhmmOf(startMin + service.durationMinutes + service.bufferMinutes),
    durationMinutes: service.durationMinutes,
    bufferMinutes: service.bufferMinutes,
    state: "offered",
    demoSeeded: window.demoSeeded,
    pendingBranchConfirmation: window.pendingBranchConfirmation,
    isFriday: window.isFriday,
    branchPhone: window.branchPhone,
  };
}

/**
 * Every slot a clinician could offer for a service on a date, BEFORE holds and
 * appointments are subtracted. Pure given `opts.now` and `opts.demoMode`.
 */
export function generateDaySlots(
  siteId: SiteId,
  clinicianId: string,
  serviceId: string,
  dateISO: string,
  opts: GenerateOpts = {}
): Slot[] {
  const service = serviceById(serviceId);
  if (!service) throw new Error(`service_unknown:${serviceId}`);
  if (service.priceOnly) throw new Error(`service_not_bookable:${serviceId}`);

  // (1) THE GATE. Empty ⇒ no slots. There is no other path into inventory.
  const windows = bookableWindows(siteId, dateISO, opts);
  if (windows.length === 0) return [];

  const dayKey = dayKeyOf(dateISO);
  const rng = xorshift32(fnv1a32(`${siteId}|${clinicianId}|${dateISO}|${FAYSAL_SLOT_SALT}`));
  const out: Slot[] = [];

  for (const w of windows) {
    const open = minutesOf(w.open);
    const close = minutesOf(w.close);
    // (2) the 15-minute grid, aligned to the window's own open.
    for (let t = open; t < close; t += FAYSAL_SLOT_GRID_MINUTES) {
      // (4) one draw per grid point, in a fixed order, so the busy pattern is a
      // property of the DAY and not of the service that happened to be asked for.
      const busy = rng() < busyProbability(Math.floor(t / 60), dayKey);
      // (3) BUF-2 — the buffer may not overhang the close. A 30-minute laser
      // session at 23:45 in a window closing at 24:00 is exactly the kind of
      // slot that produces a patient in an empty corridor.
      const fits = t + service.durationMinutes + service.bufferMinutes <= close;
      if (busy || !fits) continue;
      out.push(toSlot({ siteId, clinicianId, serviceId, dateISO, start: hhmmOf(t) }, service, w));
    }
  }
  return out;
}

// ── search ──────────────────────────────────────────────────────────────────

interface BusyInterval {
  clinicianId: string;
  siteId: SiteId;
  fromMin: number;
  toMin: number;
  device: boolean;
}

function busyIntervals(store: FaysalStore, dateISO: string, nowISO: string): BusyInterval[] {
  const out: BusyInterval[] = [];
  for (const slotId of takenSlotIds(store, nowISO)) {
    let ref: SlotRef;
    try {
      ref = parseSlotId(slotId);
    } catch {
      continue;
    }
    if (ref.dateISO !== dateISO) continue;
    const service = serviceById(ref.serviceId);
    if (!service) continue;
    const from = minutesOf(ref.start);
    out.push({
      clinicianId: ref.clinicianId,
      siteId: ref.siteId,
      fromMin: from,
      toMin: from + service.durationMinutes + service.bufferMinutes,
      device: service.resourceKind === "device",
    });
  }
  return out;
}

function overlaps(a: { fromMin: number; toMin: number }, b: { fromMin: number; toMin: number }): boolean {
  return a.fromMin < b.toMin && b.fromMin < a.toMin;
}

/**
 * §7.4 — laser sessions consume the site's laser device. The dossier names ONE
 * device at Complex 2, from patient reviews [D §3.2 L146], modelled capacity 1
 * [INF-11]: over-constraining loses a demo slot, under-constraining double-books
 * a laser room. Rule RES-1 — Faysal NEVER names the device to the patient, and
 * nothing in this module carries its brand.
 */
export const RESOURCES = Object.freeze([
  { id: "wattan-2-laser-1", siteId: "wattan-2" as SiteId, kind: "device" as const, capacity: 1 },
  { id: "shoaa-wurud-laser-1", siteId: "shoaa-wurud" as SiteId, kind: "device" as const, capacity: 1 },
]);

function deviceCapacity(siteId: SiteId): number {
  return RESOURCES.filter((r) => r.siteId === siteId && r.kind === "device").reduce((n, r) => n + r.capacity, 0);
}

/**
 * THE slot search. Rule SLOT-1: offering is not holding — this reserves
 * nothing, costs nothing, and returns at most FAYSAL_MAX_SLOTS_PER_REPLY.
 */
export function searchSlots(q: SlotQuery, opts: GenerateOpts = {}): Slot[] {
  const service = serviceById(q.serviceId);
  if (!service) throw new Error(`service_unknown:${q.serviceId}`);
  if (service.priceOnly) throw new Error(`service_not_bookable:${q.serviceId}`);

  const store = opts.store ?? defaultStore;
  const now = q.now ?? opts.now ?? new Date().toISOString();
  // ONE read of DEMO_MODE per call, then passed explicitly to everything that
  // needs it — the same law as PRICE-2's single calculator.
  const demoMode = q.demoMode ?? opts.demoMode ?? demoModeFromEnv();
  const hoursOpts: GenerateOpts = { ...opts, now, demoMode };

  const today = localDateOf(now);
  const dates = datesFor(q, today);
  const sites = (q.siteIds ?? (q.siteId ? [q.siteId] : SITE_IDS)).filter(isSiteId);
  const limit = Math.max(1, q.limit ?? FAYSAL_MAX_SLOTS_PER_REPLY);

  const found: Slot[] = [];
  for (const dateISO of dates) {
    const busy = busyIntervals(store, dateISO, now);
    for (const siteId of sites) {
      // Rule SPEC-1 — a `group_only` or `inferred` capability is conversational,
      // never bookable. The group offering ophthalmology somewhere is not
      // evidence that Ar Rawdah has an ophthalmologist on Tuesday.
      if (!isBookableSpecialty(siteId, service.specialty, demoMode)) continue;

      const clinicians = cliniciansFor(siteId, service.specialty)
        .filter((c) => (q.clinicianId ? c.id === q.clinicianId : true))
        .filter((c) => (q.gender ? c.gender === q.gender : true))
        .filter((c) => (q.language ? c.languages.includes(q.language) : true))
        .sort((a, b) => a.id.localeCompare(b.id));

      const deviceCap = deviceCapacity(siteId);
      const dayDeviceBusy = busy.filter((b) => b.device && b.siteId === siteId);

      for (const clinician of clinicians) {
        for (const slot of generateDaySlots(siteId, clinician.id, service.id, dateISO, hoursOpts)) {
          if (!meetsLeadTime(slot, now)) continue;

          const span = { fromMin: minutesOf(slot.start), toMin: minutesOf(slot.blockEnd) };
          // (5) subtract this clinician's own holds and appointments.
          if (busy.some((b) => b.clinicianId === clinician.id && overlaps(span, b))) continue;
          // (6) subtract the site's device reservations. Capacity 1 means one
          // laser session at a time at that site, whoever is running it.
          if (service.resourceKind === "device") {
            const concurrent = dayDeviceBusy.filter((b) => overlaps(span, b)).length;
            if (concurrent >= deviceCap) continue;
            // Two clinicians cannot both be offered the same laser minute AT THE
            // SAME SITE ON THE SAME DAY. (Without the date, an offer on Sunday
            // would silently suppress the same clock time on Monday.)
            const clash = found.some(
              (s) =>
                s.siteId === siteId &&
                s.dateISO === dateISO &&
                serviceUsesDevice(s.serviceId) &&
                overlaps(span, { fromMin: minutesOf(s.start), toMin: minutesOf(s.blockEnd) })
            );
            if (clash) continue;
          }
          found.push(slot);
        }
      }
    }
  }

  return found
    .sort(
      (a, b) =>
        a.dateISO.localeCompare(b.dateISO) ||
        minutesOf(a.start) - minutesOf(b.start) ||
        a.siteId.localeCompare(b.siteId) ||
        a.clinicianId.localeCompare(b.clinicianId)
    )
    .slice(0, limit);
}

function serviceUsesDevice(serviceId: string): boolean {
  return serviceById(serviceId)?.resourceKind === "device";
}

/** FAYSAL_MIN_LEAD_MINUTES — a same-day slot at 14:55 for 15:00 is a walk-in. */
export function meetsLeadTime(slot: Slot, nowISO: string): boolean {
  const now = new Date(nowISO);
  const startMs = Date.parse(`${slot.dateISO}T${slot.start === "24:00" ? "23:59" : slot.start}:00+03:00`);
  return startMs - now.getTime() >= FAYSAL_MIN_LEAD_MINUTES * 60_000;
}

function datesFor(q: SlotQuery, today: string): string[] {
  const horizonEnd = addDays(today, FAYSAL_BOOKING_HORIZON_DAYS);
  if (q.dateISO) {
    // FAYSAL_BOOKING_HORIZON_DAYS — beyond it Faysal takes a callback request
    // rather than inventing a schedule three months out.
    if (q.dateISO < today || q.dateISO > horizonEnd) return [];
    return [q.dateISO];
  }
  const from = q.dateFromISO && q.dateFromISO > today ? q.dateFromISO : today;
  const to = q.dateToISO && q.dateToISO < horizonEnd ? q.dateToISO : horizonEnd;
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Invariant H1, as a predicate — the ONE question holdSlot() and
 * confirmBooking() ask before they write anything.
 */
export function slotIsStillBookable(slotId: string, opts: GenerateOpts = {}): boolean {
  let ref: SlotRef;
  try {
    ref = parseSlotId(slotId);
  } catch {
    return false;
  }
  const service = serviceById(ref.serviceId);
  if (!service || service.priceOnly) return false;

  const windows = bookableWindows(ref.siteId, ref.dateISO, opts);
  if (windows.length === 0) return false;

  const start = minutesOf(ref.start);
  const end = start + service.durationMinutes + service.bufferMinutes;
  const inside = windows.some((w) => start >= minutesOf(w.open) && end <= minutesOf(w.close));
  if (!inside) return false;

  // The clinician must still exist and still serve this site and specialty.
  const staffed = cliniciansFor(ref.siteId, service.specialty).some((c) => c.id === ref.clinicianId);
  if (!staffed) return false;

  const demoMode = opts.demoMode ?? demoModeFromEnv();
  return isBookableSpecialty(ref.siteId, service.specialty, demoMode);
}

/** Rebuild the Slot a slotId names, or null if it is no longer bookable. */
export function slotFromId(slotId: string, opts: GenerateOpts = {}): Slot | null {
  if (!slotIsStillBookable(slotId, opts)) return null;
  const ref = parseSlotId(slotId);
  const service = serviceById(ref.serviceId);
  if (!service) return null;
  const window = bookableWindows(ref.siteId, ref.dateISO, opts).find(
    (w) => minutesOf(ref.start) >= minutesOf(w.open) && minutesOf(ref.start) < minutesOf(w.close)
  );
  if (!window) return null;
  const slot = toSlot(ref, service, window);
  return {
    ...slot,
    pendingBranchConfirmation: isContested(ref.siteId),
    branchPhone: patientPhoneFor(ref.siteId),
  };
}
