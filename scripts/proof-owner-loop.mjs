// ============================================================================
// MaitreAI — Learning System Piece 3 proof: the owner-agent loop.
// Surfaces a pending insight → owner answers → answer becomes a brain_fact +
// brain_owner_qa, insight marked answered → the customer agent reflects the new
// knowledge (before/after) → answered/dismissed insights are not re-surfaced →
// dismiss works → NO automatic menu change (only knowledge stored). Cleans up.
//
// Usage: set -a; . ./.env.local; set +a; BASE_URL=http://127.0.0.1:3409 node scripts/proof-owner-loop.mjs
// ============================================================================

const BASE = process.env.BASE_URL || "http://127.0.0.1:3409";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const RID = "d9cfd4d5-c128-4116-a907-ff863abb2a96";
const pass = (b) => (b ? "✅" : "❌");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = async (p, i = {}) => { const r = await fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.method && i.method !== "DELETE" ? { Prefer: "return=representation" } : {}), ...(i.headers || {}) } }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const insightsApi = (method, body) => fetch(`${BASE}/api/brain/insights${method === "GET" ? `?restaurantId=${RID}` : ""}`, { method, headers: { "Content-Type": "application/json", "x-agent-secret": SECRET }, ...(body ? { body: JSON.stringify(body) } : {}) });

