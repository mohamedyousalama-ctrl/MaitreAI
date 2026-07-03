// ============================================================================
// R1 proof harness — server-side tenant gate (no default tenant, ever).
// The gate DECISION is a pure function (tenantGate), so the authorization matrix
// is exercised directly — unauthenticated / no-active-tenant / mismatch /
// operator-vs-manager — with no DB. Source assertions confirm the wrapper resolves
// identity separately from tenant (so 401 ≠ 403) and that the single session
// endpoint routes through the gate.
//
// Run: node --experimental-strip-types scripts/proof-r1-tenant-gate.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tenantGate } from "../lib/db/tenant-gate.ts";
import type { Tenant } from "../lib/db/tenant.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

const manager: Tenant = { userId: "u1", restaurantId: "r-sweet", role: "manager" };
const operator: Tenant = { userId: "u2", restaurantId: "r-sweet", role: "operation" };

// ---- Unauthenticated → 401 (never 403) -------------------------------------
{
  const g = tenantGate({ signedIn: false, tenant: null });
  check("unauthenticated → 401 unauthorized", !g.ok && g.status === 401 && g.error === "unauthorized");
}
// signedIn=false wins even if a tenant somehow tags along.
{
  const g = tenantGate({ signedIn: false, tenant: manager });
  check("unauthenticated dominates → 401 even with a tenant present", !g.ok && g.status === 401);
}

// ---- Signed in, no active tenant → 403 (no default tenant, ever) -----------
{
  const g = tenantGate({ signedIn: true, tenant: null });
  check("signed in + no active tenant → 403 no_active_tenant", !g.ok && g.status === 403 && g.error === "no_active_tenant");
}

// ---- Wrong tenant (route-supplied rid ≠ session) → 403 tenant_mismatch -----
{
  const g = tenantGate({ signedIn: true, tenant: manager }, { expectedRid: "r-other" });
  check("expectedRid ≠ session tenant → 403 tenant_mismatch", !g.ok && g.status === 403 && g.error === "tenant_mismatch");
}
{
  const g = tenantGate({ signedIn: true, tenant: manager }, { expectedRid: "r-sweet" });
  check("expectedRid == session tenant → ok", g.ok && g.tenant.restaurantId === "r-sweet");
}

// ---- Operator vs manager on a manager-only route ---------------------------
{
  const g = tenantGate({ signedIn: true, tenant: operator }, { requireManager: true });
  check("operator on manager-only route → 403 forbidden_role", !g.ok && g.status === 403 && g.error === "forbidden_role");
}
{
  const g = tenantGate({ signedIn: true, tenant: manager }, { requireManager: true });
  check("manager on manager-only route → ok", g.ok && g.tenant.role === "manager");
}
{
  const g = tenantGate({ signedIn: true, tenant: operator });
  check("operator on a non-manager route → ok (role unrestricted)", g.ok);
}

// ---- Ordering: identity is checked before role ------------------------------
{
  const g = tenantGate({ signedIn: false, tenant: null }, { requireManager: true });
  check("unauthenticated + requireManager still → 401 (identity before role)", !g.ok && g.status === 401);
}
// mismatch is checked before role (a wrong-tenant manager-only route → mismatch first)
{
  const g = tenantGate({ signedIn: true, tenant: operator }, { expectedRid: "r-other", requireManager: true });
  check("mismatch outranks role → 403 tenant_mismatch", !g.ok && g.error === "tenant_mismatch");
}

// ---- Source: wrapper resolves identity SEPARATELY from tenant ---------------
const gate = read("lib/db/require-tenant.ts");
check("requireTenant resolves user identity via auth.getUser()", /auth\.getUser\(\)/.test(gate));
check("requireTenant resolves tenant only when a user exists (401 ≠ 403 split)",
  /const tenant = user \? await getServerTenant\(\) : null/.test(gate));
check("requireTenant delegates the decision to the pure tenantGate", /tenantGate\(\{ signedIn: !!user, tenant \}/.test(gate));
const pure = read("lib/db/tenant-gate.ts");
check("no default-tenant fallthrough (null tenant is a hard 403, never guessed)",
  /if \(!input\.tenant\) return \{ ok: false, status: 403, error: "no_active_tenant" \}/.test(pure));

// ---- Source: the single session endpoint routes through the gate ------------
const session = read("app/api/session/route.ts");
check("GET /api/session uses requireTenant", session.includes("requireTenant") && /if \(!gate\.ok\) return gate\.response/.test(session));
check("session payload is role-aware in ONE place (role + isManager)",
  /role, isManager: role === "manager"/.test(session));

console.log(`\nR1-TENANT-GATE PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
