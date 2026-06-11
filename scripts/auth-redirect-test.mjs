// ============================================================================
// MaitreAI — Sprint 7 Pass 1: authenticated redirect proof
// Mints a real Supabase session cookie (using @supabase/ssr's OWN serializer so
// the format/chunking is exact), then hits the running app to prove:
//   - a signed-in user with NO restaurant → redirected to /onboarding
//   - a signed-in user WITH a restaurant → reaches the app (no auth redirect)
// Cleans up the test users/restaurants afterward.
// ============================================================================

import { createServerClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.APP_URL || "http://localhost:3400";

const ts = Date.now();
const pw = "Test!" + ts + "aZ";
const created = { users: [], restaurants: [] };
const admin = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };

async function createUser(tag) {
  const email = `redir-${tag}-${ts}@maitreai.test`;
  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST", headers: admin,
    body: JSON.stringify({ email, password: pw, email_confirm: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("createUser: " + JSON.stringify(j));
  created.users.push(j.id);
  return { id: j.id, email };
}
async function tokens(email) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pw }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("tokens: " + JSON.stringify(j));
  return j;
}
async function seed(userId) {
  const r = await fetch(`${URL}/rest/v1/rpc/seed_demo_restaurant`, {
    method: "POST", headers: admin, body: JSON.stringify({ p_user_id: userId }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("seed: " + JSON.stringify(j));
  created.restaurants.push(j);
  return j;
}

// Build the exact auth cookies for a session using the library's serializer.
async function cookiesFor(session) {
  const jar = {};
  const supabase = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => { jar[name] = value; }),
    },
  });
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return Object.entries(jar)
    .map(([n, v]) => `${n}=${encodeURIComponent(v)}`)
    .join("; ");
}

async function hit(path, cookie) {
  const r = await fetch(`${APP}${path}`, { headers: { cookie }, redirect: "manual" });
  return { status: r.status, location: r.headers.get("location") || "" };
}

async function cleanup() {
  for (const id of created.restaurants)
    await fetch(`${URL}/rest/v1/restaurants?id=eq.${id}`, { method: "DELETE", headers: admin });
  for (const id of created.users)
    await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
}

(async () => {
  try {
    // No-membership user.
    const c = await createUser("nomember");
    const cCookie = await cookiesFor(await tokens(c.email));
    const cDash = await hit("/dashboard", cCookie);
    console.log(`no-membership → /dashboard: ${cDash.status} ${cDash.location}`);
    const cOK = cDash.status === 307 && cDash.location.endsWith("/onboarding");
    console.log(cOK ? "✓ redirected to /onboarding" : "✗ expected redirect to /onboarding");

    // Member user (seeded restaurant).
    const m = await createUser("member");
    await seed(m.id);
    const mCookie = await cookiesFor(await tokens(m.email));
    const mDash = await hit("/dashboard", mCookie);
    console.log(`member → /dashboard: ${mDash.status} ${mDash.location || "(no redirect)"}`);
    const mOK = mDash.status === 200 || (mDash.status === 307 && !mDash.location.match(/login|onboarding/));
    console.log(mOK ? "✓ member reaches the app" : "✗ member was blocked");

    console.log("\nRESULT:", cOK && mOK ? "PASS ✅" : "FAIL ❌");
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
    console.log("✓ cleaned up test users + restaurants");
  }
})();
