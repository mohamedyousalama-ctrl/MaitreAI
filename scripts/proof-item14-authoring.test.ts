// ============================================================================
// Item 14 proof harness — standing/tonight authoring write routes.
// Pure expiry bounding exercised directly; source assertions confirm both routes
// are manager-only + audited, the standing lifecycle matches the runtime gate
// (create=draft, publish=approve+activate, retire=retire-not-delete), and tonight
// notes derive a bounded expiry from the tenant's hours.
//
// Run: node --experimental-strip-types scripts/proof-item14-authoring.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeTonightExpiryMs, MIN_TTL_MS, MAX_TTL_MS, DEFAULT_TTL_MS } from "../lib/settings/tonight-expiry.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };
const NOW = 1_700_000_000_000;
const H = 60 * 60 * 1000;

// ---- Expiry bounding --------------------------------------------------------
check("today's close in-window → that close", computeTonightExpiryMs(NOW, NOW + 5 * H) === NOW + 5 * H);
check("closed/unknown (null) → default TTL", computeTonightExpiryMs(NOW, null) === NOW + DEFAULT_TTL_MS);
check("past close → default TTL (not a past expiry)", computeTonightExpiryMs(NOW, NOW - H) === NOW + DEFAULT_TTL_MS);
check("very soon close floored to MIN_TTL", computeTonightExpiryMs(NOW, NOW + 10 * 60 * 1000) === NOW + MIN_TTL_MS);
check("very late close capped at MAX_TTL", computeTonightExpiryMs(NOW, NOW + 40 * H) === NOW + MAX_TTL_MS);
check("expiry always strictly after now", computeTonightExpiryMs(NOW, null) > NOW);

// ---- Standing route: manager-only, governance lifecycle, audited -----------
const si = read("app/api/settings/standing-instructions/route.ts");
check("(standing) manager-only on GET and POST",
  (si.match(/tenant\.role !== "manager"\) return NextResponse\.json\(\{ error: "forbidden_role" \}, \{ status: 403 \}\)/g) ?? []).length >= 2);
check("(standing) create inserts a DRAFT (active:false, created_by)", /active: false, created_by: memberId/.test(si));
check("(standing) create auto-increments version", si.includes("nextVersion") && /version: nextVersion/.test(si));
check("(standing) publish = approve + activate together", /update\(\{ active: true, approved_by: memberId, retired_at: null \}\)/.test(si));
check("(standing) publish requires a resolvable approver (no ghost-active row)", /if \(!memberId\) return NextResponse\.json\(\{ error: "no_member"/.test(si));
check("(standing) retire = retire-not-delete (active:false + retired_at)", /update\(\{ active: false, retired_at: new Date\(\)\.toISOString\(\) \}\)/.test(si));
check("(standing) all three actions audit", si.includes('"standing_instruction_created"') && si.includes('"standing_instruction_published"') && si.includes('"standing_instruction_retired"'));
check("(standing) writes are tenant-scoped", (si.match(/\.eq\("restaurant_id", rid\)/g) ?? []).length >= 3);

// ---- Tonight route: manager-only, expiry from hours, audited ---------------
const tn = read("app/api/settings/tonight-notes/route.ts");
check("(tonight) manager-only", /tenant\.role !== "manager"\) return NextResponse\.json\(\{ error: "forbidden_role" \}, \{ status: 403 \}\)/.test(tn));
check("(tonight) computes expiry from hours via the pure helper", tn.includes("computeTonightExpiryMs(nowMs, todayCloseMs("));
check("(tonight) resolves today's close in the tenant timezone", tn.includes("timeZone: timezone") && tn.includes("WEEK_DAYS"));
check("(tonight) body bounded to TONIGHT_MAX", tn.includes("text.length > TONIGHT_MAX"));
check("(tonight) audits tonight_note_created", tn.includes('"tonight_note_created"'));
check("(tonight) GET lists only live notes (expires_at > now)", /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/.test(tn));

// ---- Audit union carries the 4 new actions ---------------------------------
const audit = read("lib/db/audit.ts");
check("audit union has the 4 item-14 actions",
  ["standing_instruction_created", "standing_instruction_published", "standing_instruction_retired", "tonight_note_created"].every((a) => audit.includes(`"${a}"`)));

console.log(`\nITEM14-AUTHORING PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
