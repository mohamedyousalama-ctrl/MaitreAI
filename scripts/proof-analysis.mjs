// ============================================================================
// MaitreAI — Learning System Piece 2 proof: the conversation analysis job.
// Seeds customer conversations with a clear pattern → runs the analysis →
// proves a GROUNDED insight (cites real conversation ids) lands in brain_insights
// (pending); re-run does NOT duplicate (dedupe/merge); no-pattern data writes
// nothing; the trigger is secret-auth'd + read-only on conversations. Cleans up.
//
// Usage: set -a; . ./.env.local; set +a; BASE_URL=http://127.0.0.1:3408 node scripts/proof-analysis.mjs
// ============================================================================

const BASE = process.env.BASE_URL || "http://127.0.0.1:3408";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const RID = "d9cfd4d5-c128-4116-a907-ff863abb2a96";
const pass = (b) => (b ? "✅" : "❌");
const rest = async (p, i = {}) => { const r = await fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { ...H, Prefer: i.method ? "return=representation" : undefined, ...(i.headers || {}) } }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const analyze = (body) => fetch(`${BASE}/api/brain/analyze`, { method: "POST", headers: { "Content-Type": "application/json", "x-agent-secret": SECRET }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

const TAG = "نباتي-تست-" + Math.floor(Math.random() * 1e6);
const made = [];
async function seedConversation(text) {
  const phone = "20144" + Math.floor(Math.random() * 1e7).toString().padStart(7, "0");
  const cust = (await rest(`customers`, { method: "POST", body: JSON.stringify({ restaurant_id: RID, phone, name: TAG }) }))[0];
  const conv = (await rest(`conversations`, { method: "POST", body: JSON.stringify({ restaurant_id: RID, customer_id: cust.id, channel: "whatsapp" }) }))[0];
  await rest(`messages`, { method: "POST", body: JSON.stringify({ restaurant_id: RID, conversation_id: conv.id, direction: "inbound", sender: "customer", text, status: "delivered" }) });
  made.push({ customerId: cust.id, conversationId: conv.id });
  return conv.id;
}
async function cleanup() {
  for (const m of made) { await rest(`conversations?id=eq.${m.conversationId}`, { method: "DELETE" }); await rest(`customers?id=eq.${m.customerId}`, { method: "DELETE" }); }
  await rest(`brain_insights?restaurant_id=eq.${RID}`, { method: "DELETE" });
}

(async () => {
  console.log("\n=== Piece 2 proof — conversation analysis job ===\n");
  await rest(`brain_insights?restaurant_id=eq.${RID}`, { method: "DELETE" }); // clean slate

  // -- #1 seed a clear pattern: 3 conversations asking for vegetarian ----------
  const seeded = [];
  seeded.push(await seedConversation("السلام عليكم، في عندكو أصناف نباتي؟"));
  seeded.push(await seedConversation("عايزة آكل نباتي، عندكو حاجة من غير لحمة؟"));
  seeded.push(await seedConversation("هل يوجد طبق نباتي في المنيو؟"));
  console.log(`#1 seeded 3 vegetarian-request conversations`);

  // -- #2 run analysis → grounded insight written -----------------------------
  const r1 = await analyze({ restaurantId: RID, windowHours: 1 });
  console.log(`#5/#6 trigger via secret: status ${r1.status} | model=${r1.json.model} | analyzed=${r1.json.conversationsAnalyzed} convos (bounded) | cost=$${(r1.json.costUsd ?? 0).toFixed(5)}`);
  const ins = await rest(`brain_insights?restaurant_id=eq.${RID}&status=eq.pending&select=id,type,summary,evidence`);
  const got = Array.isArray(ins) ? ins : [];
  const insight = got[0];
  const sampleIds = insight?.evidence?.sample_conversation_ids ?? [];
  const grounded = Array.isArray(sampleIds) && sampleIds.length >= 2 && sampleIds.every((id) => seeded.includes(id));
  console.log(`#2 grounded insight written to brain_insights (pending): ${pass(r1.json.written >= 1 && got.length >= 1)}`);
  console.log(`     type=${insight?.type} summary="${insight?.summary}"`);
  console.log(`     evidence cites REAL conversation ids (count=${insight?.evidence?.count}, all from seeded): ${pass(grounded)}`);

  // -- #3 re-run → no duplicate (dedupe/merge) --------------------------------
  const r2 = await analyze({ restaurantId: RID, windowHours: 1 });
  const ins2 = await rest(`brain_insights?restaurant_id=eq.${RID}&select=id`);
  const noDup = Array.isArray(ins2) && ins2.length === got.length;
  console.log(`#3 re-run does NOT duplicate: ${pass(noDup)} (rows: ${got.length} → ${ins2.length}; written=${r2.json.written}, merged=${r2.json.merged})`);

  // -- #4 no notable pattern → writes nothing ---------------------------------
  await cleanup(); // remove veg convos + insights
  made.length = 0;
  await seedConversation("ممكن أعرف رقم تليفون الفرع؟");
  await seedConversation("تمام شكراً ليكو 🌹");
  const r3 = await analyze({ restaurantId: RID, windowHours: 1 });
  const ins3 = await rest(`brain_insights?restaurant_id=eq.${RID}&select=id`);
  console.log(`#4 no recurring pattern → no insights manufactured: ${pass(r3.json.written === 0 && (Array.isArray(ins3) ? ins3.length : 0) === 0)} (written=${r3.json.written})`);

  // -- #5 read-only on conversations + auth gate ------------------------------
  const convStill = await rest(`conversations?id=eq.${made[0].conversationId}&select=id`);
  const readOnly = Array.isArray(convStill) && convStill.length === 1;
  const noAuth = await fetch(`${BASE}/api/brain/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: RID }) });
  console.log(`#5 read-only on conversations (seeded convo intact): ${pass(readOnly)} | trigger without secret → ${noAuth.status} ${pass(noAuth.status === 401)}`);

  await cleanup();
  const left = await rest(`brain_insights?restaurant_id=eq.${RID}&select=id`);
  console.log(`\n=== Cleanup === residual insights=${Array.isArray(left) ? left.length : left}`);
  console.log("Done.");
})();
