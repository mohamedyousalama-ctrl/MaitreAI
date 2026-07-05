// ============================================================================
// Item 15 proof harness — requireTenant sweep coverage.
// Walks every app/api/**/route.ts and asserts: any route that resolves a tenant
// does so through the R1 requireTenant gate (401 unauthenticated / 403 no active
// tenant), NOT the raw getServerTenant → null → 401 pattern. The DELIBERATE
// exclusions (public/webhook/cron) are enumerated with a reason and must NOT be
// swept. Guards against a future route re-introducing the un-gated pattern.
//
// Run: node --experimental-strip-types scripts/proof-item15-tenant-sweep.test.ts
// ============================================================================

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(p, "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// Routes intentionally NOT on requireTenant, each with a reason.
const EXCLUSIONS: Record<string, string> = {
  "app/api/health/route.ts": "public monitor — anonymous callers get {ready} 200/503, never 401",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

const apiDir = join(ROOT, "app/api");
const routes = walk(apiDir);
check("found a meaningful number of route files", routes.length > 40);

let sweptCount = 0;
for (const abs of routes) {
  const rel = abs.slice(ROOT.length + 1);
  const src = read(abs);
  const callsGetServerTenant = /await getServerTenant\(/.test(src);
  const usesRequireTenant = /requireTenant\(/.test(src);

  if (rel in EXCLUSIONS) {
    check(`EXCLUDED ${rel} is NOT on requireTenant (by design)`, !usesRequireTenant || callsGetServerTenant);
    continue;
  }
  // No non-excluded route may still resolve a tenant via the raw getServerTenant call.
  check(`no raw getServerTenant() call remains in ${rel}`, !callsGetServerTenant);
  if (usesRequireTenant) sweptCount++;
}

check("a large batch of routes were swept onto requireTenant", sweptCount >= 55);

// The gate primitive itself still carries the 401≠403 split (R1 invariant).
const gate = read(join(ROOT, "lib/db/require-tenant.ts"));
check("requireTenant resolves identity separately (401 vs 403)", /const tenant = user \? await getServerTenant\(\) : null/.test(gate));

console.log(`\nITEM15-TENANT-SWEEP PROOF: ${pass} passed, ${fail} failed (routes=${routes.length}, swept=${sweptCount})`);
if (fail > 0) process.exit(1);
