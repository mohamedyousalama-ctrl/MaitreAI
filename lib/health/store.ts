// ============================================================================
// فيصل / Faysal — the demo booking store: holds and appointments.
// SPEC-1-DOMAIN.md §7.5, §8.
//
// In-memory and INJECTABLE. Every reader and writer takes a store, so a test
// gets a fresh universe per case and the persistence owner (lib/health/db/) can
// hand in a database-backed implementation with the same shape without any
// caller changing.
//
// HOLD-3 — expiry is enforced SERVER-SIDE ON READ, never by a client timer. An
// expired hold returns inventory whether or not any sweep has run. Same posture
// as DEMO_SESSION_TTL_MS in lib/demo/config.ts.
//
// POL-04 — every appointment carries TWO markers, `source: "faysal_demo"` and
// `isTest: true`, because they are read by different things.
// ============================================================================

import type { Appointment, Hold } from "./types";

export interface FaysalStore {
  holds: Map<string, Hold>;
  appointments: Map<string, Appointment>;
  /** HOLD-2 — one active hold per WhatsApp identity. waNumber → holdId. */
  activeHoldByPatient: Map<string, string>;
  /** Monotonic counter, so two holds in the same millisecond still differ. */
  seq: number;
}

export function createStore(): FaysalStore {
  return {
    holds: new Map(),
    appointments: new Map(),
    activeHoldByPatient: new Map(),
    seq: 0,
  };
}

/** The process-wide demo store. Tests pass their own and never touch this. */
export const defaultStore: FaysalStore = createStore();

/**
 * HOLD-3. Called at the top of EVERY read and EVERY write. Expiry is a fact
 * about the clock, not about whether a sweep ran.
 */
export function expireStaleHolds(store: FaysalStore, nowISO: string): void {
  const now = Date.parse(nowISO);
  for (const hold of store.holds.values()) {
    if (hold.state === "active" && Date.parse(hold.expiresAt) <= now) {
      hold.state = "expired";
      if (store.activeHoldByPatient.get(hold.patient.waNumber) === hold.holdId) {
        store.activeHoldByPatient.delete(hold.patient.waNumber);
      }
    }
  }
}

export function activeHoldFor(store: FaysalStore, waNumber: string, nowISO: string): Hold | null {
  expireStaleHolds(store, nowISO);
  const id = store.activeHoldByPatient.get(waNumber);
  if (!id) return null;
  const hold = store.holds.get(id);
  return hold && hold.state === "active" ? hold : null;
}

/** Slot ids that inventory must be subtracted for: live holds + live bookings. */
export function takenSlotIds(store: FaysalStore, nowISO: string): Set<string> {
  expireStaleHolds(store, nowISO);
  const taken = new Set<string>();
  for (const hold of store.holds.values()) {
    if (hold.state === "active" || hold.state === "confirmed") {
      for (const id of hold.slotIds) taken.add(id);
    }
  }
  for (const appt of store.appointments.values()) {
    if (appt.state === "confirmed" || appt.state === "checked_in") {
      for (const id of appt.slotIds) taken.add(id);
    }
  }
  return taken;
}

export function holdBySlotId(store: FaysalStore, slotId: string, nowISO: string): Hold | null {
  expireStaleHolds(store, nowISO);
  for (const hold of store.holds.values()) {
    if ((hold.state === "active" || hold.state === "confirmed") && hold.slotIds.includes(slotId)) {
      return hold;
    }
  }
  return null;
}

/**
 * HOLD-4 — confirm() is idempotent ON THE HOLD TOKEN. The appointment id is a
 * pure function of the hold id, so a WhatsApp double-tap cannot mint a second
 * appointment even under a race: the second write addresses the same key.
 */
export function appointmentIdForHold(holdId: string): string {
  return `appt_${holdId.replace(/^hold_/, "")}`;
}
