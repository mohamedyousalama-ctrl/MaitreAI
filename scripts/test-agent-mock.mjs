// Deterministic mock-adapter integration test for the agent route.
// Run with the app started under AI_ADAPTER=mock. Asserts the route resolves the
// mock adapter (free, no network), returns the deterministic reply, and logs an
// agent_runs row with adapter=mock and zero cost. Cleans up.
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
const BASE = process.env.BASE_URL || "http://127.0.0.1:3401";
const OWNER_UID = "ba43f92c-8117-45b0-a7d9-74cf61e8a1f6";
const h = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const rep = { ...h, Prefer: "return=representation" };
const j = (r) => r.json();
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fails++; };

(async () => {
  const mem = await fetch(`${SB}/rest/v1/members?user_id=eq.${OWNER_UID}&select=restaurant_id`, { headers: h }).then(j);
  const restaurantId = mem?.[0]?.restaurant_id;
  const cust = await fetch(`${SB}/rest/v1/customers`, { method: "POST", headers: rep,
    body: JSON.stringify({ restaurant_id: restaurantId, phone: "+966500000778", name: "اختبار محاكاة" }) }).then(j);
  const conv = await fetch(`${SB}/rest/v1/conversations`, { method: "POST", headers: rep,
    body: JSON.stringify({ restaurant_id: restaurantId, customer_id: cust[0].id, channel: "whatsapp" }) }).then(j);
  const conversationId = conv[0].id;

  const res = await fetch(`${BASE}/api/agent/respond`, { method: "POST",
    headers: { "Content-Type": "application/json", "x-agent-secret": SECRET },
    body: JSON.stringify({ restaurantId, conversationId, text: "تجربة" }) });
  const out = await res.json();
  ok(res.status === 200, `HTTP 200 (got ${res.status})`);
  ok(out.adapter === "mock", `adapter=mock (got ${out.adapter})`);
  ok(typeof out.reply === "string" && out.reply.includes("وضع المحاكاة"), "deterministic mock reply");
  ok(out.costUsd === 0, `cost=0 (got ${out.costUsd})`);

  const runs = await fetch(`${SB}/rest/v1/agent_runs?conversation_id=eq.${conversationId}&select=adapter,cost_usd`, { headers: h }).then(j);
  ok(runs.length === 1 && runs[0].adapter === "mock", "agent_runs row logged with adapter=mock");

  // 401 without the secret
  const noauth = await fetch(`${BASE}/api/agent/respond`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId, text: "x" }) });
  ok(noauth.status === 401, `route requires secret (got ${noauth.status})`);

  await fetch(`${SB}/rest/v1/agent_runs?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: h });
  await fetch(`${SB}/rest/v1/messages?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: h });
  await fetch(`${SB}/rest/v1/conversations?id=eq.${conversationId}`, { method: "DELETE", headers: h });
  await fetch(`${SB}/rest/v1/customers?id=eq.${cust[0].id}`, { method: "DELETE", headers: h });
  console.log(fails ? `\n✗ ${fails} assertion(s) failed` : "\n✓ all assertions passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(2); });
