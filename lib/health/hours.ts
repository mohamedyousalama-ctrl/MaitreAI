// ============================================================================
// فيصل / Faysal — HOURS. The most operationally important module in the engine.
// SPEC-1-DOMAIN.md §4 in full.
//
//   «Faysal must never be able to send a patient to a closed desk.»
//
// Everything here follows from that plus one corollary: "unknown" must be a
// first-class state, never a guess. A model that can only say open or closed
// will say "open" for Complex 4, because that is the shape of a boolean's
// default. So the model does not have a boolean.
//
// THE FIVE INVARIANTS, and where each is enforced:
//   H1  no slot outside bookableWindows()            → slots.ts calls this and only this
//   H2  unknown is closed for booking, open for talk → bookableWindows [] vs hoursDisclosure
//   H3  Friday is NEVER inferred from another day    → dayHoursFor() has no fallback path
//   H4  facility/er never authorise a clinic slot    → bookableWindows reads "clinic" ONLY
//   H5  a non-operational site is never sole+silent  → canMintSlots + pendingBranchConfirmation
//   H6  client_confirmed needs an attribution        → the DayHours union in types.ts
//
// PURE. `now` is an argument. The exported wrappers default it from the clock
// exactly once, at the top of the call; every internal function is total.
// ============================================================================

import {
  CLIENT_CONFIRMED_REALERT_DAYS,
  CLIENT_CONFIRMED_SECOND_STALE_AFTER_DAYS,
  CLIENT_CONFIRMED_STALE_AFTER_DAYS,
  HOURS_STALE_AFTER_DAYS,
  VOLATILITY_WINDOWS,
  demoModeFromEnv,
} from "./config";
import { isContested, canMintSlots, isSiteId, patientPhoneFor, siteById } from "./sites";
import {
  addDays,
  dayKeyOf,
  daysBetween,
  hhmmOf,
  isDateISO,
  localDateOf,
  minutesOf,
  toLocalInstant,
} from "./time";
import type {
  Confidence,
  DayHours,
  DayKey,
  HoursLayer,
  LayerHours,
  SiteHours,
  SiteId,
  SourceRef,
  TimeWindow,
  Window,
} from "./types";

// ── helpers for authoring ───────────────────────────────────────────────────

function s(
  kind: SourceRef["kind"],
  note: string,
  dossierRef: string,
  capturedAt: string
): SourceRef {
  return { kind, note, dossierRef, capturedAt };
}

function win(open: string, close: string): TimeWindow {
  return { open, close, crossesMidnight: minutesOf(close) < minutesOf(open) };
}

/** The pinned answer for a day nobody has told us about. NEVER a sibling day. */
export const UNKNOWN_DAY: DayHours = Object.freeze({
  status: "unknown",
  windows: [],
  confidence: "unknown",
  capturedAt: "",
  sources: [],
  conflicts: [],
}) as DayHours;

function week(days: Partial<Record<DayKey, DayHours>>): Partial<Record<DayKey, DayHours>> {
  return days;
}

/** Same record for several days. NOT inference — the source states them together. */
function spread(keys: DayKey[], day: DayHours): Partial<Record<DayKey, DayHours>> {
  const out: Partial<Record<DayKey, DayHours>> = {};
  for (const k of keys) out[k] = day;
  return out;
}

const SAT_TO_THU: DayKey[] = ["sat", "sun", "mon", "tue", "wed", "thu"];
const ALL_DAYS: DayKey[] = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];

// ── §4.4 / §4.5 / §4.6 / §4.7 — the authored hours ──────────────────────────
//
// Read the Friday column downward: 13:00 · 16:00 · closed(?) · unknown ·
// 24/7(?) · 16:00. There is no group-wide Friday rule to encode, and any
// implementation that ships one is guessing — which H3 forbids.

