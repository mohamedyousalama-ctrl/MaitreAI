// ============================================================================
// فيصل / Faysal — bounded-by-construction constants and the ONE DEMO_MODE read.
// SPEC-1-DOMAIN.md §0.2 point 5, §4.1, §4.3, §4.9, §7.2.
//
// The demo's blast radius is a set of named constants, not a hope — the same
// posture as DEMO_MAX_CHARS / DEMO_SESSION_TTL_MS in lib/demo/config.ts. Every
// number here is read from exactly one place, so nothing can drift.
// ============================================================================

import type { DayKey } from "./types";

// ── Time (§4.1) ─────────────────────────────────────────────────────────────

/** Riyadh is UTC+03:00 with no DST. PINNED — never derived from the server clock. [INF-03] */
export const CLINIC_TZ = "Asia/Riyadh" as const;

/** The pinned offset, in minutes. The only place the +03:00 lives. */
export const CLINIC_UTC_OFFSET_MINUTES = 180;

/** Operating week starts Saturday (§4.1). Index order used by every reader. */
export const DAY_KEYS: readonly DayKey[] = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const;

// ── Staleness (Rule HRS-FRESH, §4.3 + §4.10) ────────────────────────────────

/** Scraped/researched hours decay one rung past this. */
export const HOURS_STALE_AFTER_DAYS = 30;

/** A dated answer from a NAMED person at the client decays slower, and DOWNGRADES. */
export const CLIENT_CONFIRMED_STALE_AFTER_DAYS = 180;
export const CLIENT_CONFIRMED_SECOND_STALE_AFTER_DAYS = 365;

/** At 150 days a re-confirmation task fires to the group. Operational alert, not silent decay. */
export const CLIENT_CONFIRMED_REALERT_DAYS = 150;

// ── Demo bounds (§7.2) ──────────────────────────────────────────────────────

/** Beyond this, Faysal takes a callback rather than inventing a schedule months out. */
export const FAYSAL_BOOKING_HORIZON_DAYS = 14;

/** No booking inside two hours. 14:55 for 15:00 is a walk-in, not a booking. */
export const FAYSAL_MIN_LEAD_MINUTES = 120;

/** WhatsApp readability. Rule SLOT-1: offering is not holding. */
export const FAYSAL_MAX_SLOTS_PER_REPLY = 3;

/** §7.5 — the hold TTL. Ten minutes. */
export const FAYSAL_HOLD_TTL_MS = 10 * 60 * 1000;

/** HOLD-2 — one active hold per WhatsApp identity; a family block counts as one. */
export const FAYSAL_MAX_ACTIVE_HOLDS_PER_PATIENT = 1;

/** Grid alignment for slot generation. */
export const FAYSAL_SLOT_GRID_MINUTES = 15;

/**
 * PINNED, never accepted from a request — the same posture as DEMO_RESTAURANT_ID
 * in lib/demo/config.ts. A caller-supplied salt is a caller-supplied schedule.
 */
export const FAYSAL_SLOT_SALT = "faysal-wattan-2026-09";

/** FAM-2 — beyond this a "block" is two visits, and Faysal says so. */
export const FAYSAL_FAMILY_MAX_GAP_MINUTES = 15;

// ── DEMO_MODE — read HERE and at bookableWindows(), nowhere else ────────────

/**
 * Rule HRS-DEMO. `demo_seeded` hours are accepted by exactly ONE function
 * (bookableWindows), and only while this is on. A second reader is a second
 * answer — the same law as PRICE-2's single calculator.
 *
 * Defaults to OFF. A production build that forgets to set it books nothing,
 * which is the correct production behaviour (§4.10, DOC-3 row 3).
 */
export function demoModeFromEnv(env: Record<string, string | undefined> = readEnv()): boolean {
  const raw = env.FAYSAL_DEMO_MODE ?? env.NEXT_PUBLIC_FAYSAL_DEMO_MODE ?? "";
  return raw.trim().toLowerCase() === "true" || raw.trim() === "1";
}

function readEnv(): Record<string, string | undefined> {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env ?? {};
}

// ── Frozen patient-visible strings ──────────────────────────────────────────
// SPEC-2-PERSONA.md owns every patient-visible string. These are reproduced
// byte-for-byte from it and are emitted by RENDERERS here, never composed by a
// model — a disclaimer a model can forget is not a disclaimer.

/**
 * Rule PRICE-1. The label appended to every figure that leaves the calculator.
 * Wording owned by SPEC-2-PERSONA.md §5.2; this rule owns the requirement.
 */
export const PRICE_LABEL_AR = "هذا سعر استرشادي، والمعتمد من الاستقبال.";

/**
 * Rule DEMO-1(c). A frozen suffix of every confirmation block — `slot` and
 * `callback_request`, contested site and operational. SPEC-2 §6.7.
 * This is the one that survives a screenshot.
 */
export const DEMO_BOOKING_SUFFIX_AR = "حجز تجريبي — غير مسجّل لدى الفرع.";

/** Rule DEMO-1(b). The system-voice first line. Carries the REAL numbers. */
export const DEMO_SYSTEM_LINE_AR =
  "هذا عرض تجريبي. الأطباء والمواعيد والأسعار المعروضة هنا افتراضية للعرض فقط، وغير معتمدة من مجموعة الوطن الطبية. " +
  "للحجز الفعلي: 920009303 أو واتساب 0504490460. وللطوارئ: 997.";

/** Group-level numbers (§1). The unified 920 is stored in its canonical form. */
export const GROUP_UNIFIED_920_WATTAN = "920009303";
export const GROUP_UNIFIED_920_SHOAA = "920002258";
export const GROUP_WHATSAPP = "0504490460";

// ── HRS-SEASON (§4.9) ───────────────────────────────────────────────────────

/**
 * Rule HRS-SEASON. Inside a volatility window with no override authored, every
 * affected day is unbookable and Faysal switches to callback. Wave 1 ships the
 * window dates with the overrides blank, so the guard exists before the data.
 * Dates are [OPEN-04] — approximate, and that is exactly why they only ever
 * REMOVE inventory. They can never add any.
 */
export interface VolatilityWindow {
  name: string;
  fromISO: string;
  toISO: string;
  note: string;
}

export const VOLATILITY_WINDOWS: readonly VolatilityWindow[] = [
  {
    name: "ramadan-1448",
    fromISO: "2027-02-08",
    toISO: "2027-03-10",
    note: "[INF-05] Riyadh clinic hours shift materially in Ramadan; no override authored. [OPEN-04]",
  },
  {
    name: "eid-al-fitr-1448",
    fromISO: "2027-03-10",
    toISO: "2027-03-14",
    note: "[OPEN-04] Eid closures are routine and unpublished here.",
  },
  {
    name: "eid-al-adha-1447",
    fromISO: "2026-05-26",
    toISO: "2026-05-30",
    note: "[OPEN-04] Eid closures are routine and unpublished here.",
  },
  {
    name: "saudi-national-day-2026",
    fromISO: "2026-09-23",
    toISO: "2026-09-23",
    note: "[OPEN-04] National Day; group calendar unknown.",
  },
] as const;
