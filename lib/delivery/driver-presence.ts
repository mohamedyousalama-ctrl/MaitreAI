// ============================================================================
// Kivo Delivery Network — Day 2 driver presence (PURE).
//
// Independent of any delivery job. Roster `active` is still roster management
// (see driver-roster.ts). Presence is the driver's explicit ONLINE / OFFLINE
// choice plus page-open browser GPS freshness. Closing the page does NOT flip
// the driver to OFFLINE — that would be a background-GPS promise. A driver who
// stays ONLINE after updates stop is STALE ONLINE, which must never look like
// explicit OFFLINE.
// ============================================================================

export const PRESENCE_STATUSES = ["offline", "online"] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

/** Match delivery LOCATION_FRESH_MS so "live" means the same 30s window. */
export const PRESENCE_FRESH_MS = 30_000;

export type PresenceKind = "offline" | "online_fresh" | "online_stale" | "online_no_fix";

export interface PresenceSnapshot {
  status: PresenceStatus | string | null;
  lastSeenAt?: string | null;
  recordedAt?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface ClassifiedPresence {
  kind: PresenceKind;
  status: PresenceStatus;
  ageMs: number | null;
  fresh: boolean;
  hasFix: boolean;
  lat: number | null;
  lng: number | null;
  recordedAt: string | null;
  lastSeenAt: string | null;
}

function isFiniteCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function ageMsSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, now - t);
}

/**
 * Operator-facing classification.
 *
 * OFFLINE always wins, even if a historical point exists.
 * ONLINE with a last-seen inside the fresh window is live.
 * ONLINE with an old last-seen is stale/unreachable — not OFFLINE.
 * ONLINE with no last-seen / no GPS fix is "working, no location yet".
 */
export function classifyPresence(
  snap: PresenceSnapshot | null | undefined,
  now: number = Date.now()
): ClassifiedPresence {
  const status: PresenceStatus = snap?.status === "online" ? "online" : "offline";
  const lastSeenAt = snap?.lastSeenAt ?? null;
  const recordedAt = snap?.recordedAt ?? null;
  const lat = typeof snap?.lat === "number" && Number.isFinite(snap.lat) ? snap.lat : null;
  const lng = typeof snap?.lng === "number" && Number.isFinite(snap.lng) ? snap.lng : null;
  const hasFix = isFiniteCoord(lat, lng);
  const ageMs = ageMsSince(lastSeenAt ?? recordedAt, now);
  const fresh = ageMs != null && ageMs < PRESENCE_FRESH_MS;

  if (status === "offline") {
    return {
      kind: "offline",
      status,
      ageMs,
      fresh: false,
      hasFix,
      lat,
      lng,
      recordedAt,
      lastSeenAt,
    };
  }

  if (ageMs == null) {
    return {
      kind: "online_no_fix",
      status,
      ageMs: null,
      fresh: false,
      hasFix,
      lat,
      lng,
      recordedAt,
      lastSeenAt,
    };
  }

  if (fresh) {
    return {
      kind: hasFix ? "online_fresh" : "online_no_fix",
      status,
      ageMs,
      fresh: true,
      hasFix,
      lat,
      lng,
      recordedAt,
      lastSeenAt,
    };
  }

  return {
    kind: "online_stale",
    status,
    ageMs,
    fresh: false,
    hasFix,
    lat,
    lng,
    recordedAt,
    lastSeenAt,
  };
}

/** Short Arabic chip for the operator roster / assign dropdown. */
export function presenceOperatorChipAr(kind: PresenceKind): string {
  switch (kind) {
    case "offline":
      return "OFFLINE — غير متصل";
    case "online_fresh":
      return "ONLINE — موقع مباشر";
    case "online_stale":
      return "ONLINE — موقع قديم / غير قابل للوصول";
    case "online_no_fix":
      return "ONLINE — بدون موقع بعد";
  }
}

export function presenceDriverStateAr(kind: PresenceKind): { title: string; body: string } {
  switch (kind) {
    case "offline":
      return {
        title: "OFFLINE — غير متصل",
        body: "المطعم يراك غير متصل. لن يُرسل موقعك ما دمت غير متصل.",
      };
    case "online_fresh":
      return {
        title: "ONLINE — متصل",
        body: "المطعم يراك متصلاً وموقعك مباشر طالما هذه الصفحة مفتوحة.",
      };
    case "online_stale":
      return {
        title: "ONLINE — التحديث توقف",
        body: "ما زلت مسجّلاً كمتصل، لكن آخر ظهور صار قديماً. أبقِ الصفحة مفتوحة لمشاركة الموقع، أو اضغط غير متصل.",
      };
    case "online_no_fix":
      return {
        title: "ONLINE — في انتظار الموقع",
        body: "أنت متصل. اسمح للمتصفح بالموقع حتى يراك المطعم قبل أي تعيين.",
      };
  }
}

export function isPresenceStatus(value: string): value is PresenceStatus {
  return value === "online" || value === "offline";
}
