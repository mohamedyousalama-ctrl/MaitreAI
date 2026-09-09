// ============================================================================
// فيصل / Faysal — slot inventory reads and state writes.
//
// WHAT A ROW IN health_slots IS. SPEC-1 §7.2 lays a 15-MINUTE GRID across each
// bookable window and marks grid points busy; the free points are what the seed
// materialises. So consecutive rows for one clinician OVERLAP — 09:00 and 09:15
// are both real candidate starts for a 20-minute consultation, and taking one
// must remove the other. That is `listConflictingSlots` below, and the domain
// layer must call it before a hold is written. A caller that treats each row as
// an independent exclusive slot will double-book a clinician, which is the one
// bug this comment exists to prevent.
//
// `FAYSAL_MIN_LEAD_MINUTES`, `FAYSAL_MAX_SLOTS_PER_REPLY` and the DEMO_MODE
// gate on `window_confidence` are NOT applied here. This file reads inventory;
// the domain decides what may be offered.
// ============================================================================

import { HEALTH_TABLES } from "./types";
import type { HealthSlotRow, SlotState } from "./types";
import { unwrapMany, unwrapMaybeOne } from "./client";
import type { HealthDb } from "./client";

export interface SlotQuery {
  siteId?: string;
  doctorId?: string;
  serviceId?: string;
  /** Inclusive lower bound on starts_at (ISO). */
  fromISO?: string;
  /** Exclusive upper bound on starts_at (ISO). */
  untilISO?: string;
  /** Local Asia/Riyadh calendar day, "YYYY-MM-DD". */
  localDate?: string;
  states?: SlotState[];
  limit?: number;
}

/**
 * Inventory in `offered` state — generated, unreserved, costing nothing.
 * Offering is not holding (Rule SLOT-1).
 */
export async function listOpenSlots(
  db: HealthDb,
  clinicId: string,
  query: SlotQuery = {},
): Promise<HealthSlotRow[]> {
  return listSlots(db, clinicId, { ...query, states: query.states ?? ["offered"] });
}

export async function listSlots(
  db: HealthDb,
  clinicId: string,
  query: SlotQuery = {},
): Promise<HealthSlotRow[]> {
  let q = db.from(HEALTH_TABLES.slots).select("*").eq("clinic_id", clinicId);
  if (query.siteId) q = q.eq("site_id", query.siteId);
  if (query.doctorId) q = q.eq("doctor_id", query.doctorId);
  if (query.serviceId) q = q.eq("service_id", query.serviceId);
  if (query.localDate) q = q.eq("local_date", query.localDate);
  if (query.fromISO) q = q.gte("starts_at", query.fromISO);
  if (query.untilISO) q = q.lt("starts_at", query.untilISO);
  if (query.states && query.states.length > 0) q = q.in("state", query.states);
  q = q.order("starts_at");
  if (query.limit) q = q.limit(query.limit);
  return unwrapMany<HealthSlotRow>(q, "listSlots");
}

export async function getSlotById(
  db: HealthDb,
  clinicId: string,
  slotId: string,
): Promise<HealthSlotRow | null> {
  return unwrapMaybeOne<HealthSlotRow>(
    db.from(HEALTH_TABLES.slots).select("*").eq("clinic_id", clinicId).eq("id", slotId).maybeSingle(),
    "getSlotById",
  );
}

/**
 * Slots for the same clinician whose blocked interval overlaps [startsAt,
 * blockedUntil) and which are already spoken for. The buffer is part of the
 * block and never part of the offer (Rule BUF-1), which is why the comparison
 * is against `blocked_until` and not `ends_at`.
 */
export async function listConflictingSlots(
  db: HealthDb,
  clinicId: string,
  doctorId: string,
  startsAtISO: string,
  blockedUntilISO: string,
  states: SlotState[] = ["held", "confirmed", "checked_in"],
): Promise<HealthSlotRow[]> {
  return unwrapMany<HealthSlotRow>(
    db
      .from(HEALTH_TABLES.slots)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("doctor_id", doctorId)
      .in("state", states)
      .lt("starts_at", blockedUntilISO)
      .gt("blocked_until", startsAtISO)
      .order("starts_at"),
    "listConflictingSlots",
  );
}

export async function listSlotsForHold(
  db: HealthDb,
  clinicId: string,
  holdId: string,
): Promise<HealthSlotRow[]> {
  return unwrapMany<HealthSlotRow>(
    db
      .from(HEALTH_TABLES.slots)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("hold_id", holdId)
      .order("starts_at"),
    "listSlotsForHold",
  );
}

export interface SlotStatePatch {
  state: SlotState;
  hold_id?: string | null;
  held_until?: string | null;
}

/**
 * Conditional state write: applies only while the row is still in
 * `expectedState`. Returns the updated row, or null when someone else moved it
 * first — which is the answer the caller needs, not an exception. HOLD-5 is the
 * domain's re-validation on top of this, not a substitute for it.
 */
export async function updateSlotStateIf(
  db: HealthDb,
  clinicId: string,
  slotId: string,
  expectedState: SlotState,
  patch: SlotStatePatch,
): Promise<HealthSlotRow | null> {
  return unwrapMaybeOne<HealthSlotRow>(
    db
      .from(HEALTH_TABLES.slots)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("clinic_id", clinicId)
      .eq("id", slotId)
      .eq("state", expectedState)
      .select("*")
      .maybeSingle(),
    "updateSlotStateIf",
  );
}

/** Release every slot attached to a hold. Used by expiry and by release(). */
export async function releaseSlotsForHold(
  db: HealthDb,
  clinicId: string,
  holdId: string,
): Promise<HealthSlotRow[]> {
  return unwrapMany<HealthSlotRow>(
    db
      .from(HEALTH_TABLES.slots)
      .update({ state: "offered", hold_id: null, held_until: null, updated_at: new Date().toISOString() })
      .eq("clinic_id", clinicId)
      .eq("hold_id", holdId)
      .eq("state", "held")
      .select("*"),
    "releaseSlotsForHold",
  );
}

export async function countSlots(
  db: HealthDb,
  clinicId: string,
  query: SlotQuery = {},
): Promise<number> {
  let q = db.from(HEALTH_TABLES.slots).select("id", { count: "exact", head: true }).eq("clinic_id", clinicId);
  if (query.siteId) q = q.eq("site_id", query.siteId);
  if (query.doctorId) q = q.eq("doctor_id", query.doctorId);
  if (query.localDate) q = q.eq("local_date", query.localDate);
  if (query.states && query.states.length > 0) q = q.in("state", query.states);
  const { count, error } = await q;
  if (error) throw new Error(`[health.db] countSlots: ${error.message}`);
  return count ?? 0;
}
