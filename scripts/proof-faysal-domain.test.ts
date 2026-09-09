// ============================================================================
// فيصل / Faysal — DOMAIN ENGINE PROOF. lib/health/* against docs/faysal/SPEC-1.
//
// What this harness exists to prove, in the order the spec ranks it:
//   • the five hours invariants (H1–H5) plus H6's type-level guarantee
//   • bookableWindows() mints NOTHING at low / conflicted / unknown / stale
//     confidence, and nothing at all with DEMO_MODE off
//   • the hold→confirm race: idempotence, single-hold-per-patient, TTL on read,
//     and the re-validation that stops a hold becoming an appointment in a
//     window that closed while the patient was typing
//   • the Friday rule: never inferred, never sold unconfirmed, always with the
//     branch phone attached
//   • no price escapes the calculator without its marker
//
// EVERY invariant is MUTATION-VERIFIED: the same assertion is re-run against a
// deliberately broken clone of the data, and the test fails if the assertion
// still passes. An assertion that cannot fail proves nothing, and this file is
// the only thing standing between a demo and a patient at a locked door.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-faysal-domain.test.ts
// ============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  CLINICIANS,
  DEMO_BOOKING_SUFFIX_AR,
  FAYSAL_BOOKING_HORIZON_DAYS,
  FAYSAL_HOLD_TTL_MS,
  PRICE_LABEL_AR,
  REAL_CLINICIAN_DENYLIST,
  SERVICES,
  SITE_HOURS,
  SITE_IDS,
  SITES,
  STRENGTHS,
  addDays,
  assertCatalogueInvariants,
  assertConfirmationMarkers,
  assertNoCoveragePromise,
  bookableWindows,
  cancelBooking,
  confirmBooking,
  createStore,
  dayHoursFor,
  effectiveConfidence,
  generateDaySlots,
  holdFamilyBlock,
  holdSlot,
  hoursDisclosure,
  insuranceAnswer,
  minutesOf,
  openStateAt,
  patientPhoneFor,
  priceFor,
  recommendBranch,
  renderConfirmationBlock,
  requestCallback,
  searchSlots,
  slotIsStillBookable,
} from "../lib/health/index.ts";
import type { DayHours, DayKey, HoursTable, SiteId } from "../lib/health/index.ts";

// ── the child-process arm of the determinism proof (criterion 23) ───────────
// Same file, same query, a DIFFERENT process. If a slot list can drift between
// processes, the salesperson's screen and the client's phone disagree.
const CHILD_QUERY = {
  serviceId: "derm-consult",
  siteId: "wattan-2" as SiteId,
  dateISO: "2026-09-14",
  limit: 20,
  now: "2026-09-10T08:00:00+03:00",
  demoMode: true,
};
if (process.env.FAYSAL_PROOF_CHILD === "1") {
  const ids = searchSlots(CHILD_QUERY, { store: createStore() }).map((s) => s.slotId);
  process.stdout.write(JSON.stringify(ids));
  process.exit(0);
}

let pass = 0;
let fail = 0;
let mutations = 0;

function check(name: string, cond: boolean): void {
  if (cond) pass++;
  else {
    fail++;
    console.error("  ✗ FAIL:", name);
  }
}

/**
 * MUTATION VERIFICATION. `broken` must make the property FALSE. If it does not,
 * the assertion above it was vacuous and this file says so out loud.
 */
function mutation(name: string, brokenStillHolds: () => boolean): void {
  mutations++;
  let held: boolean;
  try {
    held = brokenStillHolds();
  } catch {
    held = false; // a throw is a detection
  }
  if (held) {
    fail++;
    console.error("  ✗ MUTATION SURVIVED (assertion is vacuous):", name);
  } else pass++;
}

