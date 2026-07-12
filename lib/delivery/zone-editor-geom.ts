// ============================================================================
// MaitreAI — WO-ZONE-EDITOR-V2: pure geometry + numerics for the zone map editor.
//
// LEAFLET-FREE ON PURPOSE (like zone-constants.ts): imported by the editor UI AND
// unit-tested directly (node --experimental-strip-types), so the radius math is
// proven without a browser. Reuses the router's own haversine (lib/delivery/geo),
// so the on-screen radius and the pin→zone match distance are the SAME number.
//
// Founder defect (WO-ZONE-EDITOR-V2 D2): the old handle was placed by a flat
// cos-latitude offset (a small-angle approximation) while the circle was drawn by
// Leaflet's metric projection, so the gold handle never sat on the circle edge; and
// the displayed radius (toFixed(1)) was not the saved radius (toFixed(3)). Here:
//   • destinationEast — the point due EAST on the center's own parallel whose
//     haversine distance is EXACTLY r: haversineKm(center, destinationEast(center,
//     r)) === r at any latitude. This is exactly where Leaflet's metric Circle draws
//     its east edge (a horizontal extent on the center's latitude), so the handle
//     sits ON the drawn edge AND on the distance the router measures — no drift.
//   • roundRadiusKm — THE single canonical rounding, applied at every mutation, so
//     the number shown, the number on the handle, and the number saved are one.
// ============================================================================

import { haversineKm, type LatLng } from "./geo";
import { sanitizeDecimalInput } from "../util/arabic-digits";

// Mirror lib/delivery/geo's earth radius so destinationEast and haversineKm agree.
const EARTH_RADIUS_KM = 6371;
export const RADIUS_MIN_KM = 0.1;
export const RADIUS_MAX_KM = 100;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** The point due EAST of `center`, on the center's OWN parallel, whose haversine
 *  distance is exactly `km`: haversineKm(center, destinationEast(center, r)) === r
 *  at any latitude. Derived by inverting the same-latitude haversine
 *  (dLat = 0 ⇒ distance = 2R·asin(cos(lat)·sin(Δlng/2))), so the handle lands on
 *  Leaflet's metric-Circle east edge AND on the router's measured radius — no drift.
 *  Near the poles the parallel is too short to reach `km` east; Δlng saturates at π. */
export function destinationEast(center: LatLng, km: number): LatLng {
  const cosLat = Math.cos(toRad(center.lat));
  if (cosLat <= 1e-12) return { lat: center.lat, lng: center.lng }; // degenerate at a pole
  const ratio = Math.sin(Math.max(0, km) / (2 * EARTH_RADIUS_KM)) / cosLat;
  const dLng = ratio >= 1 ? Math.PI : 2 * Math.asin(ratio);
  return { lat: center.lat, lng: center.lng + toDeg(dLng) };
}

/** Clamp a raw km value to the editor's sane bounds [0.1, 100]. */
export function clampRadiusKm(km: number): number {
  if (!Number.isFinite(km)) return RADIUS_MIN_KM;
  return Math.min(RADIUS_MAX_KM, Math.max(RADIUS_MIN_KM, km));
}

/** THE single canonical rounding — 2 decimals (10 m). Applied at EVERY radius
 *  mutation (drag-commit, numeric input, initial load) so the displayed value, the
 *  handle's live label, and the saved payload are byte-equal by construction. */
export function roundRadiusKm(km: number): number {
  return Math.round(clampRadiusKm(km) * 100) / 100;
}

/** Radius (km) implied by dragging the handle to `pointer`: the great-circle
 *  distance from center, canonically rounded + clamped. Same haversine the router
 *  uses, so what the operator drew is what gets matched. */
export function radiusFromDrag(center: LatLng, pointer: LatLng): number {
  return roundRadiusKm(haversineKm(center, pointer));
}

/** Sanitize typed radius text to digits + one dot via the shared sanitizer, so an
 *  Arabic-Indic "٣٫٥" survives to "3.5" (JS \d strips it otherwise). Returns the
 *  STRING for the controlled input; parseRadiusKm commits it to a number. */
export function sanitizeRadiusInput(raw: string): string {
  return sanitizeDecimalInput(raw);
}

/** Parse sanitized radius text to a canonical km number, or null if empty/invalid
 *  (so the field can be mid-edit without forcing a value). */
export function parseRadiusKm(raw: string): number | null {
  const s = sanitizeDecimalInput(raw).trim();
  if (s === "" || s === ".") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return roundRadiusKm(n);
}

/** Lossless ASCII display of a canonical radius: 3.5→"3.5", 2→"2", 1.97→"1.97".
 *  Because the value is already canonical, parseFloat(formatKm(r)) === r — the
 *  string shown carries the exact number saved. Callers wrap it in toArabicDigits. */
export function formatKm(km: number): string {
  return String(roundRadiusKm(km));
}
