// ============================================================================
// Item 10 proof harness — preserve-86 across menu re-publish (0036 gap).
// The DB fix lives in 0050 (applied): publish_menu_draft upserts items BY NAME
// and preserves each surviving item's `available`. Proven functionally on prod
// via BEGIN…ROLLBACK (a 86'd item stayed available=f after a re-publish whose
// draft said available=true; leftover=0). This harness covers the pure route
// truth-diff and asserts the route + migration reflect the fix.
//
// Run: node --experimental-strip-types scripts/proof-preserve86.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { diffUnavailable } from "../lib/menu/publish-availability.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// ---- Pure diff: preserved vs lost ------------------------------------------
{
  // A 86'd item that survives the republish stays 86'd → preserved, NO reset warning.
  const d = diffUnavailable(["Koshari", "Molokhia"], ["Koshari", "Molokhia"]);
  check("surviving 86'd items → preserved, availabilityReset false",
    d.preserved.length === 2 && d.lost.length === 0 && d.availabilityReset === false);
}
{
  // A 86'd item renamed/removed loses its 86 → lost, warning fires.
  const d = diffUnavailable(["Koshari", "OldName"], ["Koshari"]);
  check("renamed/removed 86'd item → lost + availabilityReset true", d.lost.join() === "OldName" && d.availabilityReset === true);
  check("the survivor is still counted as preserved", d.preserved.join() === "Koshari");
}
{
  check("no 86'd items at all → no reset", diffUnavailable([], []).availabilityReset === false);
  const d = diffUnavailable(["A", "A"], ["A"]);
  check("dedups before-names", d.preserved.join() === "A" && d.lost.length === 0);
}

// ---- Source: route now tells the truth -------------------------------------
const route = read("app/api/onboarding/menu/publish/route.ts");
check("route no longer hardcodes availabilityReset: true", !/availabilityReset: true/.test(route));
check("route computes reset from the name diff", route.includes("diffUnavailable(beforeNames, afterNames)") && route.includes("availabilityReset: diff.availabilityReset"));
check("route snapshots 86'd NAMES before AND after publish",
  /beforeRows[\s\S]*\.eq\("available", false\)/.test(route) && /afterRows[\s\S]*\.eq\("available", false\)/.test(route));
check("route returns preserved + lost lists", route.includes("preservedUnavailable: diff.preserved") && route.includes("lostUnavailable: diff.lost"));
check("stale 'V2 preserve 86' TODO removed", !route.includes("V2 — preserve 86"));
// CodeRabbit: a snapshot READ error must not be swallowed into an empty list (which
// would mislabel preserved 86s). Pre-publish error → fail before publishing;
// post-publish error → report diff unavailable (publish already happened).
check("route handles pre-publish snapshot error (fails before publish)",
  /beforeErr[\s\S]*status: 502[\s\S]*snapshot_failed|snapshot_failed[\s\S]*status: 502/.test(route) && route.includes("if (beforeErr)"));
check("route handles post-publish snapshot error (diff unavailable, publish kept)",
  route.includes("if (afterErr)") && route.includes("availabilityDiffUnavailable: true"));
check("route no longer leaks raw rpcErr.message to the client", !/detail: rpcErr\.message/.test(route));

// ---- Source: 0050 migration preserves available on UPDATE ------------------
const mig = read("supabase/migrations/0050_menu_publish_upsert.sql");
check("0050 upserts items by (restaurant_id, name)", /menu_items[\s\S]*where restaurant_id = p_restaurant_id and name = v_item->>'name'/.test(mig));
check("0050 preserves available on surviving items (documented + implemented)",
  /PRESERVE its current live `available`/.test(mig) || /PRESERVE `available`/.test(mig));

console.log(`\nPRESERVE86 PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