const WATTAN_1_HOURS: SiteHours = {
  siteId: "wattan-1",
  timezone: "Asia/Riyadh",
  staleAfterDays: HOURS_STALE_AFTER_DAYS,
  layers: [
    {
      layer: "facility",
      note: "24-hour building with a duty doctor. This layer answers 'are you open now?' and mints NOTHING (H4).",
      overrides: [],
      week: {
        ...spread(SAT_TO_THU, {
          status: "open_24h",
          windows: [],
          confidence: "high",
          capturedAt: "2026-09-09",
          sources: [s("google_maps", "Sun–Thu and Sat open 24 hours", "§3.1 L112-113", "2026-09-09")],
          conflicts: [],
        }),
        // POL-01: the INTERSECTION of the two conflicting claims (13:00–24:00) —
        // the narrower window BOTH sources support. Disclosure only. It does not
        // upgrade confidence and it mints no slots.
        fri: {
          status: "windows",
          windows: [win("13:00", "24:00")],
          confidence: "conflicted",
          capturedAt: "2026-09-09",
          sources: [s("google_maps", "Friday 13:00 opening, commonly listed", "§3.1 L113", "2026-09-09")],
          conflicts: [
            {
              claimA: "Friday 13:00–24:00 (commonly listed)",
              claimB: "Friday 13:00–07:00 next day (some sources)",
              dossierRefA: "§3.1 L113",
              dossierRefB: "§3.1 L113",
              resolution: "unresolved",
              agentBehaviour:
                "Describe the intersection 13:00–24:00 only, mint no Friday slot, and give 011 458 8444 (Rule FRI-1).",
            },
          ],
        },
      },
    },
    {
      layer: "er",
      note: "Informational ONLY (Wave 1.5 / B6). It never feeds the emergency rail — SPEC-4 §4.4 owns erSites().",
      overrides: [],
      week: spread(ALL_DAYS, {
        status: "open_24h",
        windows: [],
        confidence: "medium",
        capturedAt: "2026-09-09",
        sources: [s("dossier_only", "ER services at one or more sites", "§2 L74-75", "2026-09-09")],
        conflicts: [],
      }),
    },
    {
      layer: "clinic",
      note:
        "The older 'clinic shift' pattern, from ONE Arabic guide the dossier itself calls older. `low` on purpose: " +
        "it mints nothing, so Complex 1 has no bookable outpatient slots in Wave 1 (§4.7). [OPEN-01]",
      overrides: [],
      week: {
        ...spread(SAT_TO_THU, {
          status: "windows",
          windows: [win("09:00", "12:00"), win("16:00", "21:30")],
          confidence: "low",
          capturedAt: "2024-01-01",
          sources: [s("directory", "Arabic guide, 'older clinic shift' pattern", "§3.1 L126", "2024-01-01")],
          conflicts: [],
        }),
        fri: {
          status: "windows",
          windows: [win("13:00", "24:00")],
          confidence: "low",
          capturedAt: "2024-01-01",
          sources: [s("directory", "Arabic guide: Friday clinic from 13:00", "§3.1 L126", "2024-01-01")],
          conflicts: [],
        },
      },
    },
  ],
};

const WATTAN_2_HOURS: SiteHours = {
  siteId: "wattan-2",
  timezone: "Asia/Riyadh",
  staleAfterDays: HOURS_STALE_AFTER_DAYS,
  layers: [
    {
      layer: "facility",
      overrides: [],
      week: {
        ...spread(SAT_TO_THU, {
          status: "open_24h",
          windows: [],
          confidence: "medium",
          capturedAt: "2026-09-09",
          sources: [s("google_maps", "mostly 24 hours", "§3.2 L138-139", "2026-09-09")],
          conflicts: [],
        }),
        fri: {
          status: "windows",
          windows: [win("16:00", "24:00")],
          confidence: "medium",
          capturedAt: "2026-09-09",
          sources: [s("google_maps", "Friday 16:00–24:00, 'often listed'", "§3.2 L139", "2026-09-09")],
          conflicts: [],
        },
      },
    },
    {
      layer: "clinic",
      note:
        "Rule HRS-DEMO — INVENTED clinic sessions, one of exactly three seeded sites. Accepted by bookableWindows() " +
        "ONLY under DEMO_MODE, disclosed in-conversation by Rule DEMO-1, and replaced the moment [OPEN-01] is answered. " +
        "Authored day by day: Friday is NOT derived from the weekday pattern or from the facility layer (H3, H4).",
      overrides: [],
      week: {
        ...spread(SAT_TO_THU, {
          status: "windows",
          windows: [win("09:00", "12:30"), win("16:30", "21:30")],
          confidence: "demo_seeded",
          capturedAt: null,
          demoNote: "[DEMO] invented split shift for the demo. Not an Al Wattan fact.",
          sources: [s("invented_for_demo", "Rule HRS-DEMO seeded clinic shift", "§4.10", "n/a")],
          conflicts: [],
        }),
        fri: {
          status: "windows",
          windows: [win("16:30", "21:30")],
          confidence: "demo_seeded",
          capturedAt: null,
          demoNote:
            "[DEMO] invented Friday afternoon clinic — authored, not inferred. Every Friday answer still carries the branch phone (FRI-1).",
          sources: [s("invented_for_demo", "Rule HRS-DEMO seeded Friday clinic", "§4.10", "n/a")],
          conflicts: [],
        },
      },
    },
  ],
};

