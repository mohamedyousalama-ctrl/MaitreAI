// ============================================================================
// فيصل / Faysal — clinician reads.
//
// EVERY ROW IN health_doctors IS FICTIONAL (SPEC-1 §6.3) and the column is
// CHECKed true in the database. Nothing here can return a real clinician,
// because nothing can insert one.
//
// `gender` is a FILTER, never a recommendation (Rule DOC-1). It is offered as
// a query parameter because "a female doctor, please" is one of the most common
// real requests in this market and an agent that cannot answer it has to
// apologise instead. It is not, and must not become, a ranking input.
// ============================================================================

import { HEALTH_TABLES } from "./types";
import type { HealthDoctorRow, HealthDoctorSiteRow } from "./types";
import { unwrapMany, unwrapMaybeOne } from "./client";
import type { HealthDb } from "./client";

export interface DoctorFilter {
  siteId?: string;
  specialtyId?: string;
  gender?: HealthDoctorRow["gender"];
  /** Any of these languages. */
  language?: "ar" | "en" | "ur" | "fr";
  activeOnly?: boolean;
}

export async function listDoctors(
  db: HealthDb,
  clinicId: string,
  filter: DoctorFilter = {},
): Promise<HealthDoctorRow[]> {
  // A site filter needs the join table, which PostgREST cannot express as a
  // plain `eq` on this table — so the site's doctor ids are read first. Two
  // small queries beat an embedded select whose shape changes with the filter.
  let doctorIds: string[] | null = null;
  if (filter.siteId) {
    const links = await listDoctorSites(db, clinicId, filter.siteId);
    doctorIds = links.map((l) => l.doctor_id);
    if (doctorIds.length === 0) return [];
  }

  let q = db.from(HEALTH_TABLES.doctors).select("*").eq("clinic_id", clinicId);
  if (doctorIds) q = q.in("id", doctorIds);
  if (filter.specialtyId) q = q.eq("specialty_id", filter.specialtyId);
  if (filter.gender) q = q.eq("gender", filter.gender);
  if (filter.language) q = q.contains("languages", [filter.language]);
  if (filter.activeOnly !== false) q = q.eq("active", true);

  return unwrapMany<HealthDoctorRow>(q.order("name_en"), "listDoctors");
}

export async function getDoctorByKey(
  db: HealthDb,
  clinicId: string,
  doctorKey: string,
): Promise<HealthDoctorRow | null> {
  return unwrapMaybeOne<HealthDoctorRow>(
    db
      .from(HEALTH_TABLES.doctors)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("doctor_key", doctorKey)
      .maybeSingle(),
    "getDoctorByKey",
  );
}

export async function getDoctorById(
  db: HealthDb,
  clinicId: string,
  doctorId: string,
): Promise<HealthDoctorRow | null> {
  return unwrapMaybeOne<HealthDoctorRow>(
    db
      .from(HEALTH_TABLES.doctors)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("id", doctorId)
      .maybeSingle(),
    "getDoctorById",
  );
}

/** The doctor↔site links. Two clinicians in the roster work across sites. */
export async function listDoctorSites(
  db: HealthDb,
  clinicId: string,
  siteId?: string,
  doctorId?: string,
): Promise<HealthDoctorSiteRow[]> {
  let q = db.from(HEALTH_TABLES.doctorSites).select("*").eq("clinic_id", clinicId);
  if (siteId) q = q.eq("site_id", siteId);
  if (doctorId) q = q.eq("doctor_id", doctorId);
  return unwrapMany<HealthDoctorSiteRow>(q, "listDoctorSites");
}
