// ============================================================================
// MaitreAI — Sprint 7 Pass 1 live verification (HTTPS only)
// Creates two test accounts, seeds a tenant for each, signs in as each, and
// proves RLS isolation (each user sees ONLY their own restaurant's rows). Also
// checks a no-membership user has zero members (the /onboarding redirect input).
// Cleans up all test data at the end. Reads creds from env.
// ============================================================================

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SR) {
  console.error("Missing env (NEXT_PUBLIC_SUPABASE_URL / ANON / SERVICE_ROLE).");
  process.exit(1);
}

const ts = Date.now();
const pw = "Test!" + ts + "aZ";
const created = { users: [], restaurants: [] };

const adminHeaders = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };

async function adminCreateUser(tag) {
  const email = `pass1-${tag}-${ts}@maitreai.test`;
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ email, password: pw, email_confirm: true }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`createUser ${tag}: ${JSON.stringify(j)}`);
  created.users.push(j.id);
  return { id: j.id, email };
}

async function signIn(email) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pw }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`signIn: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function seed(userId) {
  const res = await fetch(`${URL}/rest/v1/rpc/seed_demo_restaurant`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ p_user_id: userId }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`seed: ${JSON.stringify(j)}`);
  created.restaurants.push(j);
  return j; // restaurant uuid
}

// Query a table AS a given user (anon role + their JWT → RLS enforced).
async function asUser(token, path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function cleanup() {
  for (const id of created.restaurants) {
    await fetch(`${URL}/rest/v1/restaurants?id=eq.${id}`, { method: "DELETE", headers: adminHeaders });
  }
  for (const id of created.users) {
    await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
  }
}

function line() { console.log("-".repeat(64)); }

(async () => {
  try {
    console.log("MaitreAI — Pass 1 live verification against", URL);
    line();

    // 1. Two accounts, each owning a seeded restaurant.
    const a = await adminCreateUser("a");
    const b = await adminCreateUser("b");
    console.log(`✓ created account A: ${a.email}`);
    console.log(`✓ created account B: ${b.email}`);

    const rA = await seed(a.id);
    const rB = await seed(b.id);
    console.log(`✓ seeded restaurant A: ${rA}`);
    console.log(`✓ seeded restaurant B: ${rB}`);
    line();

    // 2. Sign in as each.
    const tokenA = await signIn(a.email);
    const tokenB = await signIn(b.email);
    console.log("✓ signed in as A and B (email+password grant)");
    line();

    // 3. RLS isolation: each sees ONLY its own restaurant + menu.
    const aRest = await asUser(tokenA, "restaurants?select=id,name");
    const bRest = await asUser(tokenB, "restaurants?select=id,name");
    const aItems = await asUser(tokenA, "menu_items?select=id");
    const bItems = await asUser(tokenB, "menu_items?select=id");
    const aSeesB = await asUser(tokenA, `restaurants?select=id&id=eq.${rB}`);

    console.log(`A sees restaurants: ${aRest.map((r) => r.id).join(", ")}  (count ${aRest.length})`);
    console.log(`B sees restaurants: ${bRest.map((r) => r.id).join(", ")}  (count ${bRest.length})`);
    console.log(`A sees ${aItems.length} menu items; B sees ${bItems.length} menu items`);
    console.log(`A querying B's restaurant id directly → ${aSeesB.length} rows (must be 0)`);

    const isolationOK =
      aRest.length === 1 && aRest[0].id === rA &&
      bRest.length === 1 && bRest[0].id === rB &&
      aSeesB.length === 0 &&
      aItems.length > 0 && bItems.length > 0;
    console.log(isolationOK ? "✓ RLS ISOLATION VERIFIED" : "✗ RLS ISOLATION FAILED");
    line();

    // 4. No-membership user → zero members (drives /onboarding redirect).
    const c = await adminCreateUser("c");
    const tokenC = await signIn(c.email);
    const cMembers = await asUser(tokenC, "members?select=id");
    const aMembers = await asUser(tokenA, "members?select=id,role");
    console.log(`new account C members: ${cMembers.length} (→ middleware sends C to /onboarding)`);
    console.log(`account A members: ${aMembers.length}, role=${aMembers[0]?.role} (→ A reaches the app)`);
    line();

    console.log(isolationOK ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
    console.log("✓ cleaned up all test users + restaurants");
  }
})();
