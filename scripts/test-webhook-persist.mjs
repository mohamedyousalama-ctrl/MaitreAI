// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — webhook persistence + idempotency live test
// Seeds a temp tenant, POSTs the SAME WhatsApp payload twice to the running
// webhook, and asserts exactly one customer/conversation/message exist (second
// delivery is a no-op). Cleans up afterward.
// ============================================================================

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.APP_URL || "http://localhost:3400";
const admin = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };

const ts = Date.now();
const pw = "Test!" + ts + "aZ";
const WA_ID = "966500" + String(ts).slice(-6);
const MSG_ID = "wamid.PERSIST." + ts;
let userId, restaurantId;

const payload = {
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: {
    contacts: [{ profile: { name: "عميل الاختبار" }, wa_id: WA_ID }],
    messages: [{ from: WA_ID, id: MSG_ID, timestamp: "1700000000", type: "text", text: { body: "السلام عليكم، أبغى أطلب" } }],
  } }] }],
};

async function rest(path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: admin, ...opts });
  return r.json();
}
async function post() {
  const r = await fetch(`${APP}/api/channels/whatsapp/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return r.json();
}

(async () => {
  try {
    // temp tenant (becomes most-recent active restaurant → webhook resolver picks it)
    const u = await fetch(`${URL}/auth/v1/admin/users`, {
      method: "POST", headers: admin,
      body: JSON.stringify({ email: `wh-${ts}@maitreai.test`, password: pw, email_confirm: true }),
    }).then((r) => r.json());
    userId = u.id;
    restaurantId = await rest("rpc/seed_demo_restaurant", { method: "POST", body: JSON.stringify({ p_user_id: userId }) });
    console.log("seeded temp restaurant:", restaurantId);

    const r1 = await post();
    const r2 = await post();
    console.log("POST #1 →", JSON.stringify(r1));
    console.log("POST #2 →", JSON.stringify(r2));

    const customers = await rest(`customers?restaurant_id=eq.${restaurantId}&phone=eq.${WA_ID}&select=id,name`);
    const msgs = await rest(`messages?channel_message_id=eq.${MSG_ID}&select=id,text,direction`);
    const convs = await rest(`conversations?restaurant_id=eq.${restaurantId}&select=id`);

    console.log(`\ncustomers: ${customers.length}, conversations: ${convs.length}, messages(this id): ${msgs.length}`);
    const ok =
      r1.persisted === 1 && r1.deduped === 0 &&
      r2.persisted === 0 && r2.deduped === 1 &&
      customers.length === 1 && convs.length === 1 && msgs.length === 1 &&
      msgs[0].text === "السلام عليكم، أبغى أطلب" && customers[0].name === "عميل الاختبار";
    console.log("\nRESULT:", ok ? "PASS ✅ (persisted once, redelivery deduped)" : "FAIL ❌");
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    if (restaurantId) await fetch(`${URL}/rest/v1/restaurants?id=eq.${restaurantId}`, { method: "DELETE", headers: admin });
    if (userId) await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: admin });
    console.log("✓ cleaned up temp tenant");
  }
})();
