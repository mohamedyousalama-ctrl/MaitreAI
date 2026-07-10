// ============================================================================
// MaitreAI — WO-DELIVERY-D1: delivery geography + branch routing (pure core).
//
// This module is PURE (no I/O, no DB, no LLM) and is the single source of truth
// for pin→zone matching + branch routing. Money is NOT computed here — the fee
// still comes from lib/order-pricing.ts off the matched zone's data (money law).
// Everything here is deterministic and unit-tested (scripts/test-delivery-geo).
//
// V1 geometry = a CIRCLE per zone (center + radius_km). Point-in-radius match via
// the haversine great-circle distance. Polygons are V2 (the unused polygon column).
// ============================================================================

export interface LatLng {
  lat: number;
  lng: number;
}

// A zone as the router needs it (subset of lib/types DeliveryArea + geometry).
export interface RoutableZone {
  id: string;
  name: string;
  /** Owning branch; null/undefined = restaurant-wide (no branch routing target). */
  branchId?: string;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  active: boolean;
}

// A branch as the router needs it for the nearest-branch tie-break.
export interface RoutableBranch {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
}

// ── validators (shared by the console editor API + the router) ───────────────
export function isValidLat(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
}
export function isValidLng(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;
}
/** Radius in km: strictly positive, capped at a sane 100km (a "zone", not a country). */
export function isValidRadiusKm(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100;
}
export function isValidLatLng(p: unknown): p is LatLng {
  return !!p && typeof p === "object" && isValidLat((p as LatLng).lat) && isValidLng((p as LatLng).lng);
}

// ── haversine great-circle distance, in kilometres ──────────────────────────
const EARTH_RADIUS_KM = 6371;
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ── geometry helpers ─────────────────────────────────────────────────────────
/** A zone can take part in geo matching only when it is active AND fully drawn
 *  (center + positive radius). Legacy name-only zones are geometry-inert. */
export function zoneIsRoutable(z: RoutableZone): boolean {
  return (
    z.active &&
    isValidLat(z.centerLat) &&
    isValidLng(z.centerLng) &&
    isValidRadiusKm(z.radiusKm)
  );
}

function zoneCenter(z: RoutableZone): LatLng | null {
  return isValidLat(z.centerLat) && isValidLng(z.centerLng)
    ? { lat: z.centerLat, lng: z.centerLng }
    : null;
}

/** Distance from a pin to a zone's CENTER (km), or Infinity if the zone has no
 *  center. Used for ranking; the point-in-radius test is zoneContainsPin. */
export function distanceToZoneCenterKm(z: RoutableZone, pin: LatLng): number {
  const c = zoneCenter(z);
  return c ? haversineKm(c, pin) : Infinity;
}

/** Straight-line distance from a pin to the zone's OUTER EDGE (km): 0 when the pin
 *  is inside the circle, else center-distance minus radius. Feeds miss insight
 *  ("how far outside were they?"). */
export function distanceToZoneEdgeKm(z: RoutableZone, pin: LatLng): number {
  const d = distanceToZoneCenterKm(z, pin);
  if (!Number.isFinite(d)) return Infinity;
  const r = isValidRadiusKm(z.radiusKm) ? z.radiusKm : 0;
  return Math.max(0, d - r);
}

/** True when the pin lies within the zone's circle (routable zones only). */
export function zoneContainsPin(z: RoutableZone, pin: LatLng): boolean {
  if (!zoneIsRoutable(z)) return false;
  return distanceToZoneCenterKm(z, pin) <= (z.radiusKm as number);
}

/** All routable zones whose circle contains the pin, nearest-center first. */
export function matchZonesForPin(zones: RoutableZone[], pin: LatLng): RoutableZone[] {
  return zones
    .filter((z) => zoneContainsPin(z, pin))
    .sort((a, b) => distanceToZoneCenterKm(a, pin) - distanceToZoneCenterKm(b, pin));
}

// ── the routing decision ─────────────────────────────────────────────────────
export type PinRoute =
  | {
      kind: "matched";
      /** The winning zone (the one whose branch/fee/ETA the order takes). */
      zone: RoutableZone;
      /** The branch the order routes to (the winning zone's branch), or null. */
      branchId: string | null;
      /** How the winner was chosen: sole match, or nearest-branch among overlaps. */
      via: "single" | "nearest_branch";
    }
  | {
      kind: "outside";
      /** Nearest routable zone (for the miss insight), or null if none are drawn. */
      nearestZoneId: string | null;
      /** Straight-line km from the pin to that nearest zone's edge, or null. */
      nearestDistanceKm: number | null;
    };

/**
 * Route a delivery PIN to a zone + branch (spec §2):
 *  - 0 matches → OUTSIDE (soft flow + zone_miss upstream). Reports nearest zone.
 *  - 1 match   → that zone's branch.
 *  - overlap   → the zone whose BRANCH is nearest the pin by straight-line distance
 *                (ratified tie-break). A matched zone whose branch has no coords
 *                falls back to that zone's own center distance so it still ranks.
 * Pure + deterministic: equal distances resolve by matchZonesForPin order
 * (nearest-center, then input order) so the result never depends on Math.random.
 */
export function routeDeliveryPin(
  pin: LatLng,
  zones: RoutableZone[],
  branches: RoutableBranch[]
): PinRoute {
  const matches = matchZonesForPin(zones, pin);

  if (matches.length === 0) {
    let nearestZoneId: string | null = null;
    let nearestDistanceKm: number | null = null;
    for (const z of zones) {
      if (!zoneIsRoutable(z)) continue;
      const d = distanceToZoneEdgeKm(z, pin);
      if (nearestDistanceKm === null || d < nearestDistanceKm) {
        nearestDistanceKm = d;
        nearestZoneId = z.id;
      }
    }
    return { kind: "outside", nearestZoneId, nearestDistanceKm };
  }

  if (matches.length === 1) {
    return { kind: "matched", zone: matches[0], branchId: matches[0].branchId ?? null, via: "single" };
  }

  // Overlap → nearest branch by straight-line distance from the pin.
  const branchById = new Map(branches.map((b) => [b.id, b]));
  let best = matches[0];
  let bestDist = Infinity;
  for (const z of matches) {
    const b = z.branchId ? branchById.get(z.branchId) : undefined;
    const dist =
      b && isValidLat(b.lat) && isValidLng(b.lng)
        ? haversineKm(pin, { lat: b.lat, lng: b.lng })
        : distanceToZoneCenterKm(z, pin); // no branch coords → fall back to zone center
    if (dist < bestDist) {
      bestDist = dist;
      best = z;
    }
  }
  return { kind: "matched", zone: best, branchId: best.branchId ?? null, via: "nearest_branch" };
}