const phones = [];
function textPayload(phone, body, n) { return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ profile: { name: "اختبار اللوب" }, wa_id: phone }], messages: [{ from: phone, id: `lp-${phone}-${n}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "text", text: { body } }] } }] }] }; }
async function ask(body) { const phone = "20155" + Math.floor(Math.random()*1e7).toString().padStart(7,"0"); phones.push(phone); await fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(textPayload(phone, body, 1)) }); await sleep(800); const c = await rest(`customers?phone=eq.${phone}&select=id`); const cv = await rest(`conversations?customer_id=eq.${c[0].id}&select=id&order=created_at.desc&limit=1`); const m = await rest(`messages?conversation_id=eq.${cv[0].id}&sender=eq.ai&select=text&order=created_at.desc&limit=1`); return m?.[0]?.text ?? ""; }
async function seedInsight(summary, q) { return (await rest(`brain_insights`, { method: "POST", body: JSON.stringify({ restaurant_id: RID, type: "menu_gap", summary, evidence: { key: `menu_gap:${q.slice(0,6)}-${Math.random().toString(36).slice(2,6)}`, count: 3, suggested_question: q }, status: "pending" }) }))[0]; }
async function cleanAll() { await rest(`brain_owner_qa?restaurant_id=eq.${RID}`, { method: "DELETE" }); await rest(`brain_insights?restaurant_id=eq.${RID}`, { method: "DELETE" }); await rest(`brain_facts?restaurant_id=eq.${RID}&source=in.(owner_answer,manual)`, { method: "DELETE" }); }

(async () => {
  console.log("\n=== Piece 3 proof — owner-agent loop ===\n");
  await cleanAll();
  const menuBefore = (await rest(`menu_items?restaurant_id=eq.${RID}&select=id`)).length;

  // BEFORE: customer agent has no vegetarian knowledge yet.
  const before = await ask("في عندكو أكل نباتي؟");
  console.log(`#3 BEFORE (no fact): "${before.replace(/\n/g," ").slice(0,90)}"`);

  // Seed a pending insight (as Piece 2 would have).
  const insight = await seedInsight("يسألون عن خيار نباتي غير متوفر في المنيو", "تحب نضيف خيار نباتي للمنيو؟");

  // #1 surface
  const list = await (await insightsApi("GET")).json();
  const shown = (list.insights || []).find((i) => i.id === insight.id);
  await insightsApi("POST", { restaurantId: RID, insightId: insight.id, action: "surface" });
  const afterSurface = (await rest(`brain_insights?id=eq.${insight.id}&select=status`))[0];
  console.log(`#1 console surfaces the pending insight (grounded question): ${pass(!!shown && shown.question)} → marked ${afterSurface.status} ${pass(afterSurface.status === "surfaced")}`);
  console.log(`     question: "${shown?.question}"`);

  // #2 owner answers → QA + fact + answered
  const answer = "أيوه، ممكن نحضّر أي برجر بدون لحمة كخيار نباتي للي يطلب.";
  const ans = await (await insightsApi("POST", { restaurantId: RID, insightId: insight.id, action: "answer", answer })).json();
  const qa = await rest(`brain_owner_qa?restaurant_id=eq.${RID}&resulting_fact_id=eq.${ans.factId}&select=question,answer,resulting_fact_id`);
  const fact = await rest(`brain_facts?id=eq.${ans.factId}&select=fact,source,status`);
  const insAfter = (await rest(`brain_insights?id=eq.${insight.id}&select=status`))[0];
  console.log(`#2 answer → QA recorded: ${pass(Array.isArray(qa) && qa.length === 1)} | brain_fact(owner_answer) created: ${pass(fact?.[0]?.source === "owner_answer")} | insight answered: ${pass(insAfter.status === "answered")}`);

  // #3 AFTER: customer agent reflects the new fact
  await sleep(300);
  const after = await ask("في عندكو أكل نباتي؟");
  const reflects = /بدون لحم|نباتي/.test(after);
  console.log(`#3 AFTER (fact stored): "${after.replace(/\n/g," ").slice(0,90)}"`);
  console.log(`     customer agent reflects the new knowledge: ${pass(reflects)}`);

  // #4 answered insight not re-surfaced
  const list2 = await (await insightsApi("GET")).json();
  const reSurfaced = (list2.insights || []).some((i) => i.id === insight.id);
  console.log(`#4 answered insight NOT re-surfaced: ${pass(!reSurfaced)}`);

  // #5 dismiss works
  const insight2 = await seedInsight("يسألون عن التوصيل لمنطقة بعيدة", "تحب نضيف منطقة توصيل جديدة؟");
  await insightsApi("POST", { restaurantId: RID, insightId: insight2.id, action: "surface" });
  await insightsApi("POST", { restaurantId: RID, insightId: insight2.id, action: "dismiss" });
  const dis = (await rest(`brain_insights?id=eq.${insight2.id}&select=status`))[0];
  const list3 = await (await insightsApi("GET")).json();
  const factsFromDismiss = await rest(`brain_facts?restaurant_id=eq.${RID}&source=eq.owner_answer&select=id`);
  console.log(`#5 dismiss → status=${dis.status} ${pass(dis.status === "dismissed")}; not re-surfaced: ${pass(!(list3.insights||[]).some((i)=>i.id===insight2.id))}; no fact from dismiss: ${pass((factsFromDismiss?.length ?? 0) === 1)}`);

  // #6 no automatic restaurant change (menu unchanged)
  const menuAfter = (await rest(`menu_items?restaurant_id=eq.${RID}&select=id`)).length;
  console.log(`#6 NO auto menu change (only knowledge stored): ${pass(menuAfter === menuBefore)} (menu items ${menuBefore} → ${menuAfter})`);

  // auth gate
  const noAuth = await fetch(`${BASE}/api/brain/insights`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ insightId: "x", action: "dismiss" }) });
  console.log(`#1/#2 write requires auth (no secret → ${noAuth.status}): ${pass(noAuth.status === 401)}`);

  // cleanup
  await cleanAll();
  for (const p of phones) { const c = await rest(`customers?phone=eq.${p}&select=id`); if (c?.[0]?.id) { const cv = await rest(`conversations?customer_id=eq.${c[0].id}&select=id`); for (const x of (cv||[])) await rest(`conversations?id=eq.${x.id}`, { method: "DELETE" }); await rest(`customers?id=eq.${c[0].id}`, { method: "DELETE" }); } }
  const leftF = (await rest(`brain_facts?restaurant_id=eq.${RID}&select=id`)).length;
  const leftI = (await rest(`brain_insights?restaurant_id=eq.${RID}&select=id`)).length;
  console.log(`\n=== Cleanup === residual facts=${leftF} insights=${leftI}`);
  console.log("Done.");
})();
