// ============================================================================
// Kivo Delivery Network — Cairo pilot polish: operator refresh policy (PURE).
//
// FIELD FINDING (KIV-37 / KIV-51): the operator surface reflected driver status
// / location updates with up to ~1 minute of delay. Do not guess — the code
// paths that produce that delay are:
//
//   1. Realtime watches `deliveries` + `drivers` only. `delivery_locations` is
//      intentionally off the publication (0048) and has no restaurant_id filter
//      column, so GPS freshness cannot arrive via postgres_changes without a
//      migration (not released for this polish).
//   2. The operator client polled /api/deliveries every 15s, and only while a
//      job was in-progress. That is already the product-ready ceiling — any
//      missed realtime event waited a full 15s in a foreground tab.
//   3. Chromium throttles timers in a hidden tab to ~1 execution per minute.
//      The field loop had the operator looking at the driver phone, so the
//      deliveries tab was backgrounded: the 15s poll became ~60s. That matches
//      the observed lag without assuming a server bug.
//   4. loadDeliveries swallowed HTTP/network failures, so a dead poll looked
//      identical to "everything is fine".
//
// POLICY: while a job is in-progress AND the tab is visible, poll every 4s
// (well under the 15s product target). On visibility/focus, pull immediately
// (defeats the hidden-tab timer cap). If the last successful pull is older
// than 15s while a job is live, or a pull failed, surface stale/error — never
// a silent freeze. Freshness age is ticked from recorded_at on the client so
// a point does not sit labelled "live" between polls.
// ============================================================================

export const IN_PROGRESS_STATUSES = ["assigned", "picked_up", "on_the_way"] as const;

/** Foreground poll while a job is live. Must stay strictly under STALE_AFTER_MS. */
export const VISIBLE_POLL_MS = 4_000;

/** Product-ready ceiling: operator must see an update or an explicit stale/error. */
export const STALE_AFTER_MS = 15_000;

/**
 * Chromium hidden-tab timer cap that produced the field ~1 minute observation.
 * Documented so tests can lock the diagnosis; never used as a poll interval.
 */
export const HIDDEN_TAB_TIMER_CAP_MS = 60_000;

/** Must match lib/db/delivery.ts LOCATION_FRESH_MS (server-only module). */
export const OPERATOR_LOCATION_FRESH_MS = 30_000;

export function isInProgressStatus(status: string): boolean {
  return (IN_PROGRESS_STATUSES as readonly string[]).includes(status);
}

export function locationAge(
  recordedAt: string,
  now: number
): { ageMs: number; fresh: boolean } {
  const ageMs = Math.max(0, now - new Date(recordedAt).getTime());
  return { ageMs, fresh: ageMs < OPERATOR_LOCATION_FRESH_MS };
}

export function tickLocation<T extends { recorded_at: string }>(
  loc: T | null | undefined,
  now: number
): (T & { ageMs: number; fresh: boolean }) | null {
  if (!loc) return null;
  return { ...loc, ...locationAge(loc.recorded_at, now) };
}

export type RefreshHealth = "live" | "stale" | "error" | "idle";

export function classifyRefreshHealth(args: {
  now: number;
  lastOkAt: number | null;
  lastError: string | null;
  hasInProgress: boolean;
}): RefreshHealth {
  if (args.lastError) return "error";
  if (!args.hasInProgress) return "idle";
  if (args.lastOkAt == null) return "stale";
  if (args.now - args.lastOkAt >= STALE_AFTER_MS) return "stale";
  return "live";
}
