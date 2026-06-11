// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — Brain write RLS test
// Verifies the role-gated write model behind the Brain store: a MANAGER can
// insert a menu item; an OPERATION user CANNOT (RLS denies). Cleans up.
// ============================================================================

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const ts = Date.now();
const pw = "Test!" + ts + "aZ";
const created = { users: [], restaurant: null };

async function mkUser(tag) {
  const u = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST", headers: admin,
    body: JSON.stringify({ email: `bw-${tag}-${ts}@maitreai.test`, password: pw, email_confirm: true }),
  }).then((r) => r.json());
  created.users.push(u.id);
  return u.id;
}
async function token(tag) {
  return fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `bw-${tag}-${ts}@maitreai.test`, password: pw }),
  }).then((r) => r.json()).then((j) => j.access_token);
}
async function insertItem(tok, restaurantId) {
  const res = await fetch(`${URL}/rest/v1/menu_items`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ restaurant_id: restaurantId, name: "اختبار صلاحية", price: 10 }),
  });
  return res.status;
}

(async () => {
  try {
    const mgr = await mkUser("mgr");
    const restaurantId = await fetch(`${URL}/rest/v1/rpc/seed_demo_restaurant`, {
      method: "POST", headers: admin, body: JSON.stringify({ p_user_id: mgr }),
    }).then((r) => r.json());
    created.restaurant = restaurantId;

    // Add an operation member to the SAME restaurant via service role.
    const opUser = await mkUser("op");
    await fetch(`${URL}/rest/v1/members`, {
      method: "POST", headers: admin,
      body: JSON.stringify({ restaurant_id: restaurantId, user_id: opUser, role: "operation" }),
    });

    const mgrStatus = await insertItem(await token("mgr"), restaurantId);
    const opStatus = await insertItem(await token("op"), restaurantId);

    console.log(`manager insert menu_item → HTTP ${mgrStatus} (expect 201)`);
    console.log(`operation insert menu_item → HTTP ${opStatus} (expect 401/403 — RLS denies)`);

    const ok = mgrStatus === 201 && (opStatus === 401 || opStatus === 403);
    console.log("\nRESULT:", ok ? "PASS ✅ (manager-only brain writes enforced)" : "FAIL ❌");
    if (!ok) process.exitCode = 1;
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    if (created.restaurant) await fetch(`${URL}/rest/v1/restaurants?id=eq.${created.restaurant}`, { method: "DELETE", headers: admin });
    for (const id of created.users) await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
    console.log("✓ cleaned up");
  }
})();
