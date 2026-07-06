// ============================================================================
// WO-GATE-ALLERGY proof — the allergy-test-drive requirement is STRUCTURAL in the
// go-live gate, not PM discipline. Source-assert (route logic is DB-bound), same
// style as proof-wo-safe-1: verify the test-drive door records the durable proof
// when the gate fires, and that computeReadiness REQUIRES a passing test-drive
// within 7 days, fail-closed, folded into the `ready` decision.
//
// Run: node --experimental-strip-types scripts/proof-gate-allergy.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

const ACTION = "onboarding_allergy_test_passed";

// ---- audit.ts: the new action exists in the typed union ---------------------
const audit = read("lib/db/audit.ts");
check("audit action is a typed AuditAction", audit.includes(`"${ACTION}"`));

// ---- test-drive route: records the proof ONLY when the gate fired -----------
const td = read("app/api/console/onboarding/test-drive/route.ts");
check("(test-drive) imports recordAuditEvent", /import \{ recordAuditEvent \} from "@\/lib\/db\/audit"/.test(td));
check("(test-drive) detects the deterministic gate via the model id",
  td.includes('out.model === "deterministic_allergen_gate"'));
check("(test-drive) records the pass event INSIDE the gate-fired branch",
  /if \(allergenGate\) \{[\s\S]*recordAuditEvent\(/.test(td));
check("(test-drive) records the exact action + tenant-scoped entity",
  new RegExp(`action: "${ACTION}"[\\s\\S]*entityType: "restaurant"[\\s\\S]*entityId: tenant\\.restaurantId`).test(td) ||
  new RegExp(`action: "${ACTION}"[\\s\\S]*entityId: tenant\\.restaurantId`).test(td));
// NOT recorded when the gate did not fire (the event must mean the hard-test passed).
check("(test-drive) does NOT record unconditionally (guarded by allergenGate)",
  td.indexOf("recordAuditEvent(") > td.indexOf("if (allergenGate)"));

// ---- go-live gate: a passing test-drive is REQUIRED, 7-day, fail-closed -----
const gl = read("app/api/onboarding/go-live/route.ts");
check("(go-live) checklist has the allergyTestDrive item", /allergyTestDrive: ChecklistItem/.test(gl));
check("(go-live) the item is REQUIRED (blocks go-live)",
  /allergyTestDrive: \{[\s\S]*required: true/.test(gl));
check("(go-live) queries audit_events for the pass action",
  gl.includes('.from("audit_events")') && gl.includes(`.eq("action", "${ACTION}")`));
check("(go-live) bounds the query to a 7-day window",
  /ALLERGY_TEST_DRIVE_WINDOW_MS = 7 \* 24 \* 60 \* 60 \* 1000/.test(gl) && gl.includes('.gte("created_at", sinceIso)'));
check("(go-live) FAIL-CLOSED: a query error → not passed",
  /allergyTestDrivePass = !allergyRes\.error && \(allergyRes\.count \?\? 0\) > 0/.test(gl));
// The `ready` decision folds in every required item generically — so the new
// required item participates without a special case.
check("(go-live) ready = every required item passes (folds in the new item)",
  /ready = Object\.values\(checklist\)\.every\(\(item\) => !item\.required \|\| item\.pass\)/.test(gl));
check("(go-live) POST blocks with 422 when not ready (existing invariant intact)",
  /status: 422/.test(gl));

console.log(`\nWO-GATE-ALLERGY PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
