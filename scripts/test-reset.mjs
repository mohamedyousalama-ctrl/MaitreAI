// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — reset_restaurant test
// Manager mutates the brain, then reset_restaurant restores مطعم الذواقة
// defaults (in place). An operation user is denied. Cleans up.
// ============================================================================

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminApi = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const ts = Date.now();
const pw = "Test!" + ts + "aZ";
const users = [];
let restaurantId;

async function mkUser(tag) {
  const id = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST", headers: adminApi,
    body: JSON.stringify({ email: `rst-${tag}-${ts}@maitreai.test`, password: pw, email_confirm: true }),
  }).then((r) => r.json()).then((j) => j.id);
  users.push(id);
  return id;
}
async function token(tag) {
  return fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `rst-${tag}-${ts}@maitreai.test`, password: pw }),
  }).then((r) => r.json()).then((j) => j.access_token);
}
const authed = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" });

(async () => {
  try {
    const mgr = await mkUser("mgr");
    restaurantId = await fetch(`${URL}/rest/v1/rpc/seed_demo_restaurant`, {
      method: "POST", headers: adminApi, body: JSON.stringify({ p_user_id: mgr }),
    }).then((r) => r.json());
    const mgrTok = await token("mgr");

    const countItems = async (tok) =>
      fetch(`${URL}/rest/v1/menu_items?restaurant_id=eq.${restaurantId}&select=id,name`, { headers: authed(tok) }).then((r) => r.json());

    const before = await countItems(mgrTok);
    // Mutate: add a custom item + delete one default.
    await fetch(`${URL}/rest/v1/menu_items`, { method: "POST", headers: { ...authed(mgrTok), Prefer: "return=minimal" }, body: JSON.stringify({ restaurant_id: restaurantId, name: "صنف مؤقت للاختبار", price: 99 }) });
    await fetch(`${URL}/rest/v1/menu_items?restaurant_id=eq.${restaurantId}&name=eq.${encodeURIComponent("كولا")}`, { method: "DELETE", headers: authed(mgrTok) });
    const mutated = await countItems(mgrTok);

    // Reset as manager.
    const resetRes = await fetch(`${URL}/rest/v1/rpc/reset_restaurant`, { method: "POST", headers: authed(mgrTok), body: JSON.stringify({ p_restaurant_id: restaurantId }) });
    const after = await countItems(mgrTok);
    const hasCustom = after.some((i) => i.name === "صنف مؤقت للاختبار");
    const hasCola = after.some((i) => i.name === "كولا");

    // Operation user denied.
    const op = await mkUser("op");
    await fetch(`${URL}/rest/v1/members`, { method: "POST", headers: adminApi, body: JSON.stringify({ restaurant_id: restaurantId, user_id: op, role: "operation" }) });
    const opStatus = await fetch(`${URL}/rest/v1/rpc/reset_restaurant`, { method: "POST", headers: authed(await token("op")), body: JSON.stringify({ p_restaurant_id: restaurantId }) }).then((r) => r.status);

    console.log(`before=${before.length} → mutated=${mutated.length} → after reset=${after.length}`);
    console.log(`reset HTTP=${resetRes.status}; custom item gone=${!hasCustom}; default (كولا) restored=${hasCola}`);
    console.log(`operation user reset → HTTP ${opStatus} (expect 4xx — denied)`);

    const pass = resetRes.ok && after.length === 6 && !hasCustom && hasCola && opStatus >= 400;
    console.log("\nRESULT:", pass ? "PASS ✅ (manager reset restores defaults; operation denied)" : "FAIL ❌");
    if (!pass) process.exitCode = 1;
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    if (restaurantId) await fetch(`${URL}/rest/v1/restaurants?id=eq.${restaurantId}`, { method: "DELETE", headers: adminApi });
    for (const id of users) await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminApi });
    console.log("✓ cleaned up");
  }
})();
