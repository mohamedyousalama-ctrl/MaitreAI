// ============================================================================
// فيصل / Faysal — Riyadh-local calendar arithmetic. PURE. No clock reads.
//
// Riyadh is UTC+03:00 with no DST [INF-03], so all of this is fixed-offset
// integer arithmetic — no Intl, no timezone database, no server-locale
// dependency. Every function here is total: it either returns a value or
// throws a named error, never a plausible guess.
// ============================================================================

import { CLINIC_UTC_OFFSET_MINUTES } from "./config";
import type { DayKey } from "./types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM_RE = /^(\d{2}):(\d{2})$/;

/** JS getUTCDay(): 0 = Sunday … 6 = Saturday. */
const JS_DAY_TO_KEY: readonly DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function isDateISO(s: string): boolean {
  return DATE_RE.test(s);
}

/** "YYYY-MM-DD" → the day key. TZ-free: the date string IS the Riyadh-local day. */
export function dayKeyOf(dateISO: string): DayKey {
  const m = DATE_RE.exec(dateISO);
  if (!m) throw new Error(`bad_date:${dateISO}`);
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(utc);
  // Round-trip check catches "2026-02-31" style dates, which Date.UTC rolls over.
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new Error(`bad_date:${dateISO}`);
  }
  return JS_DAY_TO_KEY[d.getUTCDay()];
}

export function isFriday(dateISO: string): boolean {
  return dayKeyOf(dateISO) === "fri";
}

/** "HH:MM" → minutes since local midnight. "24:00" === 1440 (end of THIS day). */
export function minutesOf(hhmm: string): number {
  const m = HHMM_RE.exec(hhmm);
  if (!m) throw new Error(`bad_time:${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) throw new Error(`bad_time:${hhmm}`);
  return h * 60 + min;
}

/** Minutes since local midnight → "HH:MM". 1440 renders as "24:00" (§4.8). */
export function hhmmOf(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    throw new Error(`bad_minutes:${minutes}`);
  }
  if (minutes === 1440) return "24:00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Days between two ISO dates (b - a), calendar-exact, no DST to worry about. */
export function daysBetween(aISO: string, bISO: string): number {
  return Math.round((utcMidnight(bISO) - utcMidnight(aISO)) / 86_400_000);
}

export function addDays(dateISO: string, days: number): string {
  const d = new Date(utcMidnight(dateISO) + days * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

function utcMidnight(dateISO: string): number {
  const m = DATE_RE.exec(dateISO);
  if (!m) throw new Error(`bad_date:${dateISO}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export interface LocalInstant {
  /** Riyadh-local calendar date. */
  dateISO: string;
  /** Minutes since Riyadh-local midnight. */
  minutes: number;
  dayKey: DayKey;
}

/**
 * Anything a caller might hold → a Riyadh-local instant.
 *
 *   • a Date, or an ISO string carrying `Z` / an explicit offset → converted
 *     with the PINNED +03:00. The server's own timezone is never consulted.
 *   • an ISO string with NO zone ("2026-09-15T03:00") → already Riyadh-local.
 *   • "YYYY-MM-DD" → local midnight of that day.
 */
export function toLocalInstant(when: string | Date | LocalInstant): LocalInstant {
  if (typeof when === "object" && !(when instanceof Date)) return when;

  if (when instanceof Date) return fromEpochMs(when.getTime());

  const raw = String(when).trim();
  if (DATE_RE.test(raw)) return { dateISO: raw, minutes: 0, dayKey: dayKeyOf(raw) };

  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  if (zoned) {
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) throw new Error(`bad_instant:${raw}`);
    return fromEpochMs(ms);
  }

  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(raw);
  if (!m) throw new Error(`bad_instant:${raw}`);
  const dateISO = m[1];
  return {
    dateISO,
    minutes: Number(m[2]) * 60 + Number(m[3]),
    dayKey: dayKeyOf(dateISO),
  };
}

function fromEpochMs(ms: number): LocalInstant {
  const shifted = new Date(ms + CLINIC_UTC_OFFSET_MINUTES * 60_000);
  const dateISO = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
    shifted.getUTCDate()
  ).padStart(2, "0")}`;
  return {
    dateISO,
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    dayKey: dayKeyOf(dateISO),
  };
}

/** Riyadh-local date + minutes → epoch ms. The inverse of fromEpochMs. */
export function localToEpochMs(dateISO: string, minutes: number): number {
  return utcMidnight(dateISO) + (minutes - CLINIC_UTC_OFFSET_MINUTES) * 60_000;
}

/** Minutes from `from` to `to`, both Riyadh-local instants. */
export function minutesBetweenInstants(from: LocalInstant, to: LocalInstant): number {
  return daysBetween(from.dateISO, to.dateISO) * 1440 + (to.minutes - from.minutes);
}

/** ISO date of the calendar day `when` falls on, Riyadh-local. */
export function localDateOf(when: string | Date | LocalInstant): string {
  return toLocalInstant(when).dateISO;
}
