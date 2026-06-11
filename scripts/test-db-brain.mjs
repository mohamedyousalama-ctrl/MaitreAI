// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — brain data-layer live read test
// Seeds a tenant, signs in as its manager, and reads the brain config tables
// THROUGH RLS (anon role + user JWT). Asserts the seeded مطعم الذواقة data is
// returned and item↔modifier links resolve. Cleans up.
// ============================================================================

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const ts = Date.now();
const pw = "Test!" + ts + "aZ";
let userId, restaurantId;

async function asUser(token, path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  return r.json();
}

(async () => {
  try {
    const u = await fetch(`${URL}/auth/v1/admin/users`, {
      method: "POST", headers: admin,
      body: JSON.stringify({ email: `brain-${ts}@maitreai.test`, password: pw, email_confirm: true }),
    }).then((r) => r.json());
    userId = u.id;
    restaurantId = await fetch(`${URL}/rest/v1/rpc/seed_demo_restaurant`, {
      method: "POST", headers: admin, body: JSON.stringify({ p_user_id: userId }),
    }).then((r) => r.json());

    const token = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email: `brain-${ts}@maitreai.test`, password: pw }),
    }).then((r) => r.json()).then((j) => j.access_token);

    const rest = await asUser(token, `restaurants?id=eq.${restaurantId}&select=name,currency,is_open,accept_preorders`);
    const branches = await asUser(token, `branches?restaurant_id=eq.${restaurantId}&select=id`);
    const items = await asUser(token, `menu_items?restaurant_id=eq.${restaurantId}&select=id,name,image_kind`);
    const mods = await asUser(token, `modifiers?restaurant_id=eq.${restaurantId}&select=id`);
    const links = await asUser(token, `menu_item_modifiers?restaurant_id=eq.${restaurantId}&select=item_id`);
    const zones = await asUser(token, `delivery_zones?restaurant_id=eq.${restaurantId}&select=id`);
    const policies = await asUser(token, `policies?restaurant_id=eq.${restaurantId}&select=key`);
    const faqs = await asUser(token, `faqs?restaurant_id=eq.${restaurantId}&select=id`);

    console.log("profile:", rest[0]);
    console.log(`branches=${branches.length} items=${items.length} modifiers=${mods.length} item-mod-links=${links.length} zones=${zones.length} policies=${policies.length} faqs=${faqs.length}`);
    console.log("sample item image_kind:", items[0]?.image_kind);

    const ok =
      rest.length === 1 && rest[0].name === "مطعم الذواقة" && rest[0].is_open === true &&
      branches.length === 2 && items.length === 6 && mods.length === 4 &&
      links.length >= 6 && zones.length === 3 && policies.length === 4 && faqs.length === 2 &&
      items.every((i) => ["real", "illustrative", "card"].includes(i.image_kind));
    console.log("\nRESULT:", ok ? "PASS ✅ (RLS-scoped brain reads + amended columns)" : "FAIL ❌");
    if (!ok) process.exitCode = 1;
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    if (restaurantId) await fetch(`${URL}/rest/v1/restaurants?id=eq.${restaurantId}`, { method: "DELETE", headers: admin });
    if (userId) await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: admin });
    console.log("✓ cleaned up");
  }
})();
