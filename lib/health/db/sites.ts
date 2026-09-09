// ============================================================================
// فيصل / Faysal — site reads (the six branches).
//
// These return the stored record and nothing more. Whether a site is OPEN, and
// whether a window may mint a slot, are `openStateAt()` and `bookableWindows()`
// in the domain layer — they read `hours`, apply Invariants H1–H6, and are the
// only things allowed to turn a stored window into an offer.
// ============================================================================

import { HEALTH_TABLES } from "./types";
import type { HealthSiteRow, SiteKey } from "./types";
import { unwrapMany, unwrapMaybeOne } from "./client";
import type { HealthDb } from "./client";

export async function listSites(db: HealthDb, clinicId: string): Promise<HealthSiteRow[]> {
  return unwrapMany<HealthSiteRow>(
    db.from(HEALTH_TABLES.sites).select("*").eq("clinic_id", clinicId).order("site_key"),
    "listSites",
  );
}

export async function listActiveSites(db: HealthDb, clinicId: string): Promise<HealthSiteRow[]> {
  return unwrapMany<HealthSiteRow>(
    db
      .from(HEALTH_TABLES.sites)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("active", true)
      .order("site_key"),
    "listActiveSites",
  );
}

export async function getSiteByKey(
  db: HealthDb,
  clinicId: string,
  siteKey: SiteKey,
): Promise<HealthSiteRow | null> {
  return unwrapMaybeOne<HealthSiteRow>(
    db
      .from(HEALTH_TABLES.sites)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("site_key", siteKey)
      .maybeSingle(),
    "getSiteByKey",
  );
}

export async function getSiteById(
  db: HealthDb,
  clinicId: string,
  siteId: string,
): Promise<HealthSiteRow | null> {
  return unwrapMaybeOne<HealthSiteRow>(
    db
      .from(HEALTH_TABLES.sites)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("id", siteId)
      .maybeSingle(),
    "getSiteById",
  );
}

/**
 * Sites by operating state. Invariant H5 and Rules C4-1/C4-2 are the domain's
 * to apply; this only reads the column, so a caller can ask for the contested
 * ones explicitly rather than filtering a full list by hand.
 */
export async function listSitesByOperatingState(
  db: HealthDb,
  clinicId: string,
  state: HealthSiteRow["operating_state"],
): Promise<HealthSiteRow[]> {
  return unwrapMany<HealthSiteRow>(
    db
      .from(HEALTH_TABLES.sites)
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("operating_state", state)
      .order("site_key"),
    "listSitesByOperatingState",
  );
}