const WATTAN_3_HOURS: SiteHours = {
  siteId: "wattan-3",
  timezone: "Asia/Riyadh",
  staleAfterDays: HOURS_STALE_AFTER_DAYS,
  layers: [
    {
      layer: "facility",
      note: "One 2024 Arabic guide. Stale by Rule HRS-FRESH, which downgrades it mechanically — nobody has to remember.",
      overrides: [],
      week: {
        ...spread(SAT_TO_THU, {
          status: "windows",
          windows: [win("08:00", "24:00")],
          confidence: "medium",
          capturedAt: "2024-05-01",
          sources: [s("directory", "2024 Arabic branch guide", "§3.3 L155-156", "2024-05-01")],
          conflicts: [],
        }),
        // §4.5 — `unknown`, NOT `closed`. One 2024 guide is not a closure, and
        // the counter-argument ("other group sites run Friday afternoon") is a
        // PATTERN, which under H3 is equally unusable. It mints nothing either way.
        fri: {
          status: "unknown",
          windows: [],
          confidence: "conflicted",
          capturedAt: "2024-05-01",
          sources: [s("directory", "2024 Arabic branch guide", "§3.3 L155-156", "2024-05-01")],
          conflicts: [
            {
              claimA: "Friday closed (one 2024 Arabic guide)",
              claimB:
                "Other group sites run Friday afternoon (Complex 1 from 13:00, Complex 2 from 16:00, Shoaa Rawdah from 16:00)",
              dossierRefA: "§3.3 L156",
              dossierRefB: "§3.1 L113, §3.2 L139, §3.6 L204",
              resolution: "unresolved",
              agentBehaviour:
                "Offer no Friday slot at Ar Rabwah. State that Friday is unconfirmed at this branch, give 011 491 8003, " +
                "and offer a Friday slot at a branch with a published Friday window or a Saturday slot at Ar Rabwah.",
            },
          ],
        },
      },
    },
    // NO clinic layer. The dossier gives facility hours only, and H4 forbids
    // promoting them. Ar Rabwah therefore mints nothing, on every day. [OPEN-01]
  ],
};

const WATTAN_4_HOURS: SiteHours = {
  siteId: "wattan-4",
  timezone: "Asia/Riyadh",
  staleAfterDays: HOURS_STALE_AFTER_DAYS,
  layers: [
    {
      layer: "facility",
      note:
        "§4.6 — SILENCE IS NOT A SCHEDULE. The dossier publishes hours for five sites and none for Complex 4. " +
        "The week is empty on purpose: every day resolves to UNKNOWN_DAY, and there is no sibling pattern to inherit.",
      overrides: [],
      week: {},
    },
    {
      layer: "clinic",
      note: "Empty for the same reason. bookableWindows() returns [] here on every day in the horizon (criterion 1).",
      overrides: [],
      week: {},
    },
  ],
};

