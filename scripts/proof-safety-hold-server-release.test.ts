// WO-SAFETY-HOLD-SERVER-RELEASE — red-first source proof.
// Run: node --experimental-strip-types scripts/proof-safety-hold-server-release.test.ts

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
};

const store = read("lib/conversation-store.ts");
const release = read("app/api/conversations/[id]/release-hold/route.ts");
const resume = read("app/api/conversations/[id]/resume/route.ts");

// CONTROL: the old browser path is exactly what this work order removes.
const oldBrowserClear =
  `setOwnershipState(_sb, convId, "AI_ACTIVE", { extra: { owner: "ai", status: "AI نشط", escalation_reason: null, handover_note: summary || null, is_safety_hold: false } });`;
check("CONTROL: old browser setOwnershipState clear would be caught by this proof", /setOwnershipState\([^)]*is_safety_hold:\s*false/s.test(oldBrowserClear));

// Browser cannot directly clear the hold anymore.
check("(client) returnToAi calls the dedicated release-hold route for held threads", /wasHold\s*\?\s*releaseSafetyHold\(convId, summary\)/.test(store));
check("(client) releaseSafetyHold posts to /api/conversations/[id]/release-hold", /fetch\(`\/api\/conversations\/\$\{conversationId\}\/release-hold`/.test(store));
check("(client) browser setOwnershipState no longer sends is_safety_hold:false", !/setOwnershipState\([^;]*is_safety_hold:\s*false/s.test(store));
check("(client) non-held return keeps direct ownership_state handback", /:\s*setOwnershipState\(_sb, convId, "AI_ACTIVE"/.test(store));
check("(client) held return does not use the assignee release path again", /if \(!wasHold\) fire\(releaseAssignee\(convId, "returned"\)\);/.test(store));

// Route auth, tenant binding, service-role write, and audit.
check("(route) uses createAdminClient service-role path", /const admin = createAdminClient\(\);/.test(release));
check("(route) returns 503 when admin client is absent", /if \(!admin\) return NextResponse\.json\(\{ error: "not_configured" \}, \{ status: 503 \}\);/.test(release));
check("(route) requires tenant/member auth", /const gate = await requireTenant\(\);/.test(release) && /if \(!gate\.ok\) return gate\.response;/.test(release));
check("(route) reads restaurant_id before writing", /\.select\("id, restaurant_id, ownership_state, is_safety_hold"\)/.test(release));
check("(route) compares selected restaurant_id to authenticated tenant before write", /row\.restaurant_id !== tenant\.restaurantId/.test(release) && release.indexOf("row.restaurant_id !== tenant.restaurantId") < release.indexOf(".update({"));
check("(route) writes through admin client with tenant-scoped id + restaurant filters", /\.from\("conversations"\)[\s\S]*\.update\(\{[\s\S]*is_safety_hold: false,[\s\S]*ownership_state: "AI_ACTIVE"[\s\S]*assigned_member_id: null,[\s\S]*\.eq\("id", params\.id\)[\s\S]*\.eq\("restaurant_id", tenant\.restaurantId\)/.test(release));
check("(route) rejects non-held calls instead of being a generic browser update escape hatch", /if \(!wasSafetyHeld\) \{[\s\S]*not_safety_hold/.test(release));
check("(route) audits the deliberate release", /recordAuditEvent\(admin, \{[\s\S]*action: "conversation_returned"[\s\S]*entityType: "conversation"[\s\S]*entityId: params\.id[\s\S]*release: "safety_hold"[\s\S]*note/.test(release));

// Resume remains the fail-safe and must not become a release path.
check("(resume) still bails on held conversations", /if \(state === "SYSTEM_HOLD" \|\| held\) return NextResponse\.json\(\{ ok: true, skipped: "hold" \}\);/.test(resume));
check("(resume) does not clear is_safety_hold", !/is_safety_hold:\s*false/.test(resume));
check("(resume) does not call release-hold", !/release-hold/.test(resume));

console.log(`\nSAFETY-HOLD-SERVER-RELEASE PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
