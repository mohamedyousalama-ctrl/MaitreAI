// ============================================================================
// Proof: agent/respond scope binding
// Exercises parseAgentSecret() + the three auth scenarios inline.
// Run: npx ts-node --compiler-options '{"module":"esnext","moduleResolution":"node","target":"ES2017","strict":false,"skipLibCheck":true}' --transpile-only scripts/proof-agent-respond-scope.ts
// ============================================================================

// ---- Inline copy of parseAgentSecret (must stay in sync with route.ts) ----

function parseAgentSecret(env: string | undefined): { boundRestaurantId: string; token: string } | null {
  if (!env) return null;
  const colonIdx = env.indexOf(":");
  if (colonIdx < 1) return null;
  const boundRestaurantId = env.slice(0, colonIdx);
  const token = env.slice(colonIdx + 1);
  if (!boundRestaurantId || !token) return null;
  return { boundRestaurantId, token };
}

// ---- Minimal route auth simulation ----

type AuthResult =
  | { status: 401; body: { error: string } }
  | { status: 403; body: { error: string } }
  | { status: 200; body: { ok: true; restaurantId: string } };

function simulateAuth(
  envSecret: string | undefined,
  headerSecret: string | null,
  bodyRestaurantId: string,
): AuthResult {
  const parsed = parseAgentSecret(envSecret);
  if (!parsed) return { status: 401, body: { error: "unauthorized" } };
  if (headerSecret !== parsed.token) return { status: 401, body: { error: "unauthorized" } };
  if (!bodyRestaurantId || bodyRestaurantId !== parsed.boundRestaurantId) {
    return { status: 403, body: { error: "forbidden" } };
  }
  return { status: 200, body: { ok: true, restaurantId: bodyRestaurantId } };
}

// ---- Tests ----

let pass = 0;
let fail = 0;

function assert(label: string, cond: boolean) {
  if (cond) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}`);
    fail++;
  }
}

const BOUND_RID = "rest-abc-123";
const TOKEN = "super-secret-token";
const ENV = `${BOUND_RID}:${TOKEN}`;

console.log("\n--- 1. PROOF: mismatched restaurantId → 403 ---");
{
  const r = simulateAuth(ENV, TOKEN, "rest-DIFFERENT");
  assert("status 403", r.status === 403);
  assert("error = forbidden", r.status !== 200 && r.body.error === "forbidden");
}

console.log("\n--- 1b. Empty restaurantId in body → 403 ---");
{
  const r = simulateAuth(ENV, TOKEN, "");
  assert("status 403", r.status === 403);
  assert("error = forbidden", r.status !== 200 && r.body.error === "forbidden");
}

console.log("\n--- 2. PROOF: matching secret + restaurantId → passes ---");
{
  const r = simulateAuth(ENV, TOKEN, BOUND_RID);
  assert("status 200", r.status === 200);
  assert("restaurantId is bound restaurant", (r.body as { ok: true; restaurantId: string }).restaurantId === BOUND_RID);
}

console.log("\n--- 3. PROOF: secret unset → route closed (401) ---");
{
  const r = simulateAuth(undefined, TOKEN, BOUND_RID);
  assert("status 401", r.status === 401);
  assert("error = unauthorized", r.status !== 200 && r.body.error === "unauthorized");
}

console.log("\n--- 3b. Secret empty string → 401 ---");
{
  const r = simulateAuth("", TOKEN, BOUND_RID);
  assert("status 401", r.status === 401);
}

console.log("\n--- 3c. Secret malformed (no colon) → 401 ---");
{
  const r = simulateAuth("justaplaintoken", TOKEN, BOUND_RID);
  assert("status 401 — old-format secret rejected", r.status === 401);
}

console.log("\n--- 3d. Secret with leading colon (no restaurantId) → 401 ---");
{
  const r = simulateAuth(":token", TOKEN, BOUND_RID);
  assert("status 401 — colon at position 0 rejected", r.status === 401);
}

console.log("\n--- 4. Wrong token (right restaurantId) → 401 ---");
{
  const r = simulateAuth(ENV, "wrong-token", BOUND_RID);
  assert("status 401", r.status === 401);
}

console.log("\n--- 5. parseAgentSecret unit tests ---");
{
  assert("valid → returns both parts", (() => {
    const p = parseAgentSecret("rid-X:tok-Y");
    return p?.boundRestaurantId === "rid-X" && p?.token === "tok-Y";
  })());
  assert("colon in token allowed (first colon splits)", (() => {
    const p = parseAgentSecret("rid-X:tok:with:colons");
    return p?.boundRestaurantId === "rid-X" && p?.token === "tok:with:colons";
  })());
  assert("undefined → null", parseAgentSecret(undefined) === null);
  assert("empty string → null", parseAgentSecret("") === null);
  assert("no colon → null", parseAgentSecret("nocolon") === null);
  assert("colon at start → null", parseAgentSecret(":token") === null);
  assert("colon at end (empty token) → null", parseAgentSecret("rid:") === null);
}

console.log(`\n========================================`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