const SHOAA_WURUD_HOURS: SiteHours = {
  siteId: "shoaa-wurud",
  timezone: "Asia/Riyadh",
  staleAfterDays: HOURS_STALE_AFTER_DAYS,
  layers: [
    {
      layer: "facility",
      overrides: [],
      week: spread(ALL_DAYS, {
        status: "open_24h",
        windows: [],
        confidence: "medium",
        capturedAt: "2026-09-09",
        sources: [s("official_site", "advertised 24/7 including ER", "§3.5 L184-185", "2026-09-09")],
        conflicts: [],
      }),
    },
    {
      layer: "er",
      note: "Informational only — never feeds the rail (SPEC-4 §4.4 owns erSites()).",
      overrides: [],
      week: spread(ALL_DAYS, {
        status: "open_24h",
        windows: [],
        confidence: "medium",
        capturedAt: "2026-09-09",
        sources: [s("official_site", "24/7 including ER", "§3.5 L184-185", "2026-09-09")],
        conflicts: [],
      }),
    },
    {
      layer: "phone",
      note:
        "A LAYER COLLISION, not a contradiction: a 24/7 building whose call-centre copy lists Sat–Thu 08:00–21:00. " +
        "Exactly what HoursLayer exists for. Friday is left unknown — the copy implies, and an implication is not an hour.",
      overrides: [],
      week: {
        ...spread(SAT_TO_THU, {
          status: "windows",
          windows: [win("08:00", "21:00")],
          confidence: "medium",
          capturedAt: "2026-09-09",
          sources: [s("official_site", "call-centre copy for phone inquiries", "§3.5 L184-185", "2026-09-09")],
          conflicts: [],
        }),
        fri: {
          status: "unknown",
          windows: [],
          confidence: "low",
          capturedAt: "2026-09-09",
          sources: [s("official_site", "phone-hours copy lists Sat–Thu only; Friday not stated", "§3.5 L184-185", "2026-09-09")],
          conflicts: [],
        },
      },
    },
    {
      layer: "clinic",
      note:
        "Rule HRS-DEMO — seeded site 2 of 3. Sat–Thu only: FRIDAY IS DELIBERATELY NOT SEEDED, because the 24/7 claim is " +
        "a facility claim and H4 forbids promoting it. Friday here answers [] and the reply carries the branch number.",
      overrides: [],
      week: spread(SAT_TO_THU, {
        status: "windows",
        windows: [win("09:00", "12:30"), win("17:00", "21:30")],
        confidence: "demo_seeded",
        capturedAt: null,
        demoNote: "[DEMO] invented split shift for the demo. Not an Al Wattan fact.",
        sources: [s("invented_for_demo", "Rule HRS-DEMO seeded clinic shift", "§4.10", "n/a")],
        conflicts: [],
      }),
    },
  ],
};

const SHOAA_RAWDAH_HOURS: SiteHours = {
  siteId: "shoaa-rawdah",
  timezone: "Asia/Riyadh",
  staleAfterDays: HOURS_STALE_AFTER_DAYS,
  layers: [
    {
      layer: "facility",
      note: "Only source is the LEGACY Mashfa page — hours published by the previous owner before the 2022 acquisition.",
      overrides: [],
      week: {
        ...spread(SAT_TO_THU, {
          status: "windows",
          windows: [win("08:00", "24:00")],
          confidence: "low",
          capturedAt: "2021-06-01",
          sources: [s("legacy_site", "legacy Mashfa page, pre-acquisition", "§3.6 L203-204", "2021-06-01")],
          conflicts: [],
        }),
        fri: {
          status: "windows",
          windows: [win("16:00", "24:00")],
          confidence: "low",
          capturedAt: "2021-06-01",
          sources: [s("legacy_site", "legacy Mashfa page: Friday 16:00–24:00", "§3.6 L204", "2021-06-01")],
          conflicts: [],
        },
      },
    },
    {
      layer: "er",
      note: "'ER until midnight' on the legacy page — named_at_site but low confidence and pre-acquisition.",
      overrides: [],
      week: {
        ...spread(SAT_TO_THU, {
          status: "windows",
          windows: [win("08:00", "24:00")],
          confidence: "low",
          capturedAt: "2021-06-01",
          sources: [s("legacy_site", "ER until midnight", "§3.6 L204", "2021-06-01")],
          conflicts: [],
        }),
        fri: {
          status: "windows",
          windows: [win("16:00", "24:00")],
          confidence: "low",
          capturedAt: "2021-06-01",
          sources: [s("legacy_site", "ER until midnight", "§3.6 L204", "2021-06-01")],
          conflicts: [],
        },
      },
    },
    {
      layer: "clinic",
      note:
        "Rule HRS-DEMO — seeded site 3 of 3. Sat–Thu only; Friday is not seeded, because the only Friday source here is " +
        "the previous owner's page and inventing on top of it would launder it.",
      overrides: [],
      week: spread(SAT_TO_THU, {
        status: "windows",
        windows: [win("09:00", "13:00"), win("17:00", "21:00")],
        confidence: "demo_seeded",
        capturedAt: null,
        demoNote: "[DEMO] invented split shift for the demo. Not an Al Wattan fact.",
        sources: [s("invented_for_demo", "Rule HRS-DEMO seeded clinic shift", "§4.10", "n/a")],
        conflicts: [],
      }),
    },
  ],
};

