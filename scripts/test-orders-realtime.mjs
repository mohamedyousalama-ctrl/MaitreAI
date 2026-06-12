// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — orders realtime + persistence test
// Acceptance: an order created in one place appears in another session within
// ~1s via realtime. Manager opens an RLS realtime subscription on orders; a
// second (service-role) writer inserts an order; assert delivery + queryable.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ts = Date.now();
const pw = "Test!" + ts + "aZ";
const email = `ord-${ts}@maitreai.test`;
const adminApi = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const admin = createClient(URL, SR, { auth: { persistSession: false } });
let userId, restaurantId;

(async () => {
  let received = false;
  let t0 = 0;
  let latency = 0;
  let authed;
  try {
    userId = await fetch(`${URL}/auth/v1/admin/users`, {
      method: "POST", headers: adminApi, body: JSON.stringify({ email, password: pw, email_confirm: true }),
    }).then((r) => r.json()).then((j) => j.id);
    restaurantId = await fetch(`${URL}/rest/v1/rpc/seed_demo_restaurant`, {
      method: "POST", headers: adminApi, body: JSON.stringify({ p_user_id: userId }),
    }).then((r) => r.json());

    const tok = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pw }),
    }).then((r) => r.json());

    authed = createClient(URL, ANON, { auth: { persistSession: false } });
    await authed.auth.setSession({ access_token: tok.access_token, refresh_token: tok.refresh_token });
    await authed.realtime.setAuth(tok.access_token);

    await new Promise((resolve) => {
      authed
        .channel("ord")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => {
          received = true;
          latency = Date.now() - t0;
        })
        .subscribe((s) => s === "SUBSCRIBED" && resolve());
    });
    // Let the subscription settle (avoids the cold-start race; the real app's
    // subscription is long-lived so this never applies in practice).
    await new Promise((r) => setTimeout(r, 600));

    // Second session inserts an order.
    const { data: cust } = await admin.from("customers").insert({ restaurant_id: restaurantId, phone: "+966500002222", name: "عميل طلب" }).select("id").single();
    t0 = Date.now();
    const { error } = await admin.from("orders").insert({
      restaurant_id: restaurantId, order_number: "9001", customer_id: cust.id,
      fulfillment: "delivery", items: [{ name: "برجر", quantity: 1, unitPrice: 30, total: 30 }],
      subtotal: 30, delivery_fee: 10, total: 40, order_status: "pending_payment", payment_status: "unpaid",
    });
    if (error) throw error;

    for (let i = 0; i < 50 && !received; i++) await new Promise((r) => setTimeout(r, 50));

    const { data: orders } = await authed.from("orders").select("order_number, total").eq("restaurant_id", restaurantId);
    console.log(`realtime delivered: ${received} (${latency}ms)`);
    console.log(`orders queryable via RLS: ${orders?.length} (#${orders?.[0]?.order_number}, total=${orders?.[0]?.total})`);
    const ok = received && latency < 2000 && orders?.length === 1 && orders[0].order_number === "9001";
    console.log("\nRESULT:", ok ? "PASS ✅ (orders realtime <2s + persistence)" : "FAIL ❌");
    if (!ok) process.exitCode = 1;
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    try { await authed?.removeAllChannels(); } catch {}
    if (restaurantId) await fetch(`${URL}/rest/v1/restaurants?id=eq.${restaurantId}`, { method: "DELETE", headers: adminApi });
    if (userId) await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminApi });
    console.log("✓ cleaned up");
    process.exit(process.exitCode ?? 0);
  }
})();
