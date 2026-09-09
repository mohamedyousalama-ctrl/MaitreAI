// ============================================================================
// فيصل / Faysal — clinic + membership reads.
// ============================================================================

import { HEALTH_TABLES } from "./types";
import type { HealthClinicRow, HealthMemberRow } from "./types";
import { unwrapMany, unwrapMaybeOne, unwrapOne } from "./client";
import type { HealthDb } from "./client";

export async function getClinic(db: HealthDb, clinicId: string): Promise<HealthClinicRow> {
  return unwrapOne<HealthClinicRow>(
    db.from(HEALTH_TABLES.clinics).select("*").eq("id", clinicId).maybeSingle(),
    "getClinic",
  );
}

export async function findClinicByWaPhoneNumberId(
  db: HealthDb,
  waPhoneNumberId: string,
): Promise<HealthClinicRow | null> {
  return unwrapMaybeOne<HealthClinicRow>(
    db
      .from(HEALTH_TABLES.clinics)
      .select("*")
      .eq("wa_phone_number_id", waPhoneNumberId)
      .maybeSingle(),
    "findClinicByWaPhoneNumberId",
  );
}

export async function listActiveClinics(db: HealthDb): Promise<HealthClinicRow[]> {
  return unwrapMany<HealthClinicRow>(
    db.from(HEALTH_TABLES.clinics).select("*").eq("active", true).order("name"),
    "listActiveClinics",
  );
}

export async function listClinicMembers(db: HealthDb, clinicId: string): Promise<HealthMemberRow[]> {
  return unwrapMany<HealthMemberRow>(
    db.from(HEALTH_TABLES.members).select("*").eq("clinic_id", clinicId).order("created_at"),
    "listClinicMembers",
  );
}

export async function findMembership(
  db: HealthDb,
  clinicId: string,
  userId: string,
): Promise<HealthMemberRow | null> {
  return unwrapMaybeOne<HealthMemberRow>(
    db
      .from(HEALTH_TABLES.members)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("user_id", userId)
      .maybeSingle(),
    "findMembership",
  );
}