export type HoursTable = Record<SiteId, SiteHours>;

export const SITE_HOURS: HoursTable = {
  "wattan-1": WATTAN_1_HOURS,
  "wattan-2": WATTAN_2_HOURS,
  "wattan-3": WATTAN_3_HOURS,
  "wattan-4": WATTAN_4_HOURS,
  "shoaa-wurud": SHOAA_WURUD_HOURS,
  "shoaa-rawdah": SHOAA_RAWDAH_HOURS,
};

// ── readers ─────────────────────────────────────────────────────────────────

export interface HoursOpts {
  /** ISO instant. Supplied → the call is PURE. Omitted → the clock is read once. */
  now?: string;
  /** Overrides the DEMO_MODE env read. Tests always pass it. */
  demoMode?: boolean;
  /** Alternate hours table — how a test mutates the data without monkey-patching. */
  hours?: HoursTable;
}

function tableOf(opts?: HoursOpts): HoursTable {
  return opts?.hours ?? SITE_HOURS;
}

function nowISO(opts?: HoursOpts): string {
  return opts?.now ?? new Date().toISOString();
}

export function layerHoursFor(
  siteId: SiteId,
  layer: HoursLayer,
  opts?: HoursOpts
): LayerHours | null {
  const site = tableOf(opts)[siteId];
  if (!site) return null;
  return site.layers.find((l) => l.layer === layer) ?? null;
}

/**
 * THE ONLY DAY READER, and it has no fallback path — Invariant H3.
 *
 * A missing Friday is `unknown`. Never copied from Thursday, never defaulted to
 * the weekday pattern, never interpolated across sites. Five of six sites have a
 * Friday that differs from their own weekday pattern; a generic scheduler that
 * treats Friday as "another day" is wrong at almost every site.
 */
export function dayHoursFor(
  siteId: SiteId,
  layer: HoursLayer,
  dayKey: DayKey,
  dateISO?: string,
  opts?: HoursOpts
): DayHours {
  const lh = layerHoursFor(siteId, layer, opts);
  if (!lh) return UNKNOWN_DAY;
  if (dateISO) {
    const override = lh.overrides.find((o) => o.dateISO === dateISO);
    if (override) return override.day;
  }
  return lh.week[dayKey] ?? UNKNOWN_DAY;
}

/**
 * Rule HRS-FRESH. Confidence DOWNGRADES with age, mechanically, so nobody has
 * to remember. `client_confirmed` decays on its own longer clock and downgrades
 * rather than voiding — a 30-day absolute void would delete the client's own
 * answer six weeks after they gave it (§4.10).
 */
export function effectiveConfidence(
  day: DayHours,
  now: string,
  staleAfterDays: number = HOURS_STALE_AFTER_DAYS
): Confidence {
  // `demo_seeded` was never captured from anything, so it has no capturedAt to
  // be stale. It expires when DEMO_MODE goes off, and only then.
  if (day.confidence === "demo_seeded") return "demo_seeded";

  const ageDays = ageInDays(day.capturedAt, now);

  if (day.confidence === "client_confirmed") {
    if (ageDays <= CLIENT_CONFIRMED_STALE_AFTER_DAYS) return "client_confirmed";
    if (ageDays <= CLIENT_CONFIRMED_SECOND_STALE_AFTER_DAYS) return "high";
    return "medium";
  }
  if (ageDays <= staleAfterDays) return day.confidence;
  if (day.confidence === "high") return "medium";
  if (day.confidence === "medium") return "low";
  return day.confidence; // low / conflicted / unknown are already unbookable
}

