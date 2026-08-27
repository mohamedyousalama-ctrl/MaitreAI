// ============================================================================
// WO-STOREFRONT-HOLD — a failed storefront order does not leave an orphaned
// allergy hold behind, and the failure is visible server-side.
//
// Run: node --experimental-strip-types scripts/proof-storefront-safety-hold-rollback.test.ts
//
// THE BUG
// -------
// app/api/storefront/orders/route.ts creates the SYSTEM_HOLD conversation and its
// message BEFORE the order upsert, because the order row carries
// conversation_id. If the upsert then fails, the order does not exist — and the
// route's idempotency guard keys on the ORDER row. So a client retry falls
// straight through the guard and opens ANOTHER hold for the same basket. The
// operator gets a pile of duplicate allergy reviews for one customer, and
// `bad()` does not log, so the failure is invisible server-side: a lost order
// looked exactly like a validation rejection.
//
// The hold cannot simply move after the insert: an allergen-triggering order
// MUST have a review conversation, and creating the order first would leave a
// window where it exists without one. So the fix is a compensating delete on the
// failure path, which is safe because the route created that conversation
// moments earlier and nothing else references it once the order insert failed.
//
// Structural: exercising the real route needs a database and a Next request.
// What this pins is that the compensating path exists and stays wired.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};

const src = readFileSync(resolve(process.cwd(), "app/api/storefront/orders/route.ts"), "utf8");

// The failure branch of the order upsert — everything asserted below must live
// INSIDE it, not merely somewhere in the file.
const failBranch = /if \(error\) \{[\s\S]*?\n  \}/.exec(src)?.[0] ?? "";
ok("the order upsert has an explicit failure branch", failBranch.length > 0);

ok("the failure branch rolls back the safety hold it just opened",
  /\.from\("conversations"\)\s*\n?\s*\.delete\(\)/.test(failBranch));

// Scoped delete: an unscoped .delete().eq("id", …) is still correct here, but
// pinning restaurant_id keeps a future edit from widening it into a cross-tenant
// delete on a route that takes tenant input.
ok("the rollback is scoped to the conversation AND its restaurant",
  /\.eq\("id", safetyConversationId\)/.test(failBranch) &&
  /\.eq\("restaurant_id", restaurantId\)/.test(failBranch));

ok("the rollback only runs when a hold was actually opened",
  /if \(safetyConversationId\)/.test(failBranch));

// Bounded span, not "both strings appear somewhere": asserting only that
// `cleanupErr` and `console.error` are present in the branch stayed green when
// the guard was mutated to `if (false)`, because the name survives in the
// destructuring and console.error survives further down. Caught by mutation test.
ok("a rollback that itself fails is logged loudly, not swallowed",
  /if \(cleanupErr\) \{[\s\S]{0,120}?console\.error\(/.test(failBranch));

ok("the order failure is logged — bad() alone made it invisible",
  /console\.error\(\s*"\[storefront\/orders\] order upsert failed"/.test(failBranch));

ok("the failure log carries enough to find the order (tenant, id, number, code)",
  /restaurantId,/.test(failBranch) && /orderId: id,/.test(failBranch) &&
  /orderNumber,/.test(failBranch) && /code:/.test(failBranch));

ok("the caller still gets the Arabic failure message, not a leaked error",
  /return bad\("تعذر إنشاء الطلب\. حاول مرة أخرى\.", 500\);/.test(failBranch));

// Ordering still matters: the hold must be opened BEFORE the order upsert, since
// the order row carries conversation_id. If someone "fixes" the leak by moving
// the hold after the insert, an allergen order could exist with no review.
const convAt = src.indexOf('ownership_state: "SYSTEM_HOLD"');
const upsertAt = src.indexOf('.upsert(');
ok("the safety hold is still opened BEFORE the order upsert (an allergen order is never review-less)",
  convAt > 0 && upsertAt > 0 && convAt < upsertAt);

console.log(`\nSTOREFRONT-SAFETY-HOLD PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
