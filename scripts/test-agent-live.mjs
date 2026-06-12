// Live Claude smoke test for the Sprint 8 customer-agent Brain.
// Exercises POST /api/agent/respond end-to-end against the seeded tenant with
// the REAL adapter (claude-sonnet-4-6, prompt caching on), then reports the
// agent_runs token/cost row. Cleans up its test rows. Requires the app running
// on BASE_URL with ANTHROPIC_API_KEY + AGENT_ROUTE_SECRET + Supabase env.
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const OWNER_UID = "ba43f92c-8117-45b0-a7d9-74cf61e8a1f6";
const h = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const rep = { ...h, Prefer: "return=representation" };
const j = (r) => r.json();

(async () => {
  // 1. Resolve the seeded restaurant for the owner.
  const mem = await fetch(`${SB}/rest/v1/members?user_id=eq.${OWNER_UID}&select=restaurant_id`, { headers: h }).then(j);
  const restaurantId = mem?.[0]?.restaurant_id;
  if (!restaurantId) throw new Error("no seeded restaurant for owner");
  console.log("restaurant:", restaurantId);

  // 2. Put the tenant into test mode + open (so order tools are enabled).
  await fetch(`${SB}/rest/v1/restaurants?id=eq.${restaurantId}`, {
    method: "PATCH", headers: h, body: JSON.stringify({ agent_mode: "test", is_open: true }),
  });

  // 3. Create a throwaway customer + conversation.
  const cust = await fetch(`${SB}/rest/v1/customers`, {
    method: "POST", headers: rep,
    body: JSON.stringify({ restaurant_id: restaurantId, phone: "+966500000777", name: "اختبار حي" }),
  }).then(j);
  const customerId = cust?.[0]?.id;
  const conv = await fetch(`${SB}/rest/v1/conversations`, {
    method: "POST", headers: rep,
    body: JSON.stringify({ restaurant_id: restaurantId, customer_id: customerId, channel: "whatsapp" }),
  }).then(j);
  const conversationId = conv?.[0]?.id;
  console.log("conversation:", conversationId);

  // 4. Call the agent route with a real order-building message.
  const text = "هلا، أبغى أطلب وش عندكم اليوم؟ وكم التوصيل؟";
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/agent/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-agent-secret": SECRET },
    body: JSON.stringify({ restaurantId, conversationId, text }),
  });
  const out = await res.json();
  console.log(`\n=== POST /api/agent/respond → HTTP ${res.status} (${Date.now() - t0}ms) ===`);
  if (out.error) { console.log("ERROR:", JSON.stringify(out)); }
  else {
    console.log("adapter:", out.adapter, "| model:", out.model, "| mode:", out.mode);
    console.log("toolsUsed:", JSON.stringify(out.toolsUsed));
    console.log("escalate:", out.escalate, "| draft total:", out.draft?.total, out.draft?.currency);
    console.log("reply:\n  " + String(out.reply).replace(/\n/g, "\n  "));
    console.log("usage:", JSON.stringify(out.usage), "| costUsd:", out.costUsd, "| latencyMs:", out.latencyMs);
  }

  // 5. Report the persisted agent_runs row (the deliverable).
  const runs = await fetch(
    `${SB}/rest/v1/agent_runs?conversation_id=eq.${conversationId}&select=model,adapter,input_tokens,output_tokens,cache_read_tokens,cost_usd,latency_ms,tools_used`,
    { headers: h }
  ).then(j);
  console.log("\n=== agent_runs (persisted) ===");
  console.log(JSON.stringify(runs, null, 2));

  const sig = await fetch(
    `${SB}/rest/v1/conversation_signals?conversation_id=eq.${conversationId}&select=type,detail`,
    { headers: h }
  ).then(j);
  console.log("=== conversation_signals ===", JSON.stringify(sig));

  // 6. Cleanup test rows (leave agent_mode='test' so the owner can keep testing).
  await fetch(`${SB}/rest/v1/agent_runs?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: h });
  await fetch(`${SB}/rest/v1/conversation_signals?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: h });
  await fetch(`${SB}/rest/v1/messages?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: h });
  await fetch(`${SB}/rest/v1/conversations?id=eq.${conversationId}`, { method: "DELETE", headers: h });
  await fetch(`${SB}/rest/v1/customers?id=eq.${customerId}`, { method: "DELETE", headers: h });
  console.log("\n✓ cleaned up test rows");
  if (out.error) process.exit(1);
})().catch((e) => { console.error("SMOKE FAILED:", e.message); process.exit(2); });