function ageInDays(capturedAt: string | null, now: string): number {
  if (!capturedAt || !isDateISO(capturedAt)) return Number.POSITIVE_INFINITY;
  return daysBetween(capturedAt, localDateOf(now));
}

/** Rule HRS-CONFIRM's operational alert: at 150 days, ask the client again. */
export function needsReconfirmation(day: DayHours, now: string): boolean {
  if (day.confidence !== "client_confirmed") return false;
  return ageInDays(day.capturedAt, now) >= CLIENT_CONFIRMED_REALERT_DAYS;
}

const BOOKABLE_RUNGS: Confidence[] = ["client_confirmed", "high", "medium"];

/** Rule HRS-SEASON — inside a volatility window with no override, nothing books. */
export function volatilityWindowFor(dateISO: string): string | null {
  for (const w of VOLATILITY_WINDOWS) {
    if (dateISO >= w.fromISO && dateISO <= w.toISO) return w.name;
  }
  return null;
}

// ── openStateAt — INFORMATIONAL, tri-state (§4.2) ───────────────────────────

/**
 * "Are you open?" — the honest answer, which may be "we don't know".
 *
 * Defaults to the `facility` layer: that is the question a patient asking «مفتوح
 * الحين؟» is asking about the building. Pass "clinic" to ask about outpatient
 * sessions, "er" to answer «الطوارئ عندكم مفتوحة؟» — the er layer is
 * informational ONLY and never feeds the emergency rail (SPEC-4 §4.4 owns that).
 *
 * This function does NOT gate on confidence: a conflicted record still describes
 * an hour, and the caveat travels with it through hoursDisclosure(). That split
 * is the whole point of §4.2 — collapsing the two into one boolean is how a demo
 * produces a locked door.
 */
export function openStateAt(
  siteId: SiteId,
  when: string | Date,
  layer: HoursLayer = "facility",
  opts?: HoursOpts
): "open" | "closed" | "unknown" {
  if (!isSiteId(siteId)) return "unknown";
  const at = toLocalInstant(when);
  const today = dayHoursFor(siteId, layer, at.dayKey, at.dateISO, opts);

  if (coversMinute(today, at.minutes)) return "open";

  // §4.8 — a previous day's crossing window owns the early hours of this day.
  const prevDate = addDays(at.dateISO, -1);
  const prev = dayHoursFor(siteId, layer, dayKeyOf(prevDate), prevDate, opts);
  if (prev.status === "windows") {
    for (const w of prev.windows) {
      if (w.crossesMidnight && at.minutes < minutesOf(w.close)) return "open";
    }
  }

  if (today.status === "unknown") return "unknown";
  return "closed";
}

function coversMinute(day: DayHours, minutes: number): boolean {
  if (day.status === "open_24h") return true;
  if (day.status !== "windows") return false;
  for (const w of day.windows) {
    const open = minutesOf(w.open);
    if (w.crossesMidnight) {
      if (minutes >= open) return true; // the tail belongs to the NEXT day
    } else if (minutes >= open && minutes < minutesOf(w.close)) {
      return true;
    }
  }
  return false;
}

// ── bookableWindows — the ONE gate that mints (§4.2) ────────────────────────

/**
 * BOOKABLE. Returns [] unless EVERY one of these holds:
 *   • the layer is "clinic"                        — hard-wired here, H4
 *   • the site can operate at all                  — H5
 *   • the date is outside a volatility window       — Rule HRS-SEASON
 *   • status is "open_24h" | "windows"
 *   • conflicts is empty
 *   • effective confidence ∈ client_confirmed | high | medium
 *       — OR it is "demo_seeded" AND DEMO_MODE is on. That is the ONLY way
 *         "demo_seeded" is ever accepted (Rule HRS-DEMO). Outside DEMO_MODE it
 *         behaves exactly like "unknown": []. DEMO_MODE IS READ HERE, at the one
 *         function that mints slots, AND NOWHERE ELSE — a second reader is a
 *         second answer.
 *   • capturedAt is fresh, per Rule HRS-FRESH's decay (client_confirmed uses its
 *     own 180/365 clock and downgrades rather than voiding; demo_seeded has no
 *     capturedAt to be stale)
 *
 * RETURNING [] IS NOT AN ERROR STATE. IT IS THE SAFE STATE.
 */
