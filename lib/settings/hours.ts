// ============================================================================
// MaitreAI — R4 Weekly hours validator (pure; browser+server safe)
// Per-day opening hours the console writes to restaurants.hours (existing JSONB).
// Validated here so a malformed payload is rejected at the write route (400)
// instead of silently persisting garbage the agent then reads as "open 25:00".
//
// Shape: { [day]: { closed: true } | { open: "HH:MM", close: "HH:MM" } } for the
// 7 canonical day keys. Times are 24h HH:MM, open strictly before close.
// Pure so the route and its harness share one source of truth.
// ============================================================================

export const WEEK_DAYS: readonly string[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

export interface DayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}
export type WeeklyHours = Record<string, DayHours>;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const toMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export type HoursParse =
  | { ok: true; hours: WeeklyHours }
  | { ok: false; error: string };

export interface ParseHoursOptions {
  /** Allow an OVERNIGHT window (open > close, e.g. 20:00→03:00 next day). Off by
   *  default so regular hours keep same-day semantics; the Ramadan hours route
   *  turns it on (post-iftar → suhoor windows cross midnight). open == close is
   *  still rejected either way (a zero-length window is never valid). */
  allowOvernight?: boolean;
}

/** Validate + normalize a weekly-hours payload. Every present day must be either
 *  {closed:true} or a valid {open,close}. By default open must be strictly before
 *  close; with allowOvernight, open > close is accepted as an overnight window
 *  (only open == close is rejected). Unknown day keys and malformed times are
 *  rejected — never coerced. */
export function parseWeeklyHours(input: unknown, opts: ParseHoursOptions = {}): HoursParse {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "hours must be an object keyed by day" };
  }
  const out: WeeklyHours = {};
  for (const [day, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!WEEK_DAYS.includes(day)) return { ok: false, error: `unknown day: ${day}` };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `${day}: must be an object` };
    }
    const d = raw as Record<string, unknown>;
    if (d.closed === true) {
      out[day] = { closed: true };
      continue;
    }
    const open = d.open;
    const close = d.close;
    if (typeof open !== "string" || typeof close !== "string" || !HHMM.test(open) || !HHMM.test(close)) {
      return { ok: false, error: `${day}: open/close must be HH:MM (24h)` };
    }
    if (toMinutes(open) === toMinutes(close)) {
      return { ok: false, error: `${day}: open and close must differ` };
    }
    if (!opts.allowOvernight && toMinutes(open) > toMinutes(close)) {
      return { ok: false, error: `${day}: open must be before close` };
    }
    out[day] = { open, close, closed: false };
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "no days provided" };
  return { ok: true, hours: out };
}
