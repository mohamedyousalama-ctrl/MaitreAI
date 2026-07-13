// ============================================================================
// WO-SECURITY-1 — red-first proof (source-assertion; the migration is PREPARE-ONLY
// and applied only at the ceremony, so the live behavioral check is the founder
// click-script). publish_menu_draft is locked down two ways:
//   (a) EXECUTE revoked from anon + authenticated
//   (b) EXECUTE retained for service_role (the server route keeps working)
//   (c) an internal manager guard mirrors reset_restaurant
//   (d) the guard gates on auth.uid() IS NOT NULL — so the service_role caller
//       (auth.uid() null) is NOT broken; only a DIRECT authenticated non-member is rejected
//   (e) the route's own manager check + the onboarding caller are unchanged
// Run: node --experimental-strip-types scripts/proof-security-1-publish-lockdown.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

const mig = read("supabase/migrations/0088_publish_menu_draft_lockdown.sql");
// Isolate the function BODY (begin…$$) so guard assertions are about it, not comments.
const bodyStart = mig.indexOf("\nbegin\n");
const body = bodyStart >= 0 ? mig.slice(bodyStart) : mig;

// (a) EXECUTE revoked from anon + authenticated -------------------------------
check("(a) revokes EXECUTE from anon + authenticated",
  /revoke\s+execute\s+on\s+function\s+public\.publish_menu_draft\(uuid,\s*uuid\)\s+from\s+anon,\s*authenticated/i.test(mig));
check("(a) also revokes the lingering public grant",
  /revoke\s+execute\s+on\s+function\s+public\.publish_menu_draft\(uuid,\s*uuid\)\s+from\s+public/i.test(mig));

// (b) EXECUTE retained for service_role (server route keeps working) ----------
check("(b) retains EXECUTE for service_role",
  /grant\s+execute\s+on\s+function\s+public\.publish_menu_draft\(uuid,\s*uuid\)\s+to\s+service_role/i.test(mig));
check("(b) does NOT re-grant to anon or authenticated anywhere",
  !/grant\s+execute\s+on\s+function\s+public\.publish_menu_draft[\s\S]*?to[\s\S]*?\b(anon|authenticated)\b/i.test(mig));

// (c) internal manager guard mirroring reset_restaurant -----------------------
check("(c) body has a members role=manager guard scoped to p_restaurant_id",
  /from\s+public\.members\s+where\s+restaurant_id\s*=\s*p_restaurant_id\s+and\s+user_id\s*=\s*auth\.uid\(\)\s+and\s+role\s*=\s*'manager'/i.test(body));
check("(c) an unauthorized caller raises (does not silently proceed)",
  /raise\s+exception\s+'\[menu\] not authorized to publish/i.test(body));

// (d) the guard gates on auth.uid() IS NOT NULL — service_role NOT broken ------
check("(d) guard only enforces for a DIRECT authenticated caller (auth.uid() IS NOT NULL)",
  /if\s+auth\.uid\(\)\s+is\s+not\s+null\s+and\s+not\s+exists\s*\(/i.test(body));

// sanity: the publish BODY is intact (still the 0050 upsert-by-name + preserve-86) ----
check("(sanity) still upserts by (restaurant_id, name), preserving item ids",
  /where\s+restaurant_id\s*=\s*p_restaurant_id\s+and\s+name\s*=\s*v_item->>'name'/i.test(body));
check("(sanity) still PRESERVES `available` on update (86 flag not wiped)",
  /available.*intentionally NOT updated|NOTE: `available` intentionally NOT updated/i.test(body));
check("(sanity) still marks the draft published", /set status = 'published', published_at = now\(\)/i.test(body));

// (e) the route's own manager check + the onboarding caller are unchanged ------
const route = read("app/api/onboarding/menu/publish/route.ts");
check("(e) route still verifies manager membership before the RPC",
  /\.from\("members"\)[\s\S]{0,160}membership\.role !== "manager"/.test(route) && /status: 403/.test(route));
check("(e) route still calls the RPC via the service-role admin client",
  /admin\.rpc\("publish_menu_draft"/.test(route));
const onboarding = read("app/onboarding/page.tsx");
check("(e) the onboarding wizard still publishes via the route (the one live caller)",
  /\/api\/onboarding\/menu\/publish/.test(onboarding));

console.log(`\nSECURITY-1 PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