export function bookableWindows(siteId: SiteId, dateISO: string, opts?: HoursOpts): Window[] {
  if (!isSiteId(siteId) || !isDateISO(dateISO)) return [];
  if (!canMintSlots(siteId)) return [];
  if (volatilityWindowFor(dateISO) && !hasOverride(siteId, dateISO, opts)) return [];

  const now = nowISO(opts);
  const demoMode = opts?.demoMode ?? demoModeFromEnv();
  const dayKey = dayKeyOf(dateISO);
  const staleAfterDays = tableOf(opts)[siteId]?.staleAfterDays ?? HOURS_STALE_AFTER_DAYS;

  const out: Window[] = [];
  const today = dayHoursFor(siteId, "clinic", dayKey, dateISO, opts);
  const todayConfidence = gate(today, now, demoMode, staleAfterDays);

  if (todayConfidence) {
    for (const w of windowsOf(today)) {
      // A crossing window contributes open→24:00 to ITS OWN day; the tail is
      // attributed to the next day, below, and only if this day's gates passed.
      out.push(
        decorate(siteId, dateISO, dayKey, todayConfidence, today, w.crossesMidnight ? win(w.open, "24:00") : w)
      );
    }
  }

  // §4.8 — the tail of yesterday's crossing window, attributed here.
  const prevDate = addDays(dateISO, -1);
  const prevKey = dayKeyOf(prevDate);
  const prev = dayHoursFor(siteId, "clinic", prevKey, prevDate, opts);
  const prevConfidence = gate(prev, now, demoMode, staleAfterDays);
  if (prevConfidence && prev.status === "windows") {
    for (const w of prev.windows) {
      if (w.crossesMidnight) {
        out.push(decorate(siteId, dateISO, dayKey, prevConfidence, prev, win("00:00", w.close)));
      }
    }
  }

  return out;
}

function hasOverride(siteId: SiteId, dateISO: string, opts?: HoursOpts): boolean {
  const lh = layerHoursFor(siteId, "clinic", opts);
  return !!lh?.overrides.some((o) => o.dateISO === dateISO);
}

/** null = this record mints nothing. Otherwise the effective confidence. */
function gate(
  day: DayHours,
  now: string,
  demoMode: boolean,
  staleAfterDays: number
): Confidence | null {
  if (day.status !== "open_24h" && day.status !== "windows") return null;
  if (day.conflicts.length > 0) return null;
  const eff = effectiveConfidence(day, now, staleAfterDays);
  if (eff === "demo_seeded") return demoMode ? eff : null;
  return BOOKABLE_RUNGS.includes(eff) ? eff : null;
}

function windowsOf(day: DayHours): TimeWindow[] {
  if (day.status === "open_24h") return [win("00:00", "24:00")];
  return day.windows;
}

function decorate(
  siteId: SiteId,
  dateISO: string,
  dayKey: DayKey,
  confidence: Confidence,
  day: DayHours,
  w: TimeWindow
): Window {
  return {
    ...w,
    siteId,
    dateISO,
    dayKey,
    layer: "clinic",
    confidence,
    demoSeeded: day.confidence === "demo_seeded",
    pendingBranchConfirmation: isContested(siteId),
    isFriday: dayKey === "fri",
    branchPhone: patientPhoneFor(siteId),
  };
}

/** Total bookable minutes on a date — handy for tests and for capacity talk. */
export function bookableMinutes(siteId: SiteId, dateISO: string, opts?: HoursOpts): number {
  return bookableWindows(siteId, dateISO, opts).reduce(
    (sum, w) => sum + (minutesOf(w.close) - minutesOf(w.open)),
    0
  );
}

// ── hoursDisclosure — the sentence Faysal is ALLOWED to say (§4.2) ──────────

