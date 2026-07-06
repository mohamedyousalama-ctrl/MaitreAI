// ============================================================================
// Kivo (KSA) — WO-RAMADAN-MODE: the ONE read-path helper for operating hours.
//
// Every place that reads a restaurant's operating hours to make a decision
// (tonight-notes expiry, hours answers, open checks) goes through effectiveHours
// so the Ramadan override is applied in exactly one spot and can't drift.
//
// Rule (precedence): ramadan_mode === true AND ramadan_hours is a NON-EMPTY object
// → ramadan_hours. Otherwise (mode off, or no ramadan_hours set) → regular hours.
// A null/empty ramadan_hours is a no-op even with the mode on — you never lose
// your regular hours by flipping the switch before entering the seasonal set.
//
// Pure (no imports beyond the WeeklyHours type) so it is node strip-types-testable
// and shared by the route + its harness.
// ============================================================================

import type { WeeklyHours } from "@/lib/settings/hours";

/** The hours-bearing subset of a restaurant row this helper reads. */
export interface RestaurantHoursFields {
  hours?: WeeklyHours | Record<string, unknown> | null;
  ramadan_mode?: boolean | null;
  ramadan_hours?: WeeklyHours | Record<string, unknown> | null;
}

export type EffectiveHoursSource = "ramadan" | "regular";

function isNonEmptyObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0;
}

/** Which hours set is in force right now — 'ramadan' only when the mode is on AND
 *  a non-empty ramadan_hours exists; otherwise 'regular'. */
export function effectiveHoursSource(r: RestaurantHoursFields | null | undefined): EffectiveHoursSource {
  if (r?.ramadan_mode === true && isNonEmptyObject(r?.ramadan_hours)) return "ramadan";
  return "regular";
}

/**
 * Resolve the operating hours to USE. Returns ramadan_hours when Ramadan mode is
 * on and populated, else the regular hours (which may itself be null/empty — this
 * helper only chooses WHICH set, it never invents hours). The returned object is
 * the same shape callers already expect from restaurants.hours.
 */
export function effectiveHours(
  r: RestaurantHoursFields | null | undefined,
): WeeklyHours | Record<string, unknown> | null | undefined {
  return effectiveHoursSource(r) === "ramadan" ? r?.ramadan_hours : r?.hours;
}
