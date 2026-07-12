// ============================================================================
// WO-AUDIT-SETTINGS — machine-verified evidence for the settings/onboarding audit.
//
// Two kinds of check:
//   INVARIANT(...)  — a property that MUST hold (pass = good). Regression guard.
//   OPEN_DEFECT(...) — asserts a CURRENTLY-PRESENT defect/gap pattern (pass = the
//                      defect is still open, by design). When a fix WO lands, that
//                      check FAILS — the intended signal to update this harness and
//                      move the finding to "closed". Read a failing OPEN_DEFECT as
//                      "good news, someone fixed it", not a regression.
//
// Source-level only (no DB writes) — safe to run anywhere. Extends the R4 harness
// pattern (readFileSync + assert on route source). Run:
//   node --experimental-strip-types scripts/proof-audit-settings.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const INVARIANT = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ INVARIANT FAILED:", name); } };
const OPEN_DEFECT = (name: string, present: boolean) => { if (present) pass++; else { fail++; console.error("  ✗ OPEN_DEFECT no longer reproduces (fixed?) — update harness:", name); } };

// --- INVARIANT 1: every mutating settings/onboarding route enforces a manager gate ---
const MANAGER_GATED = [
  "app/api/settings/identity/route.ts",
  "app/api/settings/psp/route.ts",
  "app/api/settings/printer/route.ts",
  "app/api/settings/hours/route.ts",
  "app/api/settings/flags/route.ts",
  "app/api/settings/ops/route.ts",
  "app/api/settings/standing-instructions/route.ts",
  "app/api/settings/alerts/route.ts",
  "app/api/settings/whatsapp/route.ts",
  "app/api/settings/whatsapp-health/roundtrip/route.ts",
  "app/api/onboarding/config/zones/route.ts",
  "app/api/onboarding/config/zones/[id]/route.ts",
  "app/api/onboarding/config/hours/route.ts",
  "app/api/onboarding/config/persona/route.ts",
  "app/api/team/invite/route.ts",
  "app/api/members/[id]/route.ts",
  "app/api/drivers/route.ts",
  "app/api/drivers/[id]/route.ts",
];
for (const r of MANAGER_GATED) {
  const src = read(r);
  INVARIANT(`(${r}) enforces role === "manager"`, /role !== "manager"/.test(src) && /403/.test(src));
  INVARIANT(`(${r}) resolves tenant server-side (requireTenant, not body rid)`, /requireTenant\(\)/.test(src));
}

// --- INVARIANT 2: go-live is manager-verified + does a server-side readiness recheck ---
const goLive = read("app/api/onboarding/go-live/route.ts");
INVARIANT("(go-live) manager-verified", /verifyManager/.test(goLive));
INVARIANT("(go-live) server recheck (never trusts client)", /computeReadiness/.test(goLive));
INVARIANT("(go-live) allergy proof is fail-closed", /allergyTestDrivePass = !.*error && .*> 0/.test(goLive) || /!allergyRes\.error/.test(goLive));

// --- INVARIANT 3: the zone editor fee/eta sanitizer normalizes Arabic-Indic BEFORE stripping ---
const zoneEditor = read("components/console-v2/delivery/ZoneMapEditor.tsx");
INVARIANT("(zone editor) toAscii normalizes Arabic-Indic digits", /toAscii/.test(zoneEditor) && /\\u0660|٠-٩|\[٠-٩\]/.test(zoneEditor));
INVARIANT("(zone editor) fee is required non-empty (no silent 0)", /feeStr === ""/.test(zoneEditor));

// ============================================================================
// OPEN DEFECTS (documented; each flips to FAIL when its fix WO lands)
// ============================================================================

// D-A: onboarding MENU PRICE — FIXED by WO-MENU-PRICE-DIGITS. The input now
// normalizes Arabic-Indic digits via the shared reference sanitizer before any
// strip, and the validator rejects a non-positive price (no silent 0).
const onboarding = read("app/onboarding/page.tsx");
const menuValidate = read("lib/onboarding/menu-validate.ts");
INVARIANT("D-A FIXED: menu price input uses sanitizeDecimalInput (Arabic-Indic safe)",
  /sanitizeDecimalInput\(e\.target\.value\)/.test(onboarding));
INVARIANT("D-A FIXED: onboarding imports the shared reference sanitizer",
  /from "@\/lib\/util\/arabic-digits"/.test(onboarding));
INVARIANT("D-A FIXED: menu validator rejects non-positive price (<= 0)",
  /<= 0/.test(menuValidate) && /positive/.test(menuValidate));

// D-B: onboarding/config/hours PUT persists `hours` with NO structural validation,
// while settings/hours validates the SAME column via parseWeeklyHours.
const obHours = read("app/api/onboarding/config/hours/route.ts");
const setHours = read("app/api/settings/hours/route.ts");
OPEN_DEFECT("D-B onboarding config/hours PUT has no parseWeeklyHours validation",
  !/parseWeeklyHours/.test(obHours) && /patch\.hours = body\.hours/.test(obHours));
INVARIANT("(settings/hours) DOES validate via parseWeeklyHours", /parseWeeklyHours/.test(setHours));

// D-C: go-live checklist — server requires allergyTestDrive, but the console-v2
// onboarding UI renders no such row (safety-critical requirement invisible).
const obUi = read("app/(console-v2)/c/(app)/(manager)/onboarding/page.tsx");
OPEN_DEFECT("D-C server go-live requires allergyTestDrive", /allergyTestDrive/.test(goLive));
OPEN_DEFECT("D-C console-v2 onboarding UI omits an allergyTestDrive checklist row", !/allergyTestDrive/.test(obUi));

// D-D: alert_routing is stored but never consumed by the alert emitter.
const alertRecord = read("lib/alerts/record.ts");
OPEN_DEFECT("D-D alert emitter never reads alert_routing", !/alert_routing/.test(alertRecord));

// D-E: go-live POST bypasses requireTenant → no CSRF same-origin gate (manager-verified
// + fail-closed, so not an authz hole, but the one route outside the uniform CSRF cover).
OPEN_DEFECT("D-E go-live POST does not go through requireTenant (no CSRF gate)",
  !/requireTenant\(\)/.test(goLive));

console.log(`\nAUDIT-SETTINGS PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
