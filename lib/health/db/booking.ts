// ============================================================================
// فيصل / Faysal — holds and appointments.
//
// A HOLD IS NOT A BOOKING (Rule HOLD-1), and this file is careful not to blur
// them: `insertHold` writes a hold, `insertAppointment` writes an appointment,
// and nothing here does both. The two-phase shape is not optional on WhatsApp —
// between "10:30 works" and the patient's confirmation there is a real gap in
// which someone else must not take the slot and in which no clinic has been
// told to expect anyone.
//
// Two invariants are enforced by the DATABASE, not by this file, and callers
// should know which errors mean what:
//   * HOLD-2 — one ACTIVE hold per patient per clinic, via the partial unique
//     index `health_holds_one_active_per_patient`. A second active hold raises
//     a unique violation; the caller releases the previous hold and retries.
//   * HOLD-4 — confirm() is idempotent on the hold token, via the partial
//     unique index `health_appointments_hold_idem`. A duplicate confirm raises
//     a unique violation and the existing appointment is the right answer;
//     `findAppointmentByHold` is how the caller fetches it.
// ============================================================================

import { HEALTH_TABLES } from "./types";
import type {
  AppointmentKind,
  AppointmentState,
  HealthAppointmentRow,
  HealthHoldRow,
  HoldState,
} from "./types";
import { unwrapMany, unwrapMaybeOne, unwrapOne } from "./client";
import type { HealthDb } from "./client";

export interface NewHold {
  clinic_id: string;
  hold_token: string;
  patient_ref: string;
  family_group_id?: string | null;
  expires_at: string;
}

export async function insertHold(db: HealthDb, hold: NewHold): Promise<HealthHoldRow> {
  return unwrapOne<HealthHoldRow>(
    db.from(HEALTH_TABLES.holds).insert(hold).select("*").maybeSingle(),
    "insertHold",
  );
}

export async function getHoldByToken(
  db: HealthDb,
  clinicId: string,
  holdToken: string,
): Promise<HealthHoldRow | null> {
  return unwrapMaybeOne<HealthHoldRow>(
    db
      .from(HEALTH_TABLES.holds)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("hold_token", holdToken)
      .maybeSingle(),
    "getHoldByToken",
  );
}

export async function listActiveHolds(
  db: HealthDb,
  clinicId: string,
  patientRef?: string,
): Promise<HealthHoldRow[]> {
  let q = db.from(HEALTH_TABLES.holds).select("*").eq("clinic_id", clinicId).eq("state", "active");
  if (patientRef) q = q.eq("patient_ref", patientRef);
  return unwrapMany<HealthHoldRow>(q.order("created_at"), "listActiveHolds");
}

/**
 * Holds whose TTL has elapsed as of `nowISO`. HOLD-3: expiry is enforced
 * server-side on READ, never by a client timer, so callers pass the instant
 * they are answering for rather than trusting a sweep to have run.
 */
export async function listExpiredHolds(
  db: HealthDb,
  clinicId: string,
  nowISO: string,
): Promise<HealthHoldRow[]> {
  return unwrapMany<HealthHoldRow>(
    db
      .from(HEALTH_TABLES.holds)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("state", "active")
      .lte("expires_at", nowISO)
      .order("expires_at"),
    "listExpiredHolds",
  );
}

export async function updateHoldStateIf(
  db: HealthDb,
  clinicId: string,
  holdId: string,
  expectedState: HoldState,
  next: HoldState,
  stamps: { released_at?: string | null; confirmed_at?: string | null } = {},
): Promise<HealthHoldRow | null> {
  return unwrapMaybeOne<HealthHoldRow>(
    db
      .from(HEALTH_TABLES.holds)
      .update({ state: next, ...stamps })
      .eq("clinic_id", clinicId)
      .eq("id", holdId)
      .eq("state", expectedState)
      .select("*")
      .maybeSingle(),
    "updateHoldStateIf",
  );
}

export interface NewAppointment {
  clinic_id: string;
  site_id: string;
  doctor_id?: string | null;
  service_id?: string | null;
  slot_id?: string | null;
  kind: AppointmentKind;
  state: AppointmentState;
  patient_name?: string | null;
  patient_ref: string;
  preferred_window?: string | null;
  note?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  pending_branch_confirmation?: boolean;
  hold_token?: string | null;
  family_group_id?: string | null;
  consent?: Record<string, unknown>;
  expires_at?: string | null;
}

export async function insertAppointment(
  db: HealthDb,
  appointment: NewAppointment,
): Promise<HealthAppointmentRow> {
  return unwrapOne<HealthAppointmentRow>(
    db.from(HEALTH_TABLES.appointments).insert(appointment).select("*").maybeSingle(),
    "insertAppointment",
  );
}

/** HOLD-4's read side: the appointment a previous confirm already wrote. */
export async function findAppointmentByHold(
  db: HealthDb,
  clinicId: string,
  holdToken: string,
  slotId: string,
): Promise<HealthAppointmentRow | null> {
  return unwrapMaybeOne<HealthAppointmentRow>(
    db
      .from(HEALTH_TABLES.appointments)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("hold_token", holdToken)
      .eq("slot_id", slotId)
      .maybeSingle(),
    "findAppointmentByHold",
  );
}

export interface AppointmentQuery {
  siteId?: string;
  patientRef?: string;
  familyGroupId?: string;
  kind?: AppointmentKind;
  states?: AppointmentState[];
  fromISO?: string;
  untilISO?: string;
  limit?: number;
}

export async function listAppointments(
  db: HealthDb,
  clinicId: string,
  query: AppointmentQuery = {},
): Promise<HealthAppointmentRow[]> {
  let q = db.from(HEALTH_TABLES.appointments).select("*").eq("clinic_id", clinicId);
  if (query.siteId) q = q.eq("site_id", query.siteId);
  if (query.patientRef) q = q.eq("patient_ref", query.patientRef);
  if (query.familyGroupId) q = q.eq("family_group_id", query.familyGroupId);
  if (query.kind) q = q.eq("kind", query.kind);
  if (query.states && query.states.length > 0) q = q.in("state", query.states);
  if (query.fromISO) q = q.gte("starts_at", query.fromISO);
  if (query.untilISO) q = q.lt("starts_at", query.untilISO);
  q = q.order("created_at", { ascending: false });
  if (query.limit) q = q.limit(query.limit);
  return unwrapMany<HealthAppointmentRow>(q, "listAppointments");
}

export async function updateAppointmentState(
  db: HealthDb,
  clinicId: string,
  appointmentId: string,
  next: AppointmentState,
): Promise<HealthAppointmentRow | null> {
  return unwrapMaybeOne<HealthAppointmentRow>(
    db
      .from(HEALTH_TABLES.appointments)
      .update({ state: next, updated_at: new Date().toISOString() })
      .eq("clinic_id", clinicId)
      .eq("id", appointmentId)
      .select("*")
      .maybeSingle(),
    "updateAppointmentState",
  );
}