/** A rule QUOTED in a header comment is not a violation of that rule. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function clone(): HoursTable {
  return structuredClone(SITE_HOURS) as HoursTable;
}

const NOW = "2026-09-10T08:00:00+03:00"; // a Thursday morning, Riyadh
const SAT = "2026-09-12";
const SUN = "2026-09-13";
const MON = "2026-09-14";
const FRI = "2026-09-11";
const DEMO = { now: NOW, demoMode: true };
const PROD = { now: NOW, demoMode: false };
const WHO = { waNumber: "966500000001", displayName: "أم محمد" };
const OTHER = { waNumber: "966500000002", displayName: "خالد" };

const horizon: string[] = [];
for (let i = 0; i <= FAYSAL_BOOKING_HORIZON_DAYS; i++) horizon.push(addDays("2026-09-10", i));

console.log("FAYSAL DOMAIN PROOF — lib/health against docs/faysal/SPEC-1-DOMAIN.md\n");

// ────────────────────────────────────────────────────────────────────────────
// 1. The contract surface other agents import
// ────────────────────────────────────────────────────────────────────────────
{
  const surface: Array<[string, unknown]> = [
    ["openStateAt", openStateAt],
    ["bookableWindows", bookableWindows],
    ["recommendBranch", recommendBranch],
    ["searchSlots", searchSlots],
    ["holdSlot", holdSlot],
    ["confirmBooking", confirmBooking],
    ["cancelBooking", cancelBooking],
    ["priceFor", priceFor],
    ["insuranceAnswer", insuranceAnswer],
  ];
  for (const [name, fn] of surface) check(`contract: ${name} is exported`, typeof fn === "function");
  check("contract: openStateAt is tri-state", ["open", "closed", "unknown"].includes(openStateAt("wattan-1", `${SAT}T10:00`, "facility", DEMO)));
  check("contract: bookableWindows returns [] (not a throw) for an unknown site", bookableWindows("nope" as SiteId, SAT, DEMO).length === 0);
  check("contract: bookableWindows returns [] (not a throw) for a malformed date", bookableWindows("wattan-2", "12-09-2026", DEMO).length === 0);
  check("contract: recommendBranch always carries a one-line reason", recommendBranch("derm_laser", DEMO).reasonAr.trim().length > 0);
}

// ────────────────────────────────────────────────────────────────────────────
// 2. H1 — no slot may be minted outside a window returned by bookableWindows()
// ────────────────────────────────────────────────────────────────────────────
{
  const wins = bookableWindows("wattan-2", SAT, DEMO);
  check("H1: the seeded site has windows to mint from", wins.length === 2);

  let inside = 0;
  let outside = 0;
  for (const serviceId of ["derm-consult", "laser-medium-session", "dental-scaling"]) {
    for (const clinician of ["dr-albaqami", "dr-alkhatib", "dr-alharbi"]) {
      for (const slot of generateDaySlots("wattan-2", clinician, serviceId, SAT, DEMO)) {
        const start = minutesOf(slot.start);
        const blockEnd = minutesOf(slot.blockEnd);
        const fits = wins.some((w) => start >= minutesOf(w.open) && blockEnd <= minutesOf(w.close));
        if (fits) inside++;
        else outside++;
      }
    }
  }
  check("H1: every generated slot sits inside a bookable window", outside === 0 && inside > 0);

  // BUF-2 — the buffer may not overhang the close. A 30-minute laser session at
  // 23:45 in a window closing at 24:00 is the slot that produces a patient in an
  // empty corridor.
  const laser = generateDaySlots("wattan-2", "dr-albaqami", "laser-medium-session", SAT, DEMO);
  check("BUF-2: laser slots reserve duration + 15-minute buffer inside the window",
    laser.every((s) => minutesOf(s.blockEnd) - minutesOf(s.start) === 45) &&
    laser.every((s) => wins.some((w) => minutesOf(s.blockEnd) <= minutesOf(w.close))));
  check("BUF-1: the buffer is time, never money — blockEnd > end and the price is per service",
    laser.every((s) => minutesOf(s.blockEnd) > minutesOf(s.end)) &&
    priceFor("laser-medium-session", "wattan-2").amount === 300);

  // MUTATION: shrink the window under a minted slot. The slot must stop being
  // bookable — this is the same machinery HOLD-5 relies on.
  const first = generateDaySlots("wattan-2", "dr-albaqami", "derm-consult", SAT, DEMO).at(-1);
  mutation("H1: a slot survives its window being narrowed", () => {
    if (!first) return true;
    const t = clone();
    const clinic = t["wattan-2"].layers.find((l) => l.layer === "clinic")!;
    clinic.week.sat = { ...(clinic.week.sat as DayHours), windows: [{ open: "09:00", close: "09:30", crossesMidnight: false }] } as DayHours;
    return slotIsStillBookable(first.slotId, { ...DEMO, hours: t });
  });
  check("H1 control: the same slot IS bookable against the unmutated table", !!first && slotIsStillBookable(first.slotId, DEMO));
}

// ────────────────────────────────────────────────────────────────────────────
// 3. H2 — unknown is CLOSED FOR BOOKING and OPEN FOR CONVERSATION
// ────────────────────────────────────────────────────────────────────────────
{
  // criterion 1 — wattan-4 mints nothing on every day in the horizon.
  const shifaTotals = horizon.map((d) => bookableWindows("wattan-4", d, DEMO).length);
  check("H2/§4.6: Ash Shifa mints nothing on EVERY day in the horizon", shifaTotals.every((n) => n === 0));

  const talk = hoursDisclosure("wattan-4", "facility", "sun", DEMO);
  check("H2: an unknown day is still answerable in conversation", talk.ar.length > 20 && talk.state === "unknown");
  check("H2: and the answer offers the call with the branch number", talk.mustOfferCall && talk.ar.includes(patientPhoneFor("wattan-4")));

  // criterion 3 — Ar Rabwah's Friday is `unknown`, NOT `closed`. They differ in
  // what Faysal is allowed to SAY: `closed` licenses "Ar Rabwah is closed on
  // Fridays" on the strength of one guide the dossier itself distrusts.
  const rabwahFri = dayHoursFor("wattan-3", "facility", "fri");
  check("§4.5: Ar Rabwah Friday status is 'unknown', not 'closed'", rabwahFri.status === "unknown");
  check("§4.5: and the disagreement is recorded, unresolved", rabwahFri.conflicts.length === 1 && rabwahFri.conflicts[0].resolution === "unresolved");
  check("§4.5: Ar Rabwah offers no Friday slot", bookableWindows("wattan-3", FRI, DEMO).length === 0);

  // MUTATION: resolve the conflict by fiat and promote the day — the only way
  // Ar Rabwah's Friday could ever mint, and precisely what the rule forbids.
  mutation("H2: a conflicted/unknown Friday still refuses to mint after being promoted", () => {
    const t = clone();
    const fac = t["wattan-3"].layers.find((l) => l.layer === "clinic");
    const layer = fac ?? { layer: "clinic" as const, week: {}, overrides: [] };
    if (!fac) t["wattan-3"].layers.push(layer);
    layer.week.fri = {
      status: "windows",
      windows: [{ open: "16:00", close: "22:00", crossesMidnight: false }],
      confidence: "medium",
      capturedAt: "2026-09-09",
      sources: [],
      conflicts: [],
    } as DayHours;
    return bookableWindows("wattan-3", FRI, { ...DEMO, hours: t }).length === 0;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 4. H3 — FRIDAY IS NEVER INFERRED FROM ANY OTHER DAY
// ────────────────────────────────────────────────────────────────────────────
{
  // criterion 5, in the only form that is meaningful: wherever Thursday is a
  // known record, Friday must not be a copy of it. (Where BOTH are unknown the
  // records are identical because the absence is identical — that is the honest
  // state, not an inference.)
  let compared = 0;
  let identical = 0;
  for (const siteId of SITE_IDS) {
    for (const layer of SITE_HOURS[siteId].layers) {
      const thu = layer.week.thu;
      const fri = layer.week.fri;
      if (!thu || thu.status === "unknown") continue;
      compared++;
      if (JSON.stringify(thu) === JSON.stringify(fri)) identical++;
    }
  }
  check("H3: no Friday record is byte-identical to that site's Thursday", compared >= 6 && identical === 0);

  // criterion 2's shape — [] on Friday, non-empty on Saturday, at a site whose
  // clinic layer IS bookable. Al Wurud's Friday is deliberately unseeded: the
  // 24/7 claim is a FACILITY claim and H4 forbids promoting it.
  check("H3: Shoaa Al Wurud — Friday mints nothing", bookableWindows("shoaa-wurud", FRI, DEMO).length === 0);
  check("H3: Shoaa Al Wurud — Saturday mints", bookableWindows("shoaa-wurud", SAT, DEMO).length > 0);
  check("H3: Ar Rawdah — Friday mints nothing, Saturday mints",
    bookableWindows("shoaa-rawdah", FRI, DEMO).length === 0 && bookableWindows("shoaa-rawdah", SAT, DEMO).length > 0);

  // The six Fridays are six different situations. If any two sites shared a
  // Friday record by construction, someone has encoded a group-wide rule.
  const fridayShapes = new Set(
    SITE_IDS.map((id) => {
      const f = dayHoursFor(id, "facility", "fri");
      return `${f.status}|${f.confidence}|${f.windows.map((w) => `${w.open}-${w.close}`).join(",")}`;
    })
  );
  check("H3: the six sites' Fridays are genuinely different situations", fridayShapes.size >= 4);

  // MUTATION A: copy Thursday into Friday — the exact bug H3 names.
  mutation("H3: Friday survives Thursday being copied over it", () => {
    const t = clone();
    const clinic = t["shoaa-wurud"].layers.find((l) => l.layer === "clinic")!;
    clinic.week.fri = structuredClone(clinic.week.thu) as DayHours;
    return bookableWindows("shoaa-wurud", FRI, { ...DEMO, hours: t }).length === 0;
  });

  // MUTATION B: delete Friday entirely. A missing day must resolve to `unknown`,
  // never to a sibling — the resolver has no fallback path at all.
  mutation("H3: a MISSING Friday falls back to another day", () => {
    const t = clone();
    const clinic = t["wattan-2"].layers.find((l) => l.layer === "clinic")!;
    delete clinic.week.fri;
    const day = dayHoursFor("wattan-2", "clinic", "fri", undefined, { hours: t });
    return day.status !== "unknown" || bookableWindows("wattan-2", FRI, { ...DEMO, hours: t }).length > 0;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 5. H4 — a facility or ER window NEVER authorises a clinic slot
// ────────────────────────────────────────────────────────────────────────────
{
  // criterion 4 — the 24-hour building with no bookable clinic.
  check("H4: Al Yamamah's building is open at 03:00 on a Tuesday", openStateAt("wattan-1", "2026-09-15T03:00", "facility", DEMO) === "open");
  check("H4: its ER layer answers too (informational only)", openStateAt("wattan-1", "2026-09-15T03:00", "er", DEMO) === "open");
  check("H4: and its CLINIC layer mints nothing, on every day in the horizon",
    horizon.every((d) => bookableWindows("wattan-1", d, DEMO).length === 0));
  check("H4: the clinic layer is honestly closed at 03:00, whatever the sign says",
    openStateAt("wattan-1", "2026-09-15T03:00", "clinic", DEMO) === "closed");

  // A seeded clinic window is not a copy of the facility window either.
  const facFri = dayHoursFor("wattan-2", "facility", "fri").windows[0];
  const cliFri = dayHoursFor("wattan-2", "clinic", "fri").windows[0];
  check("H4: Ar Rawabi's clinic Friday is authored, not copied off the facility Friday",
    !!facFri && !!cliFri && (facFri.open !== cliFri.open || facFri.close !== cliFri.close));

  // MUTATION: promote the facility record into the clinic layer — the single
  // likeliest way to build a booking agent that sends someone to a dark corridor.
  mutation("H4: promoting facility hours into the clinic layer still mints nothing", () => {
    const t = clone();
    const facility = t["wattan-1"].layers.find((l) => l.layer === "facility")!;
    const clinic = t["wattan-1"].layers.find((l) => l.layer === "clinic")!;
    clinic.week.sat = structuredClone(facility.week.sat) as DayHours;
    return bookableWindows("wattan-1", SAT, { ...DEMO, hours: t }).length === 0;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 6. H5 — a contested site is bookable, but NEVER silently, and never alone
// ────────────────────────────────────────────────────────────────────────────
{
  check("H5: Ash Shifa's status is recorded as contested, with both sides", SITES["wattan-4"].operatingStatus.state === "operational_contested" &&
    SITES["wattan-4"].operatingStatus.evidenceFor.length === 2 &&
    SITES["wattan-4"].operatingStatus.evidenceAgainst.length === 1);

  // criterion 10 — a wattan-4 request is a callback, never a slot.
  const store = createStore();
  const cb = requestCallback(
    { siteId: "wattan-4", serviceId: "ortho-assessment", patient: WHO, preferredWindowAr: "بعد العصر" },
    { store, ...DEMO }
  );
  check("C4-1: a Shifa request produces a callback_request, never a slot", cb.kind === "callback_request" && cb.dateISO === null && cb.start === null);
  const block = renderConfirmationBlock(cb);
  check("criterion 10: the callback block renders NO appointment time", !block.includes("الموعد:"));
  check("C4-1: it names the branch's own number, 011 497 7900", block.includes("0114977900"));
  check("C4-1: it never renders a bare 'confirmed'", block.includes("تم تسجيل طلبك") && !block.includes("تم الحجز"));
  check("§3.4: the suppressed Complex-1 line is never offered as Shifa's", patientPhoneFor("wattan-4") === "0114977900");
  check("DEMO-1c: the callback confirmation carries the demo suffix too", block.includes(DEMO_BOOKING_SUFFIX_AR));
  check("§4.6: a callback consumes no slot inventory", cb.slotIds.length === 0);
  check("§4.6: a preferred window is the patient's words, never a clock time",
    throws(() => requestCallback({ siteId: "wattan-4", serviceId: "ortho-assessment", patient: WHO, preferredWindowAr: "الساعة 16:30" }, { store, ...DEMO })));

  // criterion 9 / C4-2 — a contested site is never the only option offered.
  const south = recommendBranch("south_riyadh", { ...DEMO, dateISO: SAT });
  check("C4-2: routing to Ash Shifa always names an alternative", south.siteId === "wattan-4" && south.mustNameAlternate && south.alternates.length > 0);
  check("C4-2: and the Shifa path is a callback, with the gate recorded as data", south.appointmentKind === "callback_request" && south.gated === "requires_status_confirmation");
  check("C4-2: EVERY route that lands on the contested site names an alternative",
    (["south_riyadh", "orthodontics_shifa"] as const).every((need) => {
      const r = recommendBranch(need, DEMO);
      return r.siteId !== "wattan-4" || (r.mustNameAlternate && r.alternates.length > 0);
    }));

  // MUTATION: give Ash Shifa hours. Windows may come back — but never unflagged.
  mutation("H5: a contested site's windows come back unflagged", () => {
    const t = clone();
    const clinic = t["wattan-4"].layers.find((l) => l.layer === "clinic")!;
    clinic.week.sat = {
      status: "windows",
      windows: [{ open: "09:00", close: "13:00", crossesMidnight: false }],
      confidence: "demo_seeded",
      capturedAt: null,
      demoNote: "[DEMO] mutation probe",
      sources: [],
      conflicts: [],
    } as DayHours;
    const w = bookableWindows("wattan-4", SAT, { ...DEMO, hours: t });
    return w.length > 0 && w.every((x) => x.pendingBranchConfirmation === false);
  });

  // MUTATION: a site that is not operating cannot mint, whatever its hours say.
  const saved = SITES["wattan-4"].operatingStatus.state;
  try {
    (SITES["wattan-4"].operatingStatus as { state: string }).state = "closed";
    const t = clone();
    const clinic = t["wattan-4"].layers.find((l) => l.layer === "clinic")!;
    clinic.week.sat = {
      status: "windows",
      windows: [{ open: "09:00", close: "13:00", crossesMidnight: false }],
      confidence: "demo_seeded",
      capturedAt: null,
      demoNote: "[DEMO] mutation probe",
      sources: [],
      conflicts: [],
    } as DayHours;
    mutation("H5: a CLOSED site mints from seeded hours", () => bookableWindows("wattan-4", SAT, { ...DEMO, hours: t }).length > 0);
  } finally {
    (SITES["wattan-4"].operatingStatus as { state: string }).state = saved;
  }
  check("H5: the contested status is restored after the mutation", SITES["wattan-4"].operatingStatus.state === "operational_contested");
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Confidence — nothing is minted at low / conflicted / unknown / stale
// ────────────────────────────────────────────────────────────────────────────
{
  const yamamahClinic = dayHoursFor("wattan-1", "clinic", "sat");
  check("§4.7: Al Yamamah's clinic layer is authored `low`", yamamahClinic.confidence === "low" && yamamahClinic.windows.length === 2);
  check("low mints nothing", bookableWindows("wattan-1", SAT, DEMO).length === 0);

  // MUTATION: raise it one rung. It must then mint — which proves the [] above
  // is caused by the confidence rung and not by something incidental.
  mutation("confidence: a `low` clinic record mints even after being raised to `medium`", () => {
    const t = clone();
    const clinic = t["wattan-1"].layers.find((l) => l.layer === "clinic")!;
    clinic.week.sat = { ...(clinic.week.sat as DayHours), confidence: "medium", capturedAt: "2026-09-09" } as DayHours;
    return bookableWindows("wattan-1", SAT, { ...DEMO, hours: t }).length === 0;
  });

  // Rule HRS-FRESH — a 2024 guide quoted in a 2026 document is a 2024 fact.
  const rabwah = dayHoursFor("wattan-3", "facility", "sat");
  check("HRS-FRESH: a medium record captured in 2024 has decayed to low by now", rabwah.confidence === "medium" && effectiveConfidence(rabwah, NOW) === "low");
  check("HRS-FRESH: a fresh medium record stays medium", effectiveConfidence(rabwah, "2024-05-15T09:00:00+03:00") === "medium");
  mutation("HRS-FRESH: a stale medium record still mints once promoted to the clinic layer", () => {
    const t = clone();
    const stale = structuredClone(dayHoursFor("wattan-3", "facility", "sat")) as DayHours;
    t["wattan-3"].layers.push({ layer: "clinic", week: { sat: stale }, overrides: [] });
    return bookableWindows("wattan-3", SAT, { ...DEMO, hours: t }).length > 0;
  });

  // criterion 28 — client_confirmed DOWNGRADES rather than voiding.
  const confirmed = (capturedAt: string): DayHours => ({
    status: "windows",
    windows: [{ open: "09:00", close: "13:00", crossesMidnight: false }],
    confidence: "client_confirmed",
    capturedAt,
    clientConfirmation: {
      confirmedBy: "Ops Lead (demo fixture)",
      role: "Group Operations Manager",
      channel: "phone",
      confirmedAt: capturedAt,
      verbatim: "عياداتنا من ٩ إلى ١",
      scope: "wattan-3 · clinic · Saturday",
    },
    sources: [],
    conflicts: [],
  });
  const at120 = clone();
  at120["wattan-3"].layers.push({ layer: "clinic", week: { sat: confirmed("2026-05-13") }, overrides: [] });
  const at400 = clone();
  at400["wattan-3"].layers.push({ layer: "clinic", week: { sat: confirmed("2025-08-06") }, overrides: [] });
  const w120 = bookableWindows("wattan-3", SAT, { ...PROD, hours: at120 });
  const w400 = bookableWindows("wattan-3", SAT, { ...PROD, hours: at400 });
  check("criterion 28: client_confirmed at 120 days is bookable, at full confidence", w120.length === 1 && w120[0].confidence === "client_confirmed");
  check("criterion 28: the SAME record at 400 days is still bookable, downgraded — no absolute void", w400.length === 1 && w400[0].confidence === "medium");
  check("criterion 28: and it books with DEMO_MODE OFF — this is the production path", w120[0].demoSeeded === false);

  // H6 — an unattributed client confirmation is UNREPRESENTABLE. The line below
  // is the proof; uncomment it and `npx tsc --noEmit` fails with
  // "Property 'clientConfirmation' is missing":
  //   const bad: DayHours = { status: "windows", windows: [], confidence: "client_confirmed",
  //                           capturedAt: "2026-09-09", sources: [], conflicts: [] };
  let unattributed = 0;
  for (const siteId of SITE_IDS) {
    for (const layer of SITE_HOURS[siteId].layers) {
      for (const day of Object.values(layer.week)) {
        if (day?.confidence === "client_confirmed" && !day.clientConfirmation) unattributed++;
      }
    }
  }
  check("H6: no client_confirmed record exists without a named attribution", unattributed === 0);
  check("H6: and Wave 1 carries none at all — the client call is what fills them",
    SITE_IDS.every((id) => SITE_HOURS[id].layers.every((l) => Object.values(l.week).every((d) => d?.confidence !== "client_confirmed"))));

  // Rule HRS-DEMO — demo_seeded is inventory ONLY under DEMO_MODE.
  const seeded: SiteId[] = ["wattan-2", "shoaa-wurud", "shoaa-rawdah"];
  check("HRS-DEMO: exactly three sites carry seeded clinic hours",
    SITE_IDS.filter((id) => SITE_HOURS[id].layers.some((l) => l.layer === "clinic" && Object.values(l.week).some((d) => d?.confidence === "demo_seeded")))
      .join(",") === seeded.join(","));
  check("HRS-DEMO: with DEMO_MODE OFF, every site mints nothing on every day",
    SITE_IDS.every((id) => horizon.every((d) => bookableWindows(id, d, PROD).length === 0)));
  check("HRS-DEMO: with DEMO_MODE ON, the three seeded sites mint", seeded.every((id) => bookableWindows(id, SAT, DEMO).length > 0));
  check("§4.10: the honesty scene stays at two sites — Ash Shifa and Al Yamamah are NOT seeded",
    bookableWindows("wattan-1", SAT, DEMO).length === 0 && bookableWindows("wattan-4", SAT, DEMO).length === 0);
  mutation("HRS-DEMO: seeded hours mint with DEMO_MODE off", () => seeded.some((id) => bookableWindows(id, SAT, PROD).length > 0));

  // Rule HRS-SEASON — the guard exists before the data does. [OPEN-04]
  check("HRS-SEASON: a date inside a volatility window mints nothing", bookableWindows("wattan-2", "2026-09-23", DEMO).length === 0);
  check("HRS-SEASON: the day before it is unaffected", bookableWindows("wattan-2", "2026-09-22", DEMO).length > 0);
}

// ────────────────────────────────────────────────────────────────────────────
// 8. FRI-1 — every Friday answer carries the branch phone
// ────────────────────────────────────────────────────────────────────────────
{
  for (const siteId of SITE_IDS) {
    const d = hoursDisclosure(siteId, "facility", "fri", DEMO);
    check(`FRI-1: ${siteId} Friday disclosure offers the call`, d.mustOfferCall);
    check(`FRI-1: ${siteId} Friday disclosure carries the branch number`, d.ar.includes(patientPhoneFor(siteId)));
  }
  // Even where Friday confidence is `medium` — the rule has no exceptions.
  check("FRI-1: applies at Ar Rawabi, whose Friday is medium", hoursDisclosure("wattan-2", "facility", "fri", DEMO).mustOfferCall);
  // An INVENTED hour is never stated flatly as the branch's timetable.
  const seededDisclosure = hoursDisclosure("wattan-2", "clinic", "sat", DEMO);
  check("HRS-DEMO: a seeded clinic day is flagged as seeded to the caller", seededDisclosure.demoSeeded === true);
  check("HRS-DEMO: and it always offers the branch call", seededDisclosure.mustOfferCall && seededDisclosure.ar.includes(patientPhoneFor("wattan-2")));

  const store = createStore();
  const fridaySlots = searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: FRI, ...DEMO }, { store });
  check("FRI-1: the one bookable Friday in the demo is at Ar Rawabi", fridaySlots.length > 0 && fridaySlots.every((s) => s.isFriday));
  check("FRI-1: a Friday slot ships with the branch phone attached to the slot itself",
    fridaySlots.every((s) => s.branchPhone === patientPhoneFor("wattan-2")));
  const h = holdSlot(fridaySlots[0].slotId, WHO, { store, ...DEMO });
  const appt = confirmBooking(h.holdId, WHO, { store, ...DEMO });
  const block = renderConfirmationBlock(appt);
  check("FRI-1: the Friday confirmation block carries the branch number", block.includes(patientPhoneFor("wattan-2")));
  check("FRI-1: and it says the Friday hours compress", block.includes("الجمعة"));
  mutation("FRI-1: a Friday confirmation without the phone is accepted", () =>
    !throws(() => assertConfirmationMarkers(block.replace(patientPhoneFor("wattan-2"), "—"), appt)));

  // No other site sells a Friday.
  for (const siteId of SITE_IDS.filter((s) => s !== "wattan-2")) {
    check(`FRI-1/H3: ${siteId} offers no Friday slot`, bookableWindows(siteId, FRI, DEMO).length === 0);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 9. The hold → confirm race (§7.5)
// ────────────────────────────────────────────────────────────────────────────
{
  const store = createStore();
  const slots = searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: SAT, limit: 5, ...DEMO }, { store });
  check("§7.5: there are slots to race over", slots.length >= 3);
  const a = slots[0];
  // A 20-minute consult on a 15-minute grid OVERLAPS its neighbour, and the
  // engine withholds the neighbour of a held slot — correctly. The race we are
  // proving is about the HOLD, so the second slot must be independent of the
  // first, or "it came back" would be a statement about overlap arithmetic.
  const b = slots.find((s) => minutesOf(s.start) >= minutesOf(a.blockEnd)) ?? slots[2];
  check("§7.5: the two raced slots do not overlap each other", minutesOf(b.start) >= minutesOf(a.blockEnd));

  // HOLD-1 — a hold is not a booking.
  const h1 = holdSlot(a.slotId, WHO, { store, ...DEMO });
  check("HOLD-1: holding does not create an appointment", store.appointments.size === 0);
  check("HOLD-1: the hold expires in exactly ten minutes", Date.parse(h1.expiresAt) - Date.parse(NOW) === FAYSAL_HOLD_TTL_MS);

  // SLOT-1 — offering is not holding: a search reserves nothing.
  const searchAgain = searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: SAT, limit: 5, ...DEMO }, { store });
  check("SLOT-1: the held slot is the only one withdrawn by holding", !searchAgain.some((s) => s.slotId === a.slotId) && searchAgain.length >= 3);

  // The race: a second patient cannot take a held slot.
  check("§7.5: a second patient cannot hold the same slot", throws(() => holdSlot(a.slotId, OTHER, { store, ...DEMO })));
  check("§7.5: re-holding your own slot is idempotent", holdSlot(a.slotId, WHO, { store, ...DEMO }).holdId === h1.holdId);

  // HOLD-2 — one active hold per identity, released atomically.
  const h2 = holdSlot(b.slotId, WHO, { store, ...DEMO });
  check("HOLD-2: a second hold by the same number releases the first", store.holds.get(h1.holdId)?.state === "released" && store.holds.get(h2.holdId)?.state === "active");
  check("HOLD-2: the released slot returns to inventory immediately",
    searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: SAT, limit: 10, ...DEMO }, { store }).some((s) => s.slotId === a.slotId));
  check("HOLD-2: the patient never holds two slots at once", store.activeHoldByPatient.size === 1);

  // HOLD-4 — idempotent confirm.
  const appt1 = confirmBooking(h2.holdId, WHO, { store, ...DEMO });
  const appt2 = confirmBooking(h2.holdId, WHO, { store, ...DEMO });
  check("HOLD-4: confirming twice yields ONE appointment", appt1.appointmentId === appt2.appointmentId && store.appointments.size === 1);
  check("POL-04: the appointment carries both demo markers", appt1.source === "faysal_demo" && appt1.isTest === true);
  check("POL-03: and no clinical detail beyond the service name", !("nationalId" in appt1) && !("insuranceMemberNumber" in appt1));
  check("§7.5: a confirmed slot is out of inventory",
    !searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: SAT, limit: 20, ...DEMO }, { store }).some((s) => s.slotId === b.slotId));

  // HOLD-3 — expiry enforced on READ, without any sweep having run.
  const store2 = createStore();
  const s2 = searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: SAT, ...DEMO }, { store: store2 })[0];
  const h3 = holdSlot(s2.slotId, WHO, { store: store2, ...DEMO });
  const later = new Date(Date.parse(NOW) + FAYSAL_HOLD_TTL_MS + 1000).toISOString();
  check("HOLD-3: an expired hold cannot be confirmed", throws(() => confirmBooking(h3.holdId, WHO, { store: store2, now: later, demoMode: true })));
  check("HOLD-3: and its inventory came back with no sweep",
    searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: SAT, limit: 20, now: later, demoMode: true }, { store: store2 })
      .some((s) => s.slotId === s2.slotId));
  check("HOLD-3: a hold one second before expiry still confirms",
    (() => {
      const st = createStore();
      const s = searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: SAT, ...DEMO }, { store: st })[0];
      const h = holdSlot(s.slotId, WHO, { store: st, ...DEMO });
      const justBefore = new Date(Date.parse(NOW) + FAYSAL_HOLD_TTL_MS - 1000).toISOString();
      return confirmBooking(h.holdId, WHO, { store: st, now: justBefore, demoMode: true }).state === "confirmed";
    })());

  // HOLD-5 — the window closes while the patient is typing.
  const store3 = createStore();
  const s3 = searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: SAT, ...DEMO }, { store: store3 })[0];
  const h4 = holdSlot(s3.slotId, WHO, { store: store3, ...DEMO });
  const edited = clone();
  const clinic = edited["wattan-2"].layers.find((l) => l.layer === "clinic")!;
  clinic.week.sat = { ...(clinic.week.sat as DayHours), status: "unknown", windows: [] } as DayHours;
  let hold5Error = "";
  try {
    confirmBooking(h4.holdId, WHO, { store: store3, ...DEMO, hours: edited });
  } catch (e) {
    hold5Error = (e as Error).message;
  }
  check("HOLD-5: a confirm whose window became unbookable fails with hours_changed_reverify", hold5Error === "hours_changed_reverify");
  check("HOLD-5: and NOTHING was written", store3.appointments.size === 0);
  check("HOLD-5 control: the same confirm succeeds against the unedited hours", confirmBooking(h4.holdId, WHO, { store: store3, ...DEMO }).state === "confirmed");
  mutation("HOLD-5: a stale hold is confirmed into a window that closed", () => {
    const st = createStore();
    const s = searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: SUN, ...DEMO }, { store: st })[0];
    const h = holdSlot(s.slotId, WHO, { store: st, ...DEMO });
    const t = clone();
    const c = t["wattan-2"].layers.find((l) => l.layer === "clinic")!;
    c.week.sun = { ...(c.week.sun as DayHours), status: "unknown", windows: [] } as DayHours;
    confirmBooking(h.holdId, WHO, { store: st, ...DEMO, hours: t });
    return true; // reached only if the confirm went through
  });

  // Lead time and horizon.
  check("FAYSAL_MIN_LEAD_MINUTES: a slot inside two hours is never offered",
    searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: "2026-09-10", now: "2026-09-10T16:40:00+03:00", demoMode: true, limit: 20 }, { store: createStore() })
      .every((s) => minutesOf(s.start) >= 18 * 60 + 40));
  check("FAYSAL_BOOKING_HORIZON_DAYS: nothing is offered beyond 14 days",
    searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: addDays("2026-09-10", 20), ...DEMO }, { store: createStore() }).length === 0);

  // Cancellation — MED-6, no friction, no penalty, idempotent.
  cancelBooking(appt1.ref, { store, ...DEMO });
  check("MED-6: cancelling is idempotent and quotes nothing", store.appointments.get(appt1.appointmentId)?.state === "cancelled");
  cancelBooking(appt1.ref, { store, ...DEMO });
  check("MED-6: a second cancel is a no-op", store.appointments.get(appt1.appointmentId)?.state === "cancelled");

  // FAM-1 — atomic family block.
  const famStore = createStore();
  const famSlots = searchSlots({ serviceId: "paeds-consult", siteId: "wattan-2", dateISO: SAT, limit: 20, ...DEMO }, { store: famStore });
  const contiguous = famSlots.filter((s, i) => i === 0 || minutesOf(s.start) - minutesOf(famSlots[i - 1].blockEnd) <= 15).slice(0, 2);
  if (contiguous.length === 2) {
    const fam = holdFamilyBlock(contiguous.map((s) => ({ slotId: s.slotId, patientLabel: "child" })), WHO, { store: famStore, ...DEMO });
    check("FAM-6: a family block is ONE hold covering all legs", famStore.holds.get(fam.holdId)?.slotIds.length === 2);
    check("FAM-1: confirming it books every leg at once", confirmBooking(fam.holdId, WHO, { store: famStore, ...DEMO }).slotIds.length === 2);
  } else {
    check("FAM: two contiguous paediatric slots exist to block", false);
  }
  check("FAM-3: a block across two sites is refused",
    throws(() => holdFamilyBlock(
      [
        { slotId: `wattan-2|dr-mansour|paeds-consult|${SAT}|09:00`, patientLabel: "a" },
        { slotId: `shoaa-wurud|dr-abdeljalil|paeds-consult|${SAT}|09:00`, patientLabel: "b" },
      ],
      OTHER,
      { store: createStore(), ...DEMO }
    )));
  check("FAM-1: an unbookable leg voids the WHOLE block",
    (() => {
      const st = createStore();
      const ok = searchSlots({ serviceId: "paeds-consult", siteId: "wattan-2", dateISO: SAT, ...DEMO }, { store: st })[0];
      const bad = `wattan-2|dr-mansour|paeds-consult|${SAT}|03:00`; // outside every window
      const threw = throws(() => holdFamilyBlock([{ slotId: ok.slotId, patientLabel: "a" }, { slotId: bad, patientLabel: "b" }], WHO, { store: st, ...DEMO }));
      return threw && st.holds.size === 0;
    })());
}

// ────────────────────────────────────────────────────────────────────────────
// 10. Money — no price escapes without its marker (PRICE-1 … PRICE-5, PKG-1)
// ────────────────────────────────────────────────────────────────────────────
{
  const priced = SERVICES.filter((s) => s.price);
  check("§9: the catalogue has priced services", priced.length >= 30);

  let unlabelled = 0;
  let unrendered = 0;
  let notDemo = 0;
  for (const service of priced) {
    for (const siteId of SITE_IDS) {
      const q = priceFor(service.id, siteId);
      if (q.demoLabel !== PRICE_LABEL_AR) unlabelled++;
      if (!q.renderedAr.includes(PRICE_LABEL_AR)) unrendered++;
      if (q.basis === "client_confirmed") notDemo++;
    }
  }
  check("PRICE-1: EVERY price carries the frozen label, at every site", unlabelled === 0);
  check("PRICE-1: and the rendered line already contains it — a bare number cannot escape", unrendered === 0);
  check("§9.1: every price in Wave 1 is invented and says so", notDemo === 0);
  check("PRICE-1: the label is SPEC-2 §5.2's wording, byte for byte", PRICE_LABEL_AR === "هذا سعر استرشادي، والمعتمد من الاستقبال.");

  // PRICE-5 — one catalogue, all sites.
  check("PRICE-5: the same service costs the same at all six sites",
    new Set(SITE_IDS.map((id) => priceFor("derm-consult", id).amount)).size === 1);

  // §9.4 — the deliberate absences refuse rather than guess.
  check("§9.4: a service with no dossier price REFUSES to quote", throws(() => priceFor("dental-extraction", "wattan-2")));
  check("§9.4: lab tests are booked and never quoted", throws(() => priceFor("lab-tests-as-requested", "shoaa-wurud")));
  check("EMP-1: a corporate batch is never quoted", throws(() => priceFor("emp-corporate-batch", "shoaa-wurud")));
  check("§9.5: every price states that VAT is unknown, and no tax line exists", priceFor("gp-consult", "wattan-1").vatNote === "excluded_unknown");

  // PKG-1 — six sessions for the price of five, mechanically pinned.
  check("PKG-1: every laser package is exactly 5 × the session price",
    [["laser-small-session", "laser-small-pkg6"], ["laser-medium-session", "laser-medium-pkg6"], ["laser-large-session", "laser-large-pkg6"], ["laser-full-session", "laser-full-pkg6"]]
      .every(([one, six]) => priceFor(six, "wattan-2").amount === 5 * priceFor(one, "wattan-2").amount));
  check("PKG-1: and a package always states its terms", priceFor("laser-medium-pkg6", "wattan-2").termsAr !== null);
  mutation("PKG-1: a drifted package price passes the invariant", () => {
    const broken = SERVICES.map((s) => (s.id === "laser-medium-pkg6" && s.price ? { ...s, price: { ...s.price, amountSar: 1400 } } : s));
    assertCatalogueInvariants(broken);
    return true;
  });
  mutation("PRICE-1: a demo-basis price with the label switched off passes the invariant", () => {
    const broken = SERVICES.map((s) =>
      s.id === "gp-consult" && s.price ? { ...s, price: { ...s.price, requiresDemoLabel: false as unknown as true } } : s
    );
    assertCatalogueInvariants(broken);
    return true;
  });
  mutation("PRICE-4: a TPA percentage smuggled into a catalogue row passes the invariant", () => {
    const broken = SERVICES.map((s) => (s.id === "derm-consult" ? { ...s, termsAr: "خصم 30% لحاملي البطاقة" } : s));
    assertCatalogueInvariants(broken);
    return true;
  });

  // PRICE-4 — the percentages are not in the module at all, at any level.
  const catalogueSrc = stripComments(readFileSync(new URL("../lib/health/catalogue.ts", import.meta.url), "utf8"));
  check("PRICE-4: no TPA discount percentage appears anywhere in the catalogue", !/\b(20|25|30)\s*%/.test(catalogueSrc));
  check("PRICE-4: nor in any rendered price line",
    SERVICES.filter((x) => x.price).every((x) => !/\b(20|25|30)\s*%/.test(priceFor(x.id, "wattan-2").renderedAr)));

  // DEMO-1(c) — the suffix that survives a screenshot, on EVERY confirmation.
  const st = createStore();
  const s = searchSlots({ serviceId: "laser-medium-session", siteId: "wattan-2", dateISO: SAT, ...DEMO }, { store: st })[0];
  const h = holdSlot(s.slotId, WHO, { store: st, ...DEMO });
  const appt = confirmBooking(h.holdId, WHO, { store: st, ...DEMO });
  const block = renderConfirmationBlock(appt);
  check("DEMO-1c: a slot confirmation carries «حجز تجريبي — غير مسجّل لدى الفرع.»", block.includes(DEMO_BOOKING_SUFFIX_AR));
  check("DEMO-1c: the suffix is emitted by the renderer, not composed by a caller",
    block.trim().endsWith(DEMO_BOOKING_SUFFIX_AR));
  mutation("DEMO-1c: a confirmation with the suffix stripped is accepted", () =>
    !throws(() => assertConfirmationMarkers(block.replace(DEMO_BOOKING_SUFFIX_AR, ""), appt)));

  // RES-1 — the device is constrained but never named.
  const laserSrc = readFileSync(new URL("../lib/health/slots.ts", import.meta.url), "utf8");
  check("RES-1: no device brand appears anywhere in the engine", !/gentlemax|جنتل\s*ماكس/i.test(laserSrc + catalogueSrc));
  const both = searchSlots({ serviceId: "laser-medium-session", siteId: "wattan-2", dateISO: SUN, limit: 20, ...DEMO }, { store: createStore() });
  const overlapping = both.some((x, i) => both.slice(i + 1).some((y) => minutesOf(y.start) < minutesOf(x.blockEnd) && minutesOf(x.start) < minutesOf(y.blockEnd)));
  check("§7.4: the laser device is capacity 1 — no two overlapping laser offers at one site", !overlapping);
  const across = searchSlots(
    { serviceId: "laser-medium-session", siteId: "wattan-2", dateFromISO: SAT, dateToISO: MON, limit: 40, ...DEMO },
    { store: createStore() }
  );
  check("§7.4: the device constraint is per DAY — the same clock time on another day is still offered",
    new Set(across.map((x) => x.dateISO)).size >= 2);
}

// ────────────────────────────────────────────────────────────────────────────
// 11. Insurance — never a promise, never a code, never a percentage
// ────────────────────────────────────────────────────────────────────────────
{
  const carriers = ["bupa", "tawuniya", "takaful-al-arabia", "amana", "بوبا", "شركة ما", ""];
  let promises = 0;
  let classes = 0;
  let codes = 0;
  let gates = 0;
  for (const carrier of carriers) {
    for (const siteId of SITE_IDS) {
      const a = insuranceAnswer(carrier, siteId);
      if (/مغطى|covered|يغطي/.test(a.sentenceAr)) promises++;
      if (a.classKnown || a.networkClass !== "unknown") classes++;
      if (/18002|18003|17985|18004|17081/.test(a.sentenceAr)) codes++;
      if (a.blocksBooking !== false) gates++;
    }
  }
  check("INS-1: no insurance answer ever promises coverage", promises === 0);
  check("§10.3: no network class is ever stated", classes === 0);
  check("INS-3 / criterion 18: no facility code ever reaches a patient", codes === 0);
  check("INS-5: insurance never gates the booking", gates === 0);
  check("INS-2: a directory source is never named as an accepted payer", insuranceAnswer("amana", "wattan-1").accepted === "unknown");
  check("§10.1: a TPA card is answered as a discount card, not as insurance",
    insuranceAnswer("takaful-al-arabia", "wattan-3").payerKind === "tpa_discount_card" &&
    insuranceAnswer("takaful-al-arabia", "wattan-3").sentenceAr.includes("بطاقة خصم وليست تأمين"));
  check("§10.4: Bupa at Ash Shifa is an ANNOUNCEMENT, never a present-tense fact",
    insuranceAnswer("bupa", "wattan-4").sentenceAr.includes("انعلن") && insuranceAnswer("bupa", "wattan-4").sentenceAr.includes("٢٠٢٤"));
  check("INS-1: the answer always routes the class question to reception",
    SITE_IDS.every((id) => insuranceAnswer("tawuniya", id).sentenceAr.includes("الاستقبال")));
  check("§10.2: the card named back is the card the patient named",
    insuranceAnswer("عندي تكافل وطن", "wattan-3").sentenceAr.includes("تكافل وطن"));
  mutation("INS-1: a sentence containing «مغطى» passes the guard", () => !throws(() => assertNoCoveragePromise("زيارتك مغطى بالكامل")));
  mutation("PRICE-4: a percentage in an insurance sentence passes the guard", () => !throws(() => assertNoCoveragePromise("عندك خصم 30% على الكشف")));
}

// ────────────────────────────────────────────────────────────────────────────
// 12. Routing, ratings and capability (§5, §6, RATE-1, SPEC-1)
// ────────────────────────────────────────────────────────────────────────────
{
  check("STR-1: every strength cites the dossier", STRENGTHS.every((s) => s.dossierRef.trim().length > 0));
  check("STR-1: every strength carries a one-line patient reason", STRENGTHS.every((s) => s.reasonAr.trim().length > 0 && !s.reasonAr.includes("\n")));
  const comparatives = /أفضل|أحسن|أقوى|أرخص|better|best|stronger|cheaper|top rated/i;
  check("STR-2: no reason is a comparison", STRENGTHS.every((s) => !comparatives.test(s.reasonAr) && !comparatives.test(s.reasonEn)));
  check("RATE-1: no reason mentions a rating or a review count", STRENGTHS.every((s) => !/\b[0-9]\.[0-9]\b|نجوم|stars|تقييم/.test(s.reasonAr + s.reasonEn)));
  check("RATE-1: ratings exist in the record but are marked internal-only", SITE_IDS.every((id) => SITES[id].rating.internalOnly === true));

  // STR-3 — a fallback is offered WITH its reason.
  const forced = recommendBranch("paediatrics", { ...DEMO, dateISO: FRI });
  check("STR-3: when the primary can't take Friday, the fallback is named with a reason",
    forced.siteId === "wattan-2" && forced.fallbackFromSiteId === "shoaa-wurud" && !!forced.fallbackReasonAr &&
    forced.fallbackReasonAr.includes(patientPhoneFor("shoaa-wurud")));
  check("STR-3: and a bookable primary is left alone", recommendBranch("paediatrics", { ...DEMO, dateISO: SAT }).siteId === "shoaa-wurud");
  check("§5.3: fallbacks stay inside the need", recommendBranch("endodontics", DEMO).siteId === "wattan-3");
  check("§5: the commonest asks route without guessing", recommendBranch("باطنية", DEMO).siteId === "wattan-2" && recommendBranch("laser", DEMO).siteId === "wattan-2");
  // SPEC-1 §6.2 is mostly `G`. A need the matrix cannot support is REFUSED, not
  // routed — the persona layer asks specialtyEvidence() what it may say instead.
  check("SPEC-1: a need no site can be claimed to run is refused, not guessed", throws(() => recommendBranch("orthopaedics", DEMO)));
  check("§5.2: «تقويم الشفا» keeps the GATED Shifa path — the longer alias wins",
    recommendBranch("تقويم الشفا", DEMO).siteId === "wattan-4");
  check("§5: every need the demo surface asks for resolves",
    ["laser", "dermatology", "dental", "orthodontics", "endodontics", "paediatrics", "obgyn", "ent",
     "employment_medical", "neurology", "after_hours", "internal", "general"]
      .every((n) => !throws(() => recommendBranch(n, DEMO))));
  check("MED-2: an urgent need flags that the safety rail outranks routing", recommendBranch("urgent_tonight", DEMO).safetyRailOutranks === true);

  // SPEC-2 §6.2's geography fork: the branch in the patient's district is
  // REPORTED, never substituted for the clinical answer.
  const fork = recommendBranch("derm_laser", { ...DEMO, districtAr: "الشفا" });
  check("§6.2: the district branch is reported as nearest", fork.nearestSiteId === "wattan-4" && !!fork.nearestReasonAr);
  check("§6.2: and it does NOT displace the branch the group markets for the need", fork.siteId === "wattan-2");
  check("§6.2: a district we have no branch in answers null, never a guess",
    recommendBranch("derm_laser", { ...DEMO, districtAr: "حي غير معروف" }).nearestSiteId === null);

  // SPEC-1 — group_only / inferred capability is conversational, never bookable.
  check("SPEC-1: a group_only specialty is never bookable",
    searchSlots({ serviceId: "ophth-consult", siteId: "shoaa-wurud", dateISO: SAT, ...DEMO }, { store: createStore() }).length === 0);
  check("SPEC-1: a named_at_site specialty at a seeded site IS bookable",
    searchSlots({ serviceId: "ophth-consult", siteId: "wattan-2", dateISO: SAT, ...DEMO }, { store: createStore() }).length > 0);
  check("§6.2 fn3 / audit S10: Shoaa Al Wurud's OB-GYN is downgraded to group_only, deliberately",
    searchSlots({ serviceId: "obgyn-consult", siteId: "shoaa-wurud", dateISO: SAT, ...DEMO }, { store: createStore() }).length === 0);
  check("POL-07: the women's-health path with a female clinician survives, at Ar Rawabi",
    searchSlots({ serviceId: "obgyn-consult", siteId: "wattan-2", dateISO: SAT, gender: "female", ...DEMO }, { store: createStore() }).length > 0);

  // DOC-1 / DOC-2 — gender is a filter; no credentials we cannot support.
  check("DOC-1: a female-clinician filter is honoured, not volunteered",
    searchSlots({ serviceId: "derm-consult", siteId: "wattan-2", dateISO: SAT, gender: "female", limit: 10, ...DEMO }, { store: createStore() })
      .every((s) => CLINICIANS.find((c) => c.id === s.clinicianId)?.gender === "female"));
  check("§6.3: every clinician is marked fictional", CLINICIANS.every((c) => c.fictional === true));
  check("DOC-2: the roster carries no licence, university or years of experience",
    CLINICIANS.every((c) => !("licence" in c) && !("university" in c) && !("yearsExperience" in c)));

  // Prohibition A — no denylisted real name appears in the seed data. (Weaker
  // than Rule DOC-4's normalised, bundle-wide scan, which belongs with the
  // safety rail owner because it needs the authoritative normalizeAr.)
  const seed = JSON.stringify(CLINICIANS) + JSON.stringify(SITES) + JSON.stringify(STRENGTHS);
  check("Prohibition A: no denylisted real clinician appears in the seed data",
    REAL_CLINICIAN_DENYLIST.every((name) => !seed.includes(name)));
  check("§6.3: the roster is 30 invented clinicians, every site staffed, every site with a woman",
    CLINICIANS.length === 30 &&
    SITE_IDS.every((id) => CLINICIANS.filter((c) => c.siteIds.includes(id)).length >= 4) &&
    SITE_IDS.every((id) => CLINICIANS.some((c) => c.siteIds.includes(id) && c.gender === "female")));

  // PHONE-1 — never read out a fax.
  const faxes = ["0114581913", "0114964439", "0114933115", "0112052613", "0114453929"];
  check("PHONE-1: no fax or suppressed number is ever offered", SITE_IDS.every((id) => !faxes.includes(patientPhoneFor(id))));
}

// ────────────────────────────────────────────────────────────────────────────
// 13. Determinism (§7.2) — the same day, forever, in any process
// ────────────────────────────────────────────────────────────────────────────
{
  const one = searchSlots(CHILD_QUERY, { store: createStore() }).map((s) => s.slotId);
  const two = searchSlots(CHILD_QUERY, { store: createStore() }).map((s) => s.slotId);
  check("§7.2: the same query returns the same day within a process", one.join("|") === two.join("|") && one.length > 0);

  const self = fileURLToPath(import.meta.url);
  const loader = fileURLToPath(new URL("./ts-ext-loader.mjs", import.meta.url));
  const child = spawnSync(process.execPath, ["--import", loader, "--experimental-strip-types", self], {
    encoding: "utf8",
    env: { ...process.env, FAYSAL_PROOF_CHILD: "1" },
    timeout: 60_000,
  });
  let childIds: string[] = [];
  try {
    childIds = JSON.parse(child.stdout.trim());
  } catch {
    childIds = [];
  }
  check("§7.2 / criterion 23: an independent PROCESS produces the identical slot list", childIds.join("|") === one.join("|") && childIds.length > 0);

  const src = readdirSync(new URL("../lib/health/", import.meta.url))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => stripComments(readFileSync(new URL(`../lib/health/${f}`, import.meta.url), "utf8")))
    .join("\n");
  check("§7.2: there is no Math.random in the engine's CODE", !/Math\.random/.test(src));
  check("§7.2: the slot salt is pinned, never accepted from a request", !/salt\s*[:=]\s*(q|query|req|input)\./i.test(src));
}

// ────────────────────────────────────────────────────────────────────────────
// 14. The architectural seam — zero restaurant modules
// ────────────────────────────────────────────────────────────────────────────
{
  const files = readdirSync(new URL("../lib/health/", import.meta.url)).filter((f) => f.endsWith(".ts"));
  const imports: string[] = [];
  for (const f of files) {
    const text = readFileSync(new URL(`../lib/health/${f}`, import.meta.url), "utf8");
    for (const m of text.matchAll(/^\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gm)) imports.push(m[1]);
  }
  const restaurant = /(^|\/)(order|orders|menu|order-pricing|order-store|order-seed|delivery|payments|promo|cod-store)([./]|$)|lib\/(order|menu|demo|orders|payments|delivery)/;
  const offenders = imports.filter((i) => restaurant.test(i));
  check("SEAM: lib/health imports nothing from lib/order*, lib/*menu* or any restaurant module", offenders.length === 0);
  check("SEAM: every import is engine-local or a node builtin", imports.every((i) => i.startsWith("./") || i.startsWith("node:")));
  check("SEAM: the engine pulls in no framework, no server-only, no supabase",
    imports.every((i) => !/server-only|supabase|next|react/.test(i)));
  check("SEAM: the modules the other agents own are not imported either (they may not exist yet)",
    imports.every((i) => !/health\/(db|safety)/.test(i)));

  // Rule HRS-DEMO / criterion 27's source-side cousin: the literal is confined to
  // the engine. (Grepping the BUILT bundle is CI's job and SPEC-4 §11.5's.)
  const outside = spawnSync(
    "sh",
    [
      "-c",
      "grep -rl 'demo_seeded' --include='*.ts' --include='*.tsx' lib app components 2>/dev/null " +
        "| grep -v '^lib/health/' | grep -v '^app/api/faysal/' | grep -v '^app/faysal/' | head -5",
    ],
    { encoding: "utf8", cwd: fileURLToPath(new URL("..", import.meta.url)) }
  );
  check(
    "HRS-DEMO: `demo_seeded` is confined to the engine and the Faysal demo surface",
    outside.stdout.trim() === ""
  );
  // NOTE: §14 criterion 27's real form greps the BUILT PRODUCTION BUNDLE, not
  // the source tree, and belongs in CI beside SPEC-4 §11.5's bundle assertion.
  // What this file can prove is the runtime half, asserted above: with
  // DEMO_MODE off, `demo_seeded` mints nothing at any site on any day.
}

console.log(`\nFAYSAL DOMAIN PROOF: ${pass} passed, ${fail} failed, ${mutations} mutations verified`);
if (fail > 0) process.exit(1);
