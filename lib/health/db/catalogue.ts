// ============================================================================
// فيصل / Faysal — specialties, the per-site evidence matrix, services, payers
// and constrained resources.
//
// `listSiteSpecialties` returns EVERY evidence class, including `group_only`
// and `inferred`. Filtering to the bookable ones is Rule SPEC-1 and belongs to
// the domain layer: the difference between "this branch runs that clinic" and
// "the group lists it somewhere" is the whole point of the column, and a query
// helper that quietly dropped the weaker rows would delete the distinction
// before the domain ever saw it.
// ============================================================================

import { HEALTH_TABLES } from "./types";
import type {
  HealthPayerRow,
  HealthResourceRow,
  HealthServiceRow,
  HealthSiteSpecialtyRow,
  HealthSpecialtyRow,
} from "./types";
import { unwrapMany, unwrapMaybeOne } from "./client";
import type { HealthDb } from "./client";

export async function listSpecialties(
  db: HealthDb,
  clinicId: string,
): Promise<HealthSpecialtyRow[]> {
  return unwrapMany<HealthSpecialtyRow>(
    db
      .from(HEALTH_TABLES.specialties)
      .select("*")
      .eq("clinic_id", clinicId)
      .order("sort")
      .order("specialty_key"),
    "listSpecialties",
  );
}

export async function listSiteSpecialties(
  db: HealthDb,
  clinicId: string,
  siteId?: string,
): Promise<HealthSiteSpecialtyRow[]> {
  let q = db.from(HEALTH_TABLES.siteSpecialties).select("*").eq("clinic_id", clinicId);
  if (siteId) q = q.eq("site_id", siteId);
  return unwrapMany<HealthSiteSpecialtyRow>(q.order("site_id"), "listSiteSpecialties");
}

/** The `named_at_site` rows only — the sole evidence class Rule SPEC-1 allows to be booked. */
export async function listNamedSiteSpecialties(
  db: HealthDb,
  clinicId: string,
  siteId?: string,
): Promise<HealthSiteSpecialtyRow[]> {
  let q = db
    .from(HEALTH_TABLES.siteSpecialties)
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("evidence", "named_at_site");
  if (siteId) q = q.eq("site_id", siteId);
  return unwrapMany<HealthSiteSpecialtyRow>(q.order("site_id"), "listNamedSiteSpecialties");
}

export async function listServices(db: HealthDb, clinicId: string): Promise<HealthServiceRow[]> {
  return unwrapMany<HealthServiceRow>(
    db
      .from(HEALTH_TABLES.services)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("active", true)
      .order("category")
      .order("service_key"),
    "listServices",
  );
}

export async function getServiceByKey(
  db: HealthDb,
  clinicId: string,
  serviceKey: string,
): Promise<HealthServiceRow | null> {
  return unwrapMaybeOne<HealthServiceRow>(
    db
      .from(HEALTH_TABLES.services)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("service_key", serviceKey)
      .maybeSingle(),
    "getServiceByKey",
  );
}

export async function listServicesByCategory(
  db: HealthDb,
  clinicId: string,
  category: string,
): Promise<HealthServiceRow[]> {
  return unwrapMany<HealthServiceRow>(
    db
      .from(HEALTH_TABLES.services)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("category", category)
      .eq("active", true)
      .order("service_key"),
    "listServicesByCategory",
  );
}

export async function listPayers(db: HealthDb, clinicId: string): Promise<HealthPayerRow[]> {
  return unwrapMany<HealthPayerRow>(
    db.from(HEALTH_TABLES.payers).select("*").eq("clinic_id", clinicId).order("kind").order("payer_key"),
    "listPayers",
  );
}

/**
 * Payers of one kind. Rule INS-2: a `directory_source` is never named to a
 * patient as an accepted payer — it is provenance for a facility code. The
 * caller asks for the kind it means, so the two can never be confused by a
 * forgotten filter.
 */
export async function listPayersByKind(
  db: HealthDb,
  clinicId: string,
  kind: HealthPayerRow["kind"],
): Promise<HealthPayerRow[]> {
  return unwrapMany<HealthPayerRow>(
    db
      .from(HEALTH_TABLES.payers)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("kind", kind)
      .order("payer_key"),
    "listPayersByKind",
  );
}

export async function listResources(
  db: HealthDb,
  clinicId: string,
  siteId?: string,
): Promise<HealthResourceRow[]> {
  let q = db.from(HEALTH_TABLES.resources).select("*").eq("clinic_id", clinicId);
  if (siteId) q = q.eq("site_id", siteId);
  return unwrapMany<HealthResourceRow>(q.order("resource_key"), "listResources");
}
