// ============================================================================
// MaitreAI — WO-DELIVERY-D2: delivery-run grouping core (pure, unit-tested).
//
// A RUN groups up to RUN_CAP deliveries for one driver. This module is PURE (no
// I/O, no DB) and owns two decisions:
//   • the CAP (max deliveries per run) — enforced in the assign engine.
//   • the SUGGESTION — group unassigned deliveries by same-zone/adjacent, oldest
//     first, so the operator can tap-to-accept. It NEVER assigns (no side effects);
//     it only proposes. Adjacency reuses the D1 geo core (zone-center distance).
// ============================================================================

import { haversineKm, isValidLat, isValidLng } from "./geo";

/** Max deliveries a single run may carry (spec §3). Configurable later. */
export const RUN_CAP = 3;

/** Default distance under which two zones count as "adjacent" for grouping. */
export const ADJACENCY_KM = 2.5;

export interface SuggestDelivery {
  id: string;
  /** The delivery's zone (from its order). null = no zone → grouped only by adjacency-less fallback. */
  zoneId: string | null;
  /** Creation time (ISO string or epoch ms) — the oldest-first ordering key. */
  createdAt: string | number;
}
export interface SuggestZone {
  id: string;
  centerLat?: number;
  centerLng?: number;
}
export interface SuggestedGroup {
  /** The representative zone key the group clustered on (null = zoneless cluster). */
  zoneKey: string | null;
  /** Delivery ids, oldest-first, length 2..RUN_CAP. */
  deliveryIds: string[];
}

function toMs(t: string | number): number {
  return typeof t === "number" ? t : Date.parse(t) || 0;
}

// Union-find over zone ids so adjacent zones (centers within adjacencyKm) share a
// cluster key. Deterministic: the cluster's representative is the smallest zone id.
function clusterZones(zones: SuggestZone[], adjacencyKm: number): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r) as string;
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Point the lexicographically-larger root at the smaller → stable representative.
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };
  for (const z of zones) parent.set(z.id, z.id);
  const withCenter = zones.filter((z) => isValidLat(z.centerLat) && isValidLng(z.centerLng));
  for (let i = 0; i < withCenter.length; i++) {
    for (let j = i + 1; j < withCenter.length; j++) {
      const a = withCenter[i];
      const b = withCenter[j];
      const d = haversineKm(
        { lat: a.centerLat as number, lng: a.centerLng as number },
        { lat: b.centerLat as number, lng: b.centerLng as number }
      );
      if (d <= adjacencyKm) union(a.id, b.id);
    }
  }
  const rep = new Map<string, string>();
  for (const z of zones) rep.set(z.id, find(z.id));
  return rep;
}

/**
 * Suggest run groupings over UNASSIGNED deliveries (spec §3): cluster by same-zone
 * (and adjacent zones via geo), order each cluster oldest-first, and chunk into
 * groups of ≤ cap. Only groups of 2+ are returned (a lone delivery needs no run).
 * Pure + deterministic — equal timestamps break ties by id, so no Math.random.
 */
export function suggestRunGrouping(
  deliveries: SuggestDelivery[],
  zones: SuggestZone[],
  opts?: { cap?: number; adjacencyKm?: number }
): SuggestedGroup[] {
  const cap = Math.max(2, opts?.cap ?? RUN_CAP);
  const rep = clusterZones(zones, opts?.adjacencyKm ?? ADJACENCY_KM);

  // Bucket deliveries by cluster key (zoneless deliveries share the "" bucket, but
  // they are only grouped together when there is genuinely nothing else to key on).
  const buckets = new Map<string, SuggestDelivery[]>();
  for (const d of deliveries) {
    const key = d.zoneId ? rep.get(d.zoneId) ?? d.zoneId : "";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(d);
  }

  const groups: SuggestedGroup[] = [];
  // Deterministic bucket order: by key so output is stable across runs.
  for (const key of [...buckets.keys()].sort()) {
    const list = buckets.get(key)!.slice().sort((a, b) => {
      const ta = toMs(a.createdAt);
      const tb = toMs(b.createdAt);
      return ta !== tb ? ta - tb : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    for (let i = 0; i < list.length; i += cap) {
      const chunk = list.slice(i, i + cap);
      if (chunk.length >= 2) groups.push({ zoneKey: key || null, deliveryIds: chunk.map((d) => d.id) });
    }
  }
  return groups;
}

/** True when a proposed run size is within the cap (assign-engine guard). */
export function withinRunCap(count: number, cap: number = RUN_CAP): boolean {
  return count >= 1 && count <= cap;
}

/**
 * /t ACTIVE-LEG gate (spec §3): may the customer see the driver's live dot?
 *  - A single delivery (not in a run) → yes (today's behavior, byte-identical).
 *  - A run stop → only while THIS leg is the active one (status === 'on_the_way').
 * The caller still ANDs this with the <30s location-freshness check.
 */
export function isActiveLeg(inRun: boolean, status: string): boolean {
  return !inRun || status === "on_the_way";
}
