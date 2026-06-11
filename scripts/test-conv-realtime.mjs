// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — conversations realtime + persistence test
// Signs in as a tenant manager, opens an RLS-respecting realtime subscription
// on messages, then (as service role, like the webhook) inserts a customer +
// conversation + message. Asserts the realtime event is delivered AND the
// message is queryable. Cleans up.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ts = Date.now();
const pw = "Test!" + ts + "aZ";
const email = `conv-${ts}@maitreai.test`;

const adminApi = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const admin = createClient(URL, SR, { auth: { persistSession: false } });
let userId, restaurantId;

(async () => {
  let received = false;
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
    // Pass the user JWT to the realtime socket so RLS-gated postgres_changes are authorized.
    await authed.realtime.setAuth(tok.access_token);

    await new Promise((resolve) => {
      authed
        .channel("test")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `restaurant_id=eq.${restaurantId}` }, () => {
          received = true;
        })
        .subscribe((status) => status === "SUBSCRIBED" && resolve());
    });

    // Insert customer + conversation + message as service role (webhook-style).
    const { data: cust } = await admin.from("customers").insert({ restaurant_id: restaurantId, phone: "+966500001111", name: "عميل ريالتايم" }).select("id").single();
    const { data: conv } = await admin.from("conversations").insert({ restaurant_id: restaurantId, customer_id: cust.id, channel: "whatsapp" }).select("id").single();
    await admin.from("messages").insert({ restaurant_id: restaurantId, conversation_id: conv.id, direction: "inbound", sender: "customer", text: "تجربة ريالتايم" });

    // Wait up to 6s for the realtime event.
    for (let i = 0; i < 60 && !received; i++) await new Promise((r) => setTimeout(r, 100));

    // Confirm queryable through the manager's RLS session.
    const { data: msgs } = await authed.from("messages").select("text").eq("conversation_id", conv.id);

    console.log(`realtime event delivered: ${received}`);
    console.log(`messages queryable via RLS: ${msgs?.length} (text="${msgs?.[0]?.text}")`);
    const ok = received && msgs?.length === 1 && msgs[0].text === "تجربة ريالتايم";
    console.log("\nRESULT:", ok ? "PASS ✅ (conversations realtime + persistence)" : "FAIL ❌");
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