export interface HoursDisclosure {
  ar: string;
  en: string;
  /** Rule FRI-1 + every unknown/conflicted day: offer the call, with the number. */
  mustOfferCall: boolean;
  phone: string;
  state: "open_24h" | "windows" | "closed" | "unknown";
  confidence: Confidence;
  /** True when the day exists only because DEMO_MODE seeded it. */
  demoSeeded: boolean;
}

const DAY_AR: Record<DayKey, string> = {
  sat: "السبت",
  sun: "الأحد",
  mon: "الاثنين",
  tue: "الثلاثاء",
  wed: "الأربعاء",
  thu: "الخميس",
  fri: "الجمعة",
};

const DAY_EN: Record<DayKey, string> = {
  sat: "Saturday",
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
};

/**
 * H2 in one function: Faysal may DISCUSS a day it does not know; it may not
 * SELL one. The sentence is engine-side and factual — SPEC-2-PERSONA.md owns
 * the final patient-visible register and every [FROZEN] string.
 *
 * Rule FRI-1: every Friday answer — booking, enquiry or directions — ends with
 * the branch's phone number and an offer to confirm. No exceptions, including
 * at sites whose Friday confidence is `medium`. The dossier gives this
 * instruction twice; it is the client's own posture, not our caution.
 */
export function hoursDisclosure(
  siteId: SiteId,
  layer: HoursLayer,
  dayKey: DayKey,
  opts?: HoursOpts
): HoursDisclosure {
  const site = siteById(siteId);
  const day = dayHoursFor(siteId, layer, dayKey, undefined, opts);
  const now = nowISO(opts);
  const eff = effectiveConfidence(day, now, tableOf(opts)[siteId]?.staleAfterDays);
  const phone = patientPhoneFor(siteId);
  const isFriday = dayKey === "fri";
  const shaky = eff === "unknown" || eff === "low" || eff === "conflicted" || day.conflicts.length > 0;
  const mustOfferCall = isFriday || shaky || site.operatingStatus.requiresLiveConfirmation;

  const tail = mustOfferCall ? ` رقم الفرع ${phone} وأتأكد لك.` : "";
  const tailEn = mustOfferCall ? ` The branch number is ${phone} — I can confirm for you.` : "";

  let ar: string;
  let en: string;
  if (day.status === "unknown") {
    ar = `ما أقدر أأكد دوام ${site.nameAr} يوم ${DAY_AR[dayKey]}.`;
    en = `I can't confirm ${site.nameEn}'s hours on ${DAY_EN[dayKey]}.`;
  } else if (day.status === "closed") {
    ar = `المنشور إن ${site.nameAr} مسكّر يوم ${DAY_AR[dayKey]}.`;
    en = `${site.nameEn} is published as closed on ${DAY_EN[dayKey]}.`;
  } else if (day.status === "open_24h") {
    ar = `${site.nameAr} مفتوح ٢٤ ساعة يوم ${DAY_AR[dayKey]}.`;
    en = `${site.nameEn} is listed as open 24 hours on ${DAY_EN[dayKey]}.`;
  } else {
    const spans = day.windows.map((w) => `${w.open}–${w.close === "24:00" ? "12 منتصف الليل" : w.close}`).join(" و");
    const spansEn = day.windows.map((w) => `${w.open}–${w.close}`).join(" and ");
    ar = `دوام ${site.nameAr} يوم ${DAY_AR[dayKey]}: ${spans}.`;
    en = `${site.nameEn} on ${DAY_EN[dayKey]}: ${spansEn}.`;
  }

  if (day.conflicts.length > 0) {
    ar += " والمعلومات المنشورة عن هذا اليوم مختلفة، فما أحب أأكدها لك من دون تأكيد الفرع.";
    en += " Published sources disagree about this day, so I won't state it as fact without the branch.";
  }

  return {
    ar: ar + tail,
    en: en + tailEn,
    mustOfferCall,
    phone,
    state: day.status,
    confidence: eff,
    demoSeeded: day.confidence === "demo_seeded",
  };
}

/** hhmm arithmetic shared with slots.ts — keeps one implementation of the grid. */
export const timeMath = { minutesOf, hhmmOf };
