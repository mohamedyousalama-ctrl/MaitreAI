// ============================================================================
// MaitreAI — WO-DELIVERY-D1: parse+validate a zone's geometry from a request body.
// Shared by the onboarding zone routes (create + update). Geometry is OPTIONAL but
// ALL-OR-NOTHING: a zone is either name-only (legacy) or a full circle (center +
// radius). Absent geometry returns {} (caller omits the columns). A PARTIAL circle
// or an out-of-range value pushes an error string and returns {}.
// ============================================================================

import { isValidLat, isValidLng, isValidRadiusKm } from "./geo";

export interface ZoneGeometryPatch {
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
}

export function readZoneGeometry(body: Record<string, unknown>, errors: string[]): ZoneGeometryPatch {
  const hasLat = "centerLat" in body && body.centerLat !== null && body.centerLat !== undefined;
  const hasLng = "centerLng" in body && body.centerLng !== null && body.centerLng !== undefined;
  const hasRad = "radiusKm" in body && body.radiusKm !== null && body.radiusKm !== undefined;

  if (!hasLat && !hasLng && !hasRad) return {}; // name-only zone — no geometry sent.

  if (!(hasLat && hasLng && hasRad)) {
    errors.push("zone geometry must include centerLat, centerLng AND radiusKm together (or none)");
    return {};
  }
  if (!isValidLat(body.centerLat)) errors.push("centerLat must be between -90 and 90");
  if (!isValidLng(body.centerLng)) errors.push("centerLng must be between -180 and 180");
  if (!isValidRadiusKm(body.radiusKm)) errors.push("radiusKm must be a positive number ≤ 100");
  if (errors.length) return {};

  return {
    centerLat: body.centerLat as number,
    centerLng: body.centerLng as number,
    radiusKm: body.radiusKm as number,
  };
}
