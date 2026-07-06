// ============================================================================
// WO-RAMADAN-MODE proof harness — effectiveHours / effectiveHoursSource (pure).
// Covers: precedence (mode ON + ramadan_hours → ramadan), OFF-invariance (mode
// OFF → regular regardless of ramadan_hours), null/empty ramadan_hours = regular
// even with mode ON (never lose regular by flipping the switch early), and the
// source label. Run: node --experimental-strip-types scripts/proof-ramadan.test.ts
// ============================================================================

import { effectiveHours, effectiveHoursSource } from "../lib/settings/effective-hours.ts";
import { parseWeeklyHours } from "../lib/settings/hours.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } }

// ---- cross-midnight Ramadan windows (post-iftar → suhoor) -------------------
// Regular route keeps same-day semantics; the Ramadan route opts into overnight
// (open > close). open == close stays rejected either way.
check("overnight 20:00→03:00 REJECTED by default (regular hours)",
  !parseWeeklyHours({ monday: { open: "20:00", close: "03:00" } }).ok);
check("overnight 20:00→03:00 ACCEPTED with allowOvernight (Ramadan)",
  parseWeeklyHours({ monday: { open: "20:00", close: "03:00" } }, { allowOvernight: true }).ok);
check("same-day still fine with allowOvernight",
  parseWeeklyHours({ monday: { open: "12:00", close: "23:00" } }, { allowOvernight: true }).ok);
check("open == close REJECTED even with allowOvernight (zero-length)",
  !parseWeeklyHours({ monday: { open: "03:00", close: "03:00" } }, { allowOvernight: true }).ok);
check("closed day fine with allowOvernight",
  parseWeeklyHours({ friday: { closed: true } }, { allowOvernight: true }).ok);

const REG = { monday: { open: "12:00", close: "23:00" } };
const RAM = { monday: { open: "20:00", close: "03:00" }, friday: { closed: true } };

// ---- precedence: mode ON + ramadan_hours present → ramadan ------------------
{
  const r = { hours: REG, ramadan_mode: true, ramadan_hours: RAM };
  check("ON + ramadan_hours → source 'ramadan'", effectiveHoursSource(r) === "ramadan");
  check("ON + ramadan_hours → returns ramadan_hours", effectiveHours(r) === RAM);
}

// ---- OFF-invariance: mode OFF → regular, even if ramadan_hours exists --------
{
  const r = { hours: REG, ramadan_mode: false, ramadan_hours: RAM };
  check("OFF + ramadan_hours present → source 'regular'", effectiveHoursSource(r) === "regular");
  check("OFF + ramadan_hours present → returns regular hours", effectiveHours(r) === REG);
}
for (const m of [undefined, null]) {
  const r = { hours: REG, ramadan_mode: m as boolean | null, ramadan_hours: RAM };
  check(`mode ${String(m)} (not true) → regular`, effectiveHours(r) === REG);
}

// ---- null/empty ramadan_hours = regular even with mode ON -------------------
{
  const r = { hours: REG, ramadan_mode: true, ramadan_hours: null };
  check("ON + null ramadan_hours → source 'regular' (no-op switch)", effectiveHoursSource(r) === "regular");
  check("ON + null ramadan_hours → returns regular hours", effectiveHours(r) === REG);
}
{
  const r = { hours: REG, ramadan_mode: true, ramadan_hours: {} };
  check("ON + EMPTY ramadan_hours {} → regular (empty is not a seasonal set)", effectiveHours(r) === REG);
}

// ---- degenerate inputs ------------------------------------------------------
check("null restaurant → source 'regular'", effectiveHoursSource(null) === "regular");
check("null restaurant → effectiveHours undefined (nothing to return)", effectiveHours(null) === undefined);
{
  const r = { hours: null, ramadan_mode: true, ramadan_hours: RAM };
  check("ON + ramadan_hours but null regular → still ramadan (override wins)", effectiveHours(r) === RAM);
}
{
  // Only-true is 'ramadan': a truthy-but-nonboolean mode must NOT trip it.
  const r = { hours: REG, ramadan_mode: 1 as unknown as boolean, ramadan_hours: RAM };
  check("mode === 1 (not === true) → regular (strict boolean)", effectiveHours(r) === REG);
}

console.log(`\nRAMADAN-MODE PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
