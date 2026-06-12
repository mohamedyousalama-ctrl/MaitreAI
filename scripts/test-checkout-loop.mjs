// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — public checkout loop test
// Seeds a tenant + order + payment session (service role), then drives the
// PUBLIC /api/payments/[sessionId] route like the customer's phone would:
// GET (resolve) → POST open → POST success. Asserts the order becomes paid.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const adminApi = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const admin = createClient(URL, SR, { auth: { persistSession: false } });
const ts = Date.now();
let userId, restaurantId;

(async () => {
  try {
    userId = await fetch(`${URL}/auth/v1/admin/users`, {
      method: "POST", headers: adminApi,
      body: JSON.stringify({ email: `co-${ts}@maitreai.test`, password: "Test!" + ts + "aZ", email_confirm: true }),
    }).then((r) => r.json()).then((j) => j.id);
    restaurantId = await fetch(`${URL}/rest/v1/rpc/seed_demo_restaurant`, {
      method: "POST", headers: adminApi, body: JSON.stringify({ p_user_id: userId }),
    }).then((r) => r.json());

    const { data: cust } = await admin.from("customers").insert({ restaurant_id: restaurantId, phone: "+966500003333", name: "عميل دفع" }).select("id").single();
    const { data: order } = await admin.from("orders").insert({
      restaurant_id: restaurantId, order_number: "7777", customer_id: cust.id, fulfillment: "delivery",
      items: [{ name: "بيتزا", quantity: 1, unitPrice: 50, total: 50 }], subtotal: 50, delivery_fee: 12, total: 62,
      order_status: "pending_payment", payment_status: "payment_link_sent",
    }).select("id").single();
    const sessionId = crypto.randomUUID();
    await admin.from("payment_sessions").insert({
      id: sessionId, restaurant_id: restaurantId, order_id: order.id, provider: "mock", amount: 62, currency: "ر.س",
      status: "link_sent", link: `${BASE}/checkout/${sessionId}`, expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    // ---- drive the PUBLIC api like the customer's phone ----
    const get1 = await fetch(`${BASE}/api/payments/${sessionId}`).then((r) => r.json());
    console.log(`GET → ok=${get1.ok} status=${get1.session?.status} amount=${get1.session?.amount} restaurant="${get1.session?.restaurantName}" order#${get1.session?.orderNumber}`);

    const open = await fetch(`${BASE}/api/payments/${sessionId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "open" }) }).then((r) => r.json());
    console.log(`POST open → status=${open.session?.status}`);

    const ok2 = await fetch(`${BASE}/api/payments/${sessionId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "success", method: "mada" }) }).then((r) => r.json());
    console.log(`POST success → status=${ok2.session?.status}`);

    const { data: finalOrder } = await admin.from("orders").select("order_status, payment_status").eq("id", order.id).single();
    const { data: finalSession } = await admin.from("payment_sessions").select("status").eq("id", sessionId).single();
    console.log(`order now: order_status=${finalOrder.order_status} payment_status=${finalOrder.payment_status}; session=${finalSession.status}`);

    const pass =
      get1.ok && get1.session.status === "link_sent" && get1.session.restaurantName === "مطعم الذواقة" &&
      open.session.status === "opened" && ok2.session.status === "paid" &&
      finalOrder.payment_status === "paid" && finalOrder.order_status === "paid" && finalSession.status === "paid";
    console.log("\nRESULT:", pass ? "PASS ✅ (cross-device checkout loop persists to Postgres)" : "FAIL ❌");
    if (!pass) process.exitCode = 1;
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    if (restaurantId) await fetch(`${URL}/rest/v1/restaurants?id=eq.${restaurantId}`, { method: "DELETE", headers: adminApi });
    if (userId) await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminApi });
    console.log("✓ cleaned up");
  }
})();
